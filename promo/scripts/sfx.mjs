// BGM と効果音を合成して public/sfx/*.wav に書き出す (音源ファイル不要)
// BGM はゲーム本編 (src/client/sound.ts) と同じ D マイナーペンタトニックのバトル曲を重くしたもの
import { mkdirSync, writeFileSync } from "node:fs";

const SR = 44100;
mkdirSync("public/sfx", { recursive: true });

let seed = 1;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 31 - 1;
};

function wav(name, buf) {
  let peak = 0;
  for (const x of buf) peak = Math.max(peak, Math.abs(x));
  const g = peak > 0.98 ? 0.98 / peak : 1;
  const data = Buffer.alloc(44 + buf.length * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + buf.length * 2, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(SR, 24);
  data.writeUInt32LE(SR * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(buf.length * 2, 40);
  for (let i = 0; i < buf.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i] * g)) * 32767), 44 + i * 2);
  writeFileSync(`public/sfx/${name}.wav`, data);
}

const osc = {
  sine: (p) => Math.sin(2 * Math.PI * p),
  square: (p) => (p % 1 < 0.5 ? 1 : -1),
  saw: (p) => 2 * (p % 1) - 1,
  tri: (p) => 1 - 4 * Math.abs((p % 1) - 0.5),
};

// 周波数 f0→f1 へ指数スイープする音を buf の t 秒目から足す
function tone(buf, t, dur, f0, f1, vol, type = "sine", attack = 0.002) {
  const s = Math.floor(t * SR);
  const n = Math.floor(dur * SR);
  let ph = 0;
  for (let i = 0; i < n && s + i < buf.length; i++) {
    const x = i / n;
    const f = f0 * (f1 / f0) ** x;
    ph += f / SR;
    const env = Math.min(1, i / (attack * SR)) * (1 - x) ** 2;
    buf[s + i] += osc[type](ph) * env * vol;
  }
}

// 1 極ローパスを掛けたノイズ。cut0→cut1 でフィルタをスイープ
function noise(buf, t, dur, vol, cut0 = 8000, cut1 = cut0, high = false, curve = 2) {
  const s = Math.floor(t * SR);
  const n = Math.floor(dur * SR);
  let lp = 0;
  for (let i = 0; i < n && s + i < buf.length; i++) {
    const x = i / n;
    const c = cut0 * (cut1 / cut0) ** x;
    const a = 1 - Math.exp((-2 * Math.PI * c) / SR);
    const w = rnd();
    lp += a * (w - lp);
    const env = Math.min(1, i / (0.002 * SR)) * (1 - x) ** curve;
    buf[s + i] += (high ? w - lp : lp) * env * vol;
  }
}

function reverb(buf, mix = 0.3, decay = 0.5) {
  const out = Float32Array.from(buf);
  for (const [d, g] of [
    [0.031, 0.7],
    [0.047, 0.6],
    [0.071, 0.5],
    [0.113, 0.4],
    [0.163, 0.3],
  ]) {
    const k = Math.floor(d * SR);
    for (let i = k; i < out.length; i++) out[i] += out[i - k] * g * decay * mix;
  }
  return out;
}

const make = (sec) => new Float32Array(Math.floor(sec * SR));

// ---------- 効果音 ----------
{
  // ドンッ!! 重い衝撃
  const b = make(1.6);
  tone(b, 0, 1.2, 120, 32, 1.2);
  tone(b, 0, 0.25, 900, 80, 0.4, "tri");
  noise(b, 0, 0.5, 1.0, 3000, 200);
  wav("impact", reverb(b, 0.5));
}
{
  // ズドォン!! タイトル用の特大インパクト
  const b = make(3);
  tone(b, 0, 2.4, 90, 25, 1.3);
  tone(b, 0, 0.3, 1400, 60, 0.5, "saw");
  noise(b, 0, 1.6, 1.1, 5000, 120, false, 1.5);
  tone(b, 0.02, 2.2, 220, 210, 0.15, "square");
  wav("slam", reverb(b, 0.7, 0.6));
}
{
  // バシッ 打撃
  const b = make(0.5);
  tone(b, 0, 0.18, 300, 60, 0.9);
  noise(b, 0, 0.12, 1.0, 9000, 1500, true);
  wav("hit", b);
}
{
  // シュッ 風切り
  const b = make(0.45);
  const s = Math.floor(0.4 * SR);
  let lp = 0;
  for (let i = 0; i < s; i++) {
    const x = i / s;
    const c = 400 * (6000 / 400) ** Math.sin(Math.PI * x);
    lp += (1 - Math.exp((-2 * Math.PI * c) / SR)) * (rnd() - lp);
    b[i] = lp * Math.sin(Math.PI * x) ** 2 * 1.4;
  }
  wav("whoosh", b);
}
{
  // カッ!! 会心・カウンターの金属音
  const b = make(1.8);
  noise(b, 0, 0.08, 1, 12000, 4000, true);
  for (const [f, v] of [
    [1320, 0.35],
    [1980, 0.25],
    [2970, 0.15],
    [4100, 0.1],
  ])
    tone(b, 0, 1.6, f, f * 0.995, v, "sine", 0.001);
  tone(b, 0, 0.6, 160, 40, 1);
  wav("clang", reverb(b, 0.5));
}
{
  // ゴゴゴ… 地鳴り
  const b = make(2.4);
  const n = b.length;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    lp += 0.01 * (rnd() - lp);
    const trem = 0.6 + 0.4 * Math.sin(2 * Math.PI * 9 * (i / SR));
    b[i] = (lp * 8 + 0.25 * Math.sin(2 * Math.PI * 42 * (i / SR))) * trem * Math.min(1, x * 4) * (1 - x) ** 0.6;
  }
  wav("rumble", b);
}
{
  // 気合ため: 上昇するうなり
  const b = make(2);
  tone(b, 0, 1.9, 110, 880, 0.35, "saw", 0.8);
  tone(b, 0, 1.9, 112, 890, 0.3, "saw", 0.8);
  noise(b, 0, 1.9, 0.4, 300, 8000, false, 0.3);
  const n = b.length;
  for (let i = 0; i < n; i++) b[i] *= Math.min(1, (i / n) * 1.3);
  wav("charge", b);
}
{
  // ブブーッ 弱体化
  const b = make(0.8);
  tone(b, 0, 0.35, 220, 200, 0.4, "square");
  tone(b, 0.38, 0.4, 180, 120, 0.4, "square");
  wav("buzz", b);
}
{
  // ピッ UI / テロップ
  const b = make(0.15);
  tone(b, 0, 0.1, 1800, 2400, 0.5, "square");
  wav("tick", b);
}
{
  // カタカタ タイピング (1 打)
  const b = make(0.06);
  noise(b, 0, 0.04, 0.9, 6000, 2000, true);
  tone(b, 0, 0.02, 2500, 1500, 0.2, "tri");
  wav("key", b);
}
{
  // ドドンッ 和太鼓
  const b = make(1.4);
  for (const t of [0, 0.16]) {
    tone(b, t, 0.7, 150, 55, 1.1);
    noise(b, t, 0.08, 0.5, 1200, 300);
  }
  wav("taiko", reverb(b, 0.4));
}
{
  // パキィン ガラス割れ (カウンター)
  const b = make(1.2);
  noise(b, 0, 0.5, 1, 14000, 3000, true, 3);
  for (let k = 0; k < 14; k++) tone(b, 0.01 + k * 0.025, 0.25, 2500 + rnd() * 3000, 2000, 0.15, "sine", 0.001);
  tone(b, 0, 0.4, 200, 50, 0.9);
  wav("shatter", reverb(b, 0.4));
}

// ---------- BGM ----------
const SCALE = [146.83, 174.61, 196.0, 220.0, 261.63];
const note = (deg, oct = 0) => SCALE[((deg % 5) + 5) % 5] * 2 ** (Math.floor(deg / 5) + oct);
{
  const BPM = 164;
  const SEC = 42;
  const step = 60 / BPM / 4;
  const b = make(SEC);
  const drum = "D..dD.d.D..dD.dd";
  const hat = "x.xxx.xxx.xxx.xx";
  const bass = [0, 0, 5, 0, 0, 0, 4, 0, -1, -1, 4, -1, -2, -2, 3, -2];
  const lead = [
    [5, null, 7, null, 8, null, 7, 5, null, 5, 4, null, 5, null, null, null],
    [5, null, 7, null, 8, null, 10, null, 9, null, 8, 7, 8, null, null, null],
    [10, null, 9, null, 8, null, 7, null, 8, null, 7, 5, 7, null, null, null],
    [5, null, 4, null, 2, null, 4, null, 5, null, null, null, null, null, 7, null],
  ];
  const steps = Math.floor(SEC / step);
  for (let k = 0; k < steps; k++) {
    const i = k % 16;
    const bar = Math.floor(k / 16);
    const t = k * step;
    if (drum[i] === "D") {
      tone(b, t, 0.35, 140, 42, 0.9);
      noise(b, t, 0.06, 0.3, 800, 200);
    } else if (drum[i] === "d") {
      tone(b, t, 0.12, 260, 150, 0.35, "tri");
      noise(b, t, 0.12, 0.45, 4000, 1200);
    }
    if (i === 0 && bar % 4 === 0) noise(b, t, 1.2, 0.25, 12000, 6000, true, 1.5); // クラッシュ
    if (hat[i] === "x") noise(b, t, 0.03, 0.12, 9000, 9000, true);
    const bs = bass[i];
    tone(b, t, step * 0.95, note(bs, -1), note(bs, -1), 0.22, "saw", 0.003);
    tone(b, t, step * 0.95, note(bs, -2), note(bs, -2), 0.18, "square", 0.003);
    // 4 小節目以降でリードを入れる
    const l = lead[bar % 4][i];
    if (bar >= 2 && l !== null) {
      tone(b, t, step * 2, note(l), note(l) * 0.995, 0.09, "square", 0.004);
      tone(b, t, step * 2, note(l) * 1.006, note(l), 0.07, "saw", 0.004);
      tone(b, t, step * 1.4, note(l, 1), note(l, 1), 0.04, "tri");
    }
  }
  wav("bgm", reverb(b, 0.2, 0.4));
}
console.log("done");
