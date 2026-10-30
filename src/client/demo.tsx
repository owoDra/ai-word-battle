// AI もサーバーも使わずにブラウザ内だけで試合を回す演出確認用モード (/demo)
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { ClientMsg, MoveKind, PublicState, ResolvedKind, SideResult, TurnResult } from "../shared/protocol";
import { ATTRS, MAX_HP, TURN_SECONDS } from "../shared/protocol";
import { loadName } from "./app";
import { Arena, type RoomConn } from "./room";

export type Scenario = "auto" | "clash" | "counter" | "wall" | "big" | "charge" | "ko";

const SCENARIOS: [Scenario, string][] = [
  ["auto", "おまかせ"],
  ["clash", "相打ち"],
  ["counter", "カウンター"],
  ["wall", "鉄壁"],
  ["big", "会心"],
  ["charge", "気合ため"],
  ["ko", "決着"],
];

const CPU_MOVES: string[][] = [
  ["業火の竜巻", "灼熱の鉄板焼き", "火山噴火"],
  ["大津波", "消防車を召喚", "絶対零度"],
  ["雷神の太鼓", "静電気ドアノブ", "落雷注意報"],
  ["聖なる結界", "後光フラッシュ", "朝日に向かって走る"],
  ["漆黒の呪縛", "月曜日の憂鬱", "闇鍋パーティー"],
  ["定時ダッシュ", "上司の無茶振り", "稟議書のハンコリレー"],
];

const NARRATIONS = [
  (a: string, b: string) => `「${a}」と「${b}」が真正面から激突ゥーッ!! 会場の空気が震えているぞォ!!`,
  (a: string, b: string) => `なんとォ! 「${b}」が「${a}」を完全に見切っていたァ!! これは読み合いの勝利だッ!!`,
  (a: string, b: string) => `「${a}」の衝撃波が場外まで届いているッ! 「${b}」、立っていられるのかァ!?`,
];

const rand = (a: number, b: number) => Math.floor(a + Math.random() * (b - a + 1));
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

function attrVec(dominant: number): number[] {
  return ATTRS.map((_, i) => (i === dominant ? 0.7 : 0.06));
}

interface Move {
  kind: ResolvedKind;
  text: string;
  attr: number;
}

function side(name: string, m: Move, o: Partial<SideResult>, hpBefore: number): SideResult {
  const taken = o.damageTaken ?? 0;
  return {
    name,
    kind: m.kind,
    text: m.text,
    attr: m.attr >= 0 ? attrVec(m.attr) : ATTRS.map(() => 0),
    dominant: m.attr,
    intensity: Math.random() * 0.6 + 0.3,
    novelty: Math.random() * 0.6 + 0.3,
    atk: 0,
    guard: 0,
    flags: [],
    ...o,
    damageTaken: taken,
    hpAfter: Math.max(0, hpBefore - taken),
  };
}

// シナリオに沿って TurnResult を組み立てる。sides[0] = あなた, sides[1] = CPU
function buildResult(turn: number, sc: Scenario, me: Move, cpu: Move, names: [string, string], hp: [number, number]): TurnResult {
  let scenario = sc;
  if (scenario === "auto") {
    scenario = me.kind === "defense" ? pick<Scenario>(["counter", "wall", "charge"]) : pick<Scenario>(["clash", "counter", "wall", "big"]);
  }
  // あなたの技の種類はシナリオに合わせる (演出確認が目的なので)
  const youAttack = !(me.kind === "defense" && (scenario === "counter" || scenario === "wall"));
  const kinds: Record<Scenario, [MoveKind, MoveKind]> = {
    auto: ["attack", "attack"],
    clash: ["attack", "attack"],
    counter: youAttack ? ["attack", "defense"] : ["defense", "attack"],
    wall: youAttack ? ["attack", "defense"] : ["defense", "attack"],
    big: ["attack", "defense"],
    charge: ["defense", "defense"],
    ko: ["attack", "attack"],
  };
  const [k0, k1] = kinds[scenario];
  const m0 = { ...me, kind: k0 };
  const m1 = { ...cpu, kind: k1 };
  const a = youAttack ? 0 : 1; // 攻撃側 (counter / wall 用)
  const d = 1 - a;
  const o: [Partial<SideResult>, Partial<SideResult>] = [{}, {}];
  let headline = "";

  switch (scenario) {
    case "clash": {
      o[0] = { atk: rand(22, 34), damageTaken: rand(12, 24) };
      o[1] = { atk: rand(18, 30), damageTaken: rand(14, 28), flags: ["属性で押し勝った!"] };
      headline = "真っ向勝負! 相打ち!!";
      break;
    }
    case "counter": {
      const atk = rand(26, 36);
      o[a] = { atk, damageTaken: Math.round(atk * 0.3) };
      o[d] = { guard: 0.9, damageTaken: Math.round(atk * 0.1), flags: ["完全に読み切った!"] };
      headline = "カウンター炸裂!!!";
      break;
    }
    case "wall": {
      const atk = rand(22, 30);
      o[a] = { atk };
      o[d] = { guard: 0.72, damageTaken: Math.round(atk * 0.28) };
      headline = "鉄壁のガード!";
      break;
    }
    case "big": {
      const atk = rand(44, 52);
      o[0] = { atk, flags: ["会心の一撃!", "気合解放 x1.3!"] };
      o[1] = { guard: 0.18, damageTaken: Math.round(atk * 0.82) };
      headline = "ガードをぶち抜いた!";
      break;
    }
    case "charge": {
      o[0] = { flags: ["気合をためた!"] };
      o[1] = { flags: ["気合をためた!"] };
      headline = "にらみ合い…! 両者、気合をためる!";
      break;
    }
    case "ko": {
      o[0] = { atk: Math.max(40, hp[1]), damageTaken: rand(5, 12), flags: ["会心の一撃!"] };
      o[1] = { atk: rand(14, 20), damageTaken: hp[1] };
      headline = "真っ向勝負! 相打ち!!";
      break;
    }
  }
  return {
    turn,
    headline,
    sides: [side(names[0], m0, o[0], hp[0]), side(names[1], m1, o[1], hp[1])],
  };
}

function initial(name: string): PublicState {
  const p = (pid: string, n: string) => ({ pid, name: n, hp: MAX_HP, charge: 1, submitted: false, connected: true, rematch: false });
  return {
    code: "DEMO",
    phase: "input",
    turn: 1,
    deadline: Date.now() + TURN_SECONDS * 1000,
    players: [p("me", name), p("cpu", "CPUライバル")],
    spectators: 0,
    last: null,
    narration: null,
    winner: null,
  };
}

function useMockRoom(name: string, scenario: Scenario, attr: number): RoomConn {
  const [state, setState] = useState<PublicState>(() => initial(name));
  const [error, setError] = useState<string | null>(null);
  const ref = useRef({ state, scenario, attr, myMove: null as Move | null });
  ref.current.state = state;
  ref.current.scenario = scenario;
  ref.current.attr = attr;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, f: () => void) => timers.current.push(setTimeout(f, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const update = (f: (s: PublicState) => PublicState) =>
    setState((s) => {
      const n = f(s);
      ref.current.state = n;
      return n;
    });

  const resolve = useCallback(() => {
    const s = ref.current.state;
    if (s.phase !== "input") return;
    const me: Move = ref.current.myMove ?? { kind: "idle", text: "(棒立ち)", attr: -1 };
    ref.current.myMove = null;
    const cpuAttr = rand(0, 5);
    const cpu: Move = { kind: "attack", text: pick(CPU_MOVES[cpuAttr]), attr: cpuAttr };
    const hp: [number, number] = [s.players[0].hp, s.players[1].hp];
    const r = buildResult(s.turn, ref.current.scenario, me, cpu, [s.players[0].name, s.players[1].name], hp);
    const charged = r.headline.startsWith("にらみ合い");
    const over = r.sides.some((x) => x.hpAfter <= 0);
    update((st) => ({
      ...st,
      phase: over ? "finished" : "result",
      deadline: null,
      last: r,
      narration: null,
      winner: over ? (r.sides[0].hpAfter > 0 ? 0 : r.sides[1].hpAfter > 0 ? 1 : -1) : null,
      players: st.players.map((p, i) => ({
        ...p,
        hp: r.sides[i].hpAfter,
        submitted: false,
        charge: charged ? Math.min(2, p.charge * 1.3) : r.sides[i].kind === "attack" ? 1 : p.charge,
      })),
    }));
    // 実況は少し遅れて届く (本番の LLM と同じ感覚にする)
    later(rand(900, 2200), () => {
      const [x, y] = r.sides;
      update((st) => (st.last?.turn === r.turn ? { ...st, narration: pick(NARRATIONS)(x.text, y.text) } : st));
    });
  }, []);

  // 時間切れ
  useEffect(() => {
    if (state.phase !== "input" || !state.deadline) return;
    const t = setTimeout(resolve, state.deadline - Date.now());
    return () => clearTimeout(t);
  }, [state.phase, state.turn]);

  const send = useCallback((msg: ClientMsg) => {
    const s = ref.current.state;
    if (msg.t === "submit" && s.phase === "input" && !s.players[0].submitted) {
      const a = ref.current.attr >= 0 ? ref.current.attr : rand(0, 5);
      ref.current.myMove = { kind: msg.kind, text: msg.text, attr: a };
      update((st) => ({ ...st, players: st.players.map((p, i) => (i === 0 ? { ...p, submitted: true } : p)) }));
      // CPU が考えるふり
      later(700, () => update((st) => ({ ...st, players: st.players.map((p, i) => (i === 1 ? { ...p, submitted: true } : p)) })));
      later(1100, resolve);
    } else if (msg.t === "ack" && s.phase === "result" && s.turn === msg.turn) {
      update((st) => ({ ...st, phase: "input", turn: st.turn + 1, deadline: Date.now() + TURN_SECONDS * 1000 }));
    } else if (msg.t === "rematch") {
      ref.current.myMove = null;
      update(() => initial(name));
    }
  }, []);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(t);
  }, [error]);

  return { state, you: 0, error, online: true, send };
}

export function Demo({ onLeave }: { onLeave: () => void }) {
  const [scenario, setScenario] = useState<Scenario>("auto");
  const [attr, setAttr] = useState(-1);
  const room = useMockRoom(loadName() || "あなた", scenario, attr);
  const bar = room.state?.phase === "input" && !room.state.players[0].submitted && (
    <div class="demo-bar">
      <div class="demo-row" role="group" aria-label="次の結果">
        <span>結果</span>
        {SCENARIOS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={scenario === k} onClick={() => setScenario(k)}>
            {label}
          </button>
        ))}
      </div>
      <div class="demo-row" role="group" aria-label="あなたの属性">
        <span>属性</span>
        <button type="button" aria-pressed={attr === -1} onClick={() => setAttr(-1)}>
          おまかせ
        </button>
        {ATTRS.map((a, i) => (
          <button key={a} type="button" aria-pressed={attr === i} onClick={() => setAttr(i)}>
            {a}
          </button>
        ))}
      </div>
    </div>
  );
  return <Arena code="DEMO" room={room} onLeave={onLeave} extra={bar} />;
}
