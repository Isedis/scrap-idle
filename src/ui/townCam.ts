import { DISTRICTS, districtById, type DistrictType } from '../game/city';
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

    // Sky with low cloud, lit from below by the pit.
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6);
    sky.addColorStop(0, '#020805');
    sky.addColorStop(1, '#0b2214');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 5; k++) {
      const cx = ((k * 0.27 + this.t * 0.004 * (1 + k * 0.3)) % 1.3) * w - w * 0.15;
      const g = ctx.createRadialGradient(cx, h * (0.12 + k * 0.05), 0, cx, h * (0.12 + k * 0.05), w * 0.22);
      g.addColorStop(0, 'rgb(40 80 55 / 0.18)');
      g.addColorStop(1, 'rgb(40 80 55 / 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h * 0.6);
    }
    const red = ctx.createRadialGradient(pit.x, pit.y, 0, pit.x, pit.y - h * 0.15, w * 0.35);
    red.addColorStop(0, `rgb(255 80 60 / ${0.16 + 0.06 * Math.sin(this.t * 0.9) + inhaling * 0.2})`);
    red.addColorStop(1, 'rgb(255 80 60 / 0)');
    ctx.fillStyle = red;
    ctx.fillRect(0, 0, w, h);

    // Hills on the horizon, then the ground.
    const horizon = this.project(0.5, -0.05).y;
    ctx.fillStyle = '#071a0f';
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let x = 0; x <= w; x += 8) ctx.lineTo(x, horizon - 6 - Math.sin(x * 0.02) * 5 - Math.sin(x * 0.007 + 1) * 7);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();
    const ground = ctx.createLinearGradient(0, horizon, 0, h);
    ground.addColorStop(0, '#0a1f12');
    ground.addColorStop(1, '#0c2416');
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, w, h - horizon);

    // The river along the west of the town.
    for (const sp of this.spots) if (sp.type === 'river') this.water(sp);

    // The districts, far to near.
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
      // Street lamps along the row.
      if (!owned && !dark && sp.type !== 'cemetery') {
        const lx = sp.x - sp.u * 1.6;
        ctx.fillStyle = `rgb(200 255 210 / ${0.5 + 0.15 * Math.sin(this.t * 3 + sp.seed)})`;
        ctx.fillRect(lx, sp.y - sp.u * 1.3, 1.5, 1.5);
        const halo = ctx.createRadialGradient(lx, sp.y - sp.u * 1.3, 0, lx, sp.y - sp.u * 1.3, sp.u * 0.9);
        halo.addColorStop(0, 'rgb(200 255 210 / 0.12)');
        halo.addColorStop(1, 'rgb(200 255 210 / 0)');
        ctx.fillStyle = halo;
        ctx.fillRect(lx - sp.u, sp.y - sp.u * 2.3, sp.u * 2, sp.u * 2);
      }
    }

    // Smoke.
    for (const p of this.puffs) {
      ctx.fillStyle = `rgb(130 180 145 / ${0.16 * (1 - p.life / 5)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    this.pipes(pit);
    this.people();
    this.marker(v.selected);

    // Haze over the far rows.
    const haze = ctx.createLinearGradient(0, horizon - 10, 0, h * 0.85);
    haze.addColorStop(0, 'rgb(20 45 30 / 0.55)');
    haze.addColorStop(1, 'rgb(20 45 30 / 0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - 10, w, h);
    if (dark) {
      ctx.fillStyle = 'rgb(0 0 0 / 0.4)';
      ctx.fillRect(0, 0, w, h);
    }
    this.vignette(0.35);
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

  /** A gabled house; returns where its windows can go. */
  private house(x: number, y: number, bw: number, bh: number, fill: string): void {
    this.poly(
      [
        [x - bw / 2, y],
        [x - bw / 2, y - bh],
        [x, y - bh - bw * 0.45],
        [x + bw / 2, y - bh],
        [x + bw / 2, y],
      ],
      fill,
      1,
    );
  }

  private windows(x: number, y: number, bw: number, bh: number, n: number, sp: Spot, dark: boolean, people: number, inhaling: number, pit: Spot): void {
    if (dark) return;
    const { ctx } = this;
    const r = stream(sp.seed + Math.round(x));
    // The pit takes the light from the windows nearest to it first.
    const drawn = inhaling > 0 && Math.hypot(sp.x - pit.x, sp.y - pit.y) < this.w * 0.35 * inhaling;
    for (let k = 0; k < n; k++) {
      const px = x - bw / 2 + bw * (0.2 + 0.6 * r());
      const py = y - bh * (0.25 + 0.55 * r());
      if (r() > 0.25 + 0.55 * people || drawn) continue;
      ctx.fillStyle = C.light;
      ctx.globalAlpha = 0.5 + 0.15 * Math.sin(this.t * 0.8 + px);
      const s = Math.max(1, sp.u * 0.13);
      ctx.fillRect(px, py, s, s);
    }
    ctx.globalAlpha = 1;
    if (drawn && Math.random() < 0.15) {
      // A mote of light drifting off toward the pit.
      const k = Math.random();
      ctx.fillStyle = 'rgb(200 255 210 / 0.7)';
      ctx.fillRect(x + (pit.x - x) * k, y - bh / 2 + (pit.y - y + bh / 2) * k, 1.5, 1.5);
    }
  }

  /** A district still standing, drawn as what it is. */
  private district(sp: Spot, dark: boolean, people: number, inhaling: number, pit: Spot): void {
    const { ctx } = this;
    const { x, y, u } = sp;
    const r = stream(sp.seed);
    const fill = sp.near > 0.6 ? '#16402a' : sp.near > 0.3 ? '#123321' : '#0e2a1b';
    const win = (wx: number, wy: number, bw: number, bh: number, n: number) => this.windows(wx, wy, bw, bh, n, sp, dark, people, inhaling, pit);
    switch (sp.type) {
      case 'live': {
        for (let k = 0; k < 4; k++) {
          const hx = x + (k - 1.5) * u * 1.05 + (r() - 0.5) * u * 0.4;
          const bw = u * (0.8 + r() * 0.4);
          const bh = u * (0.6 + r() * 0.5);
          const hy = y - (k % 2) * u * 0.25;
          this.house(hx, hy, bw, bh, fill);
          win(hx, hy, bw, bh, 2);
        }
        break;
      }
      case 'prom':
      case 'boiler': {
        const bw = u * (sp.type === 'prom' ? 3.2 : 2);
        const bh = u * 0.9;
        this.box(x - bw / 2, y - bh, bw, bh, fill, 1);
        if (sp.type === 'prom') {
          // Sawtooth roof.
          const pts: [number, number][] = [[x - bw / 2, y - bh]];
          for (let k = 0; k < 4; k++) {
            pts.push([x - bw / 2 + (k + 0.8) * (bw / 4), y - bh - u * 0.4], [x - bw / 2 + (k + 1) * (bw / 4), y - bh]);
          }
          this.poly(pts, fill, 1);
        }
        const c = this.chimney(sp);
        this.box(c.x - u * 0.13, c.y, u * 0.26, y - bh - c.y, fill, 1);
        win(x, y, bw, bh, 4);
        break;
      }
      case 'church': {
        this.house(x, y, u * 1.4, u * 1.1, fill);
        this.box(x - u * 0.35, y - u * 2.4, u * 0.7, u * 1.4, fill, 1);
        // Onion dome and the cross.
        ctx.beginPath();
        ctx.moveTo(x - u * 0.35, y - u * 2.4);
        ctx.quadraticCurveTo(x - u * 0.5, y - u * 2.9, x, y - u * 3.2);
        ctx.quadraticCurveTo(x + u * 0.5, y - u * 2.9, x + u * 0.35, y - u * 2.4);
        this.paint(fill, 1);
        ctx.strokeStyle = C.lime;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y - u * 3.2);
        ctx.lineTo(x, y - u * 3.7);
        ctx.moveTo(x - u * 0.15, y - u * 3.5);
        ctx.lineTo(x + u * 0.15, y - u * 3.5);
        ctx.stroke();
        win(x, y, u * 1.2, u * 1, 2);
        break;
      }
      case 'cemetery': {
        ctx.strokeStyle = C.deep;
        ctx.lineWidth = 1;
        for (let k = 0; k < 9; k++) {
          const gx = x + (r() - 0.5) * u * 3.4;
          const gy = y - r() * u * 0.6;
          const s = u * 0.35;
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.lineTo(gx, gy - s);
          ctx.moveTo(gx - s * 0.35, gy - s * 0.7);
          ctx.lineTo(gx + s * 0.35, gy - s * 0.7);
          ctx.stroke();
        }
        // A bare tree.
        ctx.beginPath();
        ctx.moveTo(x + u, y);
        ctx.lineTo(x + u, y - u * 1.5);
        ctx.lineTo(x + u * 1.4, y - u * 2);
        ctx.moveTo(x + u, y - u * 1.1);
        ctx.lineTo(x + u * 0.6, y - u * 1.6);
        ctx.stroke();
        break;
      }
      case 'school': {
        const bw = u * 2.6;
        const bh = u * 1.3;
        this.box(x - bw / 2, y - bh, bw, bh, fill, 1);
        this.poly([[x - bw / 2 - 2, y - bh], [x, y - bh - u * 0.5], [x + bw / 2 + 2, y - bh]], fill, 1);
        ctx.strokeStyle = C.deep;
        ctx.beginPath();
        ctx.moveTo(x + bw / 2 + u * 0.4, y);
        ctx.lineTo(x + bw / 2 + u * 0.4, y - u * 2.4);
        ctx.stroke();
        const wave = Math.sin(this.t * 2.5) * u * 0.1;
        this.poly([[x + bw / 2 + u * 0.4, y - u * 2.4], [x + bw / 2 + u * 1.1, y - u * 2.2 + wave], [x + bw / 2 + u * 0.4, y - u * 2]], C.green, 0);
        win(x, y, bw, bh, 5);
        break;
      }
      case 'market': {
        for (let k = 0; k < 3; k++) {
          const mx = x + (k - 1) * u * 1.1;
          this.box(mx - u * 0.45, y - u * 0.6, u * 0.9, u * 0.6, fill, 1);
          this.poly([[mx - u * 0.55, y - u * 0.6], [mx, y - u * 1], [mx + u * 0.55, y - u * 0.6]], k % 2 ? C.deep : fill, 1);
        }
        break;
      }
      case 'archive': {
        const bw = u * 2.2;
        this.box(x - bw / 2, y - u * 1.2, bw, u * 1.2, fill, 1);
        this.poly([[x - bw / 2 - 2, y - u * 1.2], [x, y - u * 1.7], [x + bw / 2 + 2, y - u * 1.2]], fill, 1);
        ctx.strokeStyle = C.deep;
        for (let k = 0; k < 5; k++) {
          const cx = x - bw / 2 + (k + 0.5) * (bw / 5);
          ctx.beginPath();
          ctx.moveTo(cx, y);
          ctx.lineTo(cx, y - u * 1.1);
          ctx.stroke();
        }
        break;
      }
      case 'hospital': {
        const bw = u * 2.8;
        const bh = u * 1.6;
        this.box(x - bw / 2, y - bh, bw, bh, fill, 1);
        ctx.fillStyle = C.light;
        ctx.globalAlpha = 0.75;
        ctx.fillRect(x - u * 0.08, y - bh - u * 0.6, u * 0.16, u * 0.5);
        ctx.fillRect(x - u * 0.25, y - bh - u * 0.43, u * 0.5, u * 0.16);
        ctx.globalAlpha = 1;
        win(x, y, bw, bh, 7);
        break;
      }
      case 'depot': {
        this.box(x - u * 1.5, y - u * 0.9, u * 2.2, u * 0.9, fill, 1);
        for (let k = 0; k < 2; k++) {
          ctx.beginPath();
          ctx.arc(x - u * 0.9 + k * u, y, u * 0.35, Math.PI, 0);
          this.paint('#06120a', 1);
        }
        // A lorry in the yard.
        this.box(x + u * 0.9, y - u * 0.5, u * 0.8, u * 0.4, fill, 1);
        this.box(x + u * 1.7, y - u * 0.35, u * 0.3, u * 0.25, fill, 1);
        break;
      }
      case 'post': {
        this.house(x - u * 0.4, y, u * 1.6, u * 0.9, fill);
        win(x - u * 0.4, y, u * 1.6, u * 0.9, 2);
        // Telegraph poles and the wire.
        ctx.strokeStyle = C.deep;
        ctx.beginPath();
        for (let k = 0; k < 2; k++) {
          const px = x + u * (0.9 + k * 1.2);
          ctx.moveTo(px, y);
          ctx.lineTo(px, y - u * 1.8);
          ctx.moveTo(px - u * 0.2, y - u * 1.65);
          ctx.lineTo(px + u * 0.2, y - u * 1.65);
        }
        ctx.moveTo(x + u * 0.9, y - u * 1.65);
        ctx.quadraticCurveTo(x + u * 1.5, y - u * 1.4, x + u * 2.1, y - u * 1.65);
        ctx.stroke();
        break;
      }
      case 'station': {
        ctx.strokeStyle = C.deep;
        ctx.beginPath();
        ctx.moveTo(x - u * 3, y);
        ctx.lineTo(x + u * 3, y);
        ctx.moveTo(x - u * 3, y - u * 0.15);
        ctx.lineTo(x + u * 3, y - u * 0.15);
        ctx.stroke();
        this.box(x - u * 1.4, y - u * 1.1, u * 2.8, u * 0.12, fill, 1);
        for (const k of [-1.2, 0, 1.2]) this.box(x + k * u - 1, y - u * 1, 2, u * 0.85, fill, 0);
        // Water tower.
        this.box(x + u * 1.8, y - u * 1.9, u * 0.7, u * 0.6, fill, 1);
        this.box(x + u * 2.1, y - u * 1.3, u * 0.12, u * 1.3, fill, 0);
        break;
      }
      default:
        break;
    }
  }

  /** The heap over a district; while it is being buried, junk rains down and the mound grows. */
  private heap(sp: Spot, grown: number, t: number): void {
    const { ctx } = this;
    const { x, y, u } = sp;
    const home = sp.type === 'dump';
    const hw = u * (home ? 3.6 : 2.6);
    const hh = u * (home ? 2.6 : 1.7) * grown;
    const r = stream(sp.seed + 5);
    ctx.beginPath();
    ctx.moveTo(x - hw, y + 1);
    for (let k = 0; k <= 12; k++) {
      const a = k / 12;
      const bump = Math.sin(a * Math.PI) * hh * (0.85 + 0.25 * r());
      ctx.lineTo(x - hw + a * hw * 2, y - bump);
    }
    ctx.closePath();
    this.paint(C.heapBack, 1.2);
    // Junk on it: boxes, bags.
    for (let k = 0; k < 8; k++) {
      const a = 0.15 + r() * 0.7;
      const jx = x - hw + a * hw * 2;
      const jy = y - Math.sin(a * Math.PI) * hh * (0.3 + r() * 0.6);
      if (k % 3 === 0) this.circle(jx, jy, u * 0.18, C.heapFront, 0.8);
      else this.box(jx, jy, u * (0.2 + r() * 0.3), u * 0.15, C.heapFront, 0.8);
    }
    // Under the heap, now and then, a window still lights up. Red.
    if (!home && grown >= 1 && Math.sin(this.t * 0.6 + sp.seed) > 0.985) {
      ctx.fillStyle = '#ff6b57';
      ctx.fillRect(x + (r() - 0.5) * hw, y - hh * 0.3, 2, 2);
    }
    if (t < BURY) {
      // Junk coming down on it.
      for (let k = 0; k < 14; k++) {
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
    const rw = u * 3.6;
    const rh = u * 0.9;
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
