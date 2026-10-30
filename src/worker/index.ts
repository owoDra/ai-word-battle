import { debugInfo, embed, getScoringModel, relevance, scoreVec } from "./scoring";

export { AiBudget } from "./budget";
export { BattleRoom } from "./room";

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);

    const m = url.pathname.match(/^\/api\/room\/(\d{4})\/ws$/);
    if (m) {
      if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
      return env.ROOM.getByName(m[1]).fetch(req);
    }

    // チューニング用: /api/debug/score?text=炎の竜巻&text=消防車を召喚
    if (url.pathname === "/api/debug/score" && env.ENABLE_DEBUG === "1") {
      const texts = url.searchParams.getAll("text");
      const model = await getScoringModel(env);
      const vecs = await embed(env, texts);
      const round = (x: number) => Math.round(x * 1000) / 1000;
      return Response.json({
        model: env.EMBED_MODEL,
        moves: texts.map((text, i) => {
          const s = scoreVec(model, vecs[i]);
          const d = debugInfo(model, vecs[i]);
          return {
            text,
            attr: s.attr.map(round),
            dominant: s.dominant,
            intensity: round(s.intensity),
            novelty: round(s.novelty),
            hype: round(s.hype),
            rawIntensity: round(d.rawIntensity),
            rawCliche: round(d.rawCliche),
            attrZ: d.attrZ.map(round),
          };
        }),
        relevance: vecs.map((a) => vecs.map((b) => round(relevance(model, a, b)))),
        ranges: debugInfo(model, vecs[0] ?? []).ranges,
      });
    }

    if (url.pathname === "/api/debug/budget" && env.ENABLE_DEBUG === "1") {
      return Response.json(await env.BUDGET.getByName("global").usage());
    }

    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
