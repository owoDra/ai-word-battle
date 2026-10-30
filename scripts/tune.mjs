// 採点チューニング用: 開発サーバーの /api/debug/score に技を流して数値を一覧表示する
// usage: node scripts/tune.mjs [baseUrl]
const base = process.argv[2] ?? "http://localhost:5173";
const ATTRS = ["炎", "水", "雷", "光", "闇", "社畜"];

const MOVES = [
  "ファイアボール", "火山噴火", "消防車を召喚", "津波", "絶対零度", "雷神の怒り", "スタンガン",
  "聖なる光", "天使の歌声", "闇の儀式", "呪いの藁人形", "月曜朝の満員電車", "定時ダッシュ",
  "上司の無茶振り", "有給休暇の申請", "パンチ", "バリア", "最強究極無敵炎水雷",
  "最強の一撃", "究極奥義・天地開闢", "冷蔵庫のプリンを食べる", "お母さんの説教", "傘をさす", "既読スルー", "宇宙の始まり", "猫パンチ",
];
// 攻撃と防御の噛み合い (relevance) を見るペア
const PAIRS = [
  ["炎の竜巻", "消防車を召喚"],
  ["炎の竜巻", "傘をさす"],
  ["雷を落とす", "避雷針を立てる"],
  ["雷を落とす", "冷蔵庫のプリンを食べる"],
  ["上司の無茶振り", "有給休暇の申請"],
  ["上司の無茶振り", "聖なる光"],
];

async function score(texts) {
  const q = texts.map((t) => `text=${encodeURIComponent(t)}`).join("&");
  const res = await fetch(`${base}/api/debug/score?${q}`);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

const r = await score(MOVES);
console.log(`model: ${r.model}\nranges: ${JSON.stringify(r.ranges)}\n`);
console.log("技".padEnd(16, "　"), "属性(確率)        強度  独創  盛り   rawInt rawCliche");
for (const m of r.moves) {
  const top = m.attr
    .map((p, i) => [ATTRS[i], p])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([a, p]) => `${a}${Math.round(p * 100)}`)
    .join(" ");
  console.log(m.text.padEnd(16, "　"), top.padEnd(16), m.intensity.toFixed(2), m.novelty.toFixed(2), m.hype.toFixed(3), m.rawIntensity.toFixed(3), m.rawCliche.toFixed(3));
}

console.log("\n攻撃 → 防御  relevance");
for (const [a, d] of PAIRS) {
  const p = await score([a, d]);
  console.log(`${a} → ${d}: ${p.relevance[0][1]}`);
}
