// VOICEVOX エンジン (http://127.0.0.1:50021) でナレーションを生成し、
// public/voice/*.wav と各セリフの尺を書いた src/voice.json を出力する
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const HOST = "http://127.0.0.1:50021";

// 刃牙風の劇画ナレーション = 青山龍星 (熱血)、ツッコミ = ずんだもん
const VOICES = {
  ryusei: { speaker: 81, speed: 1.42, pitch: -0.04, intonation: 1.5 },
  zunda: { speaker: 3, speed: 1.45, pitch: 0.03, intonation: 1.4 },
};

// sub は字幕 (省略時は text)。text は読み上げ用なので英単語はカタカナで書く
const LINES = [
  { id: "hook", v: "ryusei", text: "言葉が、技になる。", sub: "言葉が――技になる。" },
  { id: "input", v: "ryusei", text: "攻撃か、防御か。技名は自由。両者、同時に公開ッ!!" },
  { id: "judge", v: "ryusei", text: "AIは言葉をベクトルに変え、属性、強さ、独創性を、数値化するッ!", sub: "AIは言葉をベクトルに変え、属性・強さ・独創性を……数値化するッ!" },
  { id: "affinity", v: "ryusei", text: "相性は、水、炎、社畜、雷の、四すくみ!", sub: "相性は、水・炎・社畜・雷の四すくみ!" },
  { id: "affinity_z", v: "zunda", text: "社畜って何なのだ!?" },
  { id: "counter", v: "ryusei", text: "炎の竜巻に、消防車ッ!! 読み切った防御は、カウンターとなるッ!!", sub: "炎の竜巻に……消防車ッ!! 読み切った防御は、カウンターとなるッッ!!" },
  { id: "nerf", v: "ryusei", text: "盛っただけの言葉、同じ技の連発。それは、弱さだ。", sub: "盛っただけの言葉、同じ技の連発……それは弱さだ。" },
  { id: "charge", v: "ryusei", text: "にらみ合えば、気合が溜まる。次の一撃は、重いッ!!", sub: "にらみ合えば気合が溜まる。次の一撃は……重いッ!!" },
  {
    id: "infra",
    v: "ryusei",
    text: "その裏側、クラウドフレア。部屋ごとのデュラブルオブジェクトが、ウェブソケットで闘いを仕切る。",
    sub: "その裏側――Cloudflare。部屋ごとのDurable Objectsが、WebSocketで闘いを仕切る。",
  },
  { id: "ai", v: "ryusei", text: "判定は、プラモの埋め込み。実況は、ジェマ。すべて、無料枠ッ!", sub: "判定はPLaMoの埋め込み。実況はGemma。すべて無料枠ッ!" },
  { id: "ai_z", v: "zunda", text: "タダなのだ!?" },
  { id: "cta", v: "ryusei", text: "語彙で、殴り合え。AIワードバトル!!", sub: "語彙で殴り合え。" },
];

mkdirSync("public/voice", { recursive: true });
const out = [];
for (const l of LINES) {
  const v = VOICES[l.v];
  const q = await fetch(`${HOST}/audio_query?speaker=${v.speaker}&text=${encodeURIComponent(l.text)}`, { method: "POST" });
  if (!q.ok) throw new Error(`audio_query ${l.id}: ${q.status}`);
  const query = await q.json();
  query.speedScale = v.speed;
  query.pitchScale = v.pitch;
  query.intonationScale = v.intonation;
  query.prePhonemeLength = 0.02;
  query.postPhonemeLength = 0.05;
  const s = await fetch(`${HOST}/synthesis?speaker=${v.speaker}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  });
  if (!s.ok) throw new Error(`synthesis ${l.id}: ${s.status}`);
  const file = `public/voice/${l.id}.wav`;
  writeFileSync(file, Buffer.from(await s.arrayBuffer()));
  const sec = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());
  // 演出を声に合わせるため、各アクセント句の開始秒を残す
  const marks = [];
  let t = query.prePhonemeLength;
  for (const ap of query.accent_phrases) {
    marks.push([ap.moras.map((m) => m.text).join(""), Math.round((t / v.speed) * 1000) / 1000]);
    for (const m of ap.moras) t += (m.consonant_length ?? 0) + m.vowel_length;
    if (ap.pause_mora) t += ap.pause_mora.vowel_length;
  }
  out.push({ id: l.id, v: l.v, sub: l.sub ?? l.text, sec: Math.round(sec * 1000) / 1000, marks });
  console.log(l.id, sec.toFixed(2), marks.map(([k, s]) => `${k}@${s.toFixed(2)}`).join(" "));
}
writeFileSync("src/voice.json", JSON.stringify(out, null, 2) + "\n");
console.log("total", out.reduce((a, b) => a + b.sec, 0).toFixed(2));
