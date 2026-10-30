import type { Decimal } from '../game/num';

/** Palette of the camera feed; matches the terminal tokens in style.css. */
const C = {
  skyTop: '#03080a',
  skyBottom: '#08140d',
  heapBack: '#0f2216',
  heapFront: '#163020',
  ridge: '#2f6b3f',
  lamp: '#ffbf47',
  items: ['#7dff9a', '#4fb067', '#ffbf47', '#8fd8c8'],
};

type Kind = 0 | 1 | 2 | 3; // can, bottle, box, tyre

interface Item {
  x: number;
  y: number;
  vy: number;
  rot: number;
  spin: number;
  kind: Kind;
  color: string;
  /** Seconds since it landed; -1 while falling. */
  landed: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

const MAX_ITEMS = 40;

/**
 * The night dump seen through the plant's security camera. The heap grows with
 * total trash, and items fall faster as production rises.
 */
export class Scene {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private items: Item[] = [];
  private sparks: Spark[] = [];
  private spawnDebt = 0;
  private sparkDebt = 0;
  private time = 0;
  /** Fixed ridge shape, 0..1 per sample, so the heap keeps its silhouette as it grows. */
  private ridge: number[] = [];
  private heapHeight = 0;
  private reducedMotion: boolean;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      // A wide mound with a few lumps on top.
      this.ridge.push(Math.sin(t * Math.PI) ** 0.7 * (0.82 + rand() * 0.18));
    }
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Height of the heap surface (from the top) at x. */
  private surface(x: number): number {
    const t = Math.min(Math.max(x / this.w, 0), 1) * (this.ridge.length - 1);
    const i = Math.floor(t);
    const a = this.ridge[i];
    const b = this.ridge[Math.min(i + 1, this.ridge.length - 1)];
    return this.h - (a + (b - a) * (t - i)) * this.heapHeight;
  }

  update(dt: number, rate: Decimal, total: Decimal): void {
    if (!this.w) return;
    dt = Math.min(dt, 0.1);
    this.time += dt;

    // Heap: a sliver at the start, about 70% of the frame by 1e15 kg.
    const grow = Math.min(Math.log10(total.toNumber() + 1) / 15, 1);
    const target = this.h * (0.18 + 0.52 * grow);
    this.heapHeight += (target - this.heapHeight) * Math.min(dt * 2, 1);

    // Falling items: from one every couple of seconds up to ~6 per second.
    const perSecond = Math.min(0.5 + Math.log10(rate.toNumber() + 1) * 0.9, 6);
    this.spawnDebt += this.reducedMotion ? 0 : perSecond * dt;
    while (this.spawnDebt >= 1 && this.items.length < MAX_ITEMS) {
      this.spawnDebt -= 1;
      this.items.push({
        x: this.w * (0.12 + Math.random() * 0.76),
        y: -12,
        vy: 30 + Math.random() * 30,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 6,
        kind: Math.floor(Math.random() * 4) as Kind,
        color: C.items[Math.floor(Math.random() * C.items.length)],
        landed: -1,
      });
    }
    this.spawnDebt = Math.min(this.spawnDebt, 1);

    for (const it of this.items) {
      if (it.landed >= 0) {
        it.landed += dt;
        continue;
      }
      it.vy += 260 * dt;
      it.y += it.vy * dt;
      it.rot += it.spin * dt;
      const floor = this.surface(it.x) + 3;
      if (it.y >= floor) {
        it.y = floor;
        it.landed = 0;
        if (Math.random() < 0.6) this.burst(it.x, floor);
      }
    }
    this.items = this.items.filter((it) => it.landed < 1.2);

    // Embers drift up from the heap now and then.
    this.sparkDebt += this.reducedMotion ? 0 : dt * 1.5;
    if (this.sparkDebt >= 1) {
      this.sparkDebt -= 1;
      const x = this.w * (0.2 + Math.random() * 0.6);
      this.sparks.push({ x, y: this.surface(x), vx: (Math.random() - 0.5) * 8, vy: -14 - Math.random() * 14, life: 1 });
    }
    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt / 2.5;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);

    this.draw();
  }

  private burst(x: number, y: number): void {
    for (let i = 0; i < 2; i++) {
      this.sparks.push({ x, y, vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 30, life: 0.45 });
    }
  }

  private draw(): void {
    const { ctx, w, h } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, C.skyTop);
    sky.addColorStop(1, C.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Street lamp with a flickering pool of light.
    const lx = w * 0.8;
    const flicker = this.reducedMotion ? 1 : this.time % 6 > 5.6 ? 0.55 + Math.random() * 0.3 : 1;
    const glow = ctx.createRadialGradient(lx, 24, 2, lx, 40, h * 0.9);
    glow.addColorStop(0, `rgba(255, 191, 71, ${0.32 * flicker})`);
    glow.addColorStop(1, 'rgba(255, 191, 71, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1d3a25';
    ctx.fillRect(lx - 1.5, 0, 3, 20);
    ctx.fillStyle = C.lamp;
    ctx.globalAlpha = flicker;
    ctx.fillRect(lx - 9, 20, 18, 4);
    ctx.globalAlpha = 1;

    // Back layer of the heap, wider and taller, so the front one reads as nearer.
    this.heapPath(1.12, 1.2);
    ctx.fillStyle = C.heapBack;
    ctx.fill();

    // Front layer is the surface items land on.
    this.heapPath(1, 1);
    ctx.fillStyle = C.heapFront;
    ctx.fill();
    ctx.strokeStyle = C.ridge;
    ctx.lineWidth = 1;
    ctx.stroke();

    for (const it of this.items) this.drawItem(it);

    for (const s of this.sparks) {
      ctx.globalAlpha = Math.max(s.life, 0);
      ctx.fillStyle = C.lamp;
      ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  private heapPath(widthScale: number, heightScale: number): void {
    const { ctx, w, h } = this;
    const n = this.ridge.length - 1;
    const left = (w - w * widthScale) / 2;
    ctx.beginPath();
    ctx.moveTo(left, h);
    for (let i = 0; i <= n; i++) {
      ctx.lineTo(left + (i / n) * w * widthScale, h - this.ridge[i] * this.heapHeight * heightScale);
    }
    ctx.lineTo(left + w * widthScale, h);
    ctx.closePath();
  }

  private drawItem(it: Item): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    ctx.globalAlpha = it.landed >= 0 ? Math.max(1 - it.landed / 1.2, 0) : 1;
    ctx.fillStyle = it.color;
    switch (it.kind) {
      case 0:
        ctx.fillRect(-3.5, -6, 7, 12);
        break;
      case 1:
        ctx.fillRect(-3, -3, 6, 10);
        ctx.fillRect(-1.5, -7, 3, 4);
        break;
      case 2:
        ctx.fillRect(-6, -5, 12, 10);
        break;
      case 3:
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.arc(0, 0, 2.5, 0, Math.PI * 2, true);
        ctx.fill();
        break;
    }
    ctx.restore();
  }
}
