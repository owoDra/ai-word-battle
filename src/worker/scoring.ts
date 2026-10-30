import { consumeBudget, EMBED_LIMIT, estimateNeurons } from "./budget";
import { ATTR_ANCHORS, CALIBRATION_MOVES, CLICHE_ANCHORS, HYPE_ANCHORS, STRONG_ANCHORS, WEAK_ANCHORS } from "./anchors";

export const DEFAULT_EMBED_MODEL = "@cf/pfnet/plamo-embedding-1b";
// 属性 softmax の温度 (z スコア単位)。小さいほど単一属性に尖る
const ATTR_TEMPERATURE = 0.6;

export type Vec = number[];

export interface MoveScore {
  vec: Vec;
  attr: number[];
  dominant: number;
  intensity: number; // 0..1
  novelty: number; // 0..1
  hype: number; // 強い言葉を盛っただけ度 (生のコサイン類似度)
}

interface Range {
  lo: number;
  hi: number;
}

interface ScoringModel {
  attrCentroids: Vec[];
  attrMean: number[];
  attrStd: number[];
  strong: Vec;
  weak: Vec;
  cliches: Vec[];
  hypes: Vec[];
  intensityRange: Range;
  clicheRange: Range;
  relevanceRange: Range;
}

export function embedModelOf(env: Env): string {
  return env.EMBED_MODEL || DEFAULT_EMBED_MODEL;
}

export async function embed(env: Env, texts: string[]): Promise<Vec[]> {
  const model = embedModelOf(env);
  await consumeBudget(env, estimateNeurons(model, texts.join("").length), EMBED_LIMIT);
  const out: Vec[] = [];
  for (let i = 0; i < texts.length; i += 50) {
    const chunk = texts.slice(i, i + 50);
    // モデルを var で差し替えるため型は緩める
    const res = (await env.AI.run(model as "@cf/baai/bge-m3", { text: chunk })) as { data?: number[][] };
    if (!res.data || res.data.length !== chunk.length) throw new Error("embedding failed");
    out.push(...res.data.map(normalize));
  }
  return out;
}

// isolate 単位でキャッシュ。初回だけアンカーとキャリブレーション用の技をまとめて埋め込む
const cache = new Map<string, Promise<ScoringModel>>();

export function getScoringModel(env: Env): Promise<ScoringModel> {
  const key = embedModelOf(env);
  let p = cache.get(key);
  if (!p) {
    p = buildModel(env).catch((e) => {
      cache.delete(key);
      throw e;
    });
    cache.set(key, p);
  }
  return p;
}

async function buildModel(env: Env): Promise<ScoringModel> {
  const groups = [...ATTR_ANCHORS, STRONG_ANCHORS, WEAK_ANCHORS, CLICHE_ANCHORS, HYPE_ANCHORS, CALIBRATION_MOVES];
  const vecs = await embed(env, groups.flat());
  const split: Vec[][] = [];
  let k = 0;
  for (const g of groups) {
    split.push(vecs.slice(k, k + g.length));
    k += g.length;
  }
  const attrCentroids = split.slice(0, ATTR_ANCHORS.length).map(centroid);
  const [strongVecs, weakVecs, cliches, hypes, calib] = split.slice(ATTR_ANCHORS.length);
  const strong = centroid(strongVecs);
  const weak = centroid(weakVecs);

  // 属性ごとの類似度の偏りを z スコアで打ち消す
  const attrSims = attrCentroids.map((c) => calib.map((v) => dot(v, c)));
  const attrMean = attrSims.map(mean);
  const attrStd = attrSims.map((s, i) => Math.max(1e-4, Math.sqrt(mean(s.map((x) => (x - attrMean[i]) ** 2)))));

  const intensityRaw = calib.map((v) => dot(v, strong) - dot(v, weak));
  const clicheRaw = calib.map((v) => maxSim(v, cliches));
  const pairSims: number[] = [];
  for (let i = 0; i < calib.length; i++) for (let j = i + 1; j < calib.length; j++) pairSims.push(dot(calib[i], calib[j]));

  return {
    attrCentroids,
    attrMean,
    attrStd,
    strong,
    weak,
    cliches,
    hypes,
    intensityRange: { lo: percentile(intensityRaw, 0.1), hi: percentile(intensityRaw, 0.9) },
    clicheRange: { lo: percentile(clicheRaw, 0.1), hi: percentile(clicheRaw, 0.9) },
    relevanceRange: { lo: percentile(pairSims, 0.5), hi: percentile(pairSims, 0.98) },
  };
}

export function scoreVec(m: ScoringModel, vec: Vec): MoveScore {
  const z = m.attrCentroids.map((c, i) => (dot(vec, c) - m.attrMean[i]) / m.attrStd[i]);
  const attr = softmax(z.map((x) => x / ATTR_TEMPERATURE));
  return {
    vec,
    attr,
    dominant: attr.indexOf(Math.max(...attr)),
    intensity: norm(dot(vec, m.strong) - dot(vec, m.weak), m.intensityRange),
    novelty: 1 - norm(maxSim(vec, m.cliches), m.clicheRange),
    hype: maxSim(vec, m.hypes),
  };
}

// 防御技が攻撃技にどれだけ「噛み合っているか」 0..1
export function relevance(m: ScoringModel, a: Vec, b: Vec): number {
  return norm(dot(a, b), m.relevanceRange);
}

export function debugInfo(m: ScoringModel, vec: Vec) {
  return {
    rawIntensity: dot(vec, m.strong) - dot(vec, m.weak),
    rawCliche: maxSim(vec, m.cliches),
    attrZ: m.attrCentroids.map((c, i) => (dot(vec, c) - m.attrMean[i]) / m.attrStd[i]),
    ranges: { intensity: m.intensityRange, cliche: m.clicheRange, relevance: m.relevanceRange },
  };
}

export function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function normalize(v: Vec): Vec {
  const n = Math.sqrt(dot(v, v)) || 1;
  return v.map((x) => x / n);
}

function centroid(vs: Vec[]): Vec {
  const c = new Array(vs[0].length).fill(0);
  for (const v of vs) for (let i = 0; i < v.length; i++) c[i] += v[i];
  return normalize(c);
}

export function maxSim(v: Vec, vs: Vec[]): number {
  return vs.reduce((m, x) => Math.max(m, dot(v, x)), -1);
}

function softmax(xs: number[]): number[] {
  const mx = Math.max(...xs);
  const e = xs.map((x) => Math.exp(x - mx));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
}

function norm(x: number, r: Range): number {
  return Math.min(1, Math.max(0, (x - r.lo) / (r.hi - r.lo || 1)));
}
