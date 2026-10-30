import { DurableObject } from "cloudflare:workers";
import type { ClientMsg, MoveKind, Phase, PublicState, ServerMsg, TurnResult } from "../shared/protocol";
import { ATTRS, MAX_HP, MAX_MOVE_LEN, RESULT_MAX_SECONDS, TURN_SECONDS } from "../shared/protocol";
import { resolveTurn, type Submission } from "./battle";
import { BudgetExceededError, consumeBudget, estimateNeurons, NARRATION_LIMIT } from "./budget";
import { embed, getScoringModel, maxSim, relevance, scoreVec, type Vec } from "./scoring";

// 過去の自分/相手の技とのコサイン類似度がこれ以上ならペナルティ
const REPEAT_SIM = 0.88;
const COPY_SIM = 0.9;
// 「最強」「究極」などを盛っただけの技 (plamo-embedding-1b で計測: 通常 0.53〜0.64, 盛り 0.79〜)
const HYPE_SIM = 0.72;

interface PlayerState {
  pid: string;
  name: string;
  hp: number;
  charge: number;
  moves: string[];
  history: Vec[];
  submission: { kind: MoveKind; text: string; vec: Vec } | null;
  rematch: boolean;
}

interface RoomState {
  code: string;
  phase: Phase;
  turn: number;
  deadline: number | null;
  players: PlayerState[];
  last: TurnResult | null;
  narration: string | null;
  winner: number | null;
  acks: string[]; // 結果演出を見終わったソケットの sid
}

interface Attachment {
  sid: string;
  pid: string;
  spectator: boolean;
}

export class BattleRoom extends DurableObject<Env> {
  private state!: RoomState;
  private scoring = new Set<string>(); // 埋め込み計算中の pid

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get<RoomState>("state")) ?? {
        code: "",
        phase: "waiting",
        turn: 0,
        deadline: null,
        players: [],
        last: null,
        narration: null,
        winner: null,
        acks: [],
      };
      this.state.acks ??= [];
    });
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pid = url.searchParams.get("pid") ?? "";
    const name = (url.searchParams.get("name") ?? "").trim().slice(0, 12) || "名無しの挑戦者";
    this.state.code ||= url.pathname.split("/")[3] ?? "";

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);

    let you: number | null = null;
    let start = false;
    if (pid && url.searchParams.get("spectate") !== "1") {
      you = this.state.players.findIndex((p) => p.pid === pid);
      if (you < 0 && this.state.players.length < 2) {
        this.state.players.push(newPlayer(pid, name));
        you = this.state.players.length - 1;
        start = this.state.players.length === 2;
      } else if (you >= 0) {
        this.state.players[you].name = name;
      } else {
        you = null;
      }
    }
    // broadcast が全ソケットの attachment を読むので、先に設定しておく
    server.serializeAttachment({ sid: crypto.randomUUID(), pid: you === null ? "" : pid, spectator: you === null } satisfies Attachment);
    this.send(server, { t: "hello", you });
    if (start) await this.startTurn();
    this.save();
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const att = ws.deserializeAttachment() as Attachment;
    if (typeof raw !== "string") return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.t === "ack") return this.ack(att.sid, msg.turn);
    if (att.spectator) return;
    const idx = this.state.players.findIndex((p) => p.pid === att.pid);
    if (idx < 0) return;
    if (msg.t === "submit") await this.submit(ws, idx, msg.kind, msg.text);
    else if (msg.t === "rematch") await this.rematch(idx);
  }

  async webSocketClose(ws: WebSocket) {
    this.broadcast(ws);
    await this.checkAcks(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.broadcast(ws);
    await this.checkAcks(ws);
  }

  private async ack(sid: string, turn: number) {
    if (this.state.phase !== "result" || this.state.turn !== turn || this.state.acks.includes(sid)) return;
    this.state.acks.push(sid);
    await this.checkAcks();
  }

  // 接続中の全画面 (プレイヤー・観戦者) が演出を見終わったら次のターンへ
  private async checkAcks(exclude?: WebSocket) {
    if (this.state.phase !== "result") return;
    const sids = this.openSockets(exclude).map((w) => (w.deserializeAttachment() as Attachment | null)?.sid);
    if (sids.every((sid) => sid && this.state.acks.includes(sid))) await this.startTurn();
  }

  private openSockets(exclude?: WebSocket): WebSocket[] {
    return this.ctx.getWebSockets().filter((w) => w !== exclude && w.readyState === WebSocket.OPEN);
  }

  async alarm() {
    if (this.state.phase === "input") await this.resolve();
    else if (this.state.phase === "result") await this.startTurn();
  }

  private async submit(ws: WebSocket, idx: number, kind: MoveKind, rawText: string) {
    const p = this.state.players[idx];
    const text = String(rawText ?? "").trim();
    if (this.state.phase !== "input" || p.submission || this.scoring.has(p.pid)) return;
    if (kind !== "attack" && kind !== "defense") return;
    if (!text || [...text].length > MAX_MOVE_LEN) return this.send(ws, { t: "error", message: `技名は1〜${MAX_MOVE_LEN}文字だ!` });
    if (p.moves.includes(text)) return this.send(ws, { t: "error", message: "同じ技は二度と通用しない!" });

    const turn = this.state.turn;
    this.scoring.add(p.pid);
    let vec: Vec;
    try {
      [vec] = await embed(this.env, [text]);
      await getScoringModel(this.env);
    } catch (e) {
      console.error("embed failed", e);
      const message =
        e instanceof BudgetExceededError
          ? "本日のAIパワーが尽きた…! (無料枠の上限。朝9時に復活)"
          : "AIが技を見切れなかった…もう一度!";
      return this.send(ws, { t: "error", message });
    } finally {
      this.scoring.delete(p.pid);
    }
    // 埋め込み待ちの間に時間切れになっていたら無効
    if (this.state.phase !== "input" || this.state.turn !== turn) return;

    p.submission = { kind, text, vec };
    this.save();
    this.broadcast();
    if (this.state.players.every((x) => x.submission)) await this.resolve();
  }

  private async resolve() {
    const s = this.state;
    if (s.phase !== "input") return;
    s.phase = "result";
    const model = await getScoringModel(this.env);

    const subs = s.players.map((p, i): Submission => {
      if (!p.submission) return { kind: "idle", text: "(棒立ち)", score: null, mult: 1, flags: ["時間切れ…!"] };
      const { kind, text, vec } = p.submission;
      const flags: string[] = [];
      let mult = 1;
      if (p.history.length && maxSim(vec, p.history) >= REPEAT_SIM) {
        mult *= 0.5;
        flags.push("技がマンネリ化…!");
      }
      const opp = s.players[1 - i];
      if (opp.history.length && maxSim(vec, opp.history) >= COPY_SIM) {
        mult *= 0.5;
        flags.push("相手の技をパクった…!");
      }
      const score = scoreVec(model, vec);
      if (score.hype >= HYPE_SIM) {
        mult *= 0.6;
        flags.push("盛りすぎて空回り…!");
      }
      return { kind, text, score, mult, flags };
    }) as [Submission, Submission];

    const { result, charges } = resolveTurn(s.turn, [s.players[0], s.players[1]], subs, (a, b) => relevance(model, a, b));

    s.players.forEach((p, i) => {
      p.hp = result.sides[i].hpAfter;
      p.charge = charges[i];
      if (p.submission) {
        p.moves.push(p.submission.text);
        p.history.push(p.submission.vec);
      }
      p.submission = null;
    });
    s.last = result;
    s.narration = null;

    const [a, b] = s.players;
    if (a.hp <= 0 || b.hp <= 0) {
      s.phase = "finished";
      s.deadline = null;
      s.winner = a.hp > 0 ? 0 : b.hp > 0 ? 1 : -1;
      await this.ctx.storage.deleteAlarm();
    } else {
      s.deadline = Date.now() + RESULT_MAX_SECONDS * 1000;
      s.acks = [];
      await this.ctx.storage.setAlarm(s.deadline);
    }
    this.save();
    this.broadcast();
    this.ctx.waitUntil(this.narrate(result));
  }

  private async startTurn() {
    const s = this.state;
    s.phase = "input";
    s.turn += 1;
    // 初回は名乗りを見る時間を少し長めに
    s.deadline = Date.now() + (TURN_SECONDS + (s.turn === 1 ? 5 : 0)) * 1000;
    await this.ctx.storage.setAlarm(s.deadline);
    this.save();
    this.broadcast();
  }

  private async rematch(idx: number) {
    const s = this.state;
    if (s.phase !== "finished") return;
    s.players[idx].rematch = true;
    if (s.players.every((p) => p.rematch)) {
      s.players = s.players.map((p) => newPlayer(p.pid, p.name));
      s.turn = 0;
      s.last = null;
      s.narration = null;
      s.winner = null;
      await this.startTurn();
    } else {
      this.save();
      this.broadcast();
    }
  }

  private async narrate(r: TurnResult) {
    try {
      const desc = r.sides
        .map((x) => {
          const kind = x.kind === "attack" ? "攻撃" : x.kind === "defense" ? "防御" : "棒立ち";
          const attr = x.dominant >= 0 ? ATTRS[x.dominant] : "なし";
          return `${x.name}: ${kind}「${x.text}」(属性:${attr}) 受けたダメージ${x.damageTaken} 残りHP${x.hpAfter} ${x.flags.join(" ")}`;
        })
        .join("\n");
      const system =
        "あなたは熱血すぎる格闘技の実況アナウンサーです。与えられたターンの結果を、両者の技名を必ず織り込んで、1〜2文・80文字以内の日本語で叫ぶように実況してください。技同士がどう作用したかを具体的に想像して描写すること。マークダウンや前置きは禁止。";
      const user = `ターン${r.turn}: ${r.headline}\n${desc}`;
      const maxTokens = 160;
      const model = this.env.NARRATION_MODEL;
      // 予算超過なら実況だけ諦める (ゲームは続行)
      await consumeBudget(this.env, estimateNeurons(model, system.length + user.length, maxTokens), NARRATION_LIMIT);
      const res = (await this.env.AI.run(model as "@cf/google/gemma-4-26b-a4b-it", {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: maxTokens,
        temperature: 0.9,
        chat_template_kwargs: { enable_thinking: false },
      })) as { choices?: { message?: { content?: string } }[]; response?: string };
      const text = (res.choices?.[0]?.message?.content ?? res.response ?? "").trim();
      if (!text || this.state.last?.turn !== r.turn) return;
      this.state.narration = text.replace(/\s+/g, " ").slice(0, 120);
      this.save();
      this.broadcast();
    } catch (e) {
      console.error("narration failed", e);
    }
  }

  private publicState(exclude?: WebSocket): PublicState {
    const sockets = this.openSockets(exclude);
    const atts = sockets.map((w) => w.deserializeAttachment() as Attachment | null).filter((a): a is Attachment => !!a);
    const s = this.state;
    return {
      code: s.code,
      phase: s.phase,
      turn: s.turn,
      deadline: s.deadline,
      players: s.players.map((p) => ({
        pid: p.pid,
        name: p.name,
        hp: p.hp,
        charge: p.charge,
        submitted: !!p.submission,
        connected: atts.some((a) => a.pid === p.pid),
        rematch: p.rematch,
      })),
      spectators: atts.filter((a) => a.spectator).length,
      last: s.last,
      narration: s.narration,
      winner: s.winner,
    };
  }

  private broadcast(exclude?: WebSocket) {
    const msg = JSON.stringify({ t: "state", state: this.publicState(exclude) } satisfies ServerMsg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      try {
        ws.send(msg);
      } catch {
        // 切断済みのソケットは無視
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMsg) {
    ws.send(JSON.stringify(msg));
  }

  private save() {
    // 出力ゲートにより、書き込み完了前にクライアントへ応答が漏れることはない
    this.ctx.storage.put("state", this.state);
  }
}

function newPlayer(pid: string, name: string): PlayerState {
  return { pid, name, hp: MAX_HP, charge: 1, moves: [], history: [], submission: null, rematch: false };
}
