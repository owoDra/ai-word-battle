import { DurableObject } from "cloudflare:workers";

// Workers AI 無料枠 (10,000 Neurons/日, 00:00 UTC リセット) を超えないためのアプリ側ガード。
// 呼び出し前に見積もりを多めに前払いで計上し、上限を超えるなら呼ばない。
export const NARRATION_LIMIT = 7000; // 実況は先に止める
export const EMBED_LIMIT = 9000;

// Neurons / 1M tokens (2026-10 時点の公式料金表)。不明なモデルは高めに見積もる
const INPUT_RATE: Record<string, number> = {
  "@cf/baai/bge-m3": 1075,
  "@cf/pfnet/plamo-embedding-1b": 1689,
  "@cf/google/gemma-4-26b-a4b-it": 9091,
};
const OUTPUT_RATE: Record<string, number> = {
  "@cf/google/gemma-4-26b-a4b-it": 27273,
};
const FALLBACK_INPUT_RATE = 60000;
const FALLBACK_OUTPUT_RATE = 100000;

export function estimateNeurons(model: string, inputChars: number, maxOutputTokens = 0): number {
  // 日本語は 1文字 ≒ 1トークン前後なので 2倍で安全側に倒す
  const inTokens = inputChars * 2 + 16;
  return (
    (inTokens * (INPUT_RATE[model] ?? FALLBACK_INPUT_RATE) + maxOutputTokens * (OUTPUT_RATE[model] ?? FALLBACK_OUTPUT_RATE)) / 1e6
  );
}

export class BudgetExceededError extends Error {
  constructor() {
    super("本日のAI予算を使い切りました");
  }
}

export async function consumeBudget(env: Env, neurons: number, limit: number): Promise<void> {
  const ok = await env.BUDGET.getByName("global").tryConsume(neurons, limit);
  if (!ok) throw new BudgetExceededError();
}

export class AiBudget extends DurableObject<Env> {
  async tryConsume(neurons: number, limit: number): Promise<boolean> {
    const day = new Date().toISOString().slice(0, 10); // UTC 日付
    const used = (await this.ctx.storage.get<number>(`used:${day}`)) ?? 0;
    if (used + neurons > limit) return false;
    await this.ctx.storage.put(`used:${day}`, used + neurons);
    return true;
  }

  async usage(): Promise<{ day: string; used: number }> {
    const day = new Date().toISOString().slice(0, 10);
    return { day, used: (await this.ctx.storage.get<number>(`used:${day}`)) ?? 0 };
  }
}
