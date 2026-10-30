import type { ResolvedKind, SideResult, TurnResult } from "../shared/protocol";
import { ATTRS } from "../shared/protocol";
import type { MoveScore } from "./scoring";

// 相性: 水>炎>社畜>雷>水 の4すくみ + 光と闇は互いに弱点
const BEATS: Record<string, string[]> = {
  水: ["炎"],
  炎: ["社畜"],
  社畜: ["雷"],
  雷: ["水"],
  光: ["闇"],
  闇: ["光"],
};
const STRONG = 1.5;
const WEAK = 0.7;

const AFFINITY: number[][] = ATTRS.map((a) =>
  ATTRS.map((d) => {
    if (BEATS[a]?.includes(d)) return STRONG;
    if (BEATS[d]?.includes(a)) return WEAK;
    return 1;
  }),
);

const MAX_CHARGE = 2;
const CHARGE_STEP = 1.3;
const CRIT_RATE = 0.1;
const COUNTER_GUARD = 0.85;
const COUNTER_RATIO = 0.3;

export interface Fighter {
  name: string;
  hp: number;
  charge: number;
}

export interface Submission {
  kind: ResolvedKind;
  text: string;
  score: MoveScore | null; // idle なら null
  mult: number; // マンネリ等のペナルティ倍率
  flags: string[];
}

export interface TurnOutcome {
  result: TurnResult;
  charges: [number, number];
}

// 攻撃側 a の属性分布が防御側 d にどれだけ効くか
function effectiveness(a: number[], d: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < d.length; j++) s += a[i] * AFFINITY[i][j] * d[j];
  return s;
}

export function resolveTurn(
  turn: number,
  fighters: [Fighter, Fighter],
  subs: [Submission, Submission],
  relevance: (a: number[], b: number[]) => number,
  rng: () => number = Math.random,
): TurnOutcome {
  const flags: [string[], string[]] = [[...subs[0].flags], [...subs[1].flags]];
  const dmg = [0, 0];
  const guard = [0, 0];
  const charges: [number, number] = [fighters[0].charge, fighters[1].charge];

  const atk = subs.map((s, i) => {
    if (s.kind !== "attack" || !s.score) return 0;
    let p = (12 + 18 * s.score.intensity + 10 * s.score.novelty) * fighters[i].charge * s.mult;
    p *= 0.9 + 0.2 * rng();
    if (fighters[i].charge > 1) flags[i].push(`気合解放 x${fighters[i].charge.toFixed(1)}!`);
    if (rng() < CRIT_RATE) {
      p *= 1.5;
      flags[i].push("会心の一撃!");
    }
    charges[i] = 1;
    return p;
  });

  const [k0, k1] = [subs[0].kind, subs[1].kind];
  let headline: string;

  if (k0 === "attack" && k1 === "attack") {
    const e01 = effectiveness(subs[0].score!.attr, subs[1].score!.attr);
    const e10 = effectiveness(subs[1].score!.attr, subs[0].score!.attr);
    dmg[1] = atk[0] * e01 * (e01 > e10 + 0.05 ? 1.2 : 1);
    dmg[0] = atk[1] * e10 * (e10 > e01 + 0.05 ? 1.2 : 1);
    if (e01 > e10 + 0.05) flags[0].push("属性で押し勝った!");
    if (e10 > e01 + 0.05) flags[1].push("属性で押し勝った!");
    headline = "真っ向勝負! 相打ち!!";
  } else if (k0 === "attack" || k1 === "attack") {
    const a = k0 === "attack" ? 0 : 1;
    const d = 1 - a;
    const as = subs[a].score!;
    const ds = subs[d];
    if (ds.kind === "defense" && ds.score) {
      const r = relevance(ds.score.vec, as.vec);
      const adv = effectiveness(ds.score.attr, as.attr) - effectiveness(as.attr, ds.score.attr);
      const g = clamp(0.25 + 0.45 * r + 0.4 * adv + 0.1 * (ds.score.intensity + ds.score.novelty), 0, 0.95) * ds.mult;
      guard[d] = g;
      dmg[d] = atk[a] * (1 - g);
      if (g >= COUNTER_GUARD) {
        dmg[a] = atk[a] * COUNTER_RATIO;
        flags[d].push("完全に読み切った!");
        headline = "カウンター炸裂!!!";
      } else if (g >= 0.6) {
        headline = "鉄壁のガード!";
      } else {
        headline = "ガードをぶち抜いた!";
      }
    } else {
      dmg[d] = atk[a];
      headline = "無防備なところに直撃!!";
    }
  } else if (k0 === "defense" || k1 === "defense") {
    for (const i of [0, 1]) {
      if (subs[i].kind === "defense") {
        charges[i] = Math.min(MAX_CHARGE, charges[i] * CHARGE_STEP);
        flags[i].push("気合をためた!");
      }
    }
    headline = k0 === k1 ? "にらみ合い…! 両者、気合をためる!" : "嵐の前の静けさ…";
  } else {
    headline = "両者、動かない…!?";
  }

  const sides = [0, 1].map((i): SideResult => {
    const s = subs[i];
    const taken = Math.round(dmg[i]);
    return {
      name: fighters[i].name,
      kind: s.kind,
      text: s.text,
      attr: s.score?.attr ?? ATTRS.map(() => 0),
      dominant: s.score?.dominant ?? -1,
      intensity: s.score?.intensity ?? 0,
      novelty: s.score?.novelty ?? 0,
      atk: Math.round(atk[i]),
      guard: guard[i],
      flags: flags[i],
      damageTaken: taken,
      hpAfter: Math.max(0, fighters[i].hp - taken),
    };
  }) as [SideResult, SideResult];

  return { result: { turn, headline, sides }, charges };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
