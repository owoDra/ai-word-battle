// クライアント・サーバー共通の型定義

export const ATTRS = ["炎", "水", "雷", "光", "闇", "社畜"] as const;
export type AttrName = (typeof ATTRS)[number];

export const MAX_HP = 100;
export const MAX_MOVE_LEN = 25;
export const TURN_SECONDS = 30;
// 結果公開は全画面が「演出と読み上げが終わった」と ack するまで待つ。ただしこの秒数で打ち切る
export const RESULT_MAX_SECONDS = 30;

export type MoveKind = "attack" | "defense";
// idle = 時間切れで棒立ち
export type ResolvedKind = MoveKind | "idle";

export type Phase = "waiting" | "input" | "result" | "finished";

export interface PublicPlayer {
  pid: string;
  name: string;
  hp: number;
  charge: number;
  submitted: boolean;
  connected: boolean;
  rematch: boolean;
}

export interface SideResult {
  name: string;
  kind: ResolvedKind;
  text: string;
  attr: number[]; // ATTRS と同じ並びの確率分布
  dominant: number; // attr の最大インデックス
  intensity: number; // 0..1
  novelty: number; // 0..1
  atk: number; // 補正後の攻撃力 (攻撃でなければ 0)
  guard: number; // 防御の軽減率 0..1 (防御でなければ 0)
  flags: string[]; // 「会心の一撃!」「マンネリ…」など
  damageTaken: number;
  hpAfter: number;
}

export interface TurnResult {
  turn: number;
  headline: string;
  sides: [SideResult, SideResult];
}

export interface PublicState {
  code: string;
  phase: Phase;
  turn: number;
  deadline: number | null; // epoch ms
  players: PublicPlayer[];
  spectators: number;
  last: TurnResult | null;
  narration: string | null; // last に対する AI 実況 (生成待ちは null)
  winner: number | null; // players のインデックス, -1 = 引き分け
}

export type ClientMsg =
  | { t: "submit"; kind: MoveKind; text: string }
  | { t: "rematch" }
  | { t: "ack"; turn: number }; // 結果演出を見終わった (観戦者も送る)

export type ServerMsg =
  | { t: "hello"; you: number | null } // null = 観戦者
  | { t: "state"; state: PublicState }
  | { t: "error"; message: string };
