// 劇画風のパーティクルエフェクト。墨(黒)と血(赤)だけで描く
// 属性インデックスは ATTRS (炎, 水, 雷, 光, 闇, 社畜) と同じ並び

const INK = "#121010";
const RED = "#c8102e";
const PAPER = "#fbfaf6";

type Kind = "spark" | "blob" | "flame" | "drop" | "ring" | "bolt" | "ray" | "paper" | "hanko" | "crack" | "dark" | "shield";

interface P {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  vr: number;
  life: number;
  max: number;
  color: string;
  g: number; // 重力
  pts?: [number, number][];
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Fx {
  private ps: P[] = [];
  private raf = 0;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private ro: ResizeObserver;
  private frozenUntil = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = r.width * this.dpr;
    this.canvas.height = r.height * this.dpr;
  }

  private add(p: Partial<P> & Pick<P, "kind" | "x" | "y">) {
    this.ps.push({ vx: 0, vy: 0, r: 4, rot: 0, vr: 0, life: 0, max: 40, color: INK, g: 0, ...p });
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  // 要素の中心をキャンバス座標で返す
  centerOf(el: Element | null): [number, number] {
    if (!el) return [this.w / 2, this.h * 0.55];
    const a = el.getBoundingClientRect();
    const b = this.canvas.getBoundingClientRect();
    return [a.left + a.width / 2 - b.left, a.top + a.height / 2 - b.top];
  }

  // ヒットストップ: 指定時間パーティクルの時間を止める (描画は続ける)
  freeze(ms: number) {
    this.frozenUntil = performance.now() + ms;
  }

  // 技の宣言時: 攻撃は横に走る火花、防御は結界
  declare(kind: "attack" | "defense" | "idle", attr: number, x: number, y: number, dir: 1 | -1) {
    if (kind === "attack") {
      for (let i = 0; i < 16; i++)
        this.add({ kind: "spark", x: x - dir * rand(20, 120), y: y + rand(-40, 40), vx: dir * rand(10, 20), vy: rand(-0.5, 0.5), r: rand(1.5, 3), max: rand(10, 18), color: Math.random() < 0.4 ? RED : INK });
      this.mini(attr, x, y);
    } else if (kind === "defense") {
      this.shield(x, y, 0.9);
      this.mini(attr, x, y);
    }
  }

  // 防御の結界 (二重の円弧 + 放射する補強線)
  shield(x: number, y: number, power: number) {
    this.add({ kind: "shield", x, y, r: 70 + 40 * power, max: 46, color: INK });
    this.add({ kind: "ring", x, y, r: 40, vx: 7, max: 22, color: RED });
  }

  // 属性の小さなまとい (宣言時)
  private mini(attr: number, x: number, y: number) {
    for (let i = 0; i < 10; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(30, 80);
      const px = x + Math.cos(a) * d;
      const py = y + Math.sin(a) * d * 0.5;
      if (attr === 0) this.add({ kind: "flame", x: px, y: py + 20, vy: -rand(1.5, 3), r: rand(5, 10), max: rand(25, 40), color: RED });
      else if (attr === 1) this.add({ kind: "drop", x: px, y: py, vx: rand(-1, 1), vy: -rand(2, 4), g: 0.3, r: rand(2, 4), max: 35 });
      else if (attr === 2 && i < 3) this.add({ kind: "bolt", x: px, y: py, max: 12, pts: bolt(px, py - 50, px + rand(-20, 20), py + 30), color: i % 2 ? RED : INK });
      else if (attr === 3 && i < 6) this.add({ kind: "ray", x, y, rot: rand(0, Math.PI * 2), r: 120, max: 20 });
      else if (attr === 4) this.add({ kind: "dark", x: px, y: py, r: 4, vx: rand(1, 2), max: 30 });
      else if (attr === 5 && i < 4) this.add({ kind: "paper", x: px, y: py - 30, vx: rand(-1, 1), vy: rand(1, 2), rot: rand(0, 6), vr: rand(-0.2, 0.2), r: 12, max: 45 });
    }
  }

  // 着弾の汎用演出 + 攻撃側の属性エフェクト
  impact(attr: number, power: number, at?: [number, number]) {
    const [x, y] = at ?? [this.w / 2, this.h * 0.55];
    const p = Math.min(1, Math.max(0.25, power));
    this.add({ kind: "ring", x, y, r: 10, vx: 9 + 8 * p, max: 26, color: INK });
    this.add({ kind: "ring", x, y, r: 4, vx: 6 + 5 * p, max: 32, color: RED });
    for (let i = 0; i < 24 + 40 * p; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(4, 14) * (0.6 + p);
      this.add({ kind: "spark", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rand(1.5, 3.5), max: rand(14, 28), color: Math.random() < 0.35 ? RED : INK });
    }
    this.splat(x, y, Math.round(6 + 10 * p));
    this.attribute(attr, x, y, p);
  }

  // 墨の飛び散り
  splat(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(2, 9);
      this.add({ kind: "blob", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rand(3, 11), g: 0.25, max: rand(40, 70), color: Math.random() < 0.3 ? RED : INK });
    }
  }

  attribute(attr: number, x: number, y: number, p: number) {
    const { w, h } = this;
    switch (attr) {
      case 0: // 炎: 立ちのぼる炎
        for (let i = 0; i < 40 + 40 * p; i++)
          this.add({ kind: "flame", x: x + rand(-w * 0.45, w * 0.45), y: h + rand(0, 40), vx: rand(-0.6, 0.6), vy: -rand(3, 8), r: rand(8, 22), max: rand(40, 80), color: Math.random() < 0.7 ? RED : INK });
        break;
      case 1: // 水: 水しぶきと波紋
        for (let i = 0; i < 50 + 30 * p; i++) {
          const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
          const s = rand(5, 13);
          this.add({ kind: "drop", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rand(2, 6), g: 0.45, max: rand(50, 80) });
        }
        for (let i = 0; i < 3; i++) this.add({ kind: "ring", x, y: y + 20, r: 6 + i * 12, vx: 4, max: 40 + i * 10, color: INK });
        break;
      case 2: // 雷: 稲妻
        for (let i = 0; i < 3 + Math.round(3 * p); i++) this.add({ kind: "bolt", x: x + rand(-w * 0.3, w * 0.3), y: 0, max: 18, pts: bolt(x + rand(-w * 0.35, w * 0.35), 0, x + rand(-30, 30), y), color: i % 2 ? RED : INK });
        break;
      case 3: // 光: 放射光
        for (let i = 0; i < 18; i++) this.add({ kind: "ray", x, y, rot: (i / 18) * Math.PI * 2, vr: 0.01, r: Math.hypot(w, h), max: 38 });
        break;
      case 4: // 闇: 画面の縁から墨が侵食する
        for (let i = 0; i < 14; i++) {
          const side = i % 4;
          const ex = side === 0 ? 0 : side === 1 ? w : rand(0, w);
          const ey = side === 2 ? 0 : side === 3 ? h : rand(0, h);
          this.add({ kind: "dark", x: ex, y: ey, r: 10, vx: rand(2.5, 5) * (0.7 + p), max: rand(50, 70) });
        }
        break;
      case 5: // 社畜: 書類が舞い、承認印が押される
        for (let i = 0; i < 18 + 14 * p; i++) this.add({ kind: "paper", x: rand(0, w), y: rand(-h * 0.6, -10), vx: rand(-1.2, 1.2), vy: rand(2, 5), rot: rand(0, 6), vr: rand(-0.15, 0.15), r: rand(14, 24), max: rand(70, 110) });
        for (let i = 0; i < 2 + Math.round(2 * p); i++) this.add({ kind: "hanko", x: rand(w * 0.2, w * 0.8), y: rand(h * 0.2, h * 0.8), rot: rand(-0.4, 0.4), r: rand(22, 34), max: 70 });
        break;
    }
  }

  // 大ダメージ時の画面のひび
  crack() {
    const x = this.w / 2 + rand(-30, 30);
    const y = this.h * 0.55;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rand(-0.2, 0.2);
      const pts: [number, number][] = [[x, y]];
      let cx = x;
      let cy = y;
      const len = rand(60, Math.max(this.w, this.h) * 0.6);
      for (let d = 0; d < len; d += rand(14, 30)) {
        cx += Math.cos(a + rand(-0.4, 0.4)) * 22;
        cy += Math.sin(a + rand(-0.4, 0.4)) * 22;
        pts.push([cx, cy]);
      }
      this.add({ kind: "crack", x, y, pts, max: 100 });
    }
  }

  // 勝利の紙吹雪 (墨と赤)
  confetti() {
    for (let i = 0; i < 90; i++)
      this.add({ kind: "paper", x: rand(0, this.w), y: rand(-this.h, -10), vx: rand(-1.5, 1.5), vy: rand(2, 5), rot: rand(0, 6), vr: rand(-0.25, 0.25), r: rand(6, 12), max: rand(120, 180), color: Math.random() < 0.5 ? RED : INK });
  }

  private frame = () => {
    const { ctx, dpr } = this;
    const frozen = performance.now() < this.frozenUntil;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (!frozen) this.ps = this.ps.filter((p) => ++p.life < p.max);
    for (const p of this.ps) {
      if (frozen) {
        draw(ctx, p, true);
        continue;
      }
      // ring / dark は vx を半径の広がる速さとして使うので移動させない
      if (p.kind !== "ring" && p.kind !== "dark") {
        p.vy += p.g;
        p.x += p.vx;
        p.y += p.vy;
      }
      p.rot += p.vr;
      draw(ctx, p);
    }
    this.raf = this.ps.length ? requestAnimationFrame(this.frame) : 0;
    if (!this.raf) ctx.clearRect(0, 0, this.w, this.h);
  };
}

function draw(ctx: CanvasRenderingContext2D, p: P, frozen = false) {
  const t = p.life / p.max;
  const fade = 1 - t;
  ctx.save();
  ctx.globalAlpha = Math.max(0, fade);
  switch (p.kind) {
    case "spark":
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.r;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2);
      ctx.stroke();
      p.vx *= 0.9;
      p.vy *= 0.9;
      break;
    case "blob":
    case "drop":
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r, p.r * (p.kind === "drop" ? 1.4 : 1), Math.atan2(p.vy, p.vx) + Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "flame": {
      const r = p.r * (1 - t * 0.6);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - r * 2.2);
      ctx.quadraticCurveTo(p.x + r, p.y - r * 0.4, p.x, p.y + r * 0.6);
      ctx.quadraticCurveTo(p.x - r, p.y - r * 0.4, p.x, p.y - r * 2.2);
      ctx.fill();
      ctx.stroke();
      p.x += Math.sin(p.life / 5) * 0.8;
      break;
    }
    case "ring":
      if (!frozen) {
        p.r += p.vx;
        p.vx *= 0.93;
      }
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 6 * fade + 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "bolt":
      // 点滅させる
      if (p.life % 4 < 2 && p.pts) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = PAPER;
        ctx.lineWidth = 9;
        poly(ctx, p.pts);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4;
        poly(ctx, p.pts);
      }
      break;
    case "ray":
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = PAPER;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(p.r, -p.r * 0.07 * (0.4 + t));
      ctx.lineTo(p.r, p.r * 0.07 * (0.4 + t));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case "dark": {
      if (!frozen) p.r += p.vx;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, INK);
      g.addColorStop(0.7, INK);
      g.addColorStop(1, "rgba(18,16,16,0)");
      ctx.globalAlpha = Math.min(1, fade * 1.6) * 0.9;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "paper":
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.abs(Math.cos(p.life / 8)) * 0.8 + 0.2);
      if (p.color === INK && p.r > 12) {
        ctx.fillStyle = PAPER;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.fillRect(-p.r * 0.7, -p.r, p.r * 1.4, p.r * 2);
        ctx.strokeRect(-p.r * 0.7, -p.r, p.r * 1.4, p.r * 2);
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(-p.r * 0.5, -p.r * 0.6 + i * p.r * 0.4);
          ctx.lineTo(p.r * 0.5, -p.r * 0.6 + i * p.r * 0.4);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.r / 2, -p.r / 3, p.r, p.r * 0.66);
      }
      p.vx += Math.sin(p.life / 10) * 0.05;
      break;
    case "hanko": {
      const s = t < 0.1 ? 1.8 - t * 8 : 1;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(s, s);
      ctx.strokeStyle = RED;
      ctx.fillStyle = RED;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, 0, p.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = `${p.r * 0.75}px "Dela Gothic One", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("承", 0, -p.r * 0.36);
      ctx.fillText("認", 0, p.r * 0.4);
      break;
    }
    case "shield": {
      const grow = Math.min(1, t * 5);
      ctx.translate(p.x, p.y);
      ctx.strokeStyle = p.color;
      for (const [r, lw] of [
        [p.r * grow, 6],
        [p.r * grow * 0.86, 2],
      ] as const) {
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.arc(0, 0, r, Math.PI * 0.15, Math.PI * 0.85, true);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, r, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * p.r * grow * 0.86, Math.sin(a) * p.r * grow * 0.86);
        ctx.lineTo(Math.cos(a) * p.r * grow, Math.sin(a) * p.r * grow);
        ctx.stroke();
      }
      break;
    }
    case "crack":
      ctx.globalAlpha = t < 0.7 ? 1 : (1 - t) / 0.3;
      if (p.pts) {
        ctx.strokeStyle = PAPER;
        ctx.lineWidth = 5;
        poly(ctx, p.pts);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        poly(ctx, p.pts);
      }
      break;
  }
  ctx.restore();
}

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.stroke();
}

function bolt(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [[x0, y0]];
  const n = 9;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    pts.push([x0 + (x1 - x0) * t + rand(-26, 26), y0 + (y1 - y0) * t]);
  }
  pts.push([x1, y1]);
  return pts;
}
