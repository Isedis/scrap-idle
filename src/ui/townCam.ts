import { DISTRICTS, districtById, plan, type DistrictType } from '../game/city';
import { Camera } from './camera';
import { C } from './scene';

/** What camera 08 needs to know about the town. */
export interface TownView {
  /** Districts the landfill holds. */
  owned: readonly string[];
  /** The district picked on the plan: marked in the picture. */
  selected: string;
  /** Share of the people still living in town, 0..1: fewer windows lit. */
  people: number;
}

/** A district as the camera sees it: where it stands in the picture and how big. */
interface Spot {
  id: string;
  type: DistrictType;
  x: number;
  y: number;
  /** Size of one storey here: nearer is bigger. */
  u: number;
  /** Depth 0 (far) .. 1 (near). */
  near: number;
  seed: number;
}

interface Puff {
  x: number;
  y: number;
  r: number;
  life: number;
}

interface Walker {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  u: number;
  t: number;
  dur: number;
}

/** Junk falling onto a district just taken. */
interface Burial {
  id: string;
  t: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const AMBER = '#ffbf47';
/** How long the heap takes to come down on a district, in seconds. */
const BURY = 2.8;
/** Camera stands this far south of the plan's top edge, in plan units. */
const Z0 = 2.0;

/** A seeded random stream, so every district looks the same each time. */
function stream(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/**
 * Camera 08: Glukhovo at night from the hill south of town. Every district of the plan
 * stands where it is on the plan, as what it is: houses, works with smoke, the church,
 * the station, the graves. What the landfill takes is under a heap, and the picked one
 * is marked. Through the haze the pit in the middle breathes; now and then pipes and
 * bags come up out of it, or it draws the light out of the windows around. Small
 * figures walk out of the houses toward the heap and do not come back.
 */
export class TownCam extends Camera<TownView> {
  private spots: Spot[] = [];
  private puffs: Puff[] = [];
  private walkers: Walker[] = [];
  private walkIn = 4;
  private burials: Burial[] = [];
  private known: Set<string> | null = null;
  private blackout = 0;
  private blackoutIn = 40;
  /** Pipes up out of the pit: seconds into the rise, or negative while waiting. */
  private rise = -20;
  /** The pit drawing the light out of the windows. */
  private inhale = -45;

  constructor() {
    super('КАМ-08 · ГЛУХОВО', 'Камера на холме над городом');
    this.root.classList.add('town');
  }

  /** Where a point of the plan lands in the picture, and how big things are there. */
  private project(px: number, py: number): { x: number; y: number; s: number } {
    const { w, h } = this;
    const z = Z0 - py;
    return { x: w / 2 + ((px - 0.5) * w * 1.06) / z, y: h * 0.036 + (h * 0.742) / z, s: 0.83 / z };
  }

  protected onResize(): void {
    this.spots = DISTRICTS.map((d, i) => {
      const p = this.project(d.x, d.y);
      return { id: d.id, type: d.type, x: p.x, y: p.y, u: this.w * 0.044 * p.s, near: (p.s - 0.43) / 0.57, seed: 17 + i * 131 };
    }).sort((a, b) => a.y - b.y);
  }

  protected simulate(dt: number): void {
    const v = this.view!;
    if (!this.known) this.known = new Set(v.owned);
    for (const id of v.owned)
      if (!this.known.has(id)) {
        this.known.add(id);
        this.burials.push({ id, t: 0 });
      }
    for (const b of this.burials) b.t += dt;
    this.burials = this.burials.filter((b) => b.t < BURY);

    this.blackout -= dt;
    this.blackoutIn -= dt;
    if (this.blackoutIn <= 0) {
      this.blackout = rnd(0.8, 2);
      this.blackoutIn = rnd(40, 90);
    }
    this.rise += dt;
    if (this.rise > 9) this.rise = -rnd(35, 70);
    this.inhale += dt;
    if (this.inhale > 4) this.inhale = -rnd(50, 90);

    // Smoke from the works and the boiler houses still standing.
    for (const sp of this.spots) {
      if ((sp.type !== 'prom' && sp.type !== 'boiler') || v.owned.includes(sp.id)) continue;
      if (Math.random() < dt * 2.2) {
        const c = this.chimney(sp);
        this.puffs.push({ x: c.x, y: c.y, r: sp.u * 0.25, life: 0 });
      }
    }
    for (const p of this.puffs) {
      p.life += dt;
      p.y -= dt * 6;
      p.x += dt * 4;
      p.r += dt * 1.6;
    }
    this.puffs = this.puffs.filter((p) => p.life < 5);

    // People going to the heap.
    this.walkIn -= dt;
    if (this.walkIn <= 0) {
      this.walkIn = rnd(5, 12) / Math.max(0.3, v.people);
      this.spawnWalker(v);
    }
    for (const wk of this.walkers) wk.t += dt;
    this.walkers = this.walkers.filter((wk) => wk.t < wk.dur);
  }

  private spawnWalker(v: TownView): void {
    const homes = this.spots.filter((s) => s.type === 'live' && !v.owned.includes(s.id));
    const heaps = this.spots.filter((s) => v.owned.includes(s.id));
    if (!homes.length || !heaps.length) return;
    const from = homes[Math.floor(Math.random() * homes.length)];
    const to = heaps.reduce((best, s) => (Math.hypot(s.x - from.x, s.y - from.y) < Math.hypot(best.x - from.x, best.y - from.y) ? s : best));
    this.walkers.push({ x0: from.x + rnd(-1, 1) * from.u, y0: from.y, x1: to.x, y1: to.y, u: from.u, t: 0, dur: rnd(14, 22) });
  }

  private chimney(sp: Spot): { x: number; y: number } {
    const tall = sp.type === 'boiler' ? 3.2 : 2.2;
    return { x: sp.x + sp.u * (sp.type === 'boiler' ? 0.1 : 0.6), y: sp.y - sp.u * tall };
  }

  protected draw(): void {
    const { ctx, w, h } = this;
    const v = this.view!;
    const dark = this.blackout > 0;
    const pit = this.spots.find((s) => s.type === 'pit')!;
    const inhaling = this.inhale > 0 ? Math.sin((this.inhale / 4) * Math.PI) : 0;
    const horizon = this.project(0.5, -0.05).y;

    this.sky(pit, inhaling, horizon);

    // The world drifts a little: the camera on its pole turns slowly, like a guard looking about.
    ctx.save();
    ctx.translate(Math.sin(this.t * 0.045) * w * 0.03, 0);

    // The streets of the plan, laid on the ground, with a lamp here and there.
    ctx.lineCap = 'round';
    plan().streets.forEach(([a, b], i) => {
      const pa = this.project(a[0], a[1]);
      const pb = this.project(b[0], b[1]);
      ctx.strokeStyle = 'rgb(95 176 122 / 0.16)';
      ctx.lineWidth = Math.max(1, 2.2 * (pa.s + pb.s) * 0.5);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
      if (i % 3 !== 0 || dark) return;
      // No lamps left burning under the heap.
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      const near = DISTRICTS.reduce((best, d) => (Math.hypot(d.x - mx, d.y - my) < Math.hypot(best.x - mx, best.y - my) ? d : best));
      if (!v.owned.includes(near.id)) this.lamp((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, (pa.s + pb.s) / 2, i);
    });
    ctx.lineCap = 'butt';

    for (const sp of this.spots) if (sp.type === 'river') this.water(sp);

    // The districts, far to near; the pit's red light on everything around it.
    for (const sp of this.spots) {
      if (sp.type === 'river') continue;
      if (sp.type === 'pit') {
        this.pit(sp, v.owned.includes('pit'), inhaling);
        continue;
      }
      const owned = v.owned.includes(sp.id);
      const burial = this.burials.find((b) => b.id === sp.id);
      if (!owned || burial) this.district(sp, dark, v.people, inhaling, pit);
      if (owned) this.heap(sp, burial ? Math.min(1, burial.t / (BURY * 0.75)) : 1, burial?.t ?? BURY);
    }
    ctx.globalCompositeOperation = 'lighter';
    const rim = ctx.createRadialGradient(pit.x, pit.y, 0, pit.x, pit.y, w * 0.4);
    rim.addColorStop(0, `rgb(120 25 15 / ${0.28 + inhaling * 0.35})`);
    rim.addColorStop(1, 'rgb(120 25 15 / 0)');
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    this.mist(pit, inhaling);
    for (const p of this.puffs) {
      ctx.fillStyle = `rgb(130 180 145 / ${0.16 * (1 - p.life / 5)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    this.fogBands(horizon);
    this.pipes(pit);
    this.people();
    this.crows(v);
    this.spotlight(v.selected);
    this.marker(v.selected);
    ctx.restore();

    // Haze over the far rows, then the hill the camera stands on, and ash in front of it all.
    const haze = ctx.createLinearGradient(0, horizon - 10, 0, h * 0.8);
    haze.addColorStop(0, 'rgb(20 45 30 / 0.5)');
    haze.addColorStop(1, 'rgb(20 45 30 / 0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - 10, w, h);
    this.foreground();
    this.ash();
    if (dark) {
      ctx.fillStyle = 'rgb(0 0 0 / 0.4)';
      ctx.fillRect(0, 0, w, h);
    }
    this.vignette(0.4);
  }

  /** Night sky: low cloud drifting, lit red from under by the pit; hills on the horizon. */
  private sky(pit: Spot, inhaling: number, horizon: number): void {
    const { ctx, w, h } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#010503');
    sky.addColorStop(1, '#0b2214');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 7; k++) {
      const cx = ((k * 0.23 + this.t * 0.005 * (1 + k * 0.3)) % 1.4) * w - w * 0.2;
      const cy = h * (0.06 + (k % 4) * 0.07);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * (0.18 + (k % 3) * 0.06));
      g.addColorStop(0, 'rgb(45 85 60 / 0.2)');
      g.addColorStop(1, 'rgb(45 85 60 / 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, horizon);
    }
    const red = ctx.createRadialGradient(pit.x, horizon, 0, pit.x, horizon, w * 0.5);
    red.addColorStop(0, `rgb(255 70 50 / ${0.22 + 0.06 * Math.sin(this.t * 0.9) + inhaling * 0.2})`);
    red.addColorStop(1, 'rgb(255 70 50 / 0)');
    ctx.fillStyle = red;
    ctx.fillRect(0, 0, w, horizon + 20);
    ctx.fillStyle = '#061509';
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, horizon + 2);
    for (let x = -w * 0.1; x <= w * 1.1; x += 6) ctx.lineTo(x, horizon - 5 - Math.sin(x * 0.02) * 5 - Math.sin(x * 0.007 + 1) * 8);
    ctx.lineTo(w * 1.1, h);
    ctx.lineTo(-w * 0.1, h);
    ctx.fill();
    const ground = ctx.createLinearGradient(0, horizon, 0, h);
    ground.addColorStop(0, '#081a0f');
    ground.addColorStop(1, '#0b2214');
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, w, h - horizon);
  }

  /** A street lamp: a post and a soft cone of light on the ground; some of them flicker. */
  private lamp(x: number, y: number, s: number, i: number): void {
    const { ctx } = this;
    const flick = i % 7 === 0 && Math.sin(this.t * 13 + i) > 0.6 ? 0.2 : 1;
    const top = y - 14 * s;
    ctx.strokeStyle = 'rgb(95 176 122 / 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, top);
    ctx.stroke();
    const g = ctx.createRadialGradient(x, y, 0, x, y, 12 * s);
    g.addColorStop(0, `rgb(200 255 210 / ${0.16 * flick})`);
    g.addColorStop(1, 'rgb(200 255 210 / 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, 12 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgb(220 255 225 / ${0.85 * flick})`;
    ctx.fillRect(x - 1, top - 1, 2, 2);
  }

  /** Red mist going up from the pit like breath on a cold night, with sparks in it. */
  private mist(pit: Spot, inhaling: number): void {
    const { ctx, h } = this;
    for (let k = 0; k < 6; k++) {
      const p = (this.t * 0.05 + k / 6) % 1;
      const y = pit.y - p * h * 0.6;
      const x = pit.x + Math.sin(p * 5 + k + this.t * 0.3) * pit.u * 1.5;
      const r = pit.u * (1.5 + p * 4);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgb(200 60 45 / ${(0.12 + inhaling * 0.1) * (1 - p)})`);
      g.addColorStop(1, 'rgb(200 60 45 / 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let k = 0; k < 14; k++) {
      const p = (this.t * (0.06 + (k % 4) * 0.02) + k * 0.31) % 1;
      const x = pit.x + (((k * 37) % 9) - 4) * pit.u * 0.6 + Math.sin(this.t * 2 + k) * pit.u * 0.5 * p;
      const y = pit.y - p * h * 0.5;
      ctx.fillStyle = `rgb(255 150 110 / ${0.8 * (1 - p)})`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }

  /** Low fog lying between the rows of houses, drifting across. */
  private fogBands(horizon: number): void {
    const { ctx, w, h } = this;
    for (let k = 0; k < 4; k++) {
      const y = horizon + (h - horizon) * (0.2 + k * 0.2);
      const drift = ((this.t * (3 + k * 1.5) + k * 90) % (w * 1.6)) - w * 0.3;
      for (const x of [drift - w * 0.8, drift]) {
        const g = ctx.createRadialGradient(x + w * 0.4, y, 0, x + w * 0.4, y, w * 0.45);
        g.addColorStop(0, 'rgb(90 130 105 / 0.13)');
        g.addColorStop(1, 'rgb(90 130 105 / 0)');
        ctx.fillStyle = g;
        ctx.save();
        ctx.translate(0, y);
        ctx.scale(1, 0.18);
        ctx.translate(0, -y);
        ctx.fillRect(x - w * 0.1, y - w * 0.5, w, w);
        ctx.restore();
      }
    }
  }

  /** Crows circling over the heap: the more of the town it has, the more of them. */
  private crows(v: TownView): void {
    const heaps = this.spots.filter((s) => v.owned.includes(s.id));
    if (!heaps.length) return;
    const { ctx } = this;
    const cx = heaps.reduce((a, s) => a + s.x, 0) / heaps.length;
    const cy = Math.min(...heaps.map((s) => s.y)) - this.h * 0.12;
    const n = Math.min(9, 2 + Math.floor(heaps.length / 5));
    ctx.strokeStyle = '#020804';
    ctx.lineWidth = 1.2;
    for (let k = 0; k < n; k++) {
      const a = this.t * (0.35 + (k % 3) * 0.1) + k * 1.9;
      const x = cx + Math.cos(a) * this.w * (0.08 + (k % 4) * 0.03);
      const y = cy + Math.sin(a) * this.h * 0.04 + (k % 3) * 4;
      const flap = Math.sin(this.t * 9 + k) * 2;
      ctx.beginPath();
      ctx.moveTo(x - 4, y - flap);
      ctx.lineTo(x, y);
      ctx.lineTo(x + 4, y - flap);
      ctx.stroke();
    }
  }

  /** The camera's own lamp on the district picked on the plan. */
  private spotlight(id: string): void {
    const sp = this.spots.find((s) => s.id === id);
    if (!sp) return;
    const { ctx, w, h } = this;
    const sx = w * 0.5;
    const sy = h + 10;
    const r = sp.u * 2.6;
    const g = ctx.createLinearGradient(sx, sy, sp.x, sp.y);
    g.addColorStop(0, 'rgb(200 255 210 / 0)');
    g.addColorStop(1, `rgb(200 255 210 / ${0.1 + 0.03 * Math.sin(this.t * 2)})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(sx - 6, sy);
    ctx.lineTo(sp.x - r, sp.y - sp.u);
    ctx.lineTo(sp.x + r, sp.y - sp.u);
    ctx.lineTo(sx + 6, sy);
    ctx.fill();
    const pool = ctx.createRadialGradient(sp.x, sp.y - sp.u, 0, sp.x, sp.y - sp.u, r * 1.2);
    pool.addColorStop(0, 'rgb(200 255 210 / 0.14)');
    pool.addColorStop(1, 'rgb(200 255 210 / 0)');
    ctx.fillStyle = pool;
    ctx.fillRect(sp.x - r * 1.2, sp.y - sp.u - r * 1.2, r * 2.4, r * 2.4);
  }

  /** The hill under the camera: grass moving in the wind, a fence, a pole with sagging wires. */
  private foreground(): void {
    const { ctx, w, h } = this;
    ctx.fillStyle = '#020805';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.9);
    for (let x = 0; x <= w; x += 10) ctx.lineTo(x, h * 0.93 + Math.sin(x * 0.03) * 4 + (x / w) * h * 0.03);
    ctx.lineTo(w, h);
    ctx.fill();
    ctx.strokeStyle = '#04130a';
    ctx.lineWidth = 1;
    for (let k = 0; k < 70; k++) {
      const x = (k / 70) * w + ((k * 13) % 7);
      const base = h * 0.93 + Math.sin(x * 0.03) * 4 + (x / w) * h * 0.03;
      const tall = 5 + ((k * 7) % 9);
      const sway = Math.sin(this.t * 1.4 + k * 0.6) * 2.5;
      ctx.beginPath();
      ctx.moveTo(x, base + 2);
      ctx.quadraticCurveTo(x + sway * 0.5, base - tall * 0.5, x + sway, base - tall);
      ctx.stroke();
    }
    // Fence posts with a wire, leaning, to the left.
    ctx.strokeStyle = '#06180d';
    ctx.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      const x = w * (0.03 + k * 0.08);
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + (k % 2 ? 2 : -1), h * 0.78 + k * 3);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w * 0.03, h * 0.82);
    ctx.quadraticCurveTo(w * 0.15, h * 0.86, w * 0.27, h * 0.84);
    ctx.stroke();
    // A pole on the right, its wires running out of the frame.
    const px = w * 0.93;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px, h);
    ctx.lineTo(px - 2, h * 0.02);
    ctx.moveTo(px - 14, h * 0.08);
    ctx.lineTo(px + 10, h * 0.07);
    ctx.stroke();
    ctx.lineWidth = 1;
    for (const [k, end] of [[-12, 0.2], [0, 0.28], [8, 0.16]] as const) {
      ctx.beginPath();
      ctx.moveTo(px + k, h * 0.075);
      const sway = Math.sin(this.t * 0.8 + k) * 2;
      ctx.quadraticCurveTo(w * 0.45, h * (end + 0.08) + sway, -10, h * end);
      ctx.stroke();
    }
  }

  /** Ash coming down in front of the camera, slowly, slantwise. */
  private ash(): void {
    const { ctx, w, h } = this;
    ctx.fillStyle = 'rgb(170 200 180 / 0.35)';
    for (let k = 0; k < 40; k++) {
      const p = (this.t * (0.03 + (k % 5) * 0.008) + k * 0.173) % 1;
      const x = ((k * 97.3) % w) + p * w * 0.15 + Math.sin(this.t + k) * 3;
      const y = p * h;
      const s = k % 4 === 0 ? 2 : 1;
      ctx.fillRect(x % w, y, s, s);
    }
  }

  /** Water: a dark sheet with light drifting on it. */
  private water(sp: Spot): void {
    const { ctx } = this;
    ctx.fillStyle = '#06150f';
    ctx.beginPath();
    ctx.ellipse(sp.x, sp.y - sp.u * 0.2, sp.u * 2.8, sp.u * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgb(140 220 165 / 0.25)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const off = ((this.t * 4 + k * 9 + sp.seed) % (sp.u * 4)) - sp.u * 2;
      ctx.beginPath();
      ctx.moveTo(sp.x + off - sp.u * 0.4, sp.y - sp.u * (0.5 - k * 0.25));
      ctx.lineTo(sp.x + off + sp.u * 0.4, sp.y - sp.u * (0.5 - k * 0.25));
      ctx.stroke();
    }
  }

  /** Which way a building's side wall shows: toward the middle of the picture, as seen from the hill. */
  private sideOf(x: number, bw: number): number {
    const off = (this.w / 2 - x) / (this.w / 2);
    return Math.sign(off) * Math.min(1, Math.abs(off)) * bw * 0.32;
  }

  /** A wall face filled dark, a shade lighter at the top, as moonlight falls on it. */
  private face(points: [number, number][], top: number, bottom: number, light: number): void {
    const { ctx } = this;
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, `rgb(${18 + light * 12} ${44 + light * 22} ${30 + light * 14})`);
    g.addColorStop(1, `rgb(${7 + light * 4} ${20 + light * 6} ${13 + light * 4})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    points.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    ctx.fill();
  }

  /** A thin moonlit line along an edge: the only bright line on a building. */
  private edge(points: [number, number][], alpha = 0.35): void {
    const { ctx } = this;
    ctx.strokeStyle = `rgb(150 220 170 / ${alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    points.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
  }

  /**
   * A wooden house with its gable to the street: front wall, the side wall turned toward
   * the camera, the roof slope over it, a chimney. The base of everything else too.
   */
  private izba(x: number, y: number, bw: number, bh: number, light: number, chimney = true): void {
    const d = this.sideOf(x, bw);
    const back = -bw * 0.18;
    const ridge = bh + bw * 0.55;
    const l = x - bw / 2;
    const rr = x + bw / 2;
    // Side wall and the roof slope over it, on the side that shows.
    const sx = d > 0 ? rr : l;
    this.face([[sx, y], [sx + d, y + back], [sx + d, y - bh + back], [sx, y - bh]], y - bh, y, light * 0.4);
    this.face([[x, y - ridge], [x + d, y - ridge + back], [sx + d, y - bh + back], [sx, y - bh]], y - ridge, y - bh, light + 0.6);
    // Front with the gable.
    this.face([[l, y], [l, y - bh], [x, y - ridge], [rr, y - bh], [rr, y]], y - ridge, y, light);
    // Barge boards: the moon on the gable's edges.
    this.edge([[l - 1, y - bh + 1], [x, y - ridge - 1], [rr + 1, y - bh + 1]]);
    this.edge([[x, y - ridge], [x + d, y - ridge + back]], 0.25);
    if (chimney) {
      const cx = x + d * 0.5 + (d > 0 ? bw * 0.1 : -bw * 0.1);
      const cy = y - (bh + ridge) / 2 + back * 0.5;
      this.face([[cx - bw * 0.07, cy], [cx - bw * 0.07, cy - bw * 0.35], [cx + bw * 0.07, cy - bw * 0.35], [cx + bw * 0.07, cy]], cy - bw * 0.35, cy, light);
    }
  }

  /** A brick block with a flat roof: works, schools, the hospital; its windows in rows. */
  private block(x: number, y: number, bw: number, bh: number, light: number): void {
    const d = this.sideOf(x, bw) * 0.8;
    const back = -bw * 0.12;
    const l = x - bw / 2;
    const rr = x + bw / 2;
    const sx = d > 0 ? rr : l;
    this.face([[sx, y], [sx + d, y + back], [sx + d, y - bh + back], [sx, y - bh]], y - bh, y, light * 0.4);
    this.face([[l, y - bh], [l + d, y - bh + back], [rr + d, y - bh + back], [rr, y - bh]], y - bh + back, y - bh, light + 0.5);
    this.face([[l, y], [l, y - bh], [rr, y - bh], [rr, y]], y - bh, y, light);
    this.edge([[l, y - bh], [rr, y - bh], [rr + Math.max(0, d), y - bh + back]], 0.3);
  }

  /**
   * Windows in a grid on a front wall: lit ones glow, framed with a cross; how many are
   * lit follows how many people are left. Near the pit, when it breathes in, they go out
   * and their light drifts to it.
   */
  private windows(x: number, y: number, bw: number, bh: number, n: number, sp: Spot, dark: boolean, people: number, inhaling: number, pit: Spot): void {
    const { ctx } = this;
    const r = stream(sp.seed + Math.round(x * 7));
    const drawn = inhaling > 0 && Math.hypot(sp.x - pit.x, sp.y - pit.y) < this.w * 0.35 * inhaling;
    const cols = Math.max(1, Math.min(n, Math.round(bw / (sp.u * 0.45))));
    const rows = Math.max(1, Math.round(n / cols));
    const ww = Math.max(1.5, sp.u * 0.2);
    const wh = ww * 1.3;
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++) {
        const px = x - bw / 2 + ((col + 0.5) / cols) * bw - ww / 2;
        const py = y - bh + ((row + 0.4) / rows) * bh - wh / 2;
        const lit = !dark && !drawn && r() < 0.2 + 0.55 * people;
        if (!lit) {
          ctx.fillStyle = '#030a06';
          ctx.fillRect(px, py, ww, wh);
          continue;
        }
        const flick = 0.85 + 0.15 * Math.sin(this.t * (0.7 + r()) + px);
        const g = ctx.createRadialGradient(px + ww / 2, py + wh / 2, 0, px + ww / 2, py + wh / 2, ww * 2.2);
        g.addColorStop(0, `rgb(210 255 170 / ${0.22 * flick})`);
        g.addColorStop(1, 'rgb(210 255 170 / 0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - ww * 2, py - ww * 2, ww * 5, wh + ww * 4);
        ctx.fillStyle = `rgb(215 255 180 / ${0.85 * flick})`;
        ctx.fillRect(px, py, ww, wh);
        if (ww >= 3) {
          ctx.fillStyle = '#0a1a10';
          ctx.fillRect(px + ww / 2 - 0.5, py, 1, wh);
          ctx.fillRect(px, py + wh * 0.45, ww, 1);
        }
      }
    if (drawn && Math.random() < 0.15) {
      const k = Math.random();
      ctx.fillStyle = 'rgb(200 255 210 / 0.7)';
      ctx.fillRect(x + (pit.x - x) * k, y - bh / 2 + (pit.y - y + bh / 2) * k, 1.5, 1.5);
    }
  }

  /** A bare birch: a pale trunk and thin branches. */
  private birch(x: number, y: number, hgt: number, r: () => number): void {
    const { ctx } = this;
    ctx.strokeStyle = 'rgb(150 200 165 / 0.45)';
    ctx.lineWidth = Math.max(1, hgt * 0.05);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.5) * hgt * 0.1, y - hgt);
    ctx.stroke();
    ctx.strokeStyle = 'rgb(20 50 32 / 0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const by = y - hgt * (0.45 + k * 0.11);
      const dir = k % 2 ? 1 : -1;
      ctx.moveTo(x, by);
      ctx.lineTo(x + dir * hgt * (0.2 + r() * 0.15), by - hgt * 0.18);
    }
    ctx.stroke();
  }

  /** A district still standing, drawn as what it is. */
  private district(sp: Spot, dark: boolean, people: number, inhaling: number, pit: Spot): void {
    const { ctx } = this;
    const { x, y } = sp;
    const r = stream(sp.seed);
    const light = Math.max(0, sp.near);
    const win = (wx: number, wy: number, bw: number, bh: number, n: number) => this.windows(wx, wy, bw, bh, n, sp, dark, people, inhaling, pit);
    // The town leans toward the pit: the nearer, the more.
    const dist = Math.hypot(pit.x - x, pit.y - y);
    const lean = Math.sign(pit.x - x) * 0.14 * Math.max(0, 1 - dist / (this.w * 0.32)) * (1 + 0.15 * Math.sin(this.t * 0.4));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean);
    ctx.translate(-x, -y);
    this.building(sp, r, light, win);
    ctx.restore();
  }

  private building(sp: Spot, r: () => number, light: number, win: (wx: number, wy: number, bw: number, bh: number, n: number) => void): void {
    const { ctx } = this;
    const { x, y, u } = sp;
    const line = (pts: [number, number][], alpha = 0.4, width = 1) => {
      ctx.strokeStyle = `rgb(120 190 145 / ${alpha})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.stroke();
    };
    switch (sp.type) {
      case 'live': {
        // Houses along a street, a birch, a picket fence in front.
        const n = 3 + Math.floor(r() * 2);
        const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => Math.abs(b - (n - 1) / 2) - Math.abs(a - (n - 1) / 2));
        for (const k of order) {
          const hx = x + (k - (n - 1) / 2) * u * 1.15 + (r() - 0.5) * u * 0.3;
          const bw = u * (0.8 + r() * 0.35);
          const bh = u * (0.55 + r() * 0.35);
          const hy = y - (k % 2) * u * 0.18;
          this.izba(hx, hy, bw, bh, light, r() < 0.7);
          win(hx, hy, bw * 0.7, bh * 0.85, 2);
        }
        if (r() < 0.6) this.birch(x + (r() - 0.5) * u * 3.5, y - u * 0.25, u * 1.8, r);
        const fy = y + u * 0.15;
        const pts: [number, number][] = [];
        ctx.strokeStyle = 'rgb(110 170 130 / 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = -6; k <= 6; k++) {
          if (r() < 0.15) continue;
          const px = x + k * u * 0.3;
          ctx.moveTo(px, fy);
          ctx.lineTo(px, fy - u * 0.3);
        }
        ctx.stroke();
        pts.push([x - u * 1.8, fy - u * 0.2], [x + u * 1.8, fy - u * 0.2]);
        line(pts, 0.2);
        break;
      }
      case 'prom':
      case 'boiler': {
        const bw = u * (sp.type === 'prom' ? 3 : 1.9);
        const bh = u * (sp.type === 'prom' ? 1 : 1.2);
        const c = this.chimney(sp);
        // The chimney first, behind: brick, bands near the top.
        this.face([[c.x - u * 0.15, y - bh * 0.5], [c.x - u * 0.11, c.y], [c.x + u * 0.11, c.y], [c.x + u * 0.15, y - bh * 0.5]], c.y, y, light + 0.2);
        line([[c.x - u * 0.12, c.y + u * 0.2], [c.x + u * 0.12, c.y + u * 0.2]], 0.3);
        line([[c.x - u * 0.11, c.y], [c.x + u * 0.11, c.y]], 0.45);
        this.block(x, y, bw, bh, light);
        if (sp.type === 'prom') {
          // A sawtooth roof of glass, faintly lit from inside.
          for (let k = 0; k < 4; k++) {
            const sx0 = x - bw / 2 + (k * bw) / 4;
            this.face([[sx0, y - bh], [sx0 + bw / 4, y - bh], [sx0 + bw / 4, y - bh - u * 0.35]], y - bh - u * 0.35, y - bh, light + 0.4);
            line([[sx0 + bw / 4, y - bh - u * 0.35], [sx0 + bw / 4, y - bh]], 0.25);
          }
        }
        win(x, y, bw, bh, sp.type === 'prom' ? 6 : 4);
        break;
      }
      case 'church': {
        this.izba(x, y, u * 1.4, u * 1.1, light, false);
        // Bell tower with an onion dome.
        const tw = u * 0.7;
        this.block(x, y - u * 0.4, tw, u * 2, light + 0.1);
        ctx.fillStyle = `rgb(${24 + light * 14} ${56 + light * 22} ${38 + light * 14})`;
        ctx.beginPath();
        ctx.moveTo(x - tw / 2, y - u * 2.4);
        ctx.bezierCurveTo(x - tw * 0.9, y - u * 2.8, x - tw * 0.2, y - u * 3, x, y - u * 3.35);
        ctx.bezierCurveTo(x + tw * 0.2, y - u * 3, x + tw * 0.9, y - u * 2.8, x + tw / 2, y - u * 2.4);
        ctx.closePath();
        ctx.fill();
        this.edge([[x - tw * 0.6, y - u * 2.65], [x, y - u * 3.35]], 0.5);
        line([[x, y - u * 3.35], [x, y - u * 3.9]], 0.7);
        line([[x - u * 0.16, y - u * 3.7], [x + u * 0.16, y - u * 3.7]], 0.7);
        line([[x - u * 0.12, y - u * 3.55], [x + u * 0.12, y - u * 3.6]], 0.7);
        win(x, y - u * 1.3, tw * 0.5, u * 0.5, 1);
        win(x, y, u * 1, u * 0.8, 2);
        break;
      }
      case 'cemetery': {
        // Crosses and stones in uneven rows, a fence, a dead tree.
        for (let k = 0; k < 11; k++) {
          const gx = x + (r() - 0.5) * u * 3.6;
          const gy = y - r() * u * 0.7;
          const s = u * (0.3 + r() * 0.2);
          const tilt = (r() - 0.5) * 0.4;
          ctx.save();
          ctx.translate(gx, gy);
          ctx.rotate(tilt);
          if (k % 3 === 0) {
            this.face([[-s * 0.25, 0], [-s * 0.25, -s * 0.6], [0, -s * 0.75], [s * 0.25, -s * 0.6], [s * 0.25, 0]], -s * 0.75, 0, light + 0.3);
          } else {
            line([[0, 0], [0, -s]], 0.5);
            line([[-s * 0.3, -s * 0.7], [s * 0.3, -s * 0.7]], 0.5);
            line([[-s * 0.2, -s * 0.4], [s * 0.2, -s * 0.5]], 0.5);
          }
          ctx.restore();
        }
        ctx.strokeStyle = 'rgb(20 50 32 / 0.95)';
        ctx.lineWidth = Math.max(1, u * 0.12);
        ctx.beginPath();
        ctx.moveTo(x + u * 1.2, y);
        ctx.lineTo(x + u * 1.25, y - u * 1.6);
        ctx.lineTo(x + u * 1.7, y - u * 2.1);
        ctx.moveTo(x + u * 1.24, y - u * 1.1);
        ctx.lineTo(x + u * 0.8, y - u * 1.6);
        ctx.moveTo(x + u * 1.25, y - u * 1.6);
        ctx.lineTo(x + u * 1.1, y - u * 2.2);
        ctx.stroke();
        break;
      }
      case 'school': {
        const bw = u * 2.8;
        const bh = u * 1.3;
        this.block(x, y, bw, bh, light);
        this.izba(x, y - bh, u * 1, u * 0.01, light, false);
        line([[x + bw / 2 + u * 0.4, y], [x + bw / 2 + u * 0.4, y - u * 2.5]], 0.5);
        const wave = Math.sin(this.t * 2.5) * u * 0.1;
        ctx.fillStyle = 'rgb(130 200 150 / 0.6)';
        ctx.beginPath();
        ctx.moveTo(x + bw / 2 + u * 0.4, y - u * 2.5);
        ctx.quadraticCurveTo(x + bw / 2 + u * 0.75, y - u * 2.5 + wave, x + bw / 2 + u * 1.1, y - u * 2.35 + wave);
        ctx.lineTo(x + bw / 2 + u * 0.4, y - u * 2.1);
        ctx.fill();
        win(x, y, bw, bh, 10);
        break;
      }
      case 'market': {
        // Stalls under torn awnings, crates in front.
        for (let k = 0; k < 3; k++) {
          const mx = x + (k - 1) * u * 1.15;
          this.block(mx, y, u * 0.9, u * 0.55, light);
          const sag = Math.sin(this.t * 1.5 + k) * u * 0.03;
          for (let s2 = 0; s2 < 4; s2++) {
            const ax = mx - u * 0.55 + s2 * u * 0.275;
            this.face([[ax, y - u * 0.55], [ax + u * 0.275, y - u * 0.55], [ax + u * 0.25, y - u * 0.85 + sag], [ax + u * 0.02, y - u * 0.85 + sag]], y - u * 0.85, y - u * 0.55, s2 % 2 ? light + 0.8 : light);
          }
          win(mx, y, u * 0.6, u * 0.35, 1);
        }
        break;
      }
      case 'archive': {
        const bw = u * 2.4;
        this.block(x, y, bw, u * 1.3, light);
        this.face([[x - bw / 2 - 2, y - u * 1.3], [x, y - u * 1.85], [x + bw / 2 + 2, y - u * 1.3]], y - u * 1.85, y - u * 1.3, light + 0.4);
        this.edge([[x - bw / 2 - 2, y - u * 1.3], [x, y - u * 1.85], [x + bw / 2 + 2, y - u * 1.3]], 0.45);
        for (let k = 0; k < 5; k++) {
          const cx = x - bw / 2 + (k + 0.5) * (bw / 5);
          this.face([[cx - u * 0.07, y], [cx - u * 0.07, y - u * 1.2], [cx + u * 0.07, y - u * 1.2], [cx + u * 0.07, y]], y - u * 1.2, y, light + 0.7);
        }
        break;
      }
      case 'hospital': {
        const bw = u * 3;
        const bh = u * 1.7;
        this.block(x, y, bw, bh, light);
        ctx.fillStyle = 'rgb(220 255 225 / 0.7)';
        ctx.fillRect(x - u * 0.08, y - bh - u * 0.65, u * 0.16, u * 0.5);
        ctx.fillRect(x - u * 0.25, y - bh - u * 0.48, u * 0.5, u * 0.16);
        win(x, y, bw, bh, 12);
        break;
      }
      case 'depot': {
        this.block(x - u * 0.4, y, u * 2.4, u * 0.95, light);
        for (let k = 0; k < 2; k++) {
          ctx.fillStyle = '#030a06';
          ctx.beginPath();
          ctx.moveTo(x - u * 1.25 + k * u * 1.1, y);
          ctx.arc(x - u * 0.95 + k * u * 1.1, y - u * 0.25, u * 0.3, Math.PI, 0);
          ctx.lineTo(x - u * 0.65 + k * u * 1.1, y);
          ctx.fill();
        }
        // A lorry with its headlights on.
        this.block(x + u * 1.35, y, u * 0.75, u * 0.45, light + 0.2);
        this.block(x + u * 1.95, y, u * 0.35, u * 0.32, light + 0.2);
        const g = ctx.createRadialGradient(x + u * 2.15, y - u * 0.15, 0, x + u * 2.15, y - u * 0.15, u * 0.8);
        g.addColorStop(0, 'rgb(220 255 200 / 0.35)');
        g.addColorStop(1, 'rgb(220 255 200 / 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + u * 1.4, y - u, u * 1.6, u * 1.6);
        break;
      }
      case 'post': {
        this.izba(x - u * 0.4, y, u * 1.6, u * 0.9, light);
        win(x - u * 0.4, y, u * 1.2, u * 0.8, 3);
        for (let k = 0; k < 2; k++) {
          const px = x + u * (0.9 + k * 1.2);
          line([[px, y], [px, y - u * 1.8]], 0.5);
          line([[px - u * 0.22, y - u * 1.65], [px + u * 0.22, y - u * 1.65]], 0.5);
        }
        ctx.strokeStyle = 'rgb(120 190 145 / 0.3)';
        ctx.beginPath();
        ctx.moveTo(x + u * 0.9, y - u * 1.65);
        ctx.quadraticCurveTo(x + u * 1.5, y - u * 1.4, x + u * 2.1, y - u * 1.65);
        ctx.stroke();
        break;
      }
      case 'station': {
        line([[x - u * 3, y], [x + u * 3, y]], 0.4);
        line([[x - u * 3, y - u * 0.15], [x + u * 3, y - u * 0.15]], 0.4);
        this.block(x - u * 0.2, y - u * 0.2, u * 2.2, u * 0.9, light);
        win(x - u * 0.2, y - u * 0.2, u * 2, u * 0.8, 4);
        this.face([[x - u * 1.6, y - u * 1.1], [x + u * 1.2, y - u * 1.1], [x + u * 1.4, y - u * 1.3], [x - u * 1.8, y - u * 1.3]], y - u * 1.3, y - u * 1.1, light + 0.6);
        // Water tower.
        this.block(x + u * 2.1, y - u * 1.3, u * 0.7, u * 0.6, light + 0.2);
        line([[x + u * 1.85, y], [x + u * 1.9, y - u * 1.3]], 0.4);
        line([[x + u * 2.35, y], [x + u * 2.3, y - u * 1.3]], 0.4);
        break;
      }
      default:
        break;
    }
  }

  /**
   * The heap over a district: a ragged mound, dark at the foot, lit along its crest, with
   * what it swallowed sticking out of it: bags, tyres, planks, a fridge door, and the roof
   * or the cross of what stood there. While a district is being buried, junk rains down
   * and the mound grows.
   */
  private heap(sp: Spot, grown: number, t: number): void {
    const { ctx } = this;
    const { x, y, u } = sp;
    const home = sp.type === 'dump';
    const r = stream(sp.seed + 5);
    // Wide and low, so neighbouring heaps run into one another as one landscape.
    const hw = u * (home ? 4 : 3.3 + r() * 0.9);
    const hh = u * (home ? 2.6 : 1.1 + r() * 0.9) * grown;
    // A ragged crest: random heights, the highest near the middle.
    const n = 14;
    const crest: [number, number][] = [];
    for (let k = 0; k <= n; k++) {
      const a = k / n;
      const env = Math.sin(a * Math.PI) ** 0.8;
      crest.push([x - hw + a * hw * 2, y - env * hh * (0.75 + r() * 0.4)]);
    }
    // What stood there, half under: the roof, the dome, the chimney.
    if (!home && grown > 0.5) {
      const kind = sp.type;
      const rx = x + (r() - 0.5) * hw * 0.6;
      const ry = y - hh * 0.75;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate((r() - 0.5) * 0.6);
      if (kind === 'church') {
        this.face([[-u * 0.2, 0], [-u * 0.25, -u * 0.4], [0, -u * 0.7], [u * 0.25, -u * 0.4], [u * 0.2, 0]], -u * 0.7, 0, 0.6);
        this.edge([[0, -u * 0.7], [0, -u * 1.2]], 0.6);
        this.edge([[-u * 0.15, -u], [u * 0.15, -u]], 0.6);
      } else if (kind === 'prom' || kind === 'boiler') {
        this.face([[-u * 0.12, 0], [-u * 0.09, -u * 1.4], [u * 0.09, -u * 1.4], [u * 0.12, 0]], -u * 1.4, 0, 0.5);
      } else {
        this.face([[-u * 0.5, 0], [0, -u * 0.45], [u * 0.5, 0]], -u * 0.45, 0, 0.7);
        this.edge([[-u * 0.5, 0], [0, -u * 0.45], [u * 0.5, 0]], 0.4);
      }
      ctx.restore();
    }
    // The body of the heap.
    const g = ctx.createLinearGradient(0, y - hh, 0, y);
    g.addColorStop(0, home ? '#1a3624' : '#13281b');
    g.addColorStop(1, '#0a1a10');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - hw, y + 1);
    for (const [px, py] of crest) ctx.lineTo(px, py);
    ctx.lineTo(x + hw, y + 1);
    ctx.closePath();
    ctx.fill();
    // Texture: scraps catching the light, more of them near the top.
    for (let k = 0; k < 26; k++) {
      const a = r();
      const i = Math.min(n - 1, Math.floor(a * n));
      const top = crest[i][1];
      const py = top + (y - top) * r() ** 1.6;
      ctx.fillStyle = `rgb(120 190 145 / ${0.08 + (1 - (py - top) / Math.max(1, y - top)) * 0.25})`;
      ctx.fillRect(x - hw + a * hw * 2, py, 1 + r() * u * 0.2, 1);
    }
    // Things on the crest, in silhouette with a lit edge.
    for (let k = 1; k < n; k += 1 + Math.floor(r() * 2)) {
      const [px, py] = crest[k];
      const kind = Math.floor(r() * 5);
      const s = u * (0.25 + r() * 0.2);
      ctx.save();
      ctx.translate(px, py + s * 0.3);
      ctx.rotate((r() - 0.5) * 1.2);
      ctx.fillStyle = '#0b1a11';
      ctx.strokeStyle = 'rgb(150 220 170 / 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (kind === 0) {
        // A bag, tied at the top.
        ctx.ellipse(0, 0, s * 0.6, s * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.5, Math.PI * 1.15, Math.PI * 1.7);
        ctx.stroke();
      } else if (kind === 1) {
        // A tyre on its edge.
        ctx.ellipse(0, -s * 0.2, s * 0.5, s * 0.5, 0, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(1.2, s * 0.25);
        ctx.strokeStyle = '#0b1a11';
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgb(150 220 170 / 0.35)';
        ctx.beginPath();
        ctx.arc(0, -s * 0.2, s * 0.6, Math.PI * 1.1, Math.PI * 1.6);
        ctx.stroke();
      } else if (kind === 2) {
        // A plank sticking out.
        ctx.rect(-s * 0.08, -s * 1.3, s * 0.16, s * 1.3);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-s * 0.08, -s * 1.3);
        ctx.lineTo(-s * 0.08, 0);
        ctx.stroke();
      } else if (kind === 3) {
        // A fridge, or a cupboard, on its side.
        ctx.rect(-s * 0.5, -s * 0.7, s, s * 0.7);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-s * 0.5, -s * 0.7);
        ctx.lineTo(s * 0.5, -s * 0.7);
        ctx.stroke();
      } else {
        // A chair, legs up.
        ctx.moveTo(-s * 0.3, 0);
        ctx.lineTo(-s * 0.3, -s * 0.8);
        ctx.moveTo(s * 0.3, 0);
        ctx.lineTo(s * 0.3, -s * 0.8);
        ctx.moveTo(-s * 0.35, -s * 0.15);
        ctx.lineTo(s * 0.35, -s * 0.15);
        ctx.stroke();
      }
      ctx.restore();
    }
    // Moonlight along the crest.
    this.edge(crest, home ? 0.4 : 0.12 + 0.12 * sp.near);
    // Under the heap, now and then, a window still lights up. Red.
    if (!home && grown >= 1 && Math.sin(this.t * 0.6 + sp.seed) > 0.985) {
      ctx.fillStyle = '#ff6b57';
      ctx.fillRect(x + (r() - 0.5) * hw, y - hh * 0.3, 2, 2);
    }
    if (t < BURY) {
      for (let k = 0; k < 18; k++) {
        const fall = ((t * 1.6 + k * 0.13) % 1) * (u * 4);
        ctx.fillStyle = C.items[k % C.items.length];
        ctx.globalAlpha = 1 - t / BURY;
        ctx.fillRect(x + (r() - 0.5) * hw * 1.6, y - u * 4.5 + fall, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
  }

  /** The pit: a black mouth in the ground, wider than any district, breathing red. */
  private pit(sp: Spot, open: boolean, inhaling: number): void {
    const { ctx } = this;
    const { x, y, u } = sp;
    const rw = u * 4.6;
    const rh = u * 1.1;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, rw * 1.4);
    glow.addColorStop(0, `rgb(255 80 60 / ${(open ? 0.35 : 0.2) + 0.1 * Math.sin(this.t * 0.9) + inhaling * 0.25})`);
    glow.addColorStop(1, 'rgb(255 80 60 / 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - rw * 1.4, y - rw * 1.4, rw * 2.8, rw * 2.8);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgb(255 107 87 / ${0.45 + 0.2 * Math.sin(this.t * 0.8)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, y, rw, rh, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    // Heat over it: the air bends.
    ctx.strokeStyle = 'rgb(255 107 87 / 0.12)';
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      for (let s = 0; s <= 1; s += 0.1) {
        const yy = y - rh - s * u * 3;
        const xx = x + (k - 1) * u + Math.sin(s * 6 + this.t * 1.5 + k) * u * 0.25;
        if (s === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
  }

  /**
   * Pipes and bags up out of the pit: they rise, feel about the edge, and go back down.
   * Made of what was thrown away: pipe joints for a spine, a bag swelling at the tip.
   */
  private pipes(sp: Spot): void {
    if (this.rise <= 0) return;
    const { ctx } = this;
    const { x, y, u } = sp;
    const up = Math.min(1, this.rise / 2.5) * Math.min(1, (9 - this.rise) / 2);
    if (up <= 0) return;
    for (let k = 0; k < 4; k++) {
      const base = x + (k - 1.5) * u * 1.4;
      const len = u * (3.5 + k * 0.7) * up;
      const pts: [number, number][] = [];
      for (let s = 0; s <= 1; s += 0.1) {
        const sway = Math.sin(this.t * (1 + k * 0.3) + s * 3 + k) * u * 0.9 * s;
        pts.push([base + sway + (k - 1.5) * s * u * 0.8, y - s * len]);
      }
      this.actor(() => {
        ctx.beginPath();
        pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.lineWidth = Math.max(2, u * 0.3);
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#06120a';
        ctx.stroke();
        ctx.lineCap = 'butt';
        // Joints along the pipe.
        for (let i = 2; i < pts.length; i += 2) this.circle(pts[i][0], pts[i][1], Math.max(1.2, u * 0.2), C.heapBack, 0.8);
        // A bag at the tip, swelling.
        const [tx, ty] = pts[pts.length - 1];
        this.circle(tx, ty, u * (0.35 + 0.08 * Math.sin(this.t * 3 + k)), '#0a1a10', 1);
      });
    }
  }

  /** Small figures walking out of town to the heap; they fade as they reach it. */
  private people(): void {
    const { ctx } = this;
    for (const wk of this.walkers) {
      const a = wk.t / wk.dur;
      const px = wk.x0 + (wk.x1 - wk.x0) * a;
      const py = wk.y0 + (wk.y1 - wk.y0) * a;
      const s = wk.u * 0.32;
      ctx.globalAlpha = a > 0.8 ? (1 - a) * 5 : Math.min(1, wk.t);
      ctx.fillStyle = '#c8ffd2';
      const bob = Math.abs(Math.sin(wk.t * 5)) * s * 0.15;
      ctx.fillRect(px - s * 0.18, py - s * 1.6 - bob, s * 0.36, s * 1.2);
      ctx.fillRect(px - s * 0.14, py - s * 2 - bob, s * 0.28, s * 0.32);
      ctx.globalAlpha = 1;
    }
  }

  /** Corners around the district picked on the plan, and a small mark over it. */
  private marker(id: string): void {
    const sp = this.spots.find((s) => s.id === id);
    if (!sp || !districtById(id)) return;
    const { ctx } = this;
    const bw = sp.u * (sp.type === 'pit' ? 4 : 2.2);
    const top = sp.y - sp.u * (sp.type === 'church' ? 3.8 : 2.2);
    const bottom = sp.y + sp.u * 0.4;
    const c = sp.u * 0.5;
    ctx.strokeStyle = AMBER;
    ctx.globalAlpha = 0.6 + 0.3 * Math.sin(this.t * 4);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const [cx, cy, dx, dy] of [
      [sp.x - bw, top, 1, 1],
      [sp.x + bw, top, -1, 1],
      [sp.x - bw, bottom, 1, -1],
      [sp.x + bw, bottom, -1, -1],
    ]) {
      ctx.moveTo(cx + dx * c, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * c);
    }
    ctx.stroke();
    const bob = Math.sin(this.t * 3) * 2;
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.moveTo(sp.x - 3, top - 7 + bob);
    ctx.lineTo(sp.x + 3, top - 7 + bob);
    ctx.lineTo(sp.x, top - 3 + bob);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
