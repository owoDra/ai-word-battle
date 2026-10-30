// 劇画演出の部品: 集中線・描き文字・縦書きナレーション・揺れ・反転・血しぶき・効果音
import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Audio, interpolate, random, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

// macOS 標準のヒラギノを使う (Google Fonts の日本語サブセットは数百ファイルになり描画がタイムアウトする)
// weight は各要素で指定する: heavy = 角ゴ W9, brush = 明朝 W6, body = 角ゴ W8
export const F = {
  heavy: '"Hiragino Sans", sans-serif',
  brush: '"Hiragino Mincho ProN", serif',
  body: '"Hiragino Sans", sans-serif',
};

// ゲーム本編 (src/client/style.css) と同じ白黒 + 血の赤
export const C = {
  paper: "#fbfaf6",
  ink: "#121010",
  red: "#c8102e",
  tone: "#d6d2c9",
  muted: "#5d5753",
  zunda: "#5fb83a",
};

// シーン内の秒数と、ある時刻からの経過フレーム
export function useT() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return { f, t: f / fps, fps, since: (sec: number) => f - Math.round(sec * fps) };
}

// sec 秒に叩きつけるように出る 0→1 (少し行き過ぎる)
export function usePunch(sec: number, stiffness = 260) {
  const { since, fps } = useT();
  return spring({ frame: since(sec), fps, config: { damping: 11, stiffness, mass: 0.6 } });
}

export function Sfx({ at, name, vol = 1 }: { at: number; name: string; vol?: number }) {
  const { fps } = useVideoConfig();
  return (
    <Sequence from={Math.max(0, Math.round(at * fps))} layout="none">
      <Audio src={staticFile(`sfx/${name}.wav`)} volume={vol} />
    </Sequence>
  );
}

// 集中線。2 フレームごとに引き直して劇画のザワつきを出す
export function SpeedLines({
  color = C.ink,
  count = 110,
  inner = 360,
  cx = 540,
  cy = 960,
  opacity = 1,
  seed = "sl",
}: {
  color?: string;
  count?: number;
  inner?: number;
  cx?: number;
  cy?: number;
  opacity?: number;
  seed?: string;
}) {
  const { f } = useT();
  const k = Math.floor(f / 2);
  const R = 2400;
  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + random(`${seed}a${i}${k}`) * 0.05;
    const w = 0.006 + random(`${seed}w${i}${k}`) * 0.016;
    const r = inner * (0.7 + random(`${seed}r${i}${k}`) * 0.8);
    const p = (ang: number, rr: number) => `${cx + Math.cos(ang) * rr},${cy + Math.sin(ang) * rr}`;
    paths.push(`M${p(a, r)}L${p(a - w, R)}L${p(a + w, R)}Z`);
  }
  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      <svg width="1080" height="1920" viewBox="0 0 1080 1920">
        <path d={paths.join("")} fill={color} />
      </svg>
    </AbsoluteFill>
  );
}

// 網点トーン
export function Tone({ color = "rgba(18,16,16,.22)", size = 14, style }: { color?: string; size?: number; style?: CSSProperties }) {
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `radial-gradient(circle, ${color} ${size * 0.13}px, transparent ${size * 0.15}px)`,
        backgroundSize: `${size}px ${size}px`,
        ...style,
      }}
    />
  );
}

// 紙のザラつき
export function Grain() {
  const { f } = useT();
  return (
    <AbsoluteFill style={{ mixBlendMode: "multiply", opacity: 0.16, pointerEvents: "none" }}>
      <svg width="1080" height="1920">
        <filter id="g">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={Math.floor(f / 3) % 7} />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.1" />
        </filter>
        <rect width="1080" height="1920" filter="url(#g)" />
      </svg>
    </AbsoluteFill>
  );
}

// 衝撃のたびに揺れ、白黒反転する入れ物
export function Stage({
  hits = [],
  inverts = [],
  bg = C.paper,
  children,
}: {
  hits?: number[];
  inverts?: number[];
  bg?: string;
  children: ReactNode;
}) {
  const { f, fps } = useT();
  let dx = 0;
  let dy = 0;
  let rot = 0;
  for (const h of hits) {
    const d = f - Math.round(h * fps);
    if (d < 0 || d > 12) continue;
    const amp = 38 * (1 - d / 12) ** 2;
    dx += (random(`x${h}${d}`) - 0.5) * 2 * amp;
    dy += (random(`y${h}${d}`) - 0.5) * 2 * amp;
    rot += (random(`r${h}${d}`) - 0.5) * amp * 0.06;
  }
  const inv = inverts.some((s) => {
    const d = f - Math.round(s * fps);
    return d >= 0 && d < 3;
  });
  return (
    <AbsoluteFill style={{ background: bg, overflow: "hidden", filter: inv ? "invert(1)" : undefined }}>
      <AbsoluteFill style={{ transform: `translate(${dx}px,${dy}px) rotate(${rot}deg) scale(${hits.length ? 1.04 : 1})` }}>{children}</AbsoluteFill>
      <Grain />
    </AbsoluteFill>
  );
}

// 描き文字 (擬音)。at 秒に叩きつけ、その後もかすかに震える
export function Onomato({
  text,
  at,
  x,
  y,
  size = 200,
  rotate = -8,
  color = C.ink,
  stroke = C.paper,
  vertical = false,
  font = F.brush,
}: {
  text: string;
  at: number;
  x: number;
  y: number;
  size?: number;
  rotate?: number;
  color?: string;
  stroke?: string;
  vertical?: boolean;
  font?: string;
}) {
  const { since } = useT();
  const d = since(at);
  if (d < 0) return null;
  const s = interpolate(d, [0, 3, 6], [2.4, 0.92, 1], { extrapolateRight: "clamp" });
  const jx = (random(`ox${text}${d >> 1}`) - 0.5) * 6;
  const jy = (random(`oy${text}${d >> 1}`) - 0.5) * 6;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%,-50%) translate(${jx}px,${jy}px) rotate(${rotate}deg) scale(${s})`,
        fontFamily: font,
        fontSize: size,
        lineHeight: 1,
        color,
        WebkitTextStroke: `${size * 0.09}px ${stroke}`,
        paintOrder: "stroke fill",
        whiteSpace: "nowrap",
        writingMode: vertical ? "vertical-rl" : undefined,
        textShadow: `${size * 0.04}px ${size * 0.04}px 0 ${C.ink}`,
        opacity: interpolate(d, [0, 1], [0, 1], { extrapolateRight: "clamp" }),
      }}
    >
      {text}
    </div>
  );
}

// 刃牙風の縦書きナレーション枠。声に合わせて文字が出る
export function Narration({
  text,
  at,
  sec,
  right = 34,
  top = 150,
  height = 1080,
  size = 54,
  dark = false,
}: {
  text: string;
  at: number;
  sec: number;
  right?: number;
  top?: number;
  height?: number;
  size?: number;
  dark?: boolean;
}) {
  const { t } = useT();
  if (t < at) return null;
  const n = Math.ceil(text.length * Math.min(1, (t - at) / (sec * 0.8)));
  const slide = interpolate(t - at, [0, 0.12], [40, 0], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        right,
        top,
        maxHeight: height,
        transform: `translateX(${slide}px)`,
        background: dark ? C.ink : C.paper,
        color: dark ? C.paper : C.ink,
        border: `5px solid ${dark ? C.paper : C.ink}`,
        boxShadow: `10px 10px 0 ${C.red}`,
        padding: "26px 18px",
        writingMode: "vertical-rl",
        fontFamily: F.body,
        fontWeight: 900,
        fontSize: size,
        lineHeight: 1.35,
        letterSpacing: "0.04em",
        textOrientation: "mixed",
      }}
    >
      {/* 先に全文で枠の大きさを確定させ、未読部分は透明にする */}
      <span>{text.slice(0, n)}</span>
      <span style={{ opacity: 0 }}>{text.slice(n)}</span>
    </div>
  );
}

// ずんだもんのツッコミ字幕
export function ZundaSub({ text, at, y = 1560 }: { text: string; at: number; y?: number }) {
  const p = usePunch(at, 320);
  const { t } = useT();
  if (t < at) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, display: "flex", flexDirection: "column", alignItems: "center", transform: `scale(${p}) rotate(-3deg)` }}>
      <div style={{ fontFamily: F.body, fontWeight: 900, fontSize: 34, color: C.paper, background: C.zunda, padding: "4px 18px", border: `4px solid ${C.ink}`, marginBottom: 10 }}>ずんだもん</div>
      <div
        style={{
          fontFamily: F.heavy,
          fontSize: 104,
          color: C.zunda,
          WebkitTextStroke: `18px ${C.paper}`,
          paintOrder: "stroke fill",
          filter: `drop-shadow(8px 8px 0 ${C.ink})`,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
    </div>
  );
}

// 血しぶき風の赤インク
export function Splat({ at, x, y, scale = 1, seed = "s", color = C.red }: { at: number; x: number; y: number; scale?: number; seed?: string; color?: string }) {
  const { since } = useT();
  const d = since(at);
  if (d < 0) return null;
  const p = interpolate(d, [0, 4], [0.2, 1], { extrapolateRight: "clamp" });
  const dots = Array.from({ length: 22 }, (_, i) => {
    const a = random(`${seed}a${i}`) * Math.PI * 2;
    const r = (60 + random(`${seed}r${i}`) * 260) * p;
    const s = 6 + random(`${seed}s${i}`) * 34;
    return <circle key={i} cx={Math.cos(a) * r} cy={Math.sin(a) * r} r={s * (1 - r / 400)} />;
  });
  return (
    <svg style={{ position: "absolute", left: x - 400, top: y - 400, overflow: "visible" }} width="800" height="800" viewBox="-400 -400 800 800">
      <g fill={color} transform={`scale(${scale})`}>
        <ellipse rx={110 * p} ry={86 * p} transform={`rotate(${random(seed) * 90})`} />
        {dots}
      </g>
    </svg>
  );
}

// コマ切り替えの斜めスラッシュ
export function CutIn({ at = 0, color = C.ink }: { at?: number; color?: string }) {
  const { since } = useT();
  const d = since(at);
  if (d < 0 || d > 6) return null;
  const x = interpolate(d, [0, 6], [-1400, 1400]);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: x, top: -400, width: 520, height: 2800, background: color, transform: "rotate(24deg)" }} />
    </AbsoluteFill>
  );
}

// 漫画のコマ枠
export function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        position: "absolute",
        background: C.paper,
        border: `8px solid ${C.ink}`,
        boxShadow: `12px 12px 0 ${C.ink}`,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
