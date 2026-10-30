import { createContext, type ComponentChildren, type RefObject } from "preact";
import { useContext, useEffect, useRef, useState } from "preact/hooks";
import type { MoveKind, PublicPlayer, PublicState, SideResult, TurnResult } from "../shared/protocol";
import { ATTRS, MAX_HP, MAX_MOVE_LEN } from "../shared/protocol";
import { loadName, saveName } from "./app";
import { Fx } from "./fx";
import { audioReady, bgm, prefs, setBgm, setSound, setVoice, sfx, speak, stopSpeaking, unlockAudio } from "./sound";
import { useRoom } from "./useRoom";

const KANJI_NUM = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const turnLabel = (n: number) => `第${n <= 10 ? KANJI_NUM[n] : n}合`;
const LOW_HP = 25;

// 結果公開の段階。Hud や Finished もこれを見て演出を合わせる
const STEP = { quiet: 0, m1: 1, m2: 2, charge: 3, stop: 4, release: 5, headline: 6, ko: 7, narration: 8 } as const;

interface Stage {
  fx: () => Fx | null;
  invert: () => void;
  // 観戦画面があるときは読み上げを観戦画面に任せ、スマホ同士で声が重ならないようにする
  talker: boolean;
}
const StageCtx = createContext<Stage>({ fx: () => null, invert: () => {}, talker: false });

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Room(props: { code: string; spectate: boolean; onLeave: () => void }) {
  const [name, setName] = useState(loadName);
  if (!name && !props.spectate) return <NameGate code={props.code} onDone={setName} />;
  return <OnlineArena {...props} name={name} />;
}

function OnlineArena({ code, spectate, name, onLeave }: { code: string; spectate: boolean; name: string; onLeave: () => void }) {
  const room = useRoom(code, name, spectate);
  return <Arena code={code} room={room} onLeave={onLeave} />;
}

function NameGate({ code, onDone }: { code: string; onDone: (n: string) => void }) {
  const [v, setV] = useState("");
  const submit = (e: Event) => {
    e.preventDefault();
    if (!v.trim()) return;
    unlockAudio();
    saveName(v.trim());
    onDone(v.trim());
  };
  return (
    <main class="lobby">
      <form class="lobby-form gate" onSubmit={submit}>
        <p class="gate-code">部屋 {code} に挑む</p>
        <label class="field">
          <span>名前</span>
          <input id="gate-name" value={v} maxLength={12} placeholder="例: 社畜丸" onInput={(e) => setV(e.currentTarget.value)} />
        </label>
        <button type="submit" class="btn-ink big">
          いざ参る!!
        </button>
      </form>
    </main>
  );
}

export type RoomConn = Pick<ReturnType<typeof useRoom>, "state" | "you" | "error" | "online" | "send">;

// 通信部分は room で差し替えられる (オンライン対戦 / AIなしのデモ)
export function Arena({ code, room, onLeave, extra }: { code: string; room: RoomConn; onLeave: () => void; extra?: ComponentChildren }) {
  const { state, you, error, online, send } = room;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenRef = useRef<HTMLElement>(null);
  const fxRef = useRef<Fx | null>(null);
  const [needTap, setNeedTap] = useState(false);
  const [reveal, setReveal] = useState({ turn: 0, step: 0 });
  const hasState = !!state;
  const phase = state?.phase;

  useEffect(() => {
    if (!canvasRef.current) return;
    const f = new Fx(canvasRef.current);
    fxRef.current = f;
    return () => {
      f.destroy();
      fxRef.current = null;
    };
  }, [hasState]);

  // リロード直後などは音が出せないので、タップを促す
  useEffect(() => {
    const t = setTimeout(() => setNeedTap(!audioReady()), 600);
    return () => clearTimeout(t);
  }, []);

  // 入力中の曲は Countdown が残り時間に応じて切り替える
  useEffect(() => {
    if (phase === "waiting") bgm.play("lobby");
    else if (phase === "result") bgm.play("battle");
    else if (phase === "finished") bgm.play("none");
  }, [phase]);

  if (!state) {
    return (
      <main class="screen center">
        <p class="loading">{online ? "入場中…" : "接続中…"}</p>
      </main>
    );
  }

  // 自分を常に左側に表示する
  const order: [number, number] = you === 1 ? [1, 0] : [0, 1];
  const isPlayer = you !== null;
  const stage: Stage = {
    fx: () => fxRef.current,
    talker: !isPlayer || state.spectators === 0,
    invert: () => {
      const el = screenRef.current;
      if (!el) return;
      el.classList.remove("inverted");
      void el.offsetWidth;
      el.classList.add("inverted");
    },
  };
  const revealing = (state.phase === "result" || state.phase === "finished") && !!state.last;
  const step = revealing && reveal.turn === state.last!.turn ? reveal.step : revealing ? 0 : STEP.narration;

  return (
    <StageCtx.Provider value={stage}>
      <main ref={screenRef} class={`screen ${isPlayer ? "" : "watching"}`}>
        <Hud state={state} order={order} released={!revealing || step >= STEP.release} />
        <section class="stage">
          <div class="tone" aria-hidden="true" />
          <canvas ref={canvasRef} class="fx-layer" aria-hidden="true" />
          <Toggles />
          {state.phase === "waiting" && <Waiting code={code} isPlayer={isPlayer} />}
          {state.phase === "input" && <Prompt key={state.turn} state={state} order={order} you={you} />}
          {revealing && (
            <Reveal
              key={state.last!.turn}
              result={state.last!}
              narration={state.narration}
              order={order}
              finished={state.phase === "finished"}
              winner={state.winner}
              onStep={(s) => setReveal({ turn: state.last!.turn, step: s })}
              onDone={() => send({ t: "ack", turn: state.last!.turn })}
            />
          )}
        </section>
        <footer class="controls">
          {extra}
          {state.phase === "input" && isPlayer && (
            <Controls key={state.turn} error={error} submitted={state.players[you!]?.submitted ?? false} onSubmit={(kind, text) => send({ t: "submit", kind, text })} />
          )}
          {state.phase === "finished" && step >= STEP.ko && <Finished state={state} you={you} onRematch={() => send({ t: "rematch" })} onLeave={onLeave} />}
          {(state.phase === "result" || state.phase === "waiting" || (state.phase === "finished" && step < STEP.ko) || (!isPlayer && state.phase === "input")) && (
            <p class="footnote">
              {isPlayer ? `部屋 ${code}` : `観戦中 — 部屋 ${code}`} ・ 観戦 {state.spectators}人{online ? "" : " ・ 再接続中…"}
            </p>
          )}
        </footer>
        {error && (
          <div class="toast" role="alert">
            {error}
          </div>
        )}
        {needTap && (
          <button
            type="button"
            class="tap-to-sound"
            onClick={() => {
              unlockAudio();
              setNeedTap(false);
            }}
          >
            タップで音と実況をON
          </button>
        )}
      </main>
    </StageCtx.Provider>
  );
}

function Toggles() {
  const [sound, setS] = useState(prefs.sound);
  const [voice, setV] = useState(prefs.voice);
  const [music, setM] = useState(prefs.bgm);
  const item = (label: string, on: boolean, flip: () => void) => (
    <button
      type="button"
      aria-pressed={on}
      aria-label={`${label} ${on ? "オン" : "オフ"}`}
      onClick={() => {
        unlockAudio();
        flip();
      }}
    >
      {label}
      {on ? "" : "✕"}
    </button>
  );
  return (
    <div class="toggles">
      {item("音", sound, () => (setSound(!sound), setS(!sound)))}
      {item("声", voice, () => (setVoice(!voice), setV(!voice)))}
      {item("曲", music, () => (setBgm(!music), setM(!music)))}
    </div>
  );
}

function Hud({ state, order, released }: { state: PublicState; order: [number, number]; released: boolean }) {
  const last = state.phase === "result" || state.phase === "finished" ? state.last : null;
  return (
    <header class="hud">
      {order.map((idx, side) => {
        const p: PublicPlayer | undefined = state.players[idx];
        const taken = last?.sides[idx]?.damageTaken ?? 0;
        const before = (p?.hp ?? MAX_HP) + taken;
        // 着弾の瞬間までは減る前の HP を見せる
        const hp = released ? before - taken : before;
        const charged = !!p && p.charge > 1;
        const pct = (v: number) => (v / MAX_HP) * 100;
        return (
          <div class={`fighter ${side === 0 ? "left" : "right"} ${charged ? "charged" : ""} ${released && taken > 0 ? "hurt" : ""}`} key={`${idx}-${last?.turn ?? 0}-${released}`}>
            <span class="name">
              {p?.name ?? "???"}
              {p && !p.connected && <small class="off"> 離脱中</small>}
            </span>
            <div class={`bar ${hp <= LOW_HP ? "danger" : ""}`}>
              {/* 格ゲー式: 本体は一瞬で減り、薄い残像が少し遅れて追いかける */}
              <i class={`ghost ${released && taken > 0 ? "drain" : ""}`} style={{ "--hp": pct(hp), "--from": pct(before) }} />
              <i class="main" style={{ "--hp": pct(hp) }} />
            </div>
            <span class="hpnum">
              HP {hp}
              {charged && <b class="charge"> 気合x{p!.charge.toFixed(1)}</b>}
            </span>
          </div>
        );
      })}
      <div class="mid">
        <span class="round">{state.turn > 0 ? turnLabel(state.turn) : "対"}</span>
        {state.phase === "input" && <Countdown deadline={state.deadline} />}
      </div>
    </header>
  );
}

function Countdown({ deadline }: { deadline: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const s = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
  useEffect(() => {
    if (s > 0 && s <= 5) sfx.tick(s === 1);
    if (s > 0) bgm.play(s <= 10 ? "hurry" : "battle");
  }, [s]);
  if (!deadline) return null;
  return <span class={`timer ${s <= 5 ? "hurry" : ""}`}>残{s}秒</span>;
}

function Waiting({ code, isPlayer }: { code: string; isPlayer: boolean }) {
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}/r/${code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div class="waiting">
      <p class="waiting-label">部屋番号</p>
      <p class="waiting-code">{code}</p>
      <p class="waiting-msg">{isPlayer ? "挑戦者を待っている…!" : "対戦者がそろうのを待っている…"}</p>
      {isPlayer && (
        <button type="button" class="btn-ink" onClick={copy}>
          {copied ? "コピーした!" : "招待URLをコピー"}
        </button>
      )}
      <p class="waiting-sub">観戦用: {url}?watch=1</p>
    </div>
  );
}

function Prompt({ state, order, you }: { state: PublicState; order: [number, number]; you: number | null }) {
  const { talker } = useContext(StageCtx);
  useEffect(() => {
    sfx.taiko();
    if (talker) speak(`${turnLabel(state.turn)}!`, { interrupt: true, rate: 1 });
    const me = you !== null ? state.players[you] : null;
    if (me && me.hp <= LOW_HP) {
      const t = setTimeout(() => sfx.heartbeat(), 900);
      return () => clearTimeout(t);
    }
  }, []);
  return (
    <div class="prompt">
      <p class="prompt-turn">{turnLabel(state.turn)}</p>
      <p class="prompt-call">{you === null ? "両者、技を練っている…!" : "技を叫べ!!"}</p>
      <ul class="ready">
        {order.map((idx) => {
          const p = state.players[idx];
          return (
            <li key={idx} class={p?.submitted ? "done" : ""}>
              <span>{p?.name}</span>
              <b>{p?.submitted ? "準備完了!" : "思案中…"}</b>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Controls({ submitted, error, onSubmit }: { submitted: boolean; error: string | null; onSubmit: (k: MoveKind, t: string) => void }) {
  const [kind, setKind] = useState<MoveKind>("attack");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const len = [...text.trim()].length;

  // エラーで弾かれたら再入力できるように
  useEffect(() => {
    if (error) setSending(false);
  }, [error]);

  if (submitted) return <p class="locked">技は放たれた…! 相手を待て!!</p>;

  const submit = (e: Event) => {
    e.preventDefault();
    if (!len || len > MAX_MOVE_LEN || sending) return;
    unlockAudio();
    sfx.shout();
    navigator.vibrate?.(30);
    setSending(true);
    onSubmit(kind, text.trim());
  };

  return (
    <form class={`move-form ${kind}`} onSubmit={submit}>
      <div class="kind">
        <button type="button" data-sfx="attack" aria-pressed={kind === "attack"} onClick={() => setKind("attack")}>
          攻撃
        </button>
        <button type="button" data-sfx="defense" aria-pressed={kind === "defense"} onClick={() => setKind("defense")}>
          防御
        </button>
      </div>
      <div class="row">
        <input
          id="move"
          value={text}
          placeholder={kind === "attack" ? "攻撃技を叫べ!" : "防御技を叫べ!"}
          aria-label="技名"
          autocomplete="off"
          enterKeyHint="send"
          onInput={(e) => {
            setText(e.currentTarget.value);
            sfx.ui("type");
          }}
        />
        <button type="submit" class="go" data-sfx="none" disabled={!len || len > MAX_MOVE_LEN || sending}>
          {sending ? "…" : "叫べ!!"}
        </button>
      </div>
      <p class={`hint ${len > MAX_MOVE_LEN ? "over" : ""}`}>
        {len > MAX_MOVE_LEN ? `長すぎる! ${len}/${MAX_MOVE_LEN}文字` : "━━ 魂を込めて技名を書け!! ━━"}
      </p>
    </form>
  );
}

interface Beat {
  sfx: string;
  stamp: string | null;
  attr: number; // 着弾エフェクトの属性 (攻撃側, -1 = なし)
  power: number; // 0..1
  maxDmg: number;
  victim: number; // 表示上の左右 (0/1), -1 = なし
  attacker: number;
  guarded: number; // 防御していた側 (表示上の左右), -1 = なし
  counter: boolean;
  clash: boolean; // 両者防御
}

function analyze(sides: SideResult[], headline: string): Beat {
  const [a, b] = sides;
  const counter = headline.includes("カウンター");
  const maxDmg = Math.max(a.damageTaken, b.damageTaken);
  const victim = maxDmg === 0 ? -1 : a.damageTaken >= b.damageTaken ? 0 : 1;
  // 受けたダメージが大きい方の相手を攻撃側とみなす。カウンターなら攻撃したのは技を出した側
  let attacker = victim === -1 ? -1 : 1 - victim;
  if (counter) attacker = a.kind === "attack" ? 0 : 1;
  if (attacker >= 0 && sides[attacker].kind !== "attack") attacker = sides.findIndex((s) => s.kind === "attack");
  const guarded = sides.findIndex((s) => s.kind === "defense" && s.guard > 0);
  const crit = sides.some((s) => s.flags.includes("会心の一撃!"));
  let sfxText = "ゴゴゴゴ…";
  if (counter) sfxText = "カキィン!!";
  else if (maxDmg >= 30) sfxText = "ドゴォッ!!";
  else if (maxDmg > 0 && guarded >= 0) sfxText = "ガギィン!!";
  else if (maxDmg > 0) sfxText = "バキィッ!!";
  else if (a.kind === "idle" && b.kind === "idle") sfxText = "シーン…";
  return {
    sfx: sfxText,
    stamp: counter ? "返" : crit ? "会心" : maxDmg >= 30 ? "痛恨" : guarded >= 0 && maxDmg < 10 ? "鉄壁" : null,
    attr: attacker >= 0 ? sides[attacker].dominant : -1,
    power: Math.min(1, maxDmg / 40),
    maxDmg,
    victim,
    attacker,
    guarded,
    counter,
    clash: a.kind === "defense" && b.kind === "defense",
  };
}

interface RevealProps {
  result: TurnResult;
  narration: string | null;
  order: [number, number];
  finished: boolean;
  winner: number | null;
  onStep: (s: number) => void;
  onDone: () => void;
}

function Reveal({ result, narration, order, finished, winner, onStep, onDone }: RevealProps) {
  const { fx, invert, talker } = useContext(StageCtx);
  const sides = order.map((i) => result.sides[i]);
  const beat = analyze(sides, result.headline);
  const [step, setStep] = useState<number>(STEP.quiet);
  const [hit, setHit] = useState(0); // 0: なし, 1: 一撃目, 2: カウンターの二撃目
  const panels = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const narrationDone = useRef<() => void>(() => {});

  useEffect(() => {
    let alive = true;
    const go = (s: number) => {
      if (!alive) return;
      setStep(s);
      onStep(s);
    };
    const reduce = reducedMotion();
    const center = (i: number) => fx()?.centerOf(panels[i].current) ?? ([0, 0] as [number, number]);
    const declare = (i: number) => {
      const s = sides[i];
      sfx.declare(s.kind, s.dominant);
      fx()?.declare(s.kind, s.dominant, ...center(i), i === 0 ? 1 : -1);
    };

    (async () => {
      // 静寂 → 宣言 → 宣言 → 溜め → ヒットストップ → 解放 → 見出し → (決着) → 実況 → 余韻
      await wait(400);
      go(STEP.m1);
      declare(0);
      if (talker) {
        speak(`${sides[0].text}!`, { interrupt: true, rate: 1.2, pitch: 0.7 });
        speak(`${sides[1].text}!`, { rate: 1.2, pitch: 0.9 });
      }
      await wait(750);
      if (!alive) return;
      go(STEP.m2);
      declare(1);
      await wait(800);
      if (!alive) return;

      const charge = beat.maxDmg > 0 ? 450 + 350 * beat.power : 500;
      go(STEP.charge);
      sfx.riser(charge);
      await wait(charge);
      if (!alive) return;

      if (beat.maxDmg > 0 || beat.guarded >= 0) {
        // 一撃目: 時間が止まる
        const stopMs = reduce ? 0 : 80 + 170 * beat.power;
        const target = beat.counter ? (beat.guarded >= 0 ? beat.guarded : 0) : beat.victim >= 0 ? beat.victim : beat.guarded;
        go(STEP.stop);
        setHit(1);
        sfx.hit(beat.counter ? 0.6 : beat.power);
        fx()?.impact(beat.attr, beat.counter ? 0.4 : beat.power, center(target));
        if (beat.guarded >= 0) {
          fx()?.shield(...center(beat.guarded), 1);
          sfx.kin();
        }
        fx()?.freeze(stopMs);
        navigator.vibrate?.(beat.maxDmg >= 30 ? [60, 30, 180] : 90);
        await wait(stopMs);
        if (!alive) return;
        go(STEP.release);
        sfx.boom(beat.counter ? 0.4 : beat.power, beat.attr);
        if (!beat.counter && beat.maxDmg >= 30) fx()?.crack();

        if (beat.counter && beat.attacker >= 0) {
          // カウンター: 一瞬の間のあと、攻撃側に跳ね返る二撃目
          await wait(450);
          if (!alive) return;
          setHit(2);
          invert();
          sfx.kin();
          sfx.hit(1);
          fx()?.impact(sides[beat.guarded >= 0 ? beat.guarded : 0].dominant, 1, center(beat.attacker));
          fx()?.freeze(reduce ? 0 : 220);
          await wait(reduce ? 0 : 220);
          sfx.boom(0.8, -1);
          fx()?.crack();
        }
      } else {
        go(STEP.release);
        if (beat.clash) sfx.rumble();
      }

      await wait(900);
      if (!alive) return;
      go(STEP.headline);
      sfx.stamp();

      if (finished) {
        await wait(700);
        if (!alive) return;
        go(STEP.ko);
        sfx.fanfare();
        fx()?.confetti();
        if (talker) {
          const w = winner !== null && winner >= 0 ? result.sides[winner].name : null;
          speak(w ? `決着! 勝者、${w}!` : "相討ち!", { rate: 1, pitch: 0.7 });
        }
      }

      await wait(600);
      if (!alive) return;
      go(STEP.narration);
      // 実況が届いて読み終わるまで待つ (届かなければ 8 秒で諦める)
      await Promise.race([new Promise<void>((r) => (narrationDone.current = r)), wait(8000)]);
      await wait(1200);
      if (alive) onDone();
    })();
    return () => {
      alive = false;
    };
  }, []);

  const amp = beat.maxDmg >= 30 ? 16 : beat.maxDmg > 0 ? 9 : 3;
  const cls = [
    "reveal",
    step === STEP.charge && "charging",
    step === STEP.stop && "stopped",
    step >= STEP.release && "released",
    beat.counter && "is-counter",
    hit === 2 && "second-hit",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div class={cls} style={{ "--amp": `${amp}px` }}>
      <div class="speed" aria-hidden="true" />
      <MovePanel side={sides[0]} pos="m1" shown={step >= STEP.m1} elRef={panels[0]} hurt={step >= STEP.release && beat.victim === 0} />
      <MovePanel side={sides[1]} pos="m2" shown={step >= STEP.m2} elRef={panels[1]} hurt={step >= STEP.release && beat.victim === 1} />
      <div class="impact">
        {step >= STEP.release && <span class="sfx">{beat.sfx}</span>}
        {step >= STEP.release &&
          sides.map(
            (s, i) =>
              s.damageTaken > 0 && (
                <span class={`dmg ${s.damageTaken >= 30 ? "huge" : ""}`} key={i} style={{ animationDelay: beat.counter && i === beat.attacker ? "450ms" : "0ms" }}>
                  {s.name} -{s.damageTaken}
                </span>
              ),
          )}
      </div>
      <div class={`headline ${step >= STEP.headline ? "in" : ""}`}>{result.headline}</div>
      <Narration key={narration ?? ""} text={narration} active={step >= STEP.narration} onDone={() => narrationDone.current()} />
      {beat.stamp && step >= STEP.release && (
        <span class="stamp-big" aria-hidden="true">
          {beat.stamp}
        </span>
      )}
      {finished && step >= STEP.ko && (
        <span class="ko" aria-hidden="true">
          決着!!
        </span>
      )}
      {step === STEP.stop && <div class="impact-frame" aria-hidden="true" />}
    </div>
  );
}

function MovePanel(props: { side: SideResult; pos: "m1" | "m2"; shown: boolean; hurt: boolean; elRef: RefObject<HTMLDivElement | null> }) {
  const { side, pos, shown, hurt, elRef } = props;
  const label = side.kind === "attack" ? "の攻撃!" : side.kind === "defense" ? "の防御!" : "は動けない!";
  const pct = side.dominant >= 0 ? Math.round(side.attr[side.dominant] * 100) : 0;
  const mark = side.kind === "defense" ? "守" : side.dominant >= 0 ? ATTRS[side.dominant][0] : "無";
  return (
    <div ref={elRef} class={`move ${pos} ${side.kind} attr-${side.dominant} ${shown ? "in" : ""} ${hurt ? "hurt" : ""}`} data-mark={mark}>
      <span class="who">
        {side.name}
        {label}
      </span>
      <span class="word">{side.text}</span>
      <div class="chips">
        {side.dominant >= 0 && (
          <span class="attr">
            {ATTRS[side.dominant]}属性 {pct}%
          </span>
        )}
        {side.kind === "attack" && <span class="stat">威力 {side.atk}</span>}
        {side.kind === "defense" && side.guard > 0 && <span class="stat">防御 {Math.round(side.guard * 100)}%</span>}
        {side.kind !== "idle" && (
          <span class="stat sub">
            強さ{Math.round(side.intensity * 100)} 独創{Math.round(side.novelty * 100)}
          </span>
        )}
      </div>
      {side.flags.length > 0 && (
        <div class="flags">
          {side.flags.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function Narration({ text, active, onDone }: { text: string | null; active: boolean; onDone: () => void }) {
  const { talker } = useContext(StageCtx);
  const chars = text ? [...text] : [];
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!text || !active) return;
    let alive = true;
    // 技名の読み上げの後ろに並ぶので、読み終わり = 全部読み終わり
    const spoken = talker ? speak(text, { rate: 1.3, pitch: 1.05 }) : Promise.resolve();
    const typed = new Promise<void>((resolve) => {
      if (reducedMotion()) {
        setN(chars.length);
        return resolve();
      }
      let i = 0;
      const t = setInterval(() => {
        if (!alive) return clearInterval(t);
        setN(++i);
        if (i >= chars.length) {
          clearInterval(t);
          resolve();
        }
      }, 45);
    });
    void Promise.all([spoken, typed]).then(() => alive && onDone());
    return () => {
      alive = false;
    };
  }, [text, active]);
  return (
    <p class={`narration ${active ? "in" : ""} ${text ? "" : "pending"}`}>{text ? chars.slice(0, n).join("") : "実況席が息をのむ…"}</p>
  );
}

function Finished({ state, you, onRematch, onLeave }: { state: PublicState; you: number | null; onRematch: () => void; onLeave: () => void }) {
  const w = state.winner;
  const title = w === -1 || w === null ? "相討ち…!!" : `${state.players[w].name} の勝利!!`;
  const me = you !== null ? state.players[you] : null;
  return (
    <div class="finished">
      <p class={`winner ${you !== null && w === you ? "me" : ""}`}>{title}</p>
      {me && (
        <div class="finished-actions">
          <button
            type="button"
            class="btn-red"
            disabled={me.rematch}
            onClick={() => {
              stopSpeaking();
              onRematch();
            }}
          >
            {me.rematch ? "相手の返事待ち…" : "もう一戦!!"}
          </button>
          <button
            type="button"
            class="btn-ghost"
            onClick={() => {
              stopSpeaking();
              onLeave();
            }}
          >
            ロビーへ
          </button>
        </div>
      )}
    </div>
  );
}
