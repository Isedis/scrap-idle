import type { Decimal } from '../game/num';

/** Palette of the camera feed; matches the terminal tokens in style.css. */
const C = {
  skyTop: '#03080a',
  skyBottom: '#08140d',
  ground: '#07120a',
  heapFar: '#0b1a10',
  heapBack: '#0f2216',
  heapFront: '#163020',
  ridge: '#2f6b3f',
  build: '#0c1d12',
  buildEdge: '#24543a',
  glow: '#7dff9a',
  mid: '#4fb067',
  dim: '#2f6b3f',
  amber: '#ffbf47',
  red: '#ff6b57',
  items: ['#7dff9a', '#4fb067', '#ffbf47', '#8fd8c8'],
};

/** What the camera needs to know about the game. */
export interface SceneView {
  owned: Record<string, number>;
  rate: Decimal;
  total: Decimal;
}

type ItemKind = 0 | 1 | 2 | 3; // can, bottle, box, tyre

interface Item {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  kind: ItemKind;
  color: string;
  /** Seconds since it landed; -1 while in the air. */
  landed: number;
  /** Pulled into the black hole instead of falling. */
  sucked?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  /** Seconds the particle lives in total. */
  span: number;
  size: number;
  color: string;
  smoke?: boolean;
}

interface Walker {
  kind: 'collector' | 'cart';
  x: number;
  dir: 1 | -1;
  speed: number;
  phase: number;
  tossIn: number;
}

interface Truck {
  x: number;
  state: 'in' | 'dump' | 'out';
  timer: number;
  tilt: number;
  dumped: boolean;
}

interface Satellite {
  x: number;
  y: number;
  speed: number;
  phase: number;
}

const MAX_ITEMS = 60;
const MAX_PARTICLES = 160;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/**
 * The dump seen through the plant's security camera. Everything the player owns
 * shows up: collectors and carts walk the yard, trucks dump loads, the plant
 * smokes in the back, satellites cross the sky. The heap grows with total trash.
 */
export class Scene {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private t = 0;
  private view: SceneView | null = null;
  private items: Item[] = [];
  private particles: Particle[] = [];
  private walkers: Walker[] = [];
  private trucks: Truck[] = [];
  private truckIn = 1;
  private beltItems: number[] = [];
  private beltIn = 0;
  private skyDropIn = 2;
  private holePullIn = 3;
  private satellites: Satellite[] = [];
  private stars: { x: number; y: number; r: number; phase: number }[] = [];
  /** Fixed ridge shape, 0..1 per sample, so the heap keeps its silhouette as it grows. */
  private ridge: number[] = [];
  private heapHeight = 0;
  private flashAlpha = 0;
  private flashColor = C.glow;
  private glitchLeft = 0;
  private reducedMotion: boolean;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i <= 40; i++) {
      // A mound with a few lumps on top.
      this.ridge.push(Math.sin((i / 40) * Math.PI) ** 0.75 * (0.84 + rand() * 0.16));
    }
    for (let i = 0; i < 80; i++) this.stars.push({ x: rand(), y: rand() * 0.6, r: rand() < 0.15 ? 1.4 : 0.8, phase: rand() * 6 });
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  // ---- Layout -------------------------------------------------------------

  private get ground() {
    return this.h - 12;
  }
  private get heapX() {
    return this.w * 0.58;
  }
  private get heapHalf() {
    return this.w * 0.3;
  }

  /** y of the heap surface at x; the ground outside the heap. */
  private surface(x: number): number {
    const left = this.heapX - this.heapHalf;
    const u = (x - left) / (this.heapHalf * 2);
    if (u <= 0 || u >= 1) return this.ground;
    const t = u * (this.ridge.length - 1);
    const i = Math.floor(t);
    const a = this.ridge[i];
    const b = this.ridge[Math.min(i + 1, this.ridge.length - 1)];
    return this.ground - (a + (b - a) * (t - i)) * this.heapHeight;
  }

  private owned(id: string): number {
    return this.view?.owned[id] ?? 0;
  }

  // ---- Bright moments -----------------------------------------------------

  /** A short flash over the whole feed. */
  flash(color: 'green' | 'amber'): void {
    if (this.reducedMotion) return;
    this.flashColor = color === 'green' ? C.glow : C.amber;
    this.flashAlpha = 0.35;
  }

  /** Signal interference: torn lines and static. */
  glitch(seconds: number): void {
    if (this.reducedMotion) return;
    this.glitchLeft = Math.max(this.glitchLeft, seconds);
  }

  /** Sparks along the yard, for a celebration. */
  burst(): void {
    for (let i = 0; i < 28; i++) {
      this.spark(rnd(0, this.w), this.ground - rnd(0, 10), rnd(-40, 40), rnd(-90, -30), pick([C.glow, C.amber]), 0.9);
    }
  }

  // ---- Spawning -----------------------------------------------------------

  private throwItem(x: number, y: number, targetX: number, flight = 0.8): void {
    if (this.items.length >= MAX_ITEMS) return;
    const targetY = this.surface(targetX);
    // Ballistic arc that lands on the heap after roughly `flight` seconds.
    const g = 260;
    this.items.push({
      x,
      y,
      vx: (targetX - x) / flight,
      vy: (targetY - y - 0.5 * g * flight * flight) / flight,
      rot: rnd(0, 6.3),
      spin: rnd(-6, 6),
      kind: Math.floor(Math.random() * 4) as ItemKind,
      color: pick(C.items),
      landed: -1,
    });
  }

  private onHeap(): number {
    return this.heapX + rnd(-0.8, 0.8) * this.heapHalf;
  }

  private spark(x: number, y: number, vx: number, vy: number, color: string, span: number): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push({ x, y, vx, vy, life: span, span, size: 2, color });
  }

  private smoke(x: number, y: number, dark = false): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push({
      x,
      y,
      vx: rnd(2, 7),
      vy: rnd(-14, -8),
      life: 3,
      span: 3,
      size: 2,
      color: dark ? 'rgba(70, 90, 75,' : 'rgba(120, 165, 135,',
      smoke: true,
    });
  }

  /** Keeps the number of walkers on screen in step with what the player owns. */
  private syncWalkers(kind: Walker['kind'], target: number): void {
    const mine = this.walkers.filter((w) => w.kind === kind);
    // On the first frames the yard is already busy; later purchases walk in from the left edge.
    const settled = this.t > 0.5;
    for (let i = mine.length; i < target; i++) {
      this.walkers.push({
        kind,
        x: settled ? -10 - (i - mine.length) * 8 : rnd(0, this.w),
        dir: settled || Math.random() < 0.5 ? 1 : -1,
        speed: kind === 'collector' ? rnd(14, 22) : rnd(18, 26),
        phase: rnd(0, 6),
        tossIn: rnd(1, 4),
      });
    }
    if (mine.length > target) {
      const drop = new Set(mine.slice(target));
      this.walkers = this.walkers.filter((w) => !drop.has(w));
    }
  }

  // ---- Simulation ---------------------------------------------------------

  update(dt: number, view: SceneView): void {
    this.view = view;
    if (!this.w) return;
    dt = Math.min(dt, 0.1);
    this.t += dt;

    // Heap: a sliver at the start, most of the frame by 1e15 kg.
    const grow = Math.min(Math.log10(view.total.toNumber() + 1) / 15, 1);
    const target = this.h * (0.12 + 0.4 * grow);
    this.heapHeight += (target - this.heapHeight) * Math.min(dt * 2, 1);

    this.syncWalkers('collector', Math.min(this.owned('collector'), 10));
    this.syncWalkers('cart', Math.min(this.owned('cart'), 5));
    if (!this.reducedMotion) this.simulate(dt);

    this.draw();
  }

  private simulate(dt: number): void {
    const heapL = this.heapX - this.heapHalf * 0.9;
    const heapR = this.heapX + this.heapHalf * 0.9;

    for (const w of this.walkers) {
      w.x += w.dir * w.speed * dt;
      w.phase += dt * w.speed * 0.4;
      // Turn around just off screen so the yard never empties.
      if (w.x > this.w + 14) w.dir = -1;
      if (w.x < -14) w.dir = 1;
      w.tossIn -= dt;
      if (w.tossIn <= 0 && w.x > heapL && w.x < heapR) {
        const y = this.ground - (w.kind === 'cart' ? 10 : 12);
        this.throwItem(w.x, y, this.onHeap(), 0.7);
        if (w.kind === 'cart') this.throwItem(w.x, y, this.onHeap(), 0.9);
        w.tossIn = w.kind === 'cart' ? rnd(3, 6) : rnd(2.5, 5);
      }
    }

    // Trucks: drive in, raise the body, dump, drive off.
    const trucks = this.owned('truck');
    if (trucks > 0) {
      this.truckIn -= dt;
      if (this.truckIn <= 0 && this.trucks.length < (trucks >= 10 ? 2 : 1)) {
        this.trucks.push({ x: -44, state: 'in', timer: 0, tilt: 0, dumped: false });
        this.truckIn = Math.max(2.5, 12 - Math.log2(trucks + 1) * 2);
      }
    }
    for (const tr of this.trucks) {
      if (tr.state === 'in') {
        tr.x += 60 * dt;
        if (tr.x >= this.heapX - this.heapHalf * 1.05) {
          tr.state = 'dump';
          tr.timer = 1.8;
        }
      } else if (tr.state === 'dump') {
        tr.timer -= dt;
        tr.tilt = tr.timer > 0.6 ? Math.min(tr.tilt + dt * 1.2, 0.55) : Math.max(tr.tilt - dt * 1.5, 0);
        if (!tr.dumped && tr.timer < 1.0) {
          tr.dumped = true;
          for (let i = 0; i < 5; i++) this.throwItem(tr.x + 30, this.ground - 22, this.onHeap(), rnd(0.6, 1));
        }
        if (tr.timer <= 0) tr.state = 'out';
      } else {
        tr.x += 75 * dt;
      }
    }
    this.trucks = this.trucks.filter((tr) => tr.x < this.w + 60);

    // Sorting line: items ride the belt and drop onto the heap.
    const sorters = this.owned('sorter');
    const beltEnd = this.heapX - this.heapHalf * 0.75;
    if (sorters > 0) {
      this.beltIn -= dt;
      if (this.beltIn <= 0) {
        this.beltItems.push(4);
        this.beltIn = Math.max(0.5, 3 - sorters * 0.08);
      }
      const speed = 22 + Math.min(sorters, 60) * 0.6;
      this.beltItems = this.beltItems.map((x) => x + speed * dt);
      for (const x of this.beltItems.filter((x) => x >= beltEnd)) this.throwItem(x, this.ground - 24, this.onHeap(), 0.6);
      this.beltItems = this.beltItems.filter((x) => x < beltEnd);
    }

    // Factory and incinerator chimneys smoke.
    for (const [x, y] of this.chimneyTops()) if (Math.random() < dt * 1.2) this.smoke(x, y);
    for (const [x, y] of this.stackTops()) if (Math.random() < dt * 0.9) this.smoke(x, y, true);

    // Orbital collectors drop scrap from the sky.
    const orbital = this.owned('orbital');
    if (orbital > 0) {
      this.skyDropIn -= dt;
      if (this.skyDropIn <= 0) {
        const x = this.onHeap();
        this.throwItem(x + rnd(-30, 30), -10, x, rnd(1, 1.4));
        this.skyDropIn = Math.max(0.6, 5 - orbital * 0.15);
      }
    }
    const satTarget = Math.min(orbital, 6);
    while (this.satellites.length < satTarget) {
      this.satellites.push({ x: -10, y: rnd(0.08, 0.38) * this.h, speed: rnd(8, 20), phase: rnd(0, 6) });
    }
    this.satellites.length = Math.min(this.satellites.length, satTarget);
    for (const s of this.satellites) {
      s.x += s.speed * dt;
      if (s.x > this.w + 10) {
        s.x = -10;
        s.y = rnd(0.08, 0.38) * this.h;
      }
    }

    // The singularity pulls scrap off the heap.
    const holes = this.owned('singularity');
    if (holes > 0) {
      this.holePullIn -= dt;
      if (this.holePullIn <= 0 && this.items.length < MAX_ITEMS) {
        const x = this.onHeap();
        this.items.push({ x, y: this.surface(x), vx: 0, vy: 0, rot: 0, spin: rnd(-8, 8), kind: Math.floor(Math.random() * 4) as ItemKind, color: pick(C.items), landed: -1, sucked: true });
        this.holePullIn = Math.max(0.4, 3.5 - holes * 0.1);
      }
    }

    const [hx, hy] = this.holeCenter();
    for (const it of this.items) {
      if (it.sucked) {
        // Spiral in, faster as it gets close.
        const dx = hx - it.x;
        const dy = hy - it.y;
        const d = Math.hypot(dx, dy) || 1;
        const pull = 9000 / Math.max(d, 12);
        it.vx += ((dx / d) * pull - (dy / d) * 40) * dt;
        it.vy += ((dy / d) * pull + (dx / d) * 40) * dt;
        it.vx *= 0.97;
        it.vy *= 0.97;
        it.x += it.vx * dt;
        it.y += it.vy * dt;
        it.rot += it.spin * dt;
        if (d < this.holeRadius() * 0.6) it.landed = 99;
        continue;
      }
      if (it.landed >= 0) {
        it.landed += dt;
        continue;
      }
      it.vy += 260 * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.rot += it.spin * dt;
      const floor = this.surface(it.x) + 3;
      if (it.vy > 0 && it.y >= floor) {
        it.y = floor;
        it.landed = 0;
        if (Math.random() < 0.5) this.spark(it.x, floor, rnd(-30, 30), rnd(-50, -20), C.amber, 0.45);
      }
    }
    this.items = this.items.filter((it) => it.landed < 1.4);

    // Embers drift up from the heap now and then.
    if (Math.random() < dt * 1.5) {
      const x = this.onHeap();
      this.spark(x, this.surface(x), rnd(-4, 4), rnd(-28, -14), C.amber, 2.5);
    }
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.smoke) p.size += dt * 2.2;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 1.4);
    this.glitchLeft = Math.max(0, this.glitchLeft - dt);
  }

  // ---- Landmarks ----------------------------------------------------------

  private plantCount() {
    const n = this.owned('plant');
    return n > 0 ? Math.min(1 + Math.floor(n / 5), 4) : 0;
  }

  /** Tops of factory chimneys, left to right. */
  private chimneyTops(): [number, number][] {
    const tops: [number, number][] = [];
    for (let i = 0; i < this.plantCount(); i++) tops.push([this.w * 0.04 + i * 27 + 18, this.ground - 44 - (i % 2) * 6]);
    return tops;
  }

  private stackCount() {
    const n = this.owned('incinerator');
    return n > 0 ? Math.min(1 + Math.floor(n / 10), 3) : 0;
  }

  /** Tops of the incinerator stacks. */
  private stackTops(): [number, number][] {
    const tops: [number, number][] = [];
    for (let i = 0; i < this.stackCount(); i++) tops.push([this.w - 10 - i * 11, this.h * 0.22 + i * 8]);
    return tops;
  }

  private holeRadius() {
    return 6 + Math.min(this.owned('singularity'), 30) * 0.45;
  }

  private holeCenter(): [number, number] {
    return [this.w * 0.2, this.h * 0.27];
  }

  // ---- Drawing ------------------------------------------------------------

  private draw(): void {
    const { ctx, w, h } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, C.skyTop);
    sky.addColorStop(1, C.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    if (this.owned('orbital') > 0 || this.owned('singularity') > 0) this.drawStars();
    if (this.owned('singularity') > 0) this.drawHole();
    for (const s of this.satellites) this.drawSatellite(s);
    this.drawLamp();
    this.drawPlants();
    this.drawStacks();
    this.drawHeap();
    if (this.owned('sorter') > 0) this.drawBelt();
    if (this.owned('press') > 0) this.drawPress();

    ctx.fillStyle = C.ground;
    ctx.fillRect(0, this.ground, w, h - this.ground);
    ctx.fillStyle = C.dim;
    ctx.fillRect(0, this.ground, w, 1);

    for (const tr of this.trucks) this.drawTruck(tr);
    for (const wk of this.walkers) (wk.kind === 'collector' ? this.drawCollector(wk) : this.drawCart(wk));
    for (const it of this.items) this.drawItem(it);
    this.drawParticles();

    if (this.flashAlpha > 0) {
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    if (this.glitchLeft > 0) this.drawGlitch();
  }

  private drawStars(): void {
    const { ctx } = this;
    const n = Math.min(20 + this.owned('orbital') * 4 + this.owned('singularity') * 4, this.stars.length);
    ctx.fillStyle = '#cfe8d6';
    for (let i = 0; i < n; i++) {
      const s = this.stars[i];
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(this.t * 1.5 + s.phase);
      ctx.fillRect(s.x * this.w, s.y * this.h, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  private drawHole(): void {
    const { ctx } = this;
    const [x, y] = this.holeCenter();
    const r = this.holeRadius();
    const halo = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 3);
    halo.addColorStop(0, 'rgba(255, 191, 71, 0.25)');
    halo.addColorStop(1, 'rgba(255, 191, 71, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    // Accretion disc: two rotating arcs, tilted.
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.38);
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 2; i++) {
      ctx.strokeStyle = i === 0 ? C.amber : C.glow;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      const a = this.t * (1.6 + i * 0.5) + i * Math.PI;
      ctx.arc(0, 0, r * (1.7 + i * 0.35), a, a + Math.PI * 1.3);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 191, 71, 0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private drawSatellite(s: Satellite): void {
    const { ctx } = this;
    ctx.fillStyle = C.mid;
    ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
    ctx.fillStyle = C.dim;
    ctx.fillRect(s.x - 7, s.y - 1, 5, 2);
    ctx.fillRect(s.x + 2, s.y - 1, 5, 2);
    if (Math.sin(this.t * 4 + s.phase) > 0.6) {
      ctx.fillStyle = C.red;
      ctx.fillRect(s.x - 0.5, s.y - 3.5, 1.5, 1.5);
    }
  }

  private drawLamp(): void {
    const { ctx, h } = this;
    const lx = this.w * 0.72;
    const flicker = this.reducedMotion ? 1 : this.t % 7 > 6.6 ? 0.55 + Math.random() * 0.3 : 1;
    const glow = ctx.createRadialGradient(lx, 24, 2, lx, 40, h * 0.9);
    glow.addColorStop(0, `rgba(255, 191, 71, ${0.28 * flicker})`);
    glow.addColorStop(1, 'rgba(255, 191, 71, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.w, h);
    ctx.fillStyle = '#1d3a25';
    ctx.fillRect(lx - 1.5, 0, 3, 20);
    ctx.globalAlpha = flicker;
    ctx.fillStyle = C.amber;
    ctx.fillRect(lx - 9, 20, 18, 4);
    ctx.globalAlpha = 1;
  }

  private drawPlants(): void {
    const { ctx } = this;
    for (let i = 0; i < this.plantCount(); i++) {
      const x = this.w * 0.04 + i * 27;
      const top = this.ground - 26 - (i % 2) * 6;
      ctx.fillStyle = C.build;
      ctx.strokeStyle = C.buildEdge;
      ctx.lineWidth = 1;
      // Saw-tooth factory roof.
      ctx.beginPath();
      ctx.moveTo(x, this.ground);
      ctx.lineTo(x, top);
      ctx.lineTo(x + 6, top - 5);
      ctx.lineTo(x + 6, top);
      ctx.lineTo(x + 12, top - 5);
      ctx.lineTo(x + 12, top);
      ctx.lineTo(x + 24, top);
      ctx.lineTo(x + 24, this.ground);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const [cx, cy] = this.chimneyTops()[i];
      ctx.fillRect(cx - 2, cy, 4, top - cy);
      ctx.strokeRect(cx - 2, cy, 4, top - cy);
      // Lit windows, one of them flickers.
      ctx.fillStyle = C.amber;
      for (let k = 0; k < 3; k++) {
        ctx.globalAlpha = k === 1 && Math.sin(this.t * 3 + i) > 0.7 ? 0.25 : 0.75;
        ctx.fillRect(x + 4 + k * 6, top + 8, 3, 3);
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawStacks(): void {
    const { ctx } = this;
    const tops = this.stackTops();
    if (!tops.length) return;
    const baseX = this.w - 10 - (tops.length - 1) * 11 - 8;
    ctx.fillStyle = C.build;
    ctx.strokeStyle = C.buildEdge;
    ctx.fillRect(baseX, this.ground - 22, this.w - baseX, 22);
    ctx.strokeRect(baseX, this.ground - 22, this.w - baseX + 2, 22);
    // Furnace window glows.
    ctx.fillStyle = C.amber;
    ctx.globalAlpha = 0.55 + 0.35 * Math.sin(this.t * 2.3);
    ctx.fillRect(baseX + 5, this.ground - 12, 9, 5);
    ctx.globalAlpha = 1;
    for (const [x, y] of tops) {
      ctx.fillStyle = C.build;
      ctx.fillRect(x - 3, y, 6, this.ground - 22 - y);
      ctx.strokeRect(x - 3, y, 6, this.ground - 22 - y);
      if (Math.sin(this.t * 3 + x) > 0) {
        ctx.fillStyle = C.red;
        ctx.fillRect(x - 1, y - 3, 2, 2);
      }
    }
  }

  private heapPath(cx: number, half: number, height: number): void {
    const { ctx } = this;
    const n = this.ridge.length - 1;
    ctx.beginPath();
    ctx.moveTo(cx - half, this.ground);
    for (let i = 0; i <= n; i++) ctx.lineTo(cx - half + (i / n) * half * 2, this.ground - this.ridge[i] * height);
    ctx.lineTo(cx + half, this.ground);
    ctx.closePath();
  }

  private drawHeap(): void {
    const { ctx } = this;
    const landfill = this.owned('landfill');
    if (landfill > 0) {
      // A second, distant mountain of trash.
      const scale = 0.5 + 0.5 * Math.min(landfill / 25, 1);
      this.heapPath(this.heapX + this.heapHalf * 0.5, this.heapHalf * 1.4, this.heapHeight * 1.25 * scale);
      ctx.fillStyle = C.heapFar;
      ctx.fill();
    }
    this.heapPath(this.heapX - this.heapHalf * 0.15, this.heapHalf * 1.1, this.heapHeight * 1.15);
    ctx.fillStyle = C.heapBack;
    ctx.fill();
    this.heapPath(this.heapX, this.heapHalf, this.heapHeight);
    ctx.fillStyle = C.heapFront;
    ctx.fill();
    ctx.strokeStyle = C.ridge;
    ctx.lineWidth = 1;
    ctx.stroke();

    if (landfill > 0) {
      // Terraces cut into the heap, and a flag on the summit.
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = C.dim;
      const n = Math.min(landfill, 4);
      for (let k = 1; k <= n; k++) {
        const f = k / (n + 1);
        const half = this.heapHalf * (1 - f * 0.8);
        const y = this.ground - this.heapHeight * f * 0.85;
        ctx.beginPath();
        ctx.moveTo(this.heapX - half, y);
        ctx.lineTo(this.heapX + half, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      const top = this.surface(this.heapX);
      ctx.fillStyle = C.mid;
      ctx.fillRect(this.heapX, top - 14, 1.5, 14);
      const wave = Math.sin(this.t * 4) * 1.5;
      ctx.fillStyle = C.amber;
      ctx.beginPath();
      ctx.moveTo(this.heapX + 1.5, top - 14);
      ctx.lineTo(this.heapX + 10, top - 11.5 + wave);
      ctx.lineTo(this.heapX + 1.5, top - 9);
      ctx.fill();
    }
  }

  private drawBelt(): void {
    const { ctx } = this;
    const x0 = 2;
    const x1 = this.heapX - this.heapHalf * 0.75;
    const y = this.ground - 20;
    ctx.fillStyle = C.dim;
    for (let x = x0 + 8; x < x1; x += 30) ctx.fillRect(x, y + 4, 2, this.ground - y - 4);
    ctx.fillStyle = '#1a3524';
    ctx.fillRect(x0, y, x1 - x0, 4);
    // Moving ticks show the belt running.
    ctx.fillStyle = C.mid;
    const shift = (this.t * 24) % 8;
    for (let x = x0 + shift; x < x1; x += 8) ctx.fillRect(x, y + 1, 3, 1);
    for (const bx of this.beltItems) {
      ctx.fillStyle = C.items[Math.floor(bx * 7) % C.items.length];
      ctx.fillRect(bx - 3, y - 5, 6, 5);
    }
  }

  private drawPress(): void {
    const { ctx } = this;
    const n = this.owned('press');
    const x = this.w * 0.83;
    const top = this.ground - 34;
    ctx.fillStyle = C.build;
    ctx.strokeStyle = C.buildEdge;
    ctx.fillRect(x, top, 3, 34);
    ctx.fillRect(x + 19, top, 3, 34);
    ctx.fillRect(x, top, 22, 4);
    ctx.strokeRect(x, top, 22, 34);
    // Piston: slow lift, fast slam.
    const period = Math.max(0.7, 2 - n * 0.03);
    const p = (this.t % period) / period;
    const y = p < 0.75 ? top + 4 + 4 * (1 - p / 0.75) : top + 4 + 18 * Math.sin(((p - 0.75) / 0.25) * Math.PI);
    ctx.fillStyle = C.mid;
    ctx.fillRect(x + 10, top + 4, 2, y - top - 4);
    ctx.fillRect(x + 4, y, 14, 4);
    ctx.fillStyle = C.amber;
    ctx.fillRect(x + 6, this.ground - 6, 10, 6);
    // Finished cubes stack up beside it.
    const cubes = Math.min(n, 10);
    for (let i = 0; i < cubes; i++) {
      const row = i < 4 ? 0 : i < 7 ? 1 : i < 9 ? 2 : 3;
      const col = i < 4 ? i : i < 7 ? i - 4 : i < 9 ? i - 7 : 0;
      ctx.fillStyle = C.items[i % C.items.length];
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x + 25 + col * 6 + row * 3, this.ground - 6 - row * 6, 5, 5);
    }
    ctx.globalAlpha = 1;
  }

  private drawCollector(wk: Walker): void {
    const { ctx } = this;
    const x = wk.x;
    const g = this.ground;
    const step = Math.sin(wk.phase) * 2.5;
    ctx.strokeStyle = C.glow;
    ctx.fillStyle = C.glow;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(x - step, g);
    ctx.lineTo(x, g - 5);
    ctx.lineTo(x + step, g);
    ctx.moveTo(x, g - 5);
    ctx.lineTo(x, g - 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, g - 12, 2, 0, Math.PI * 2);
    ctx.fill();
    // Sack on the back.
    ctx.fillStyle = C.mid;
    ctx.beginPath();
    ctx.arc(x - wk.dir * 3.5, g - 8, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawCart(wk: Walker): void {
    const { ctx } = this;
    const g = this.ground;
    const front = wk.x + wk.dir * 8;
    // The pusher walks behind the cart.
    this.drawCollector({ ...wk, x: wk.x - wk.dir * 6 });
    ctx.fillStyle = C.build;
    ctx.strokeStyle = C.mid;
    ctx.lineWidth = 1;
    ctx.fillRect(front - 6, g - 9, 12, 6);
    ctx.strokeRect(front - 6, g - 9, 12, 6);
    ctx.fillStyle = C.amber;
    ctx.fillRect(front - 4, g - 11, 3, 2);
    ctx.fillStyle = C.items[3];
    ctx.fillRect(front, g - 12, 3, 3);
    ctx.fillStyle = C.mid;
    ctx.beginPath();
    ctx.arc(front - 3.5, g - 1.5, 1.5, 0, Math.PI * 2);
    ctx.arc(front + 3.5, g - 1.5, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawTruck(tr: Truck): void {
    const { ctx } = this;
    const g = this.ground;
    const x = tr.x;
    // Body pivots on its rear axle when dumping.
    ctx.save();
    ctx.translate(x + 2, g - 6);
    ctx.rotate(tr.tilt);
    ctx.fillStyle = '#123020';
    ctx.strokeStyle = C.mid;
    ctx.lineWidth = 1;
    ctx.fillRect(0, -14, 24, 12);
    ctx.strokeRect(0, -14, 24, 12);
    ctx.fillStyle = C.items[0];
    ctx.globalAlpha = 0.7;
    ctx.fillRect(3, -17, 6, 3);
    ctx.fillRect(12, -16, 7, 2);
    ctx.globalAlpha = 1;
    ctx.restore();
    // Cab and chassis stay level.
    ctx.fillStyle = '#123020';
    ctx.strokeStyle = C.mid;
    ctx.fillRect(x + 26, g - 16, 10, 10);
    ctx.strokeRect(x + 26, g - 16, 10, 10);
    ctx.fillStyle = C.glow;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(x + 30, g - 14, 4, 3);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.dim;
    ctx.fillRect(x, g - 7, 37, 2);
    ctx.fillStyle = C.amber;
    ctx.fillRect(x + 35, g - 9, 2, 2);
    ctx.fillStyle = C.mid;
    ctx.beginPath();
    ctx.arc(x + 7, g - 3, 3, 0, Math.PI * 2);
    ctx.arc(x + 30, g - 3, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawParticles(): void {
    const { ctx } = this;
    for (const p of this.particles) {
      const a = Math.max(p.life / p.span, 0);
      if (p.smoke) {
        ctx.fillStyle = `${p.color} ${0.35 * a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 1, p.y - 1, p.size, p.size);
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawItem(it: Item): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    let alpha = it.landed >= 0 ? Math.max(1 - it.landed / 1.4, 0) : 1;
    if (it.sucked) {
      // Shrinks as it nears the hole.
      const [hx, hy] = this.holeCenter();
      const s = Math.min(Math.hypot(hx - it.x, hy - it.y) / 60, 1);
      ctx.scale(0.3 + 0.7 * s, 0.3 + 0.7 * s);
      alpha = 0.5 + 0.5 * s;
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = it.color;
    switch (it.kind) {
      case 0:
        ctx.fillRect(-2.5, -4.5, 5, 9);
        break;
      case 1:
        ctx.fillRect(-2, -2, 4, 8);
        ctx.fillRect(-1, -5, 2, 3);
        break;
      case 2:
        ctx.fillRect(-4.5, -3.5, 9, 7);
        break;
      case 3:
        ctx.beginPath();
        ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
        ctx.arc(0, 0, 1.8, 0, Math.PI * 2, true);
        ctx.fill();
        break;
    }
    ctx.restore();
  }

  private drawGlitch(): void {
    const { ctx, w, h, dpr } = this;
    // Tear a few horizontal strips sideways, then sprinkle static.
    for (let i = 0; i < 4; i++) {
      const y = Math.random() * h;
      const sh = rnd(2, 12);
      const dx = rnd(-18, 18);
      ctx.drawImage(this.canvas, 0, y * dpr, w * dpr, sh * dpr, dx, y, w, sh);
    }
    ctx.fillStyle = C.glow;
    for (let i = 0; i < 120; i++) {
      ctx.globalAlpha = Math.random() * 0.5;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
    ctx.globalAlpha = 0.12;
    ctx.fillRect(0, rnd(0, h), w, rnd(4, 14));
    ctx.globalAlpha = 1;
  }
}
