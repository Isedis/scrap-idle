import { Camera } from './camera';
import { C } from './scene';
import {
  FRAC_LETTER,
  STREAM,
  capture,
  crush,
  impurity,
  stationById,
  type Frac,
  type StationId,
  type StationLevels,
} from '../game/sorting';

/** What camera 02 needs to know about the line. */
export interface BeltView {
  line: readonly (StationId | null)[];
  levels: Partial<Record<StationId, StationLevels>>;
  /** Stream onto the belt, items per second in the game; the picture runs it on a log scale. */
  flow: number;
  queue: number;
  queueSize: number;
  threat: number;
}

type Kind = Frac | 'unknown';

interface Item {
  kind: Kind;
  x: number;
  y: number;
  /** Riding, lifted into a bin, knocked off as waste, ground up, sent to the table, or falling into the pit. */
  state: 'belt' | 'lift' | 'spoil' | 'crush' | 'table' | 'fall';
  /** Seconds in the current state. */
  t: number;
  /** Stations already passed. */
  passed: number;
  /** Where a lifted item flies to. */
  tx: number;
  ty: number;
  rot: number;
}

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

const BELT_SPEED = 30;
const STREAM_UNKNOWN = 0.1;
const MAX_ITEMS = 40;

const pick = (mix: Record<Kind, number>): Kind => {
  const total = Object.values(mix).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [k, w] of Object.entries(mix) as [Kind, number][]) {
    r -= w;
    if (r <= 0) return k;
  }
  return 'plastic';
};

/** Camera 02: the sorting belt. Stations stand in the line's order and do what the line math says. */
export class BeltCam extends Camera<BeltView> {
  private items: Item[] = [];
  private bits: Bit[] = [];
  private spawnIn = 0;
  private belt = 0;
  /** Per slot: how full its bin looks, and when its machine last moved. */
  private bins: number[] = [];
  private kick: number[] = [];
  /** Something on the belt that is not trash, after an anomaly on the table. */
  private body: { x: number; t: number } | null = null;
  /** The hand out of the pit, under pressure. */
  private hand = { up: 0, in: 12 };

  constructor() {
    super('КАМ-02 · ЛЕНТА', 'Камера над сортировочной лентой');
  }

  /** An anomaly on the table: for a while, something rides the belt that no station takes. */
  anomaly(): void {
    this.body = { x: this.x0 - 40, t: 0 };
    this.glitch(1.2);
  }

  // ---- Layout -------------------------------------------------------------------

  private get beltY() {
    return Math.round(this.h * 0.6);
  }
  private get x0() {
    return 34;
  }
  private get x1() {
    return this.w - 48;
  }
  private slotX(i: number, n: number): number {
    const a = this.x0 + 34;
    const b = this.x1 - 26;
    return n <= 1 ? (a + b) / 2 : a + ((b - a) * i) / (n - 1);
  }

  // ---- Motion ---------------------------------------------------------------------

  protected simulate(dt: number): void {
    const v = this.view!;
    const n = v.line.length;
    while (this.bins.length < n) this.bins.push(0);
    while (this.kick.length < n) this.kick.push(0);
    this.belt = (this.belt + BELT_SPEED * dt) % 12;

    // A heavier stream puts more on the belt; the picture never empties or floods.
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.items.length < MAX_ITEMS) {
      const busy = Math.min(1, Math.log10(v.flow * 10 + 1) / 2.2);
      this.spawnIn = 1.3 - busy * 0.85 + Math.random() * 0.3;
      const kind = pick({ ...STREAM, unknown: STREAM_UNKNOWN });
      this.items.push({ kind, x: this.x0 - 6, y: this.beltY - 4, state: 'belt', t: 0, passed: 0, tx: 0, ty: 0, rot: (Math.random() - 0.5) * 0.6 });
    }

    for (const it of this.items) {
      it.t += dt;
      switch (it.state) {
        case 'belt': {
          it.x += BELT_SPEED * dt;
          // The unidentified turn off to the table right away.
          if (it.kind === 'unknown' && it.x > this.x0 + 12) {
            it.state = 'table';
            it.t = 0;
            break;
          }
          if (it.passed < n && it.x >= this.slotX(it.passed, n)) this.atStation(it, it.passed, n);
          if (it.x >= this.x1) {
            it.state = 'fall';
            it.t = 0;
          }
          break;
        }
        case 'lift': {
          const k = Math.min(it.t / 0.5, 1);
          it.x += (it.tx - it.x) * Math.min(dt * 8, 1);
          it.y = it.y + (it.ty - it.y) * Math.min(dt * 8, 1) - Math.sin(k * Math.PI) * 0.6;
          break;
        }
        case 'spoil':
          it.y += 26 * dt + it.t * 40 * dt;
          it.x += 6 * dt;
          it.rot += dt * 5;
          break;
        case 'table':
          it.x += (this.x0 - 4 - it.x) * Math.min(dt * 2.5, 1);
          it.y += (this.h - 22 - it.y) * Math.min(dt * 2.5, 1);
          break;
        case 'fall':
          it.x += 10 * dt;
          it.y += 30 * dt + it.t * 120 * dt;
          break;
        case 'crush':
          break;
      }
    }
    this.items = this.items.filter(
      (it) =>
        !(
          (it.state === 'lift' && it.t > 0.6) ||
          (it.state === 'spoil' && it.t > 1.2) ||
          (it.state === 'table' && it.t > 1.4) ||
          (it.state === 'fall' && it.y > this.h + 10) ||
          it.state === 'crush'
        ),
    );

    for (const b of this.bits) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vy += 90 * dt;
      b.life -= dt;
    }
    this.bits = this.bits.filter((b) => b.life > 0);
    for (let i = 0; i < this.kick.length; i++) this.kick[i] = Math.max(0, this.kick[i] - dt);
    for (let i = 0; i < this.bins.length; i++) this.bins[i] = Math.max(0, this.bins[i] - dt * 0.02);

    if (this.body) {
      this.body.t += dt;
      this.body.x += BELT_SPEED * 0.8 * dt;
      if (this.body.x > this.x1 + 60) this.body = null;
    }

    // Under pressure a hand comes up out of the pit now and then.
    this.hand.in -= dt;
    if (v.threat >= 0.7 && this.hand.in <= 0 && this.hand.up === 0) this.hand.up = 0.01;
    if (this.hand.up > 0) {
      this.hand.up += dt;
      if (this.hand.up > 4) {
        this.hand.up = 0;
        this.hand.in = 10 + Math.random() * 20 - v.threat * 6;
      }
    }
  }

  /** What a station does to an item reaching it, by the same shares as the line math. */
  private atStation(it: Item, i: number, n: number): void {
    const v = this.view!;
    it.passed = i + 1;
    const id = v.line[i];
    if (!id) return;
    const def = stationById(id)!;
    const lv = v.levels[id] ?? { speed: 0, purity: 0 };
    const sx = this.slotX(i, n);
    if (def.frac) {
      if (it.kind === def.frac && Math.random() < capture(lv.speed)) {
        it.state = 'lift';
        it.t = 0;
        it.tx = sx + 4;
        it.ty = this.beltY + 20;
        this.kick[i] = 0.5;
        this.bins[i] = Math.min(1, this.bins[i] + 0.08);
      } else if (it.kind !== def.frac && Math.random() < impurity(lv.purity)) {
        it.state = 'spoil';
        it.t = 0;
        this.kick[i] = 0.3;
      }
    } else if (id === 'crusher' && Math.random() < crush(lv.purity)) {
      it.state = 'crush';
      this.kick[i] = 0.4;
      for (let k = 0; k < 6; k++) this.bits.push({ x: it.x, y: it.y, vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 30, life: 0.6 + Math.random() * 0.4 });
    } else if (id === 'briquetter') {
      this.kick[i] = 0.35;
    }
  }

  // ---- Picture ------------------------------------------------------------------------

  protected draw(): void {
    const { ctx, w, h } = this;
    const v = this.view!;
    const n = v.line.length;
    const by = this.beltY;

    // The hall: a dark wall, roof beams, a lamp cone over the belt.
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#030c07');
    sky.addColorStop(1, '#0b2116');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    for (let x = 18; x < w; x += 46) this.line(x, 0, x + 10, by - 40, C.far, 1, 0.5);
    this.line(0, 12, w, 12, C.deep, 1.5, 0.6);
    const flicker = v.threat >= 0.5 && Math.random() < v.threat * 0.08 ? 0.3 : 1;
    for (const lx of [w * 0.3, w * 0.72]) {
      ctx.globalAlpha = 0.07 * flicker;
      ctx.fillStyle = C.light;
      ctx.beginPath();
      ctx.moveTo(lx - 4, 14);
      ctx.lineTo(lx + 4, 14);
      ctx.lineTo(lx + 44, by + 6);
      ctx.lineTo(lx - 44, by + 6);
      ctx.fill();
      ctx.globalAlpha = 1;
      this.box(lx - 6, 10, 12, 5, C.deep, 1);
    }

    // The chute from the heap on the left, the pit on the right.
    this.poly([[0, by - 30], [this.x0 + 4, by - 6], [this.x0 + 4, by + 2], [0, by - 18]], C.heapBack, 1);
    this.label('КУЧА', 14, by - 34, C.deep);
    const pit = ctx.createLinearGradient(0, by, 0, h);
    pit.addColorStop(0, '#020805');
    pit.addColorStop(1, '#000');
    ctx.fillStyle = pit;
    ctx.fillRect(this.x1 + 2, by + 2, w - this.x1, h - by);
    this.line(this.x1 + 2, by + 2, w, by + 2, C.deep, 1);
    this.label('ХВОСТЫ', (this.x1 + w) / 2 + 1, by + 16, '#c86a5a');
    this.label('▼', (this.x1 + w) / 2 + 1, by + 26, '#c86a5a');

    // The inspection table under the chute.
    const ty = h - 14;
    this.box(4, ty - 4, this.x0 + 18, 4, C.deep, 1);
    this.line(8, ty, 8, h, C.deep, 1);
    this.line(this.x0 + 18, ty, this.x0 + 18, h, C.deep, 1);
    for (let k = 0; k < v.queueSize; k++) {
      const filled = k < v.queue;
      this.box(7 + k * 8, ty - 11, 6, 6, filled ? C.light : C.far, filled ? 1 : 0.6);
    }
    this.label('СТОЛ', (this.x0 + 22) / 2, ty - 15, C.deep);

    // The belt: rollers and moving slats.
    this.box(this.x0, by, this.x1 - this.x0, 6, C.far, 1);
    ctx.strokeStyle = C.deep;
    ctx.lineWidth = 1;
    for (let x = this.x0 + this.belt; x < this.x1; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, by + 1);
      ctx.lineTo(x, by + 5);
      ctx.stroke();
    }
    for (let x = this.x0 + 6; x < this.x1; x += 22) this.circle(x, by + 9, 3, C.tyre, 0.8);

    // Stations, in line order, with their bins under the belt.
    for (let i = 0; i < n; i++) this.drawStation(v.line[i], i, this.slotX(i, n));

    // What rides the belt.
    for (const it of this.items) this.actor(() => this.drawItem(it));
    if (this.body) this.drawBody(this.body.x);
    ctx.fillStyle = C.light;
    for (const b of this.bits) {
      ctx.globalAlpha = Math.min(1, b.life * 2);
      ctx.fillRect(b.x, b.y, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;

    if (this.hand.up > 0) this.drawHand();
    this.vignette(v.threat);
  }

  private drawStation(id: StationId | null, i: number, x: number): void {
    const by = this.beltY;
    const kick = this.kick[i] ?? 0;
    if (!id) {
      this.ctx.setLineDash([3, 3]);
      this.box(x - 12, by - 30, 24, 24, '#000000', 0.8);
      this.ctx.setLineDash([]);
      this.label('ПУСТО', x, by - 34, C.deep);
      return;
    }
    const def = stationById(id)!;
    const letter = def.frac ? FRAC_LETTER[def.frac] : id === 'briquetter' ? 'БР' : 'ДР';
    // A bin under the belt, filling as the station catches.
    if (def.frac) {
      const fill = this.bins[i] ?? 0;
      this.box(x - 9, by + 14, 18, 12, C.far, 1);
      if (fill > 0) this.box(x - 8, by + 26 - 11 * fill, 16, 11 * fill, C.green, 0);
    }
    switch (id) {
      case 'optic': {
        this.box(x - 9, by - 34, 18, 10, C.deep, 1.2);
        this.ctx.globalAlpha = 0.18 + kick * 0.6;
        this.ctx.fillStyle = C.glow;
        this.ctx.beginPath();
        this.ctx.moveTo(x - 3, by - 24);
        this.ctx.lineTo(x + 3, by - 24);
        this.ctx.lineTo(x + 9, by - 1);
        this.ctx.lineTo(x - 9, by - 1);
        this.ctx.fill();
        this.ctx.globalAlpha = 1;
        break;
      }
      case 'magnet': {
        const drop = kick > 0 ? 8 * Math.sin((kick / 0.5) * Math.PI) : 0;
        this.line(x, 14, x, by - 22 + drop, C.deep, 1.5);
        this.actor(() => this.box(x - 8, by - 22 + drop, 16, 5, C.hub, 1.2));
        break;
      }
      case 'sieve': {
        const shake = Math.sin(this.t * 40) * 1.2;
        this.box(x - 11 + shake, by - 12, 22, 8, '#000000', 1);
        for (let k = -8; k <= 8; k += 4) this.line(x + k + shake, by - 12, x + k + shake, by - 4, C.green, 0.8, 0.8);
        break;
      }
      case 'blower': {
        this.circle(x, by - 24, 8, C.deep, 1.2);
        const a = this.t * 14;
        for (let k = 0; k < 3; k++) this.line(x, by - 24, x + Math.cos(a + k * 2.1) * 7, by - 24 + Math.sin(a + k * 2.1) * 7, C.green, 1.2);
        for (let k = 0; k < 3; k++) {
          const off = (this.t * 30 + k * 9) % 26;
          this.line(x + 4 + off, by - 18 + k * 3, x + 10 + off, by - 20 + k * 3, C.glow, 0.8, 0.4);
        }
        break;
      }
      case 'briquetter': {
        const drop = kick > 0 ? 12 * Math.sin((kick / 0.35) * Math.PI) : 0;
        this.box(x - 12, by - 40, 24, 8, C.deep, 1.2);
        this.line(x, by - 32, x, by - 20 + drop, C.deep, 2);
        this.actor(() => this.box(x - 10, by - 20 + drop, 20, 6, C.hub, 1.2));
        break;
      }
      case 'crusher': {
        const a = this.t * 8;
        for (const dx of [-6, 6]) {
          this.circle(x + dx, by - 9, 6, C.tyre, 1.2);
          for (let k = 0; k < 4; k++) this.line(x + dx, by - 9, x + dx + Math.cos(a * Math.sign(dx) + k * 1.57) * 6, by - 9 + Math.sin(a * Math.sign(dx) + k * 1.57) * 6, C.green, 1);
        }
        break;
      }
    }
    this.label(letter, x, by - 42, C.green);
  }

  private drawItem(it: Item): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    ctx.scale(1.4, 1.4);
    if (it.state === 'spoil') ctx.globalAlpha = Math.max(0, 1 - it.t);
    if (it.state === 'table') ctx.globalAlpha = Math.max(0, 1 - it.t / 1.4);
    switch (it.kind) {
      case 'plastic':
        this.box(-2.5, -5, 5, 9, '#9fe8a8', 0.9);
        this.box(-1, -7, 2, 2, '#9fe8a8', 0.6);
        break;
      case 'metal':
        this.box(-3, -4, 6, 7, C.hub, 0.9);
        break;
      case 'glass':
        this.circle(0, -1, 3.5, C.light, 0.9);
        break;
      case 'paper':
        this.poly([[-4, -2], [3, -4], [4, 2], [-3, 3]], '#c8e8c8', 0.9);
        break;
      case 'unknown':
        this.poly([[-4, 0], [-1, -5], [4, -3], [3, 3], [-2, 3]], C.green, 0.9);
        break;
    }
    ctx.restore();
    if (it.state === 'belt' || it.state === 'table') {
      ctx.globalAlpha = it.state === 'table' ? Math.max(0, 1 - it.t / 1.4) : 0.8;
      this.label(it.kind === 'unknown' ? '?' : FRAC_LETTER[it.kind], it.x, it.y - 12, it.kind === 'unknown' ? C.light : C.green);
      ctx.globalAlpha = 1;
    }
  }

  /** Something long and still, lying on the belt. */
  private drawBody(x: number): void {
    const y = this.beltY - 3;
    this.actor(() => {
      this.poly([[x - 26, y], [x - 22, y - 5], [x + 14, y - 6], [x + 18, y - 3], [x + 18, y], [x - 26, y + 1]], C.deep, 1.2);
      this.circle(x + 22, y - 3, 4, C.deep, 1.2);
    });
  }

  private drawHand(): void {
    const up = this.hand.up;
    const rise = Math.min(up, 1) * (up > 3 ? Math.max(0, 4 - up) : 1);
    const x = this.x1 + 14;
    const y = this.h - rise * (this.h - this.beltY - 4);
    this.actor(() => {
      this.box(x - 3, y, 6, this.h - y, C.deep, 1);
      for (let k = -2; k <= 2; k++) this.line(x + k * 1.6, y, x + k * 2.4, y - 6 - Math.abs(k), C.green, 1);
    });
  }
}
