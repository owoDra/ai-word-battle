// 2人の対戦をスクリプトで再現する動作確認用
// usage: node scripts/simulate.mjs [baseWsUrl]
const base = process.argv[2] ?? "ws://localhost:5173";
const code = String(1000 + Math.floor(Math.random() * 9000));

const SCRIPT = [
  [["attack", "炎の竜巻"], ["defense", "消防車を召喚"]],
  [["attack", "月曜朝の満員電車"], ["attack", "雷神の怒り"]],
  [["defense", "傘をさす"], ["defense", "段ボールに隠れる"]],
  [["attack", "最強究極無敵炎水雷"], ["defense", "有給休暇の申請"]],
  [["attack", "隕石を落とす"], ["attack", "上司の無茶振り"]],
  [["attack", "マグマの海"], ["attack", "絶対零度"]],
  [["attack", "ブラックホール"], ["attack", "聖なる光"]],
  [["attack", "核融合"], ["attack", "津波"]],
];

function join(name) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${base}/api/room/${code}/ws?pid=${name}-${code}&name=${encodeURIComponent(name)}`);
    const c = { ws, name, state: null, listeners: [] };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.t === "state") {
        // 結果演出を見終わった扱いで即 ack (ack-wait の動作確認)
        if (msg.state.phase === "result" && c.state?.last?.turn !== msg.state.last?.turn) ws.send(JSON.stringify({ t: "ack", turn: msg.state.last.turn }));
        c.state = msg.state;
      }
      if (msg.t === "error") console.log(`  [${name}] error: ${msg.message}`);
      c.listeners.forEach((f) => f(msg));
    };
    ws.onopen = () => resolve(c);
  });
}

const until = (c, pred, ms = 30000) =>
  new Promise((resolve, reject) => {
    if (c.state && pred(c.state)) return resolve(c.state);
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    c.listeners.push((m) => {
      if (m.t === "state" && pred(m.state)) {
        clearTimeout(t);
        resolve(m.state);
      }
    });
  });

const a = await join("炎太郎");
const b = await join("社畜丸");
await until(a, (s) => s.phase === "input");
console.log(`room ${code} started`);

for (const [ma, mb] of SCRIPT) {
  const turn = a.state.turn;
  const t0 = Date.now();
  a.ws.send(JSON.stringify({ t: "submit", kind: ma[0], text: ma[1] }));
  b.ws.send(JSON.stringify({ t: "submit", kind: mb[0], text: mb[1] }));
  const s = await until(a, (s) => s.last?.turn === turn);
  console.log(`\n=== turn ${turn} (${Date.now() - t0}ms) ${s.last.headline}`);
  for (const x of s.last.sides) {
    console.log(`  ${x.name} ${x.kind}「${x.text}」 atk=${x.atk} guard=${x.guard.toFixed(2)} 受=${x.damageTaken} HP=${x.hpAfter} ${x.flags.join(" ")}`);
  }
  const n = await until(a, (s) => s.last?.turn === turn && s.narration, 20000).catch(() => null);
  console.log(`  実況: ${n?.narration ?? "(なし)"}`);
  if (s.phase === "finished") {
    console.log(`\nfinished winner=${s.winner}`);
    break;
  }
  await until(a, (s) => s.phase === "input" && s.turn === turn + 1, 15000);
}
a.ws.close();
b.ws.close();
