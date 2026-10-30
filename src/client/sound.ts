// 効果音・BGM はすべて Web Audio API で合成する (音源ファイル不要)
// 属性インデックスは ATTRS (炎, 水, 雷, 光, 闇, 社畜) と同じ並び

let ctx: AudioContext | null = null;
let master: GainNode | null = null; // 効果音
let music: GainNode | null = null; // BGM (読み上げ中は絞る)
let noiseBuf: AudioBuffer | null = null;

const SFX_VOL = 0.8;
const BGM_VOL = 0.32;

function readPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

function writePref(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    // 保存できなくても今回のセッションでは有効
  }
}

export const prefs = {
  sound: readPref("awb:sound", true),
  voice: readPref("awb:voice", true),
  bgm: readPref("awb:bgm", true),
};

export function setSound(on: boolean) {
  prefs.sound = on;
  writePref("awb:sound", on);
  if (master) master.gain.value = on ? SFX_VOL : 0;
}

export function setVoice(on: boolean) {
  prefs.voice = on;
  writePref("awb:voice", on);
  if (!on) stopSpeaking();
}

export function setBgm(on: boolean) {
  prefs.bgm = on;
  writePref("awb:bgm", on);
  if (on) bgm.play(bgm.current);
  else bgm.stopAll();
}

// ブラウザの自動再生制限を解除する。ユーザー操作のハンドラ内で呼ぶこと
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = prefs.sound ? SFX_VOL : 0;
    master.connect(comp);
    music = ctx.createGain();
    music.gain.value = BGM_VOL;
    music.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume().then(() => bgm.play(bgm.current));
  else bgm.play(bgm.current);
  // iOS は最初の読み上げもユーザー操作内で行う必要がある
  if ("speechSynthesis" in window && !voiceUnlocked) {
    voiceUnlocked = true;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
  }
}
let voiceUnlocked = false;

export function audioReady(): boolean {
  return !!ctx && ctx.state === "running";
}

function ready(): AudioContext | null {
  return ctx && master && prefs.sound && ctx.state === "running" ? ctx : null;
}

// ---------- 合成の部品 ----------
function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, out: AudioNode = master!, attack = 0.005) {
  const c = ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  env(g, t, peak, attack, dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

function noise(t: number, dur: number, peak: number, filter: BiquadFilterType, f0: number, f1 = f0, q = 1, out: AudioNode = master!, attack = 0.005) {
  const c = ctx!;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  s.playbackRate.value = 0.5 + Math.random();
  const bf = c.createBiquadFilter();
  bf.type = filter;
  bf.Q.value = q;
  bf.frequency.setValueAtTime(f0, t);
  bf.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + attack + dur);
  const g = c.createGain();
  env(g, t, peak, attack, dur);
  s.connect(bf).connect(g).connect(out);
  s.start(t);
  s.stop(t + attack + dur + 0.05);
}

// 属性ごとの音色。攻撃は派手に、防御は同じ属性でも低く短く
function attrVoice(attr: number, t: number, s: number) {
  switch (attr) {
    case 0: // 炎: ごうっと燃え上がる + 火の粉のパチパチ
      noise(t, 0.7 * s, 0.7 * s, "lowpass", 300, 2200, 0.7, master!, 0.08);
      for (let i = 0; i < 8; i++) noise(t + 0.05 + Math.random() * 0.5, 0.02, 0.35 * s, "highpass", 3000);
      break;
    case 1: // 水: ざばっ + 泡
      noise(t, 0.6 * s, 0.7 * s, "bandpass", 2500, 300, 1.2);
      for (let i = 0; i < 6; i++) {
        const f = 500 + Math.random() * 900;
        tone("sine", f, f * 2.2, t + 0.1 + i * 0.07, 0.06, 0.18 * s);
      }
      break;
    case 2: // 雷: バチバチッ
      for (let i = 0; i < 7; i++) {
        const f = 80 + Math.random() * 400;
        tone("sawtooth", f, f * 0.5, t + i * 0.045, 0.05, 0.3 * s);
        noise(t + i * 0.045, 0.03, 0.5 * s, "highpass", 2000);
      }
      tone("square", 60, 40, t, 0.4 * s, 0.25 * s);
      break;
    case 3: // 光: キラーン (倍音の鈴 + 上昇)
      for (const [f, p] of [
        [1568, 0.25],
        [2093, 0.2],
        [3136, 0.12],
      ] as const)
        tone("sine", f, f * 1.01, t, 0.9 * s, p * s, master!, 0.01);
      tone("triangle", 600, 2400, t, 0.35, 0.15 * s);
      break;
    case 4: // 闇: ずぅぅん (うなる低音)
      tone("sawtooth", 55, 38, t, 1.0 * s, 0.35 * s, master!, 0.15);
      tone("sawtooth", 57.5, 39, t, 1.0 * s, 0.35 * s, master!, 0.15);
      noise(t, 0.8 * s, 0.3 * s, "lowpass", 200, 80, 1, master!, 0.2);
      break;
    case 5: // 社畜: 内線の呼び出し音 + 判子
      for (let i = 0; i < 4; i++) tone("square", i % 2 ? 1600 : 1300, i % 2 ? 1600 : 1300, t + i * 0.06, 0.05, 0.12 * s);
      tone("triangle", 200, 90, t + 0.3, 0.15, 0.5 * s);
      noise(t + 0.3, 0.08, 0.4 * s, "bandpass", 1200, 500, 1.5);
      break;
  }
}

export type UiSound = "hover" | "press" | "attack" | "defense" | "type";

export const sfx = {
  ui(kind: UiSound) {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    switch (kind) {
      case "hover":
        tone("triangle", 1800, 2200, t, 0.03, 0.06);
        break;
      case "press":
        tone("square", 420, 180, t, 0.05, 0.15);
        noise(t, 0.03, 0.2, "bandpass", 2500);
        break;
      case "attack": // 抜刀: シャキン
        noise(t, 0.12, 0.35, "highpass", 4000, 9000);
        tone("sine", 2600, 2500, t + 0.03, 0.35, 0.12);
        tone("sine", 3900, 3850, t + 0.03, 0.25, 0.06);
        break;
      case "defense": // 盾を構える: ゴン
        tone("triangle", 160, 90, t, 0.22, 0.6);
        tone("square", 640, 600, t, 0.08, 0.08);
        noise(t, 0.06, 0.3, "lowpass", 1500);
        break;
      case "type": // 筆の擦れ
        noise(t, 0.025, 0.06, "bandpass", 3000 + Math.random() * 2000, 2000, 2);
        break;
    }
  },
  // ターン開始の和太鼓 (ドン、ドン!)
  taiko() {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    for (const [dt, p] of [
      [0, 0.9],
      [0.32, 1],
    ] as const) {
      tone("sine", 150, 48, t + dt, 0.45, p);
      noise(t + dt, 0.08, 0.35 * p, "lowpass", 900, 200);
    }
  },
  // 技パネル登場。攻撃は風切り + 属性音、防御は重い着地 + 結界音
  declare(kind: "attack" | "defense" | "idle", attr: number) {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    if (kind === "attack") {
      noise(t, 0.25, 0.55, "bandpass", 500, 3500, 2);
      attrVoice(attr, t + 0.08, 0.6);
    } else if (kind === "defense") {
      tone("sine", 110, 50, t, 0.35, 0.8);
      noise(t, 0.1, 0.3, "lowpass", 800, 200);
      tone("sine", 880, 870, t + 0.05, 0.6, 0.08, master!, 0.08);
      tone("sine", 1320, 1310, t + 0.05, 0.6, 0.05, master!, 0.08);
      if (attr >= 0) attrVoice(attr, t + 0.1, 0.3);
    } else {
      tone("triangle", 300, 150, t, 0.4, 0.15);
    }
  },
  // 溜め: 上昇するうねり
  riser(ms: number) {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    const d = ms / 1000;
    noise(t, d, 0.45, "bandpass", 300, 4000, 3, master!, d * 0.9);
    tone("sawtooth", 80, 320, t, d, 0.12, master!, d * 0.9);
  },
  // 着弾の一撃目 (ヒットストップ中に鳴る、短く鋭い)
  hit(strength: number) {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    const s = Math.min(1, Math.max(0.2, strength));
    noise(t, 0.05, 1, "highpass", 1500);
    tone("square", 180, 60, t, 0.06, 0.5 * s);
    tone("sine", 90, 40, t, 0.12, 1);
  },
  // ヒットストップ明けの余韻 (重低音 + 属性音)
  boom(strength: number, attr: number) {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    const s = Math.min(1, Math.max(0.2, strength));
    tone("sine", 120, 28, t, 0.5 + 0.7 * s, 1);
    noise(t, 0.3 + 0.6 * s, 0.9 * s, "lowpass", 4000, 100);
    if (attr >= 0) attrVoice(attr, t + 0.02, 0.5 + 0.5 * s);
  },
  // 防御成功 / カウンターの金属音
  kin() {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    for (const [f, p] of [
      [1870, 0.35],
      [2790, 0.22],
      [4130, 0.12],
    ] as const)
      tone("sine", f, f * 0.98, t, 0.9, p);
    noise(t, 0.04, 0.5, "highpass", 5000);
  },
  // ゴゴゴゴ… (気合ため)
  rumble() {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const lfo = c.createOscillator();
    const lg = c.createGain();
    const g = c.createGain();
    o.type = "sawtooth";
    o.frequency.value = 42;
    lfo.frequency.value = 9;
    lg.gain.value = 0.5;
    lfo.connect(lg).connect(g.gain);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    o.connect(lp).connect(g).connect(master!);
    o.start(t);
    lfo.start(t);
    o.stop(t + 1.9);
    lfo.stop(t + 1.9);
  },
  stamp() {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    tone("triangle", 220, 80, t, 0.18, 0.6);
    noise(t, 0.1, 0.5, "bandpass", 1200, 600, 1.5);
  },
  tick(last: boolean) {
    const c = ready();
    if (!c) return;
    tone("square", last ? 1320 : 880, last ? 1320 : 880, c.currentTime, 0.07, 0.18);
  },
  shout() {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    tone("sawtooth", 220, 660, t, 0.18, 0.25);
    noise(t, 0.2, 0.35, "bandpass", 800, 2400, 3);
  },
  heartbeat() {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    tone("sine", 70, 40, t, 0.18, 0.8);
    tone("sine", 65, 38, t + 0.22, 0.2, 0.6);
  },
  fanfare() {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    const notes = [523, 659, 784, 1047, 784, 1047];
    const times = [0, 0.14, 0.28, 0.42, 0.62, 0.76];
    notes.forEach((f, i) => {
      const d = i === notes.length - 1 ? 1.2 : 0.16;
      tone("square", f, f, t + times[i], d, 0.22);
      tone("sawtooth", f / 2, f / 2, t + times[i], d, 0.12);
    });
    this.taiko();
  },
};

// ---------- BGM (16分音符のステップシーケンサ) ----------
export type Track = "lobby" | "battle" | "hurry" | "none";

// D マイナーペンタトニック (D F G A C)
const SCALE = [146.83, 174.61, 196.0, 220.0, 261.63];
const note = (deg: number, oct = 0) => SCALE[((deg % 5) + 5) % 5] * 2 ** (Math.floor(deg / 5) + oct);

interface Song {
  bpm: number;
  drum: string; // 16ステップ。D=太鼓 d=小太鼓 .=休み
  hat: string;
  bass: (number | null)[]; // 16ステップの音階度数
  lead: (number | null)[][]; // 小節ごとの 16 ステップ
}

const SONGS: Record<Exclude<Track, "none">, Song> = {
  lobby: {
    bpm: 84,
    drum: "D.......d...D.d.",
    hat: "....x.......x...",
    bass: [0, null, null, null, null, null, null, null, -2, null, null, null, -1, null, null, null],
    lead: [
      [5, null, null, null, 7, null, 6, null, 5, null, null, null, null, null, null, null],
      [4, null, null, null, 5, null, 3, null, 2, null, null, null, null, null, null, null],
      [5, null, null, null, 7, null, 8, null, 9, null, 8, null, 7, null, null, null],
      [6, null, null, null, 5, null, null, null, 4, null, null, null, null, null, null, null],
    ],
  },
  battle: {
    bpm: 148,
    drum: "D..dD.d.D..dD.dd",
    hat: "x.x.x.x.x.x.x.x.",
    bass: [0, 0, 5, 0, 0, 0, 4, 0, -1, -1, 4, -1, -2, -2, 3, -2],
    lead: [
      [5, null, 7, null, 8, null, 7, 5, null, 5, 4, null, 5, null, null, null],
      [5, null, 7, null, 8, null, 10, null, 9, null, 8, 7, 8, null, null, null],
      [10, null, 9, null, 8, null, 7, null, 8, null, 7, 5, 7, null, null, null],
      [5, null, 4, null, 2, null, 4, null, 5, null, null, null, null, null, 7, null],
    ],
  },
  hurry: {
    bpm: 176,
    drum: "DdDdD.dDDdDdD.dd",
    hat: "xxxxxxxxxxxxxxxx",
    bass: [0, 0, 5, 0, 1, 1, 6, 1, 2, 2, 7, 2, 1, 1, 6, 1],
    lead: [
      [10, null, 10, null, 9, null, 10, null, 12, null, 10, null, 9, null, 8, null],
      [10, null, 10, null, 9, null, 10, null, 13, null, 12, null, 10, null, null, null],
      [10, null, 10, null, 9, null, 10, null, 12, null, 10, null, 9, null, 8, null],
      [7, null, 8, null, 9, null, 10, null, 11, null, 12, null, 13, null, 14, null],
    ],
  },
};

export const bgm = {
  current: "none" as Track,
  timer: 0 as ReturnType<typeof setInterval> | 0,
  step: 0,
  nextTime: 0,
  song: null as Song | null,

  play(track: Track) {
    this.current = track;
    if (!ctx || !music || ctx.state !== "running" || !prefs.bgm || track === "none") return this.stopAll();
    const song = SONGS[track];
    if (this.song === song && this.timer) return;
    this.song = song;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.05;
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 25);
  },

  stopAll() {
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
    this.song = null;
  },

  // 25ms ごとに 0.1 秒先までの音を予約する
  schedule() {
    const song = this.song;
    if (!ctx || !music || !song) return;
    const stepDur = 60 / song.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.1) {
      const i = this.step % 16;
      const bar = Math.floor(this.step / 16) % song.lead.length;
      const t = this.nextTime;
      const d = song.drum[i];
      if (d === "D") {
        tone("sine", 130, 45, t, 0.3, 0.9, music);
        noise(t, 0.05, 0.25, "lowpass", 700, 200, 1, music);
      } else if (d === "d") {
        tone("triangle", 260, 140, t, 0.1, 0.35, music);
        noise(t, 0.06, 0.2, "bandpass", 1500, 800, 1, music);
      }
      if (song.hat[i] === "x") noise(t, 0.03, 0.08, "highpass", 7000, 7000, 1, music);
      const b = song.bass[i];
      if (b !== null) tone("sawtooth", note(b, -1), note(b, -1), t, stepDur * 0.9, 0.16, music);
      const l = song.lead[bar][i];
      if (l !== null) {
        tone("square", note(l), note(l) * 0.995, t, stepDur * 1.8, 0.06, music);
        tone("triangle", note(l, 1), note(l, 1), t, stepDur * 1.2, 0.03, music);
      }
      this.nextTime += stepDur;
      this.step++;
    }
  },
};

function duck(on: boolean) {
  if (!ctx || !music) return;
  music.gain.setTargetAtTime(on ? BGM_VOL * 0.3 : BGM_VOL, ctx.currentTime, 0.15);
}

// ---------- 読み上げ ----------
let jaVoice: SpeechSynthesisVoice | null = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("ja"));
  jaVoice = vs.find((v) => /Otoya|Hattori|Male|男/i.test(v.name)) ?? vs[0] ?? null;
}
if ("speechSynthesis" in window) {
  pickVoice();
  speechSynthesis.addEventListener?.("voiceschanged", pickVoice);
}

let pending = 0;

// 読み終わったら resolve する。onend が来ないブラウザもあるので文字数から上限時間を決めておく
export function speak(text: string, opts: { rate?: number; pitch?: number; interrupt?: boolean } = {}): Promise<void> {
  if (!prefs.voice || !("speechSynthesis" in window) || !text) return Promise.resolve();
  if (opts.interrupt) stopSpeaking();
  const rate = opts.rate ?? 1.15;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  if (jaVoice) u.voice = jaVoice;
  u.rate = rate;
  u.pitch = opts.pitch ?? 0.8;
  pending++;
  duck(true);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      pending = Math.max(0, pending - 1);
      if (!pending) duck(false);
      resolve();
    };
    u.onend = finish;
    u.onerror = finish;
    setTimeout(finish, 1500 + ([...text].length * 220) / rate);
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  pending = 0;
  duck(false);
}
