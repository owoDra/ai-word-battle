// 各シーンの尺はナレーション音声 (src/voice.json) の長さから決める
import voice from "./voice.json";

export const FPS = 30;

export type Voice = "ryusei" | "zunda";
export interface Line {
  id: string;
  v: Voice;
  sub: string;
  sec: number;
  marks: [string, number][];
}
export interface PlacedLine extends Line {
  at: number; // シーン先頭からの開始秒
}
export interface PlacedScene {
  id: string;
  from: number; // フレーム
  dur: number; // フレーム
  lines: PlacedLine[];
}

const LINES = Object.fromEntries((voice as Line[]).map((l) => [l.id, l]));

// lead = 最初のセリフまでの間, tail = 最後のセリフ後の余韻 (秒)
const SCENES: { id: string; lines: string[]; lead: number; tail: number }[] = [
  { id: "title", lines: ["hook"], lead: 0.2, tail: 0.85 },
  { id: "input", lines: ["input"], lead: 0.05, tail: 0.15 },
  { id: "judge", lines: ["judge"], lead: 0.05, tail: 0.15 },
  { id: "affinity", lines: ["affinity", "affinity_z"], lead: 0.05, tail: 0.2 },
  { id: "counter", lines: ["counter"], lead: 0.05, tail: 0.2 },
  { id: "nerf", lines: ["nerf"], lead: 0.05, tail: 0.15 },
  { id: "charge", lines: ["charge"], lead: 0.05, tail: 0.3 },
  { id: "infra", lines: ["infra"], lead: 0.05, tail: 0.15 },
  { id: "ai", lines: ["ai", "ai_z"], lead: 0.05, tail: 0.25 },
  { id: "cta", lines: ["cta"], lead: 0.05, tail: 0.85 },
];
const GAP = 0.05;

let cursor = 0;
export const TIMELINE: PlacedScene[] = SCENES.map((s) => {
  let t = s.lead;
  const lines = s.lines.map((id, i) => {
    const l = LINES[id];
    if (!l) throw new Error(`voice.json に ${id} がありません`);
    const placed = { ...l, at: t };
    t += l.sec + (i < s.lines.length - 1 ? GAP : 0);
    return placed;
  });
  const dur = Math.round((t + s.tail) * FPS);
  const scene = { id: s.id, from: cursor, dur, lines };
  cursor += dur;
  return scene;
});
export const TOTAL = cursor;

// シーン内での、あるアクセント句 (カタカナ前方一致) の開始秒
export function mark(sc: PlacedScene, kana: string, line = 0): number {
  const l = sc.lines[line];
  const m = l.marks.find(([k]) => k.startsWith(kana));
  if (!m) throw new Error(`${l.id} に ${kana} がありません`);
  return l.at + m[1];
}
