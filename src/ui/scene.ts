import type { Decimal } from '../game/num';
import type { EventKind } from '../game/story';
import { drawLurker } from './lurker';

/** Palette of the camera feed: a night-vision picture in phosphor greens with amber lights. */
export const C = {
  skyTop: '#041009',
  skyBottom: '#0f2d1c',
  skyline: '#0c2416',
  skylineWin: '#8fd89c',
  far: '#123321',
  heapBack: '#1f4a30',
  heapFront: '#2f6b45',
  heapEdge: '#5fb07a',
  yard: '#0e2618',
  yardNear: '#0a1d12',
  lane: '#2c6b44',
  outline: '#03100a',
  glow: '#7dff9a',
  light: '#c8ffd2',
  // Night vision is monochrome: what used to be colours are now brightness levels of one green.
  lime: '#a8f0b0',
  green: '#4fa868',
  deep: '#2f7a4a',
  amber: '#d8ffdc',
  cyan: '#6fcf8a',
  red: '#e8ffe8',
  hub: '#6fae86',
  tyre: '#062012',
  items: ['#9fe8a8', '#6fcf8a', '#c8ffd2', '#4fa868', '#86dc98'],
};

/** Big junk on the heap is darker so the heap reads as one mass; the brightest shades belong to things that move. */
const J = {
  white: '#7fb08a',
  box: '#5f8f68',
  bags: ['#4f8a60', '#6a9f74', '#3f7a52'],
  sofa: '#2a6a40',
  hub: '#4f8a63',
};

/** What the camera needs to know about the game. */
export interface SceneView {
  owned: Record<string, number>;
  rate: Decimal;
  /** Trash collected this run: the heap grows with it and shrinks on recycle. */
  total: Decimal;
  /** Recycles done: a recycling complex grows on the horizon. */
  recycles: number;
  /** Threat 0..1: darkness, interference and the thing in the yard grow with it. */
  threat: number;
  /** Marks left by events this run. */
  traces: readonly string[];
}

/** An event playing on camera: what, how far in, and whether it is a replay from the archive. */
interface Playing {
  kind: EventKind;
  t: number;
  dur: number;
  replay: boolean;
}

/** How long each camera event lasts, in seconds. DOM-only kinds are absent. */
const EVENT_SECONDS: Partial<Record<EventKind, number>> = {
  eyes: 4.5,
  bag: 6,
  lampBlink: 3,
  extra: 7,
  fridge: 5,
  note: 6,
  driverless: 9,
  lampTurn: 2.5,
  breathe: 8,
  gull: 5,
  raccoon: 7,
  cat: 7,
};

type ItemKind = 0 | 1 | 2 | 3 | 4; // can, bottle, box, tyre, bag

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
  /** 0 = back lane (smaller, higher), 1 = front lane. */
  lane: 0 | 1;
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

/** A piece of big junk lying on the heap: position along the heap and how deep below its surface. */
interface Junk {
  u: number;
  depth: number;
  kind: 'fridge' | 'washer' | 'tyre' | 'bag' | 'box' | 'sofa';
  rot: number;
  color: string;
}

/** Screen background the dim bodies fade toward, and the brightest phosphor. */
const PHOSPHOR_BG = [6, 20, 12];
const PHOSPHOR_HI = [216, 255, 220];

export interface Phosphor {
  /** Fill for scenery: mostly sunk into the background. */
  body: string;
  /** Fill for actors: brighter so they stand out. */
  actorBody: string;
  /** Edge for actors: the brightest lines on screen. */
  edge: string;
  /** Edge for scenery: dimmer, so it never competes with actors. */
  dimEdge: string;
}
const phosphorCache = new Map<string, Phosphor>();

/** Splits a colour into bodies and edges for the vector-terminal look. */
export function phosphor(hex: string): Phosphor {
  let out = phosphorCache.get(hex);
  if (out) return out;
  const n = parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const mix = (a: number[], b: number[], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(' ')})`;
  const luma = (rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11) / 255;
  out = {
    body: mix(rgb, PHOSPHOR_BG, 0.78),
    actorBody: mix(rgb, PHOSPHOR_BG, 0.55),
    // Dark parts (tyres) still get a visible edge.
    edge: luma < 0.25 ? '#6fcf8a' : mix(rgb, PHOSPHOR_HI, 0.4),
    dimEdge: luma < 0.25 ? '#2f6b45' : mix(rgb, PHOSPHOR_BG, 0.4),
  };
  phosphorCache.set(hex, out);
  return out;
}

/** Dark outline drawn around actors so they separate from the busy background. */
export const HALO = 'rgb(4 14 8)';

/** The camera overlay's own colour, like the REC mark: the one thing in the picture that is not green. */
const HUD_RED = '#ff6b57';

const MAX_ITEMS = 24;
const MAX_PARTICLES = 160;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/**
 * The dump seen through the plant's security camera, in three planes: the town and
 * the plant on the horizon, the heap in the middle, the yard up front. Everything
 * the player owns shows up, at a believable size.
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
  private skyline: { x: number; w: number; h: number; win: [number, number][] }[] = [];
  private junk: Junk[] = [];
  /** Fixed ridge shape, 0..1 per sample, so the heap keeps its silhouette as it grows. */
  private ridge: number[] = [];
  private heapHeight = 0;
  private grow = 0;
  private flashAlpha = 0;
  private flashColor = C.glow;
  private glitchLeft = 0;
  /** Floodlight glare, 1 right after the switch, fading out. */
  private glare = 0;
  /** The figure that shows up in the yard as the threat rises: where, and how long it stays. */
  private ghost: { x: number; lane: 0 | 1; left: number } | null = null;
  private ghostIn = 8;
  private playing: Playing[] = [];
  /** Digital zoom onto a replayed event: current scale and the point it is centred on. */
  private zoom = { scale: 1, x: 0, y: 0 };
  private reducedMotion: boolean;
  /** How `paint` draws: dim scenery, bright actors, or the dark halo behind actors. */
  private mode: 'scenery' | 'actor' | 'halo' = 'scenery';

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let seed = 11;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i <= 40; i++) this.ridge.push(Math.sin((i / 40) * Math.PI) ** 0.8 * (0.86 + rand() * 0.14));
    for (let i = 0; i < 80; i++) this.stars.push({ x: rand(), y: rand() * 0.45, r: rand() < 0.15 ? 1.4 : 0.8, phase: rand() * 6 });
    // Town on the horizon: blocks of different heights with a few lit windows.
    for (let x = 0; x < 1; ) {
      const bw = 0.03 + rand() * 0.05;
      const win: [number, number][] = [];
      for (let k = 0; k < 3; k++) if (rand() < 0.5) win.push([rand(), rand()]);
      this.skyline.push({ x, w: bw, h: 0.04 + rand() * 0.1, win });
      x += bw;
    }
    const kinds: Junk['kind'][] = ['fridge', 'tyre', 'bag', 'box', 'washer', 'tyre', 'bag', 'sofa', 'box', 'bag', 'tyre', 'fridge', 'bag', 'box', 'washer', 'tyre', 'bag', 'box'];
    kinds.forEach((kind, i) => {
      this.junk.push({ u: 0.1 + rand() * 0.8, depth: 0.08 + rand() * 0.55, kind, rot: (rand() - 0.5) * 0.7, color: J.bags[i % J.bags.length] });
    });
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  private resize(): void {
    // One canvas pixel per CSS pixel, scaled up without smoothing: a slightly coarse, CRT-like picture.
    this.dpr = 1;
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  // ---- Layout -------------------------------------------------------------

  /** Where the heap meets the yard; the far plane stands on this line too. */
  private get horizon() {
    return Math.round(this.h * 0.7);
  }
  /** Feet of people and wheels of vehicles, per lane. */
  private laneY(lane: 0 | 1) {
    return lane === 0 ? this.horizon + 16 : this.h - 10;
  }
  private get heapX() {
    return this.w * 0.56;
  }
  private get heapHalf() {
    return this.w * 0.32;
  }

  /** y of the heap surface at x; the horizon outside the heap. */
  private surface(x: number): number {
    const left = this.heapX - this.heapHalf;
    const u = (x - left) / (this.heapHalf * 2);
    if (u <= 0 || u >= 1) return this.horizon;
    const t = u * (this.ridge.length - 1);
    const i = Math.floor(t);
    const a = this.ridge[i];
    const b = this.ridge[Math.min(i + 1, this.ridge.length - 1)];
    return this.horizon - (a + (b - a) * (t - i)) * this.heapHeight;
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

  /** The floodlight: glare over the yard, the figure gone. */
  /** Plays a camera event; returns false for kinds the camera does not draw. */
  playEvent(kind: EventKind, replay = false): boolean {
    const dur = EVENT_SECONDS[kind];
    if (!dur) return false;
    this.playing = this.playing.filter((p) => p.kind !== kind);
    this.playing.push({ kind, t: 0, dur, replay });
    if (kind === 'lampTurn') this.glitch(1.5);
    return true;
  }

  /** The live event (not a replay) near a tap at x, y in CSS pixels of the canvas, if any. */
  hit(x: number, y: number): EventKind | null {
    // Taps arrive in screen pixels; anchors live in scene pixels.
    const [ox, oy] = this.zoomOffset();
    x = (x - ox) / this.zoom.scale;
    y = (y - oy) / this.zoom.scale;
    for (const p of this.playing) {
      if (p.replay) continue;
      const a = this.anchor(p);
      if (a && Math.hypot(a[0] - x, a[1] - y) < 32) return p.kind;
    }
    return null;
  }

  private active(kind: EventKind): Playing | undefined {
    return this.playing.find((p) => p.kind === kind);
  }

  floodlight(): void {
    this.glare = 1;
    this.ghost = null;
    this.ghostIn = 10;
  }

  /** Sparks along the yard, for a celebration. */
  burst(): void {
    for (let i = 0; i < 16; i++) {
      this.spark(rnd(0, this.w), this.laneY(1) - rnd(0, 20), rnd(-40, 40), rnd(-90, -30), pick([C.glow, C.amber]), 0.9);
    }
  }

  // ---- Spawning -----------------------------------------------------------

  private throwItem(x: number, y: number, targetX: number, flight = 0.8): void {
    if (this.items.length >= MAX_ITEMS) return;
    const targetY = this.surface(targetX);
    const g = 260;
    this.items.push({
      x,
      y,
      vx: (targetX - x) / flight,
      vy: (targetY - y - 0.5 * g * flight * flight) / flight,
      rot: rnd(0, 6.3),
      spin: rnd(-6, 6),
      kind: Math.floor(Math.random() * 5) as ItemKind,
      color: pick(C.items),
      landed: -1,
    });
  }

  private onHeap(): number {
    return this.heapX + rnd(-0.75, 0.75) * this.heapHalf;
  }

  private spark(x: number, y: number, vx: number, vy: number, color: string, span: number): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push({ x, y, vx, vy, life: span, span, size: 2, color });
  }

  private smoke(x: number, y: number, dark = false): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push({ x, y, vx: rnd(3, 8), vy: rnd(-12, -7), life: 3.2, span: 3.2, size: 2.5, color: dark ? 'rgba(80, 120, 95,' : 'rgba(140, 200, 160,', smoke: true });
  }

  /** Keeps the number of walkers in step with what the player owns. */
  private syncWalkers(kind: Walker['kind'], target: number): void {
    const mine = this.walkers.filter((w) => w.kind === kind);
    // On the first frames the yard is already busy; later purchases walk in from the left edge.
    const settled = this.t > 0.5;
    for (let i = mine.length; i < target; i++) {
      this.walkers.push({
        kind,
        x: settled ? -14 - (i - mine.length) * 10 : rnd(0, this.w),
        dir: settled || Math.random() < 0.5 ? 1 : -1,
        speed: kind === 'collector' ? rnd(12, 20) : rnd(16, 24),
        phase: rnd(0, 6),
        tossIn: rnd(1, 4),
        lane: i % 2 === 0 ? 1 : 0,
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

    // Heap: a mound at the start, filling the sky by 1e15 kg.
    this.grow = Math.min(Math.log10(view.total.toNumber() + 1) / 15, 1);
    const target = this.h * (0.1 + 0.36 * this.grow);
    this.heapHeight += (target - this.heapHeight) * Math.min(dt * 2, 1);
    // At the edge the heap breathes.
    const breath = this.active('breathe');
    if (breath && !this.reducedMotion) this.heapHeight += Math.sin(breath.t * ((2 * Math.PI) / 4.8)) * this.h * 0.02 * dt * 6;
    if (view.threat >= 0.9 && !this.reducedMotion) this.heapHeight += Math.sin(this.t * 1.3) * this.h * 0.012 * dt * 60 * (view.threat - 0.85);

    // A few actors stand for the whole workforce; once machines arrive, fewer people walk the yard.
    const machines = this.owned('truck') >= 10 || this.owned('sorter') >= 10;
    this.syncWalkers('collector', Math.min(this.owned('collector'), machines ? 2 : 4));
    this.syncWalkers('cart', Math.min(this.owned('cart'), machines ? 1 : 2));
    if (!this.reducedMotion) this.simulate(dt);
    this.updateZoom(dt);
    this.draw();
  }

  private simulate(dt: number): void {
    const heapL = this.heapX - this.heapHalf * 0.85;
    const heapR = this.heapX + this.heapHalf * 0.85;

    const threat = this.view?.threat ?? 0;
    // Under pressure the workers keep stopping to stare at the heap.
    const freeze = threat >= 0.7 && Math.sin(this.t * 0.7) > 0.2;
    for (const w of this.walkers) {
      if (freeze) continue;
      w.x += w.dir * w.speed * dt;
      w.phase += dt * w.speed * 0.45;
      if (w.x > this.w + 20) w.dir = -1;
      if (w.x < -20) w.dir = 1;
      w.tossIn -= dt;
      if (w.tossIn <= 0 && w.x > heapL && w.x < heapR) {
        const y = this.laneY(w.lane) - 20;
        this.throwItem(w.x, y, this.onHeap(), 0.8);
        if (w.kind === 'cart') this.throwItem(w.x + w.dir * 14, y + 4, this.onHeap(), 0.95);
        w.tossIn = w.kind === 'cart' ? rnd(5, 9) : rnd(4, 8);
      }
    }

    const trucks = this.owned('truck');
    if (trucks > 0) {
      this.truckIn -= dt;
      if (this.truckIn <= 0 && this.trucks.length < 1) {
        this.trucks.push({ x: -90, state: 'in', timer: 0, tilt: 0, dumped: false });
        this.truckIn = Math.max(3, 13 - Math.log2(trucks + 1) * 2);
      }
    }
    for (const tr of this.trucks) {
      if (tr.state === 'in') {
        tr.x += 55 * dt;
        if (tr.x >= this.heapX - this.heapHalf - 30) {
          tr.state = 'dump';
          tr.timer = 2.2;
        }
      } else if (tr.state === 'dump') {
        tr.timer -= dt;
        tr.tilt = tr.timer > 0.7 ? Math.min(tr.tilt + dt * 0.9, 0.5) : Math.max(tr.tilt - dt * 1.4, 0);
        if (!tr.dumped && tr.timer < 1.2) {
          tr.dumped = true;
          for (let i = 0; i < 6; i++) this.throwItem(tr.x + 4, this.laneY(1) - 34, this.onHeap(), rnd(0.6, 1));
        }
        if (tr.timer <= 0) tr.state = 'out';
      } else {
        tr.x += 70 * dt;
      }
    }
    this.trucks = this.trucks.filter((tr) => tr.x < this.w + 100);

    // Sorting line: a belt climbing from the yard to the foot of the heap.
    const sorters = this.owned('sorter');
    if (sorters > 0) {
      this.beltIn -= dt;
      if (this.beltIn <= 0) {
        this.beltItems.push(0);
        this.beltIn = Math.max(0.5, 3 - sorters * 0.08);
      }
      const speed = 0.25 + Math.min(sorters, 60) * 0.006;
      this.beltItems = this.beltItems.map((u) => u + speed * dt);
      const x1 = this.beltLine()[2];
      for (let k = this.beltItems.filter((u) => u >= 1).length; k > 0; k--) this.throwItem(x1, this.surface(x1) - 6, this.onHeap(), 0.6);
      this.beltItems = this.beltItems.filter((u) => u < 1);
    }

    for (const [x, y] of this.chimneyTops()) if (Math.random() < dt * 1.2) this.smoke(x, y);
    for (const [x, y] of this.stackTops()) if (Math.random() < dt * 0.9) this.smoke(x, y, true);

    const orbital = this.owned('orbital');
    if (orbital > 0) {
      this.skyDropIn -= dt;
      if (this.skyDropIn <= 0) {
        const x = this.onHeap();
        this.throwItem(x + rnd(-30, 30), -10, x, rnd(1, 1.4));
        this.skyDropIn = Math.max(0.6, 5 - orbital * 0.15);
      }
    }
    const satTarget = Math.min(orbital, 3);
    while (this.satellites.length < satTarget) this.satellites.push({ x: -10, y: rnd(0.08, 0.32) * this.h, speed: rnd(8, 20), phase: rnd(0, 6) });
    this.satellites.length = Math.min(this.satellites.length, satTarget);
    for (const s of this.satellites) {
      s.x += s.speed * dt;
      if (s.x > this.w + 10) {
        s.x = -10;
        s.y = rnd(0.08, 0.32) * this.h;
      }
    }

    const holes = this.owned('singularity');
    if (holes > 0) {
      this.holePullIn -= dt;
      if (this.holePullIn <= 0 && this.items.length < MAX_ITEMS) {
        const x = this.onHeap();
        this.items.push({ x, y: this.surface(x), vx: 0, vy: 0, rot: 0, spin: rnd(-8, 8), kind: Math.floor(Math.random() * 5) as ItemKind, color: pick(C.items), landed: -1, sucked: true });
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
      const floor = this.surface(it.x) + 2;
      if (it.vy > 0 && it.y >= floor) {
        it.y = floor;
        it.landed = 0;
        if (Math.random() < 0.5) this.spark(it.x, floor, rnd(-30, 30), rnd(-50, -20), C.amber, 0.45);
      }
    }
    this.items = this.items.filter((it) => it.landed < 1.6);

    if (Math.random() < dt * 0.5) {
      const x = this.onHeap();
      this.spark(x, this.surface(x), rnd(-4, 4), rnd(-26, -12), C.amber, 2.5);
    }
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.smoke) p.size += dt * 2.4;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 1.4);
    this.glitchLeft = Math.max(0, this.glitchLeft - dt);
    this.glare = Math.max(0, this.glare - dt * 0.9);
    for (const p of this.playing) p.t += dt;
    this.playing = this.playing.filter((p) => p.t < p.dur);

    // Interference comes more often the higher the threat.
    if (threat >= 0.25 && Math.random() < dt * threat * threat * 0.6) this.glitch(rnd(0.08, 0.3));

    // The figure: from "Он здесь" on it turns up in the yard now and then, and stands still.
    if (threat >= 0.5) {
      if (this.ghost) {
        this.ghost.left -= dt;
        if (this.ghost.left <= 0) this.ghost = null;
      } else if ((this.ghostIn -= dt * (0.5 + threat)) <= 0) {
        this.ghost = { x: rnd(0.15, 0.85) * this.w, lane: threat >= 0.7 ? 1 : 0, left: rnd(2, 4) };
        this.ghostIn = rnd(6, 14);
      }
    } else {
      this.ghost = null;
    }
  }

  // ---- Landmarks ----------------------------------------------------------

  private plantCount() {
    const n = this.owned('plant');
    return n > 0 ? Math.min(1 + Math.floor(n / 5), 3) : 0;
  }

  /** Factory blocks on the left of the horizon: [x, roof y]. */
  private plants(): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i < this.plantCount(); i++) out.push([4 + i * 34, this.horizon - 22 - (i % 2) * 5]);
    return out;
  }

  private chimneyTops(): [number, number][] {
    return this.plants().map(([x, roof]) => [x + 26, roof - 22]);
  }

  private stackCount() {
    const n = this.owned('incinerator');
    return n > 0 ? Math.min(1 + Math.floor(n / 10), 3) : 0;
  }

  private stackTops(): [number, number][] {
    const tops: [number, number][] = [];
    for (let i = 0; i < this.stackCount(); i++) tops.push([this.w - 12 - i * 13, this.h * 0.2 + i * 10]);
    return tops;
  }

  /** The sorting belt: from the yard [x0, y0] up to the heap's foot [x1, y1]. */
  private beltLine(): [number, number, number, number] {
    const x1 = this.heapX - this.heapHalf * 0.7;
    return [this.w * 0.02, this.laneY(0) + 2, x1, this.surface(x1) - 2];
  }

  private holeRadius() {
    return 6 + Math.min(this.owned('singularity'), 30) * 0.45;
  }

  private holeCenter(): [number, number] {
    return [this.w * 0.2, this.h * 0.22];
  }

  // ---- Drawing ------------------------------------------------------------

  private draw(): void {
    const { ctx, w, h } = this;
    ctx.save();
    this.applyZoom();
    const sky = ctx.createLinearGradient(0, 0, 0, this.horizon);
    sky.addColorStop(0, C.skyTop);
    sky.addColorStop(1, C.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, this.horizon);

    if (this.owned('orbital') > 0 || this.owned('singularity') > 0) this.drawStars();
    if (this.owned('singularity') > 0) this.drawHole();
    for (const s of this.satellites) this.drawSatellite(s);

    // Far plane.
    this.drawSkyline();
    this.drawComplex();
    this.drawStacks();
    this.drawPlants();
    this.drawLamp();
    this.drawFence();

    // Middle plane.
    this.drawHeap();
    if (this.view?.traces.includes('fridge') && !this.active('fridge')) this.drawFridge(0.55, 0.9);

    // Near plane.
    const yard = ctx.createLinearGradient(0, this.horizon, 0, h);
    yard.addColorStop(0, C.yard);
    yard.addColorStop(1, C.yardNear);
    ctx.fillStyle = yard;
    ctx.fillRect(0, this.horizon, w, h - this.horizon);
    ctx.fillStyle = C.outline;
    ctx.fillRect(0, this.horizon, w, 1.5);
    ctx.strokeStyle = C.lane;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(0, this.laneY(0) + 6);
    ctx.lineTo(w, this.laneY(0) + 6);
    ctx.stroke();
    ctx.setLineDash([]);

    if (this.owned('sorter') > 0) this.drawBelt();
    if (this.owned('press') > 0) this.drawPress();

    // Back lane first, then trucks, then the front lane, so nearer things overlap farther ones.
    for (const wk of this.walkers) if (wk.lane === 0) this.actor(() => this.drawWalker(wk));
    for (const tr of this.trucks) this.actor(() => this.drawTruck(tr));
    for (const wk of this.walkers) if (wk.lane === 1) this.actor(() => this.drawWalker(wk));
    for (const it of this.items) this.actor(() => this.drawItem(it));
    this.drawParticles();

    for (const p of this.playing) this.drawEvent(p);
    if (this.ghost) this.drawGhost(this.ghost.x, this.laneY(this.ghost.lane), this.ghost.lane === 0 ? 0.78 : 1);
    ctx.restore();
    this.drawReticle();
    this.drawDread();
    drawLurker(ctx, w, h, this.t);

    if (this.flashAlpha > 0) {
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    if (this.glare > 0) {
      ctx.globalAlpha = this.glare * 0.75;
      ctx.fillStyle = C.light;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    if (this.glitchLeft > 0) this.drawGlitch();
  }

  // ---- Replay zoom -------------------------------------------------------------

  /** How far a replay zooms in on what happened. */
  private static readonly ZOOM = 2.5;

  /** The replay being zoomed on, if any. */
  private zoomTarget(): Playing | undefined {
    return this.playing.find((p) => p.replay && this.anchor(p));
  }

  /** Eases the zoom in on a replayed event, follows it while it moves, and eases out at the end. */
  private updateZoom(dt: number): void {
    const p = this.zoomTarget();
    const a = p && this.anchor(p);
    const want = p && a && p.t < p.dur - 0.7 ? Scene.ZOOM : 1;
    const k = this.reducedMotion ? 1 : Math.min(dt * 3.5, 1);
    this.zoom.scale += (want - this.zoom.scale) * k;
    if (a) {
      // Jump to the spot on the first frame, then track it smoothly.
      if (this.zoom.scale < 1.02) [this.zoom.x, this.zoom.y] = a;
      this.zoom.x += (a[0] - this.zoom.x) * k;
      this.zoom.y += (a[1] - this.zoom.y) * k;
    }
  }

  /** Where a point of the scene lands on screen under the current zoom. */
  private toScreen(x: number, y: number): [number, number] {
    const { scale } = this.zoom;
    const [ox, oy] = this.zoomOffset();
    return [x * scale + ox, y * scale + oy];
  }

  /** Translation that puts the zoom point in the middle, without showing past the edges of the scene. */
  private zoomOffset(): [number, number] {
    const { scale, x, y } = this.zoom;
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
    return [clamp(this.w / 2 - x * scale, this.w - this.w * scale, 0), clamp(this.h / 2 - y * scale, this.h - this.h * scale, 0)];
  }

  private applyZoom(): void {
    if (this.zoom.scale <= 1.001) return;
    const [ox, oy] = this.zoomOffset();
    this.ctx.translate(ox, oy);
    this.ctx.scale(this.zoom.scale, this.zoom.scale);
  }

  /** Corner brackets around the zoomed object and the zoom readout, like a review desk. */
  private drawReticle(): void {
    const p = this.zoomTarget();
    const a = p && this.anchor(p);
    if (!p || !a || this.zoom.scale < 1.3) return;
    const { ctx } = this;
    const [sx, sy] = this.toScreen(a[0], a[1]);
    const r = 14 * this.zoom.scale;
    const c = r * 0.45;
    const blink = Math.sin(p.t * 8) > -0.3;
    ctx.strokeStyle = HUD_RED;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = blink ? 0.95 : 0.5;
    ctx.beginPath();
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = sx + dx * r;
      const y = sy + dy * r;
      ctx.moveTo(x, y - dy * c);
      ctx.lineTo(x, y);
      ctx.lineTo(x - dx * c, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = HUD_RED;
    ctx.font = '10px "JetBrains Mono Variable", monospace';
    ctx.fillText(`ZOOM ×${this.zoom.scale.toFixed(1)}`, 8, this.h - 8);
    ctx.fillText('ОБЪЕКТ', Math.min(sx + r + 4, this.w - 44), Math.max(sy - r + 8, 12));
  }

  // ---- Camera events ---------------------------------------------------------

  /** Where a tap counts as catching the event, or null for events without a spot. */
  private anchor(p: Playing): [number, number] | null {
    const u = p.t / p.dur;
    switch (p.kind) {
      case 'lampBlink':
      case 'lampTurn':
        return [this.w * 0.24 + 8, this.horizon - 60];
      case 'breathe':
        return [this.heapX, this.surface(this.heapX) + 10];
      case 'eyes': {
        // Low in the dark body of the heap, away from the lamp.
        const x = this.heapX + this.heapHalf * 0.55;
        return [x, this.surface(x) + (this.horizon - this.surface(x)) * 0.6];
      }
      case 'bag': {
        // Rises to near the top of the frame, never out of it.
        const x = this.heapX + this.heapHalf * 0.15 + Math.sin(p.t * 1.5) * 6;
        const from = this.surface(x) - 10;
        return [x, from - u * (from - this.h * 0.14)];
      }
      case 'extra':
        return [this.w * (0.75 - 0.35 * u), this.laneY(0) + (this.h - this.laneY(0)) * u - 14];
      case 'fridge': {
        const x = this.heapX + this.heapHalf * 0.35;
        return [x, this.surface(x) + 4];
      }
      case 'note': {
        const x = this.heapX - this.heapHalf * 0.2 + u * this.w * 0.5;
        return [x, this.surface(this.heapX) - 10 - u * this.h * 0.5 + Math.sin(p.t * 4) * 8];
      }
      case 'driverless':
        return [this.driverlessX(p) + 70, this.laneY(1) - 20];
      case 'gull':
        return [-20 + u * (this.w + 40), this.h * 0.25 + Math.sin(p.t * 3) * 6];
      case 'raccoon': {
        const [bx, by] = this.raccoonBag();
        return p.t < 5 ? [bx, by - 8] : [bx - (p.t - 5) * 40, this.surface(bx - (p.t - 5) * 40) - 3];
      }
      case 'cat':
        return [this.catX(p.t), this.fenceTop - 6];
      default:
        return null;
    }
  }

  private driverlessX(p: Playing): number {
    const stop = this.heapX - this.heapHalf - 30;
    if (p.t < 3) return -90 + (stop + 90) * (p.t / 3);
    if (p.t < 5.5) return stop;
    return stop - (stop + 90) * ((p.t - 5.5) / 3.5);
  }

  private drawEvent(p: Playing): void {
    const { ctx } = this;
    const a = this.anchor(p);
    const fade = Math.min(1, p.t / 0.4, (p.dur - p.t) / 0.6);
    switch (p.kind) {
      case 'eyes': {
        // Two lights that do not blink together.
        const [x, y] = a!;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 12);
        glow.addColorStop(0, `rgba(216, 255, 220, ${0.25 * fade})`);
        glow.addColorStop(1, 'rgba(216, 255, 220, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - 12, y - 12, 24, 24);
        ctx.fillStyle = C.light;
        ctx.globalAlpha = fade * (Math.sin(p.t * 3) > -0.6 ? 1 : 0);
        ctx.fillRect(x - 5, y - 1, 3, 2);
        ctx.globalAlpha = fade * (Math.sin(p.t * 3 + 1.4) > -0.6 ? 1 : 0);
        ctx.fillRect(x + 2, y - 1, 3, 2);
        ctx.globalAlpha = 1;
        break;
      }
      case 'bag': {
        const [x, y] = a!;
        ctx.globalAlpha = fade;
        this.actor(() => this.drawJunk({ u: 0, depth: 0, kind: 'bag', rot: Math.sin(p.t) * 0.3, color: C.items[1] }, x, y, 0.7));
        ctx.globalAlpha = 1;
        break;
      }
      case 'extra': {
        // Walks toward the camera, growing, no hat, no sack; never shows a face.
        const [x, y] = a!;
        const scale = 0.8 + 0.7 * (p.t / p.dur);
        ctx.globalAlpha = fade;
        this.actor(() => {
          this.ctx.save();
          this.ctx.translate(x, y + 14);
          this.ctx.scale(scale, scale);
          this.box(-3.5, -9, 3, 9, C.deep, 1);
          this.box(0.5, -9, 3, 9, C.deep, 1);
          this.ctx.beginPath();
          this.ctx.roundRect(-5, -19, 10, 11, 2);
          this.paint(C.green);
          this.circle(0, -22.5, 3.8, '#06140c');
          this.ctx.restore();
        });
        ctx.globalAlpha = 1;
        break;
      }
      case 'fridge':
        this.drawFridge(Math.min(p.t / 2, 1), fade);
        break;
      case 'note': {
        const [x, y] = a!;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(p.t * 5) * 0.6);
        ctx.globalAlpha = fade;
        this.mode = 'actor';
        this.box(-4, -3, 8, 6, C.light, 0.8);
        this.mode = 'scenery';
        ctx.fillStyle = '#2f6b45';
        ctx.fillRect(-2.5, -1.5, 5, 0.8);
        ctx.fillRect(-2.5, 0.5, 4, 0.8);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;
      }
      case 'driverless': {
        const tilt = p.t < 3 ? 0 : p.t < 4.2 ? (p.t - 3) * 0.4 : p.t < 5.3 ? 0.48 : Math.max(0, 0.48 - (p.t - 5.3) * 1.2);
        const tr: Truck = { x: this.driverlessX(p), state: 'dump', timer: 0, tilt, dumped: false };
        this.actor(() => this.drawTruck(tr, true));
        if (p.t > 4.2 && p.t < 4.3) for (let i = 0; i < 5; i++) this.throwItem(tr.x + 4, this.laneY(1) - 34, this.onHeap(), rnd(0.6, 1));
        break;
      }
      case 'breathe':
        break;
      case 'gull': {
        const [x, y] = a!;
        const flap = Math.sin(p.t * 10) * 3;
        this.actor(() => {
          this.ctx.beginPath();
          this.ctx.moveTo(x - 7, y - flap);
          this.ctx.quadraticCurveTo(x - 3, y - 3, x, y);
          this.ctx.quadraticCurveTo(x + 3, y - 3, x + 7, y - flap);
          this.ctx.lineWidth = 1.6;
          this.ctx.strokeStyle = this.mode === 'halo' ? '#040e08' : C.light;
          this.ctx.stroke();
          this.box(x - 0.5, y + 1, 1, 5, C.lime, 0.6);
        });
        break;
      }
      case 'raccoon':
        this.drawRaccoon(p.t, fade);
        break;
      case 'cat':
        this.drawCat(p.t);
        break;
      default:
        break;
    }
  }

  // ---- The fence, the cat and the raccoon ---------------------------------------

  /** Top of the yard's fence, right of the heap. */
  private get fenceTop() {
    return this.horizon - 16;
  }

  /** A chain-link fence on concrete posts along the back of the yard, right of the heap. */
  private drawFence(): void {
    const { ctx } = this;
    const x0 = this.heapX + this.heapHalf * 0.6;
    const top = this.fenceTop;
    const y = this.horizon;
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = C.deep;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let x = x0; x < this.w + 16; x += 4) {
      ctx.moveTo(x, top);
      ctx.lineTo(x - 16, y);
      ctx.moveTo(x - 16, top);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    this.line(x0, top, this.w, top, C.hub, 1.4);
    this.line(x0, top + 8, this.w, top + 8, C.deep, 1);
    for (let x = x0; x < this.w; x += 14) this.box(x - 1, top - 1, 2.5, y - top + 1, C.far, 0.8);
  }

  /** Where the cat is on the fence: comes in from the right, sits, jumps down behind it. */
  private catX(t: number): number {
    const stop = this.w * 0.86;
    return t < 2.2 ? this.w + 12 - (this.w + 12 - stop) * (t / 2.2) : stop;
  }

  /**
   * A cat on the fence: walks along the top, sits down, its tail sweeping; turns to the
   * camera with eyes that catch the light; then drops down behind the fence.
   */
  private drawCat(t: number): void {
    const { ctx } = this;
    const x = this.catX(t);
    const jump = t > 5.6 ? (t - 5.6) / 1.4 : 0;
    const y = this.fenceTop - 1 + jump * jump * 30;
    const sitting = t >= 2.2 && t < 5.6;
    const looking = t > 3.4 && t < 5.4;
    ctx.save();
    ctx.globalAlpha = 1 - jump;
    this.actor(() => {
      const c = this.ctx;
      if (!sitting) {
        // Walking left: body, head ahead, tail up behind, legs stepping.
        const step = Math.sin(t * 10) * 1.5;
        for (const [lx, ph] of [[-4, 1], [-2, -1], [3, -1], [5, 1]] as const) this.line(x + lx, y - 3, x + lx + step * ph, y, C.green, 1.2);
        c.beginPath();
        c.ellipse(x, y - 5, 6.5, 3, 0, 0, Math.PI * 2);
        this.paint(C.green, 1);
        this.drawCatHead(x - 7.5, y - 8, false);
        c.beginPath();
        c.moveTo(x + 6, y - 6);
        c.quadraticCurveTo(x + 11, y - 9, x + 9 + Math.sin(t * 4) * 2, y - 15);
        c.lineWidth = this.mode === 'halo' ? 4.5 : 1.6;
        c.strokeStyle = this.mode === 'halo' ? '#040e08' : C.green;
        c.stroke();
      } else {
        // Sitting: upright body, tail sweeping along the fence.
        c.beginPath();
        c.ellipse(x, y - 6, 4, 6, 0, 0, Math.PI * 2);
        this.paint(C.green, 1);
        this.drawCatHead(x - 0.5, y - 14, looking);
        c.beginPath();
        c.moveTo(x + 3, y - 1);
        c.quadraticCurveTo(x + 9, y + 1, x + 11, y - 2 + Math.sin(t * 3) * 3);
        c.lineWidth = this.mode === 'halo' ? 4.5 : 1.6;
        c.strokeStyle = this.mode === 'halo' ? '#040e08' : C.green;
        c.stroke();
      }
    });
    ctx.restore();
  }

  /** A cat's head with two ears; looking at the camera, its eyes shine. */
  private drawCatHead(x: number, y: number, looking: boolean): void {
    this.circle(x, y, 3.2, C.green, 1);
    this.poly([[x - 3, y - 1.5], [x - 2.6, y - 4.6], [x - 0.6, y - 2.6]], C.green, 0.6);
    this.poly([[x + 3, y - 1.5], [x + 2.6, y - 4.6], [x + 0.6, y - 2.6]], C.green, 0.6);
    if (looking && this.mode !== 'halo') {
      this.ctx.fillStyle = C.light;
      this.ctx.fillRect(x - 1.8, y - 0.6, 1.4, 1.4);
      this.ctx.fillRect(x + 0.6, y - 0.6, 1.4, 1.4);
    }
  }

  /** Where the bag with the raccoon lies: on the left slope of the heap. */
  private raccoonBag(): [number, number] {
    const x = this.heapX - this.heapHalf * 0.6;
    return [x, this.surface(x) + 2];
  }

  /**
   * A raccoon in a bag: the bag shakes, a masked head looks out, the raccoon climbs out
   * with its striped tail, and runs off down the heap, leaving the bag empty.
   */
  private drawRaccoon(t: number, fade: number): void {
    const { ctx } = this;
    const [bx, by] = this.raccoonBag();
    ctx.save();
    ctx.globalAlpha = fade;
    // The bag: shaking while something moves inside, slack once it is out.
    const empty = t > 5;
    const shake = t < 2 ? Math.sin(t * 18) * 0.15 * (Math.sin(t * 3) > 0 ? 1 : 0.2) : 0;
    this.actor(() => {
      const c = this.ctx;
      c.save();
      c.translate(bx, by);
      c.rotate(shake);
      c.scale(1, empty ? 0.6 : 1);
      c.beginPath();
      c.moveTo(-8, 0);
      c.quadraticCurveTo(-10, -9, -3, -12);
      c.lineTo(3, -12);
      c.quadraticCurveTo(10, -9, 8, 0);
      c.closePath();
      this.paint(C.items[1], 1);
      // The knot, torn open.
      this.poly([[-2, -12], [-4, -15], [0, -13], [4, -16], [2, -12]], C.items[1], 0.8);
      c.restore();
    });
    if (t >= 2 && t < 5) {
      // Looking out, then climbing out over the edge.
      const rise = Math.min((t - 2) / 0.6, 1) * 4 + (t > 3.5 ? Math.min((t - 3.5) / 1.2, 1) * 6 : 0);
      const hx = bx;
      const hy = by - 12 - rise;
      if (t > 3.5) this.drawRaccoonBody(bx + 3, by - 12 - rise + 6, Math.min((t - 3.5) / 1.2, 1), false);
      this.drawRaccoonHead(hx, hy, t);
    } else if (t >= 5) {
      // Running off down the slope.
      const x = bx - (t - 5) * 40;
      const y = this.surface(x) - 3;
      this.drawRaccoonBody(x + 5, y, 1, true, t);
      this.drawRaccoonHead(x, y - 2, t);
    }
    ctx.restore();
  }

  private drawRaccoonBody(x: number, y: number, shown: number, running: boolean, t = 0): void {
    this.actor(() => {
      const c = this.ctx;
      if (running) for (const [lx, ph] of [[-3, 1], [3, -1]] as const) this.line(x + lx, y, x + lx + Math.sin(t * 14) * 2 * ph, y + 3, C.green, 1.2);
      c.beginPath();
      c.ellipse(x, y, 6 * shown, 3.5, 0, 0, Math.PI * 2);
      this.paint(C.green, 1);
      // A striped tail.
      for (let k = 0; k < 4; k++) this.circle(x + 6 + k * 2.4, y - 1 - k * 0.6, 1.6, k % 2 ? '#1c3a26' : C.light, 0.5);
    });
  }

  /** The masked face: small round ears, a dark mask round two bright eyes, a pale pointed snout. */
  private drawRaccoonHead(x: number, y: number, t: number): void {
    this.actor(() => {
      this.circle(x - 2.8, y - 3, 1.4, C.green, 0.8);
      this.circle(x + 2.8, y - 3, 1.4, C.green, 0.8);
      const c = this.ctx;
      c.beginPath();
      c.ellipse(x, y, 4, 3.2, 0, 0, Math.PI * 2);
      this.paint(C.lime, 1);
      // The snout, pointing at the camera.
      this.poly([[x - 1.6, y + 1], [x + 1.6, y + 1], [x, y + 3.6]], C.light, 0.6);
      if (this.mode === 'halo') return;
      // The mask: two dark patches joined across the face.
      c.fillStyle = '#04120a';
      c.beginPath();
      c.ellipse(x - 1.8, y - 0.2, 1.8, 1.2, -0.3, 0, Math.PI * 2);
      c.ellipse(x + 1.8, y - 0.2, 1.8, 1.2, 0.3, 0, Math.PI * 2);
      c.fill();
      c.fillRect(x - 1, y - 0.8, 2, 0.9);
      const blink = Math.sin(t * 2.3) > 0.95;
      c.fillStyle = C.light;
      if (!blink) {
        c.fillRect(x - 2.2, y - 0.7, 1, 1);
        c.fillRect(x + 1.3, y - 0.7, 1, 1);
      }
      c.fillStyle = '#04120a';
      c.fillRect(x - 0.6, y + 2.8, 1.2, 0.9);
    });
  }

  /** The fridge on the heap: door swinging open, light inside. `open` 0..1. */
  private drawFridge(open: number, alpha = 1): void {
    const { ctx } = this;
    const x = this.heapX + this.heapHalf * 0.35;
    const y = this.surface(x) + 4;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(-0.12);
    this.actor(() => this.box(-6, -18, 12, 20, C.hub, 1));
    // Light spilling out of the gap.
    const glow = ctx.createRadialGradient(4, -8, 1, 4, -8, 24 * open);
    glow.addColorStop(0, `rgba(216, 255, 220, ${0.55 * open})`);
    glow.addColorStop(1, 'rgba(216, 255, 220, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-20, -32, 48, 48);
    ctx.fillStyle = C.light;
    ctx.fillRect(-5, -17, 10 * open, 18);
    // Something standing on the shelves.
    if (open > 0.6) {
      ctx.fillStyle = '#010503';
      ctx.fillRect(-3, -15, 3, 14);
      ctx.fillRect(1, -11, 2, 10);
    }
    // The door, swung out toward the camera.
    ctx.fillStyle = C.green;
    ctx.fillRect(6, -18, 6 * open, 20);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** A tall dark figure with two faint eyes. It never moves. */
  private drawGhost(x: number, feet: number, scale: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, feet);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#010503';
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(-6, -22);
    ctx.quadraticCurveTo(-6, -34, 0, -34);
    ctx.quadraticCurveTo(6, -34, 6, -22);
    ctx.lineTo(5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.light;
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 9);
    ctx.fillRect(-2.5, -29, 1.5, 1);
    ctx.fillRect(1, -29, 1.5, 1);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * Pressure on the picture: the edges close in as the threat rises, and near the edge
   * a silhouette rises in front of the lens.
   */
  private drawDread(): void {
    const { ctx, w, h } = this;
    const threat = this.view?.threat ?? 0;
    if (threat < 0.25) return;
    const t = (threat - 0.25) / 0.75;
    const dark = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * (0.75 - 0.45 * t), w / 2, h * 0.55, Math.max(w, h) * 0.75);
    dark.addColorStop(0, 'rgba(1, 5, 3, 0)');
    dark.addColorStop(1, `rgba(1, 5, 3, ${0.35 + 0.6 * t})`);
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, w, h);
    if (threat >= 0.9) {
      // Head and shoulders rising into the frame, right up against the camera.
      const rise = Math.min((threat - 0.9) / 0.1, 1);
      const cx = w * 0.5;
      const top = h - h * 0.55 * rise;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.32, h);
      ctx.quadraticCurveTo(cx - w * 0.3, top + h * 0.28, cx - w * 0.12, top + h * 0.24);
      ctx.quadraticCurveTo(cx - w * 0.13, top, cx, top);
      ctx.quadraticCurveTo(cx + w * 0.13, top, cx + w * 0.12, top + h * 0.24);
      ctx.quadraticCurveTo(cx + w * 0.3, top + h * 0.28, cx + w * 0.32, h);
      ctx.closePath();
      ctx.fill();
      if (rise > 0.6) {
        ctx.fillStyle = C.light;
        ctx.globalAlpha = (rise - 0.6) * 2.5 * (0.7 + 0.3 * Math.sin(this.t * 7));
        ctx.fillRect(cx - w * 0.045, top + h * 0.1, w * 0.018, h * 0.012);
        ctx.fillRect(cx + w * 0.027, top + h * 0.1, w * 0.018, h * 0.012);
        ctx.globalAlpha = 1;
      }
    }
  }

  /**
   * Draws the current path the way a vector terminal would: a dim body and a phosphor
   * edge. Scenery is dimmer than actors; in the halo pass only a thick dark outline is
   * drawn. `line` 0 means a plain solid fill.
   */
  private paint(fill: string, line = 1.2): void {
    const { ctx } = this;
    if (this.mode === 'halo') {
      if (line <= 0) return;
      ctx.strokeStyle = HALO;
      ctx.lineWidth = line + 3.5;
      ctx.stroke();
      ctx.fillStyle = HALO;
      ctx.fill();
      return;
    }
    if (line <= 0) {
      ctx.fillStyle = fill;
      ctx.fill();
      return;
    }
    const p = phosphor(fill);
    const actor = this.mode === 'actor';
    ctx.fillStyle = actor ? p.actorBody : p.body;
    ctx.fill();
    ctx.strokeStyle = actor ? p.edge : p.dimEdge;
    ctx.lineWidth = line;
    ctx.stroke();
  }

  /** Draws a moving thing in two passes: a dark halo first, then the bright figure on top. */
  private actor(draw: () => void): void {
    this.mode = 'halo';
    draw();
    this.mode = 'actor';
    draw();
    this.mode = 'scenery';
  }

  private box(x: number, y: number, bw: number, bh: number, fill: string, line = 1.2): void {
    this.ctx.beginPath();
    this.ctx.rect(x, y, bw, bh);
    this.paint(fill, line);
  }

  private circle(x: number, y: number, r: number, fill: string, line = 1.2): void {
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.paint(fill, line);
  }

  private poly(points: [number, number][], fill: string, line = 1.2): void {
    this.ctx.beginPath();
    points.forEach(([x, y], i) => (i ? this.ctx.lineTo(x, y) : this.ctx.moveTo(x, y)));
    this.ctx.closePath();
    this.paint(fill, line);
  }

  /** A stroke: legs and tails, thicker and dark in the halo pass. */
  private line(x1: number, y1: number, x2: number, y2: number, color: string, width = 1): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = this.mode === 'halo' ? width + 3 : width;
    ctx.strokeStyle = this.mode === 'halo' ? HALO : color;
    ctx.stroke();
  }

  private drawStars(): void {
    const { ctx } = this;
    const n = Math.min(20 + this.owned('orbital') * 4 + this.owned('singularity') * 4, this.stars.length);
    ctx.fillStyle = C.light;
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
    halo.addColorStop(0, 'rgba(170, 240, 180, 0.3)');
    halo.addColorStop(1, 'rgba(170, 240, 180, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.38);
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 2; i++) {
      ctx.strokeStyle = i === 0 ? C.amber : C.glow;
      ctx.globalAlpha = 0.85;
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
    ctx.strokeStyle = 'rgba(170, 240, 180, 0.75)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private drawSatellite(s: Satellite): void {
    this.box(s.x - 2, s.y - 2, 4, 4, C.green, 1);
    this.box(s.x - 9, s.y - 1, 6, 2, C.cyan, 0.8);
    this.box(s.x + 3, s.y - 1, 6, 2, C.cyan, 0.8);
    if (Math.sin(this.t * 4 + s.phase) > 0.6) {
      this.ctx.fillStyle = C.red;
      this.ctx.fillRect(s.x - 0.5, s.y - 4, 1.5, 1.5);
    }
  }

  private drawSkyline(): void {
    const { ctx } = this;
    for (const b of this.skyline) {
      const x = b.x * this.w;
      const bw = b.w * this.w + 1;
      const bh = b.h * this.h;
      ctx.fillStyle = C.skyline;
      ctx.fillRect(x, this.horizon - bh, bw, bh);
      ctx.fillStyle = C.skylineWin;
      ctx.globalAlpha = 0.6;
      for (const [u, v] of b.win) ctx.fillRect(x + 2 + u * (bw - 5), this.horizon - bh + 2 + v * (bh - 5), 1.5, 1.5);
      ctx.globalAlpha = 1;
    }
  }

  /** Recycling domes on the horizon behind the heap, one more for each of the first recycles. */
  private drawComplex(): void {
    const { ctx } = this;
    const n = Math.min(this.view?.recycles ?? 0, 4);
    for (let i = 0; i < n; i++) {
      // Big enough to show over the heap's shoulder early in a run; the heap hides them as it grows.
      const x = this.w * (0.87 - i * 0.09);
      const r = 17 + i * 3;
      ctx.beginPath();
      ctx.arc(x, this.horizon, r, Math.PI, 0);
      ctx.closePath();
      this.paint(C.heapEdge);
      // Ribs of the dome.
      ctx.strokeStyle = phosphor(C.heapEdge).dimEdge;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(x, this.horizon, r * 0.5, r, 0, Math.PI, 0);
      ctx.moveTo(x - r * 0.85, this.horizon - r * 0.5);
      ctx.lineTo(x + r * 0.85, this.horizon - r * 0.5);
      ctx.stroke();
      if (Math.sin(this.t * 2 + i * 1.7) > 0.2) {
        ctx.fillStyle = C.light;
        ctx.fillRect(x - 1, this.horizon - r - 3, 2, 2);
      }
    }
  }

  private drawPlants(): void {
    const { ctx } = this;
    const chimneys = this.chimneyTops();
    for (const [i, [x, roof]] of this.plants().entries()) {
      // Chimney first, so the roof overlaps its base.
      const [cx, cy] = chimneys[i];
      this.box(cx - 2.5, cy, 5, roof - cy + 2, C.far);
      ctx.beginPath();
      ctx.moveTo(x, this.horizon);
      ctx.lineTo(x, roof);
      for (let k = 0; k < 3; k++) {
        ctx.lineTo(x + k * 8 + 8, roof - 6);
        ctx.lineTo(x + k * 8 + 8, roof);
      }
      ctx.lineTo(x + 30, roof);
      ctx.lineTo(x + 30, this.horizon);
      ctx.closePath();
      this.paint(C.far);
      ctx.fillStyle = C.amber;
      for (let k = 0; k < 3; k++) {
        ctx.globalAlpha = k === 1 && Math.sin(this.t * 3 + i) > 0.7 ? 0.25 : 0.8;
        ctx.fillRect(x + 4 + k * 8, roof + 7, 4, 3);
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawStacks(): void {
    const { ctx } = this;
    const tops = this.stackTops();
    if (!tops.length) return;
    const baseX = this.w - 12 - (tops.length - 1) * 13 - 12;
    for (const [x, y] of tops) {
      this.box(x - 3.5, y, 7, this.horizon - 18 - y, C.far);
      ctx.fillStyle = C.light;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x - 3, y + 6, 6, 1.5);
      ctx.globalAlpha = 1;
      if (Math.sin(this.t * 3 + x) > 0) {
        ctx.fillStyle = C.red;
        ctx.fillRect(x - 1, y - 3, 2.5, 2.5);
      }
    }
    this.box(baseX, this.horizon - 20, this.w - baseX + 2, 20, C.far);
    ctx.fillStyle = C.amber;
    ctx.globalAlpha = 0.6 + 0.3 * Math.sin(this.t * 2.3);
    ctx.fillRect(baseX + 6, this.horizon - 12, 10, 6);
    ctx.globalAlpha = 1;
  }

  private drawLamp(): void {
    const { ctx } = this;
    const lx = this.w * 0.24;
    const top = this.horizon - 62;
    let flicker = this.reducedMotion ? 1 : this.t % 7 > 6.6 ? 0.55 + Math.random() * 0.3 : 1;
    // Three blinks, a second apart.
    const blink = this.active('lampBlink');
    if (blink && [0.3, 1.3, 2.3].some((s) => blink.t > s && blink.t < s + 0.35)) flicker = 0;
    if (this.view?.traces.includes('lamp')) {
      // Turned to face the lens: no cone on the yard, a hard glare at the camera instead.
      this.box(lx - 1, top, 2.5, this.horizon + 10 - top, C.far, 0.8);
      const glow = ctx.createRadialGradient(lx + 8, top + 2, 1, lx + 8, top + 2, 40);
      glow.addColorStop(0, `rgba(216, 255, 220, ${0.8 * flicker})`);
      glow.addColorStop(1, 'rgba(216, 255, 220, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(lx - 32, top - 38, 80, 80);
      ctx.fillStyle = C.light;
      ctx.beginPath();
      ctx.arc(lx + 8, top + 2, 5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    // Cone of light down onto the yard.
    ctx.globalAlpha = 0.09 * flicker;
    ctx.fillStyle = C.amber;
    ctx.beginPath();
    ctx.moveTo(lx + 8, top + 3);
    ctx.lineTo(lx - 22, this.h);
    ctx.lineTo(lx + 44, this.h);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    this.box(lx - 1, top, 2.5, this.horizon + 10 - top, C.far, 0.8);
    this.box(lx, top - 1, 12, 2.5, C.far, 0.8);
    ctx.globalAlpha = flicker;
    ctx.fillStyle = C.amber;
    ctx.fillRect(lx + 4, top + 1.5, 9, 2.5);
    ctx.globalAlpha = 1;
  }

  private heapPath(cx: number, half: number, height: number): void {
    const { ctx } = this;
    const n = this.ridge.length - 1;
    ctx.beginPath();
    ctx.moveTo(cx - half, this.horizon);
    for (let i = 0; i <= n; i++) ctx.lineTo(cx - half + (i / n) * half * 2, this.horizon - this.ridge[i] * height);
    ctx.lineTo(cx + half, this.horizon);
    ctx.closePath();
  }

  private drawHeap(): void {
    const { ctx } = this;
    const landfill = this.owned('landfill');
    if (landfill > 0) {
      // A second, distant mountain of trash.
      const scale = 0.5 + 0.5 * Math.min(landfill / 25, 1);
      this.heapPath(this.heapX + this.heapHalf * 0.75, this.heapHalf * 1.2, this.heapHeight * 1.2 * scale);
      ctx.fillStyle = C.far;
      ctx.fill();
    }
    this.heapPath(this.heapX - this.heapHalf * 0.1, this.heapHalf * 1.08, this.heapHeight * 1.1);
    ctx.fillStyle = C.heapBack;
    ctx.fill();
    this.heapPath(this.heapX, this.heapHalf, this.heapHeight);
    this.paint(C.heapFront, 1.6);

    // Big junk sticking out of the heap; more shows as it grows.
    const visible = Math.round(4 + this.grow * 6);
    const s = Math.min(Math.max(this.heapHeight / 75, 0.5), 0.85);
    for (const j of this.junk.slice(0, visible)) {
      const x = this.heapX - this.heapHalf + j.u * this.heapHalf * 2;
      const top = this.surface(x);
      const y = top + (this.horizon - top) * j.depth;
      if (this.horizon - y < 6 * s) continue;
      this.drawJunk(j, x, y, s);
    }

    if (landfill > 0) {
      // Terraces cut into the heap, and a flag on the summit.
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = C.heapEdge;
      ctx.lineWidth = 1;
      const n = Math.min(landfill, 3);
      for (let k = 1; k <= n; k++) {
        const f = k / (n + 1);
        const half = this.heapHalf * (1 - f * 0.85);
        const y = this.horizon - this.heapHeight * f * 0.85;
        ctx.beginPath();
        ctx.moveTo(this.heapX - half, y);
        ctx.lineTo(this.heapX + half, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      const peak = this.heapX + this.heapHalf * 0.02;
      const top = this.surface(peak);
      this.box(peak - 0.75, top - 16, 1.5, 16, C.light, 0.6);
      const wave = Math.sin(this.t * 4) * 1.5;
      ctx.beginPath();
      ctx.moveTo(peak + 0.75, top - 16);
      ctx.lineTo(peak + 11, top - 13 + wave);
      ctx.lineTo(peak + 0.75, top - 10);
      this.paint(C.amber, 1);
    }
  }

  private drawJunk(j: Junk, x: number, y: number, s: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(j.rot);
    ctx.scale(s, s);
    switch (j.kind) {
      case 'fridge':
        this.box(-6, -11, 12, 21, J.white);
        ctx.beginPath();
        ctx.moveTo(-6, -4);
        ctx.lineTo(6, -4);
        ctx.stroke();
        ctx.fillStyle = C.outline;
        ctx.fillRect(3, -9, 1.5, 3);
        break;
      case 'washer':
        this.box(-6, -6, 12, 12, J.white);
        this.circle(0, 1, 3.5, J.hub, 1);
        break;
      case 'tyre':
        this.circle(0, 0, 5.5, C.tyre);
        this.circle(0, 0, 2.2, J.hub, 1);
        break;
      case 'bag':
        ctx.beginPath();
        ctx.moveTo(-1, -7);
        ctx.quadraticCurveTo(-7, -4, -6, 2);
        ctx.quadraticCurveTo(-5, 6, 0, 6);
        ctx.quadraticCurveTo(5, 6, 6, 2);
        ctx.quadraticCurveTo(7, -4, 1, -7);
        ctx.closePath();
        this.paint(j.color);
        break;
      case 'box':
        this.box(-7, -5, 14, 10, J.box);
        ctx.beginPath();
        ctx.moveTo(-7, -1);
        ctx.lineTo(7, -1);
        ctx.stroke();
        break;
      case 'sofa':
        this.box(-10, -3, 20, 6, J.sofa);
        this.box(-10, -7, 4, 10, J.sofa);
        this.box(6, -7, 4, 10, J.sofa);
        break;
    }
    ctx.restore();
  }

  private drawBelt(): void {
    const { ctx } = this;
    const [x0, y0, x1, y1] = this.beltLine();
    const angle = Math.atan2(y1 - y0, x1 - x0);
    const len = Math.hypot(x1 - x0, y1 - y0);
    // Legs down to the yard.
    for (let u = 0.15; u < 1; u += 0.3) {
      const lx = x0 + (x1 - x0) * u;
      const ly = y0 + (y1 - y0) * u;
      this.box(lx - 1, ly, 2.5, this.laneY(0) + 4 - ly, C.far, 0.8);
    }
    ctx.save();
    ctx.translate(x0, y0);
    ctx.rotate(angle);
    this.box(0, -2.5, len, 5, '#1b4a2e', 1.2);
    ctx.fillStyle = C.green;
    const shift = (this.t * 20) % 8;
    for (let d = shift; d < len - 2; d += 8) ctx.fillRect(d, -1, 3, 1.5);
    for (const u of this.beltItems) {
      ctx.save();
      ctx.translate(u * len, -5);
      this.box(-2.5, -2.5, 5, 5, C.items[Math.floor(u * 50) % C.items.length], 0.9);
      ctx.restore();
    }
    ctx.restore();
  }

  private drawPress(): void {
    const n = this.owned('press');
    const x = this.w * 0.82;
    const base = this.laneY(0) + 4;
    const top = base - 42;
    this.box(x, top, 5, 42, C.far);
    this.box(x + 27, top, 5, 42, C.far);
    this.box(x - 2, top - 3, 36, 7, C.hub);
    // Piston: slow lift, fast slam.
    const period = Math.max(0.8, 2 - n * 0.03);
    const p = (this.t % period) / period;
    const y = p < 0.75 ? top + 6 + 4 * (1 - p / 0.75) : top + 6 + 18 * Math.sin(((p - 0.75) / 0.25) * Math.PI);
    this.box(x + 14, top + 4, 4, y - top - 4, C.hub, 0.8);
    this.box(x + 6, y, 20, 6, C.amber);
    this.box(x + 7, base - 8, 18, 8, C.lime);
    // Finished cubes stacked beside it.
    const cubes = Math.min(n, 6);
    for (let i = 0; i < cubes; i++) {
      const row = i < 4 ? 0 : i < 7 ? 1 : i < 9 ? 2 : 3;
      const col = i < 4 ? i : i < 7 ? i - 4 : i < 9 ? i - 7 : 0;
      const cx = x + 36 + col * 7 + row * 3.5;
      if (cx > this.w - 4) continue;
      this.box(cx, base - 7 - row * 7, 7, 7, C.items[i % C.items.length], 1);
    }
  }

  /** A worker in a hard hat and vest, ~26 px tall in the front lane. */
  private drawWorker(x: number, feet: number, dir: number, phase: number, scale: number, carrying: boolean): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, feet);
    ctx.scale(scale * dir, scale);
    const step = Math.sin(phase) * 2.2;
    this.box(-3.5 + step * 0.5, -9, 3, 9, C.deep, 1);
    this.box(0.5 - step * 0.5, -9, 3, 9, C.deep, 1);
    ctx.beginPath();
    ctx.roundRect(-5, -19, 10, 11, 2);
    this.paint(C.amber);
    ctx.fillStyle = C.light;
    ctx.fillRect(-5, -14, 10, 1.5);
    this.circle(0, -22.5, 3.6, C.light);
    ctx.beginPath();
    ctx.arc(0, -23.5, 4.2, Math.PI, 0);
    ctx.closePath();
    this.paint(C.lime, 1);
    if (carrying) {
      // Sack slung on the back.
      ctx.beginPath();
      ctx.moveTo(-5, -18);
      ctx.quadraticCurveTo(-12, -15, -11, -9);
      ctx.quadraticCurveTo(-10, -5, -6, -6);
      ctx.closePath();
      this.paint(C.cyan, 1);
    }
    ctx.restore();
  }

  private drawWalker(wk: Walker): void {
    const scale = wk.lane === 0 ? 0.78 : 1;
    const feet = this.laneY(wk.lane);
    if (wk.kind === 'collector') {
      this.drawWorker(wk.x, feet, wk.dir, wk.phase, scale, true);
      return;
    }
    const { ctx } = this;
    this.drawWorker(wk.x - wk.dir * 4 * scale, feet, wk.dir, wk.phase, scale, false);
    ctx.save();
    ctx.translate(wk.x, feet);
    ctx.scale(scale * wk.dir, scale);
    // Handle, basket with junk, wheels.
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(3, -14);
    ctx.lineTo(8, -12);
    ctx.stroke();
    this.box(10, -9 - 4, 6, 5, C.amber, 1);
    this.box(16, -10 - 4, 4, 6, C.glow, 1);
    ctx.beginPath();
    ctx.moveTo(7, -13);
    ctx.lineTo(27, -13);
    ctx.lineTo(25, -3);
    ctx.lineTo(10, -3);
    ctx.closePath();
    this.paint(C.cyan);
    this.circle(12, -1.5, 2.2, C.tyre, 1);
    this.circle(23, -1.5, 2.2, C.tyre, 1);
    ctx.restore();
  }

  /** Garbage truck, about twice a worker's height; the body tips back to dump. */
  private drawTruck(tr: Truck, empty = false): void {
    const { ctx } = this;
    const g = this.laneY(1);
    const x = tr.x;
    // Body pivots on its rear lower corner.
    ctx.save();
    ctx.translate(x + 2, g - 10);
    ctx.rotate(-tr.tilt);
    ctx.beginPath();
    ctx.rect(0, -30, 56, 30);
    this.paint(C.green, 1.6);
    ctx.strokeStyle = C.outline;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    for (let k = 1; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(4, -30 + k * 7.5);
      ctx.lineTo(52, -30 + k * 7.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.box(6, -34, 9, 4, C.amber, 1);
    this.box(20, -33, 7, 3, C.cyan, 1);
    ctx.restore();
    // Cab and chassis stay level.
    ctx.beginPath();
    ctx.moveTo(x + 58, g - 32);
    ctx.lineTo(x + 72, g - 32);
    ctx.lineTo(x + 82, g - 20);
    ctx.lineTo(x + 82, g - 8);
    ctx.lineTo(x + 58, g - 8);
    ctx.closePath();
    this.paint(C.lime, 1.6);
    ctx.beginPath();
    ctx.moveTo(x + 62, g - 29);
    ctx.lineTo(x + 70, g - 29);
    ctx.lineTo(x + 77, g - 21);
    ctx.lineTo(x + 62, g - 21);
    ctx.closePath();
    // An empty cab is just a dark window.
    this.paint(empty ? '#06140c' : C.light, 1);
    this.box(x, g - 11, 84, 4, C.outline, 0);
    this.circle(x + 16, g - 5, 6, C.tyre, 1.4);
    this.circle(x + 16, g - 5, 2.2, C.hub, 0.8);
    this.circle(x + 68, g - 5, 6, C.tyre, 1.4);
    this.circle(x + 68, g - 5, 2.2, C.hub, 0.8);
    ctx.fillStyle = C.amber;
    ctx.fillRect(x + 80, g - 18, 2.5, 3);
  }

  private drawParticles(): void {
    const { ctx } = this;
    for (const p of this.particles) {
      const a = Math.max(p.life / p.span, 0);
      if (p.smoke) {
        ctx.fillStyle = `${p.color} ${0.4 * a})`;
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

  /** Small loose scrap in flight: cans and bottles are the size of a worker's hand. */
  private drawItem(it: Item): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    let alpha = it.landed >= 0 ? Math.max(1 - it.landed / 1.6, 0) : 1;
    if (it.sucked) {
      const [hx, hy] = this.holeCenter();
      const s = Math.min(Math.hypot(hx - it.x, hy - it.y) / 60, 1);
      ctx.scale(0.3 + 0.7 * s, 0.3 + 0.7 * s);
      alpha = 0.5 + 0.5 * s;
    }
    ctx.globalAlpha = alpha;
    switch (it.kind) {
      case 0:
        this.box(-1.5, -2.5, 3, 5, it.color, 0.8);
        break;
      case 1:
        this.box(-1.5, -2, 3, 5, it.color, 0.8);
        ctx.fillStyle = it.color;
        ctx.fillRect(-0.75, -3.5, 1.5, 1.5);
        break;
      case 2:
        this.box(-3, -2.5, 6, 5, C.amber, 0.8);
        break;
      case 3:
        this.circle(0, 0, 3, C.tyre, 0.8);
        break;
      case 4:
        this.circle(0, 0, 3.2, C.cyan, 0.8);
        break;
    }
    ctx.restore();
  }

  private drawGlitch(): void {
    const { ctx, w, h, dpr } = this;
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
