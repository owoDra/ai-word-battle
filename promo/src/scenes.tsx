import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, interpolate, random, spring } from "remotion";
import { C, CutIn, F, Narration, Onomato, Panel, Sfx, Splat, SpeedLines, Stage, Tone, useT, ZundaSub } from "./fx";
import { mark, type PlacedScene } from "./timeline";

type P = { sc: PlacedScene };

// at 秒に from 倍から叩きつけて出てくる
function Pop({ at, from = 2.4, style, children }: { at: number; from?: number; style?: CSSProperties; children: ReactNode }) {
  const { since, fps } = useT();
  const d = since(at);
  if (d < 0) return null;
  const p = spring({ frame: d, fps, config: { damping: 11, stiffness: 280, mass: 0.6 } });
  return <div style={{ position: "absolute", ...style, transform: `${style?.transform ?? ""} scale(${from + (1 - from) * p})` }}>{children}</div>;
}

function Narr({ sc, i = 0, ...rest }: { sc: PlacedScene; i?: number } & Partial<Parameters<typeof Narration>[0]>) {
  const l = sc.lines[i];
  return <Narration text={l.sub} at={l.at} sec={l.sec} {...rest} />;
}

function Chip({ children, bg = C.ink, fg = C.paper, size = 40, style }: { children: ReactNode; bg?: string; fg?: string; size?: number; style?: CSSProperties }) {
  return (
    <span style={{ display: "inline-block", fontFamily: F.body, fontWeight: 900, fontSize: size, background: bg, color: fg, padding: "4px 20px", border: `4px solid ${C.ink}`, ...style }}>
      {children}
    </span>
  );
}

const heavyText = (size: number, color = C.ink, stroke = C.paper): CSSProperties => ({
  fontFamily: F.heavy,
  fontSize: size,
  lineHeight: 1.05,
  color,
  WebkitTextStroke: `${Math.round(size * 0.08)}px ${stroke}`,
  paintOrder: "stroke fill",
  whiteSpace: "nowrap",
});

// ---------- タイトルロゴ (冒頭と締めで共用) ----------
function Logo({ at, top = 560 }: { at: number; top?: number }) {
  return (
    <>
      <Tone />
      <SpeedLines inner={470} seed={`logo${at}`} />
      <Splat at={at} x={800} y={700} scale={1.4} seed={`lg${at}`} />
      <Pop at={at} from={3} style={{ left: 0, right: 0, top, display: "flex", flexDirection: "column", alignItems: "center", transform: "rotate(-4deg)" }}>
        <Chip bg={C.red} size={56} style={{ marginBottom: 20 }}>
          言葉が、技になる。
        </Chip>
        <div style={heavyText(330, C.red)}>AI</div>
        <div style={{ ...heavyText(250), textShadow: `14px 14px 0 ${C.red}` }}>ワード</div>
        <div style={{ ...heavyText(250), textShadow: `14px 14px 0 ${C.red}` }}>バトル</div>
      </Pop>
    </>
  );
}

export const titleSlam = (sc: PlacedScene) => mark(sc, "ナル") + 0.15;

export function Title({ sc }: P) {
  const { t } = useT();
  const slam = titleSlam(sc);
  const w = mark(sc, "ワザ");
  if (t >= slam) {
    return (
      <Stage hits={[slam]} inverts={[slam]}>
        <Sfx at={slam} name="slam" />
        <Logo at={slam} />
        <Onomato text="ドンッ!!" at={slam + 0.08} x={790} y={1580} size={220} color={C.red} rotate={-12} />
      </Stage>
    );
  }
  return (
    <Stage bg={C.ink}>
      <Sfx at={0} name="rumble" />
      <SpeedLines color="#3a3434" inner={430} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 300, display: "flex", justifyContent: "center" }}>
        <div style={{ writingMode: "vertical-rl", fontFamily: F.brush, fontSize: 190, color: C.paper, lineHeight: 1.3 }}>
          <div>{t >= sc.lines[0].at ? "言葉が" : ""}</div>
          <div style={{ color: C.red, paddingTop: 240 }}>{t >= w ? "技になる。" : ""}</div>
        </div>
      </div>
      <Onomato text="ゴゴゴゴ" at={0.05} x={150} y={1450} size={120} color={C.paper} stroke={C.ink} vertical rotate={5} />
      <Onomato text="ゴゴゴ" at={0.25} x={940} y={420} size={100} color={C.paper} stroke={C.ink} vertical rotate={-6} />
    </Stage>
  );
}

// ---------- 入力 ----------
export function Input({ sc }: P) {
  const { t } = useT();
  const a = mark(sc, "コオゲキ");
  const b = mark(sc, "ボオギョ");
  const w = mark(sc, "ワザメ");
  const j = mark(sc, "ジユウ");
  const r = mark(sc, "リョオシャ");
  const k = mark(sc, "コオカイ");
  const MOVE = "業火の竜巻";
  const typed = Math.max(0, Math.min(MOVE.length, Math.floor((t - w - 0.08) / 0.08) + 1));

  let body: ReactNode;
  if (t < w) {
    body = (
      <>
        <Tone />
        <SpeedLines inner={520} opacity={0.5} />
        <Pop at={0} from={1.5} style={{ left: 50, top: 120 }}>
          <div style={{ fontFamily: F.brush, fontSize: 96, background: C.ink, color: C.paper, padding: "6px 26px" }}>第一合</div>
        </Pop>
        <Pop at={a} style={{ left: 60, top: 520, transform: "rotate(-5deg)" }}>
          <div style={{ ...heavyText(220, C.paper, C.ink), background: C.red, border: `10px solid ${C.ink}`, padding: "20px 70px", boxShadow: `16px 16px 0 ${C.ink}` }}>攻撃</div>
        </Pop>
        <Pop at={b} style={{ left: 180, top: 960, transform: "rotate(4deg)" }}>
          <div style={{ ...heavyText(220, C.paper, C.ink), background: C.ink, border: `10px solid ${C.ink}`, padding: "20px 70px", boxShadow: `16px 16px 0 ${C.red}` }}>防御</div>
        </Pop>
        <Onomato text="か!?" at={b + 0.1} x={300} y={1420} size={170} />
      </>
    );
  } else if (t < r) {
    body = (
      <>
        <Tone />
        <Panel style={{ left: 50, right: 300, top: 600, padding: "30px 36px", transform: "rotate(-2deg)" }}>
          <div style={{ fontFamily: F.body, fontWeight: 900, fontSize: 40, color: C.muted }}>技名 (25文字まで)</div>
          <div style={{ fontFamily: F.heavy, fontSize: 104, color: C.ink, marginTop: 10, whiteSpace: "nowrap" }}>
            {MOVE.slice(0, typed)}
            <span style={{ color: C.red, opacity: Math.floor(t * 6) % 2 ? 1 : 0 }}>|</span>
          </div>
        </Panel>
        <Onomato text="自由入力!!" at={j} x={400} y={1080} size={150} color={C.red} rotate={-10} />
        {MOVE.split("").map((_, i) => (
          <Sfx key={i} at={w + 0.08 + i * 0.08} name="key" vol={0.7} />
        ))}
      </>
    );
  } else {
    const flip = (delay: number) => interpolate(t - k - delay, [-0.1, 0], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const card = (top: number, text: string, delay: number, dark: boolean) => {
      const f = flip(delay);
      const shown = f === 0;
      const sx = Math.abs(Math.cos((1 - f) * Math.PI));
      return (
        <Panel style={{ left: 60, right: 300, top, height: 330, display: "flex", alignItems: "center", justifyContent: "center", background: dark ? C.ink : C.paper, transform: `scaleX(${t < k - 0.1 ? 1 : sx})` }}>
          <div style={heavyText(shown ? 110 : 160, shown ? (dark ? C.paper : C.ink) : C.red, dark ? C.ink : C.paper)}>{shown ? text : "???"}</div>
        </Panel>
      );
    };
    body = (
      <>
        <SpeedLines inner={300} cx={420} />
        {card(380, "業火の竜巻", 0, true)}
        {card(1060, "大津波", 0.05, false)}
        <Onomato text="VS" at={r} x={420} y={890} size={170} color={C.red} rotate={-6} font={F.heavy} />
        <Onomato text="バンッ!!" at={k + 0.02} x={720} y={1580} size={200} color={C.red} rotate={8} />
      </>
    );
  }
  return (
    <Stage hits={[a, b, k]} inverts={[k]}>
      <Sfx at={a} name="hit" />
      <Sfx at={b} name="hit" />
      <Sfx at={w} name="whoosh" vol={0.6} />
      <Sfx at={j} name="tick" vol={0.6} />
      <Sfx at={r} name="whoosh" />
      <Sfx at={k} name="impact" />
      {body}
      <CutIn at={w} />
      <CutIn at={r} color={C.red} />
      <Narr sc={sc} />
    </Stage>
  );
}

// ---------- AI 判定 ----------
function Meter({ label, value, at, color = C.ink, top }: { label: string; value: number; at: number; color?: string; top: number }) {
  const { t } = useT();
  const p = interpolate(t - at, [0, 0.35], [0, value], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Pop at={at} from={1.6} style={{ left: 50, top, width: 700 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: F.brush, fontSize: 96 }}>{label}</span>
        <span style={heavyText(90, color)}>{p.toFixed(2)}</span>
      </div>
      <div style={{ height: 60, border: `7px solid ${C.ink}`, background: C.paper, boxShadow: `8px 8px 0 ${C.ink}` }}>
        <div style={{ height: "100%", width: `${p * 100}%`, background: color }} />
      </div>
    </Pop>
  );
}

export function Judge({ sc }: P) {
  const { t, f } = useT();
  const v = mark(sc, "ベクトル");
  const z = mark(sc, "ゾクセエ");
  const s = mark(sc, "ツヨサ");
  const d = mark(sc, "ドクソオ");
  const n = mark(sc, "スウチカ");
  let body: ReactNode;
  if (t < z) {
    const rows = Array.from({ length: 14 }, (_, i) => {
      const nums = Array.from({ length: 3 }, (_, j) => (random(`v${i}${j}${Math.floor(f / 2)}`) * 2 - 1).toFixed(3)).join("  ");
      return (
        <div key={i} style={{ color: (i + Math.floor(f / 3)) % 5 === 0 ? C.red : C.ink, opacity: interpolate(t - v - i * 0.03, [0, 0.1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          {nums}
        </div>
      );
    });
    body = (
      <>
        <Tone />
        <Pop at={0} from={1.8} style={{ left: 40, top: 200 }}>
          <Chip bg={C.red} size={44}>AI判定</Chip>
          <div style={{ ...heavyText(140), marginTop: 20, textShadow: `10px 10px 0 ${C.red}` }}>業火の竜巻</div>
        </Pop>
        <div style={{ position: "absolute", left: 50, top: 640, fontFamily: F.body, fontWeight: 900, fontSize: 54, lineHeight: 1.25, letterSpacing: "0.02em" }}>
          {t >= v && <div style={{ fontSize: 46, color: C.muted }}>vec = [</div>}
          {t >= v && rows}
        </div>
        <Onomato text="ベクトル化ッ!!" at={v + 0.05} x={420} y={1650} size={140} color={C.red} rotate={-7} />
      </>
    );
  } else {
    // 炎 72% の属性分布
    const attrs: [string, number, string][] = [
      ["炎", 0.72, C.red],
      ["水", 0.06, "#5b6f8a"],
      ["雷", 0.07, "#b49a2a"],
      ["光", 0.05, C.tone],
      ["闇", 0.04, "#3a3434"],
      ["社畜", 0.06, C.muted],
    ];
    const ap = interpolate(t - z, [0, 0.3], [0, 1], { extrapolateRight: "clamp" });
    body = (
      <>
        <Tone />
        <Pop at={z} from={1.6} style={{ left: 50, top: 150, width: 700 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontFamily: F.brush, fontSize: 96 }}>属性</span>
            <span style={heavyText(100, C.red)}>炎 {Math.round(72 * ap)}%</span>
          </div>
          <div style={{ display: "flex", height: 80, border: `7px solid ${C.ink}`, boxShadow: `8px 8px 0 ${C.ink}` }}>
            {attrs.map(([name, p, col]) => (
              <div key={name} style={{ width: `${(ap * p + (1 - ap) / 6) * 100}%`, background: col, borderRight: `3px solid ${C.ink}`, color: C.paper, fontFamily: F.heavy, fontSize: 44, textAlign: "center", lineHeight: "80px", overflow: "hidden" }}>
                {p > 0.5 ? name : ""}
              </div>
            ))}
          </div>
        </Pop>
        <Meter label="強さ" value={0.84} at={s} top={520} />
        <Meter label="独創性" value={0.71} at={d} top={860} />
        <Splat at={n} x={420} y={1560} scale={1.1} seed="atk" />
        <Pop at={n} from={3} style={{ left: 50, top: 1380, transform: "rotate(-7deg)" }}>
          <div style={{ ...heavyText(200, C.paper, C.ink), filter: `drop-shadow(12px 12px 0 ${C.ink})` }}>ATK 38</div>
        </Pop>
      </>
    );
  }
  return (
    <Stage hits={[z, s, d, n]} inverts={[n]}>
      <Sfx at={v} name="whoosh" />
      {Array.from({ length: 8 }, (_, i) => (
        <Sfx key={i} at={v + 0.05 + i * 0.07} name="tick" vol={0.35} />
      ))}
      <Sfx at={z} name="hit" />
      <Sfx at={s} name="hit" />
      <Sfx at={d} name="hit" />
      <Sfx at={n} name="impact" />
      {body}
      <CutIn at={z} />
      <Narr sc={sc} />
    </Stage>
  );
}

// ---------- 相性 ----------
export function Affinity({ sc }: P) {
  const { t } = useT();
  const at = [mark(sc, "ミズ"), mark(sc, "ホノオ"), mark(sc, "シャチク"), mark(sc, "カミナリ")];
  const y4 = mark(sc, "ヨン");
  const z = sc.lines[1].at;
  const CX = 420;
  const CY = 840;
  const R = 290;
  const nodes: [string, number, number][] = [
    ["水", CX, CY - R],
    ["炎", CX + R, CY],
    ["社畜", CX, CY + R],
    ["雷", CX - R, CY],
  ];
  const zoom = interpolate(t - z, [0, 0.18], [1, 2.3], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const arrows = nodes.map(([, x1, y1], i) => {
    const [, x2, y2] = nodes[(i + 1) % 4];
    const show = interpolate(t - (i < 3 ? at[i + 1] : y4), [0, 0.15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const ux = (x2 - x1) / Math.hypot(x2 - x1, y2 - y1);
    const uy = (y2 - y1) / Math.hypot(x2 - x1, y2 - y1);
    const sx = x1 + ux * 135;
    const sy = y1 + uy * 135;
    const ex = sx + (x2 - ux * 150 - sx) * show;
    const ey = sy + (y2 - uy * 150 - sy) * show;
    return show > 0 ? <line key={i} x1={sx} y1={sy} x2={ex} y2={ey} stroke={C.red} strokeWidth={22} markerEnd="url(#ah)" /> : null;
  });
  return (
    <Stage hits={[...at, y4, z]} inverts={[z]}>
      {at.map((a, i) => (
        <Sfx key={i} at={a} name="taiko" vol={0.8} />
      ))}
      <Sfx at={y4} name="impact" vol={0.8} />
      <Sfx at={z} name="whoosh" />
      <Sfx at={z + 0.05} name="clang" vol={0.5} />
      <Tone />
      <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: `${CX}px ${CY + R}px` }}>
        <SpeedLines inner={340} cx={CX} cy={CY} opacity={0.35} />
        <div style={{ position: "absolute", left: 40, top: 150 }}>
          <Chip size={44}>相性</Chip>
          <span style={{ fontFamily: F.body, fontWeight: 900, fontSize: 40, marginLeft: 16 }}>→ は「強い」</span>
        </div>
        <svg style={{ position: "absolute", inset: 0 }} width="1080" height="1920">
          <defs>
            <marker id="ah" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="2.6" markerHeight="2.6" orient="auto">
              <path d="M0 0L10 5L0 10Z" fill={C.red} />
            </marker>
          </defs>
          {arrows}
        </svg>
        {nodes.map(([name, x, y], i) => (
          <Pop key={name} at={at[i]} style={{ left: x - 125, top: y - 125 }}>
            <div
              style={{
                width: 250,
                height: 250,
                borderRadius: "50%",
                background: name === "社畜" ? C.ink : C.paper,
                border: `10px solid ${C.ink}`,
                boxShadow: `10px 10px 0 ${C.red}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                ...heavyText(name.length > 1 ? 92 : 140, name === "社畜" ? C.paper : C.ink, name === "社畜" ? C.ink : C.paper),
              }}
            >
              {name}
            </div>
          </Pop>
        ))}
        {t >= z && (
          <>
            <Onomato text="汗" at={z + 0.1} x={CX + 140} y={CY + R - 120} size={70} color="#5b6f8a" rotate={20} />
            <div style={{ position: "absolute", left: CX - 160, top: CY + R + 140, fontFamily: F.brush, fontSize: 34, transform: "rotate(-4deg)" }}>※残業の力</div>
          </>
        )}
      </AbsoluteFill>
      {t < z && (
        <Pop at={y4} from={2} style={{ left: 40, top: 1380, display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ width: 170, height: 170, borderRadius: "50%", background: C.paper, border: `8px solid ${C.ink}`, display: "flex", alignItems: "center", justifyContent: "center", ...heavyText(100) }}>光</div>
          <div style={heavyText(110, C.red)}>⇄</div>
          <div style={{ width: 170, height: 170, borderRadius: "50%", background: C.ink, border: `8px solid ${C.ink}`, display: "flex", alignItems: "center", justifyContent: "center", ...heavyText(100, C.paper, C.ink) }}>闇</div>
          <div style={{ fontFamily: F.body, fontWeight: 900, fontSize: 40, whiteSpace: "nowrap" }}>互いに弱点</div>
        </Pop>
      )}
      {t < z && <Narr sc={sc} />}
      <ZundaSub text={sc.lines[1].sub} at={z} y={1540} />
    </Stage>
  );
}

// ---------- カウンター ----------
export function Counter({ sc }: P) {
  const { t } = useT();
  const s = mark(sc, "ショオボオ");
  const y = mark(sc, "ヨミキッタ");
  const c = mark(sc, "カウンタア");
  let body: ReactNode;
  if (t < c) {
    body = (
      <>
        <div style={{ position: "absolute", left: -100, right: -100, top: -100, height: t < s ? 2200 : 1060, background: C.red, transform: "rotate(-6deg)", overflow: "hidden", borderBottom: `14px solid ${C.ink}` }}>
          <SpeedLines color={C.ink} inner={260} cx={640} cy={t < s ? 1060 : 620} seed="fire" opacity={0.7} />
        </div>
        <Pop at={0} from={2} style={{ left: 50, top: t < s ? 720 : 300, transform: "rotate(-6deg)" }}>
          <Chip size={44} style={{ marginBottom: 16 }}>攻撃</Chip>
          <div style={heavyText(t < s ? 160 : 120, C.paper, C.ink)}>炎の竜巻</div>
        </Pop>
        <Onomato text="ゴオォッ" at={0.1} x={680} y={t < s ? 1400 : 800} size={t < s ? 170 : 110} color={C.paper} rotate={10} />
        {t >= s && (
          <>
            <Tone style={{ top: 1060 }} />
            <Pop at={s} from={2.6} style={{ left: 50, top: 1180, transform: "rotate(3deg)" }}>
              <Chip bg={C.paper} fg={C.ink} size={44} style={{ marginBottom: 16 }}>防御</Chip>
              <div style={{ ...heavyText(124), textShadow: `10px 10px 0 ${C.red}` }}>消防車を召喚</div>
            </Pop>
            <Onomato text="ウゥ〜〜ッ!!" at={s + 0.12} x={470} y={1640} size={130} color={C.ink} rotate={-6} />
          </>
        )}
        {t >= y && (
          <Pop at={y} from={1.8} style={{ right: 300, top: 400 }}>
            <div style={{ writingMode: "vertical-rl", background: C.ink, color: C.paper, fontFamily: F.heavy, fontSize: 70, padding: "20px 12px", border: `6px solid ${C.paper}`, boxShadow: `10px 10px 0 ${C.ink}` }}>完全に読み切った!</div>
          </Pop>
        )}
      </>
    );
  } else {
    body = (
      <>
        <AbsoluteFill style={{ background: C.ink }} />
        <SpeedLines color={C.red} inner={380} seed="cnt" />
        <Splat at={c} x={240} y={500} seed="c1" scale={1.2} />
        <Splat at={c + 0.15} x={860} y={1500} seed="c2" />
        <Pop at={c} from={3.2} style={{ left: 0, right: 0, top: 640, display: "flex", flexDirection: "column", alignItems: "center", transform: "rotate(-8deg)" }}>
          <div style={heavyText(210, C.paper, C.ink)}>カウンター</div>
          <div style={{ ...heavyText(250, C.red, C.paper), marginTop: 10 }}>炸裂!!!</div>
        </Pop>
        <Pop at={c + 0.3} from={1.6} style={{ left: 60, top: 1300 }}>
          <Chip bg={C.paper} fg={C.ink} size={46}>攻撃側に反射ダメージ!</Chip>
        </Pop>
      </>
    );
  }
  return (
    <Stage hits={[s, y, c, c + 0.15]} inverts={[c, c + 0.17]} bg={C.paper}>
      <Sfx at={0.02} name="whoosh" />
      <Sfx at={s} name="impact" />
      <Sfx at={y} name="clang" vol={0.7} />
      <Sfx at={c} name="shatter" />
      <Sfx at={c} name="slam" vol={0.7} />
      {body}
      <CutIn at={s} />
      {t < c && <Narr sc={sc} />}
    </Stage>
  );
}

// ---------- 弱体化 ----------
export function Nerf({ sc }: P) {
  const { t } = useT();
  const k = mark(sc, "コトバ") + 0.05;
  const o = mark(sc, "オナジ");
  const r = mark(sc, "レンパツ");
  const so = mark(sc, "ソレワ");
  let body: ReactNode;
  if (t < o) {
    const fall = interpolate(t - k, [0, 0.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const atk = t < k ? Math.round(interpolate(t, [0, k], [40, 99], { extrapolateRight: "clamp" })) : 18;
    body = (
      <>
        <Tone />
        <div style={{ position: "absolute", left: 40, top: 360, transform: `translateY(${fall * fall * 500}px) rotate(${fall * 14}deg)` }}>
          <div style={{ ...heavyText(124), textShadow: `0 0 30px ${C.red}` }}>最強究極</div>
          <div style={{ ...heavyText(124), textShadow: `0 0 30px ${C.red}` }}>超絶ギガ</div>
          <div style={{ ...heavyText(124), textShadow: `0 0 30px ${C.red}` }}>ビーム!!!</div>
        </div>
        <div style={{ position: "absolute", left: 50, top: 180, ...heavyText(90, t < k ? C.ink : C.red) }}>
          ATK {atk}
          {t >= k && <span style={{ fontSize: 70 }}> ↓↓</span>}
        </div>
        <Pop at={k} from={2.6} style={{ left: 40, top: 1380, transform: "rotate(-8deg)" }}>
          <div style={{ fontFamily: F.heavy, fontSize: 92, color: C.paper, background: C.red, border: `8px solid ${C.ink}`, padding: "10px 24px", boxShadow: `12px 12px 0 ${C.ink}` }}>盛りすぎて空回り…!</div>
        </Pop>
      </>
    );
  } else if (t < so) {
    body = (
      <>
        <Tone />
        {[0, 0.12, 0.24].map((d, i) => (
          <Pop key={i} at={o + d} from={1.8} style={{ left: 60 + i * 50, top: 300 + i * 260, transform: `rotate(${-4 + i * 3}deg)`, opacity: 1 - i * 0.25 }}>
            <div style={heavyText(150)}>火炎斬り</div>
          </Pop>
        ))}
        <Pop at={r} from={2.6} style={{ left: 40, top: 1200, transform: "rotate(5deg)" }}>
          <div style={{ fontFamily: F.heavy, fontSize: 92, color: C.paper, background: C.ink, border: `8px solid ${C.ink}`, padding: "10px 24px", boxShadow: `12px 12px 0 ${C.red}` }}>技がマンネリ化…!</div>
        </Pop>
        <Pop at={r + 0.25} from={1.6} style={{ left: 60, top: 1420 }}>
          <Chip bg={C.paper} fg={C.ink} size={44}>相手のパクリも威力ダウン</Chip>
        </Pop>
      </>
    );
  } else {
    const z = interpolate(t - so, [0, 1.2], [1.25, 1], { extrapolateRight: "clamp" });
    body = (
      <>
        <AbsoluteFill style={{ background: C.ink }} />
        <div style={{ position: "absolute", left: -60, top: 380, fontFamily: F.brush, fontSize: 920, lineHeight: 1, color: C.red, opacity: 0.85, transform: `scale(${z})` }}>弱</div>
      </>
    );
  }
  return (
    <Stage hits={[k, r, so]} inverts={[so]}>
      <Sfx at={0.02} name="charge" vol={0.5} />
      <Sfx at={k} name="buzz" />
      {[0, 0.12, 0.24].map((d) => (
        <Sfx key={d} at={o + d} name="hit" vol={0.6} />
      ))}
      <Sfx at={r} name="buzz" />
      <Sfx at={so} name="impact" vol={0.8} />
      {body}
      <CutIn at={o} />
      <Narr sc={sc} dark={t >= so} />
    </Stage>
  );
}

// ---------- 気合ため → 一撃 ----------
export function Charge({ sc }: P) {
  const { t, f } = useT();
  const k = mark(sc, "キアイ");
  const i = mark(sc, "イチゲキ");
  const o = mark(sc, "オモイ");
  let body: ReactNode;
  if (t < i) {
    const g = interpolate(t, [k, i - 0.1], [1, 1.69], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const shake = (g - 1) * 16;
    body = (
      <AbsoluteFill style={{ transform: `translate(${(random(`cx${f}`) - 0.5) * shake}px,${(random(`cy${f}`) - 0.5) * shake}px)` }}>
        <AbsoluteFill style={{ background: C.ink }} />
        <SpeedLines color="#3a3434" inner={300} cx={420} />
        <Pop at={0} from={1.6} style={{ left: 40, top: 220 }}>
          <div style={{ fontFamily: F.brush, fontSize: 150, color: C.paper }}>にらみ合い…!</div>
        </Pop>
        <div style={{ position: "absolute", left: 50, top: 560, display: "flex", gap: 60 }}>
          <Chip bg={C.paper} fg={C.ink} size={70}>防御</Chip>
          <span style={heavyText(80, C.red, C.ink)}>⇄</span>
          <Chip bg={C.paper} fg={C.ink} size={70}>防御</Chip>
        </div>
        <div style={{ position: "absolute", left: 50, top: 860, width: 700 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", color: C.paper }}>
            <span style={{ fontFamily: F.brush, fontSize: 100 }}>気合</span>
            <span style={heavyText(110, C.red, C.paper)}>x{g.toFixed(2)}</span>
          </div>
          <div style={{ height: 70, border: `7px solid ${C.paper}` }}>
            <div style={{ height: "100%", width: `${((g - 1) / 1) * 100}%`, background: C.red }} />
          </div>
        </div>
        <Onomato text="ゴゴゴゴ" at={0.15} x={160} y={1420} size={130} color={C.paper} stroke={C.ink} vertical rotate={4} />
        <Onomato text="ゴゴゴ" at={0.5} x={640} y={1500} size={110} color={C.paper} stroke={C.ink} vertical rotate={-5} />
      </AbsoluteFill>
    );
  } else {
    const hp = interpolate(t - o, [0, 0.25], [100, 12], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    body = (
      <>
        <Tone />
        <SpeedLines inner={300} seed="crit" />
        <div style={{ position: "absolute", left: 50, top: 180, width: 700 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontFamily: F.heavy, fontSize: 60 }}>相手 HP</span>
            <span style={heavyText(90, hp < 30 ? C.red : C.ink)}>{Math.round(hp)}</span>
          </div>
          <div style={{ height: 60, border: `7px solid ${C.ink}`, background: C.paper, boxShadow: `8px 8px 0 ${C.ink}` }}>
            <div style={{ height: "100%", width: `${hp}%`, background: hp < 30 ? C.red : C.ink }} />
          </div>
        </div>
        <Pop at={i} from={1.8} style={{ left: 50, top: 480 }}>
          <Chip bg={C.red} size={56}>気合解放 x1.7!</Chip>
        </Pop>
        <Splat at={o} x={440} y={1000} scale={1.5} seed="kr" />
        <Pop at={o} from={3} style={{ left: 0, right: 0, top: 820, display: "flex", justifyContent: "center", transform: "rotate(-6deg)" }}>
          <div style={{ ...heavyText(146, C.paper, C.ink), filter: `drop-shadow(12px 12px 0 ${C.ink})` }}>会心の一撃!</div>
        </Pop>
        <Onomato text="ズドンッ!!" at={o + 0.06} x={520} y={1480} size={230} color={C.ink} rotate={-10} />
      </>
    );
  }
  return (
    <Stage hits={[i, o]} inverts={[o, o + 0.13]}>
      <Sfx at={0} name="rumble" />
      <Sfx at={k} name="charge" />
      <Sfx at={i} name="whoosh" />
      <Sfx at={o} name="slam" />
      <Sfx at={o} name="clang" vol={0.6} />
      {body}
      <CutIn at={i} color={C.red} />
      <Narr sc={sc} dark={t < i} />
    </Stage>
  );
}

// ---------- アーキテクチャ ----------
export function Infra({ sc }: P) {
  const { t, f } = useT();
  const cf = mark(sc, "クラウド");
  const hy = mark(sc, "ヘヤゴト");
  const du = mark(sc, "デュラブル");
  const ws = mark(sc, "ウェブ");
  const ta = mark(sc, "タタカイ");
  const rooms = ["#4271", "#0815", "#3350"];
  const phones = [130, 450];
  const dash = -f * 6;
  return (
    <Stage hits={[cf, hy, du, ws]} inverts={[cf]}>
      <Sfx at={0} name="rumble" vol={0.7} />
      <Sfx at={cf} name="impact" />
      {rooms.map((_, i) => (
        <Sfx key={i} at={hy + i * 0.12} name="taiko" vol={0.6} />
      ))}
      <Sfx at={du} name="clang" vol={0.6} />
      <Sfx at={ws} name="whoosh" />
      {[0, 0.15, 0.3].map((d) => (
        <Sfx key={d} at={ta + d} name="tick" vol={0.6} />
      ))}
      <Tone />
      <Onomato text="裏側" at={0} x={170} y={110} size={110} color={C.red} rotate={-8} />
      {/* 矢印・WebSocket の線 */}
      <svg style={{ position: "absolute", inset: 0 }} width="1080" height="1920">
        {t >= hy && <line x1={405} y1={470} x2={405} y2={560} stroke={C.ink} strokeWidth={14} />}
        {t >= ws &&
          phones.map((x) => (
            <g key={x}>
              <line x1={x + 100} y1={1150} x2={180} y2={890} stroke={C.red} strokeWidth={12} strokeDasharray="28 18" strokeDashoffset={dash} />
              <circle cx={x + 100 + (180 - x - 100) * ((t * 2.2) % 1)} cy={1150 - 260 * ((t * 2.2) % 1)} r={16} fill={C.ink} />
            </g>
          ))}
      </svg>
      <Pop at={cf} from={2} style={{ left: 40, top: 220, width: 730 }}>
        <Panel style={{ position: "relative", padding: "20px 28px", background: C.ink }}>
          <div style={heavyText(88, C.paper, C.ink)}>Cloudflare</div>
          <div style={{ fontFamily: F.body, fontWeight: 900, fontSize: 36, color: C.paper }}>Workers + Static Assets (Preact)</div>
        </Panel>
      </Pop>
      <Pop at={hy} from={1.6} style={{ left: 40, top: 560, width: 730 }}>
        <Panel style={{ position: "relative", padding: "18px 24px" }}>
          <div style={{ fontFamily: F.heavy, fontSize: 48 }}>BattleRoom ×部屋数</div>
          <div style={{ display: "flex", gap: 18, marginTop: 14 }}>
            {rooms.map((r, i) => (
              <div
                key={r}
                style={{
                  flex: 1,
                  height: 140,
                  border: `6px solid ${C.ink}`,
                  background: i === 0 ? C.red : C.paper,
                  color: i === 0 ? C.paper : C.ink,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: F.heavy,
                  fontSize: 50,
                  opacity: t >= hy + i * 0.12 ? 1 : 0,
                }}
              >
                {r}
              </div>
            ))}
          </div>
        </Panel>
      </Pop>
      <Pop at={du} from={2.4} style={{ left: 80, top: 900, transform: "rotate(-5deg)" }}>
        <div style={{ fontFamily: F.heavy, fontSize: 60, color: C.paper, background: C.red, border: `7px solid ${C.ink}`, padding: "4px 24px", boxShadow: `10px 10px 0 ${C.ink}` }}>Durable Objects</div>
      </Pop>
      {phones.map((x, i) => (
        <Pop key={x} at={ws + i * 0.08} from={1.6} style={{ left: x, top: 1150 }}>
          <div style={{ width: 200, height: 320, border: `9px solid ${C.ink}`, borderRadius: 34, background: C.paper, boxShadow: `10px 10px 0 ${C.ink}`, display: "flex", alignItems: "center", justifyContent: "center", ...heavyText(64) }}>P{i + 1}</div>
        </Pop>
      ))}
      <Pop at={ws + 0.1} from={2} style={{ left: 310, top: 1040, transform: "rotate(-24deg)" }}>
        <Chip bg={C.paper} fg={C.red} size={40}>WebSocket</Chip>
      </Pop>
      {["ターン管理 (alarm)", "同時公開", "観戦にも配信"].map((s, i) => (
        <Pop key={s} at={ta + i * 0.15} from={1.8} style={{ left: 40 + i * 30, top: 1530 + i * 100 }}>
          <Chip bg={i === 0 ? C.ink : C.paper} fg={i === 0 ? C.paper : C.ink} size={48}>
            {s}
          </Chip>
        </Pop>
      ))}
      <Narr sc={sc} size={50} height={1500} />
    </Stage>
  );
}

// ---------- AI 構成と無料枠 ----------
export function Ai({ sc }: P) {
  const { t } = useT();
  const pl = mark(sc, "プラモ");
  const je = mark(sc, "ジェマ");
  const mu = mark(sc, "ムリョオ");
  const z = sc.lines[1].at;
  const BUBBLE = "「業火の竜巻」が真正面から激突ゥーッ!!";
  const typed = Math.floor(interpolate(t - je, [0, 0.6], [0, BUBBLE.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const zoom = interpolate(t - z, [0, 0.15], [1, 1.12], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Stage hits={[pl, je, mu, z]} inverts={[mu]}>
      <Sfx at={0.02} name="whoosh" />
      <Sfx at={pl} name="hit" />
      <Sfx at={je} name="hit" />
      {Array.from({ length: 6 }, (_, i) => (
        <Sfx key={i} at={je + 0.05 + i * 0.1} name="key" vol={0.5} />
      ))}
      <Sfx at={mu} name="slam" />
      <Sfx at={z} name="clang" vol={0.5} />
      <Tone />
      <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: "420px 1250px" }}>
        <Pop at={0} from={1.5} style={{ left: 40, top: 150, width: 730 }}>
          <Panel style={{ position: "relative", padding: "14px 24px", background: C.ink }}>
            <div style={{ fontFamily: F.heavy, fontSize: 52, color: C.paper }}>Workers AI</div>
          </Panel>
        </Pop>
        <Pop at={pl} from={1.8} style={{ left: 40, top: 350, width: 350 }}>
          <Panel style={{ position: "relative", padding: "18px 20px", height: 520 }}>
            <div style={{ fontFamily: F.brush, fontSize: 96 }}>判定</div>
            <div style={{ fontFamily: F.heavy, fontSize: 44, color: C.red, lineHeight: 1.1 }}>
              PLaMo
              <br />
              Embedding 1B
            </div>
            <div style={{ fontFamily: F.body, fontWeight: 900, fontSize: 32, marginTop: 20, lineHeight: 1.5 }}>
              技名 → ベクトル
              <br />→ 属性アンカーと
              <br />　 コサイン類似度
            </div>
          </Panel>
        </Pop>
        <Pop at={je} from={1.8} style={{ left: 420, top: 350, width: 350 }}>
          <Panel style={{ position: "relative", padding: "18px 20px", height: 520 }}>
            <div style={{ fontFamily: F.brush, fontSize: 96 }}>実況</div>
            <div style={{ fontFamily: F.heavy, fontSize: 44, color: C.red, lineHeight: 1.1 }}>Gemma 4</div>
            <div style={{ fontFamily: F.body, fontWeight: 900, fontSize: 34, marginTop: 20, lineHeight: 1.4, background: C.ink, color: C.paper, padding: 14, borderRadius: 18 }}>{BUBBLE.slice(0, typed) || "…"}</div>
          </Panel>
        </Pop>
        <Pop at={mu} from={3} style={{ left: 190, top: 1010, transform: "rotate(-12deg)" }}>
          <div
            style={{
              width: 460,
              height: 460,
              borderRadius: "50%",
              border: `22px solid ${C.red}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: F.brush,
              fontSize: 124,
              whiteSpace: "nowrap",
              color: C.red,
              background: "rgba(251,250,246,.85)",
            }}
          >
            無料枠
          </div>
        </Pop>
        <Pop at={mu + 0.2} from={1.4} style={{ left: 40, top: 1500 }}>
          <Chip bg={C.paper} fg={C.ink} size={36}>10,000 Neurons/日 · AiBudget で上限ガード</Chip>
        </Pop>
      </AbsoluteFill>
      {t < z && <Narr sc={sc} />}
      <ZundaSub text={sc.lines[1].sub} at={z} y={1600} />
    </Stage>
  );
}

// ---------- 締め ----------
export function Cta({ sc }: P) {
  const { t } = useT();
  const g = sc.lines[0].at;
  const n = mark(sc, "ナグリ");
  const ti = mark(sc, "エエアイ");
  if (t >= ti) {
    return (
      <Stage hits={[ti]} inverts={[ti]}>
        <Sfx at={ti} name="slam" />
        <Logo at={ti} top={330} />
        <Pop at={ti + 0.35} from={1.6} style={{ left: 0, right: 0, top: 1480, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          <Chip bg={C.ink} size={54}>スマホで2人対戦 / 観戦OK</Chip>
          <Chip bg={C.red} size={54}>部屋番号4桁で集合!!</Chip>
        </Pop>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 30, display: "flex", justifyContent: "center" }}>
          <span style={{ fontFamily: F.body, fontSize: 28, color: C.ink, background: C.paper, padding: "4px 16px" }}>VOICEVOX:青山龍星 / VOICEVOX:ずんだもん</span>
        </div>
      </Stage>
    );
  }
  return (
    <Stage hits={[n]} inverts={[n]} bg={C.ink}>
      <Sfx at={g} name="whoosh" />
      <Sfx at={n} name="impact" />
      <Sfx at={n} name="hit" />
      <SpeedLines color={C.red} inner={360} seed="cta" />
      <div style={{ position: "absolute", left: 0, right: 0, top: 260, display: "flex", justifyContent: "center" }}>
        <div style={{ writingMode: "vertical-rl", fontFamily: F.brush, fontSize: 230, color: C.paper, lineHeight: 1.25, WebkitTextStroke: `16px ${C.ink}`, paintOrder: "stroke fill" }}>
          <div>語彙で</div>
          <div style={{ paddingTop: 200, color: t >= n ? C.paper : "transparent" }}>殴り合え。</div>
        </div>
      </div>
      <Onomato text="ドゴォッ!!" at={n + 0.04} x={300} y={1600} size={190} color={C.red} rotate={-12} />
    </Stage>
  );
}

export const SCENE_VIEWS: Record<string, (p: P) => ReactNode> = {
  title: Title,
  input: Input,
  judge: Judge,
  affinity: Affinity,
  counter: Counter,
  nerf: Nerf,
  charge: Charge,
  infra: Infra,
  ai: Ai,
  cta: Cta,
};
