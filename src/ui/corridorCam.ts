import { Camera } from './camera';
import { C } from './scene';
import { HOLD_SECONDS } from '../game/hearing';

/** What camera 07 needs to know about the one that listens. */
export interface CorridorView {
  phase: 'idle' | 'walk' | 'check' | 'caught';
  /** How far along the corridor it is, 0..1. */
  near: number;
  /** Seconds of silence held at the door. */
  held: number;
}

const HUD_RED = '#ff6b57';
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Camera 07: the corridor from the plant to the booth, outside the plant. The camera
 * hangs at the plant end and looks down the corridor at the booth door, the player's
 * door, at the far end. The one that listens walks away from the lens toward it: wet
 * prints along the floor, a shape seen only when the tubes flicker, always from behind.
 * At the door it knocks, tries the handle and, at the whisper, turns its head to the lens.
 */
export class CorridorCam extends Camera<CorridorView> {
  /** Wet prints on the floor: depth along the corridor and side. */
  private prints: { d: number; u: number; age: number }[] = [];
  private leftFoot = false;
  private jolt = 0;
  /** It stopped to listen: the tubes go out. */
  listening = false;
  private audio: { text: string; until: number } | null = null;
  private beatAt = { knock: -99, rattle: -99, whisper: -99 };
  private leftAt = -1;
  /** Tubes off for a moment; the shape shows when they come back. */
  private dark = 0;
  private glimpse = 0;
  /** The glimpse shows it facing the lens, not walking away. */
  private facing = false;
  private zoom = 1;
  /** Claw marks it leaves along the walls: depth, side, height. */
  private scratches: { d: number; side: -1 | 1; v: number }[] = [];
  /** Called when it is seen facing the lens: the sound of that moment. */
  onSting: () => void = () => {};

  constructor() {
    super('КАМ-07 · КОРИДОР К БУДКЕ', 'Камера в коридоре к будке охраны');
    this.root.classList.add('plant');
    // It is really here: no flickering stand-in on this camera.
    this.lurks = false;
  }

  // ---- Perspective -----------------------------------------------------------------------

  private get vx() {
    return this.w * 0.5;
  }
  private get vy() {
    return this.h * 0.42;
  }
  /** Scale at a depth: 1 at the lens, a sixth at the booth door. */
  private s(d: number) {
    return 1 / (1 + 5 * d);
  }
  /** Screen point of a spot in the corridor: across (-1..1), up (0 floor..1 ceiling), depth (0..1). */
  private p(u: number, v: number, d: number): [number, number] {
    const s = this.s(d);
    return [this.vx + u * (this.w / 2) * s, this.vy + (this.h - this.vy) * s * (1 - v) - this.vy * s * v];
  }

  // ---- What happens ---------------------------------------------------------------------

  /** A step; returns true when it dragged its claws along the wall as well. */
  huntStep(near: number, pan: number): boolean {
    this.leftFoot = !this.leftFoot;
    const d = Math.min(near * 0.95, 0.95);
    this.prints.push({ d, u: this.leftFoot ? -0.12 : 0.12, age: 0 });
    this.jolt = Math.max(this.jolt, 0.2 + 0.3 * near);
    if (Math.random() < 0.45) this.dark = rnd(0.08, 0.25);
    const scratch = Math.random() < 0.3;
    if (scratch) {
      this.scratches.push({ d, side: Math.random() < 0.5 ? -1 : 1, v: rnd(0.35, 0.7) });
      this.say('СКРЕЖЕТ ПО СТЕНЕ', 1.8);
    } else this.say(`ШАГИ · ${pan < -0.35 ? 'СЛЕВА' : pan > 0.35 ? 'СПРАВА' : 'В КОРИДОРЕ'}`, 1.6);
    return scratch;
  }

  huntLunge(): void {
    this.jolt = 1;
    this.flash();
    this.glitch(0.5);
    this.glimpse = 0.5;
    this.say('УДАР · СОВСЕМ РЯДОМ С ДВЕРЬЮ', 2);
  }

  huntBeat(kind: 'knock' | 'rattle' | 'whisper'): void {
    this.beatAt[kind] = this.t;
    if (kind === 'knock') this.jolt = 0.6;
    if (kind === 'whisper') this.glitch(0.3);
    this.say(kind === 'knock' ? 'СТУК В ДВЕРЬ БУДКИ ×3' : kind === 'rattle' ? 'ДЁРГАЮТ РУЧКУ' : 'ШЁПОТ: «Я ЗНАЮ, ЧТО ТЫ ТАМ»', 2.6);
  }

  huntLeave(): void {
    this.leftAt = this.t;
    this.say('ШАГИ УДАЛЯЮТСЯ', 3);
  }

  /** Still showing it walk away. */
  get leaving(): boolean {
    return this.leftAt >= 0 && this.t - this.leftAt < 4;
  }

  huntClear(): void {
    this.prints = [];
    this.scratches = [];
    this.leftAt = -1;
    this.listening = false;
  }

  say(text: string, seconds: number): void {
    this.audio = { text, until: this.t + seconds };
  }

  protected simulate(dt: number): void {
    const v = this.view!;
    this.jolt = Math.max(0, this.jolt - dt * 3);
    this.dark -= dt;
    // A flicker now and then; the shape shows in the moment the tubes come back.
    if (v.phase === 'walk' && this.dark < -1 && Math.random() < dt * (0.3 + v.near)) {
      this.dark = rnd(0.1, 0.3);
      this.glimpse = rnd(0.15, 0.35);
      // Now and then it is not walking away. It is looking at the lens.
      this.facing = v.near > 0.25 && Math.random() < 0.3;
      if (this.facing) this.onSting();
    }
    if (this.dark <= 0) this.glimpse -= dt;
    for (const p of this.prints) p.age += dt * (this.leftAt >= 0 ? 8 : 1);
    this.prints = this.prints.filter((p) => p.age < 60).slice(-16);
    // At the door the camera closes in, and closer as its head turns.
    const want = v.phase === 'check' ? 1.8 + Math.max(0, (v.held - 6) / 4) * 0.9 : 1;
    this.zoom += (want - this.zoom) * Math.min(dt * 2, 1);
  }

  protected draw(): void {
    const { ctx, w, h } = this;
    const v = this.view!;
    const lit = this.listening ? 0 : this.dark > 0 ? 0.15 : 1;
    ctx.save();
    if (this.jolt > 0 && !this.reducedMotion) ctx.translate(rnd(-1, 1) * this.jolt * 5, rnd(-1, 1) * this.jolt * 4);
    // At the door the camera closes in on it, and the closer, the more on its head.
    if (this.zoom > 1.001) {
      const s = this.s(0.93);
      const [, fy] = this.p(0, 0, 0.93);
      const head = fy - (this.h - this.vy) * s * 2.1;
      const k = Math.min((this.zoom - 1) / 1.7, 1);
      const cy = (head + fy) / 2 + (head + 8 - (head + fy) / 2) * k;
      ctx.translate(w / 2, h / 2);
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-this.vx, -cy);
    }
    this.drawCorridor(lit, this.thingDepth(v));
    this.drawScratches();
    this.drawPrints(lit);
    this.drawDoor(v);
    this.drawThing(v, lit);
    ctx.restore();
    if (lit < 1) {
      ctx.fillStyle = `rgb(0 0 0 / ${0.55 * (1 - lit)})`;
      ctx.fillRect(0, 0, w, h);
    }
    this.drawTape(v);
    if (v.phase === 'check' && v.held > 0) this.drawCountdown(v.held);
    this.drawAudio();
    this.vignette(0.6 + 0.4 * Math.min(v.near, 1));
  }

  /** Where it is along the corridor, or -1 when it is not there. */
  private thingDepth(v: CorridorView): number {
    if (v.phase === 'check') return 0.93;
    if (v.phase === 'walk') return Math.min(v.near * 0.95, 0.93);
    return -1;
  }

  /** An old tape: a rolling bar, torn lines and snow, worse the nearer it is. */
  private drawTape(v: CorridorView): void {
    if (this.reducedMotion) return;
    const { ctx, w, h } = this;
    const bad = v.phase === 'check' ? 0.7 + Math.min(v.held / HOLD_SECONDS, 1) * 0.3 : v.phase === 'walk' ? v.near : 0;
    if (bad <= 0) return;
    const bar = (this.t * 38) % (h + 40) - 20;
    ctx.fillStyle = `rgb(200 255 210 / ${0.05 + 0.07 * bad})`;
    ctx.fillRect(0, bar, w, 14);
    if (Math.random() < 0.15 + bad * 0.4) {
      const y = Math.random() * h;
      const sh = rnd(2, 6);
      ctx.drawImage(this.canvas, 0, y, w, sh, rnd(-12, 12) * bad, y, w, sh);
    }
    ctx.fillStyle = C.light;
    for (let i = 0; i < 40 + bad * 160; i++) {
      ctx.globalAlpha = Math.random() * 0.35 * bad;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1);
    }
    ctx.globalAlpha = 1;
  }

  /** The silence, counted on the picture itself. */
  private drawCountdown(held: number): void {
    const { ctx, w, h } = this;
    const n = Math.ceil(HOLD_SECONDS - held);
    ctx.textAlign = 'center';
    ctx.fillStyle = HUD_RED;
    ctx.font = '700 11px "JetBrains Mono Variable", monospace';
    ctx.fillText('НЕ ДВИГАЙТЕСЬ', w / 2, h * 0.2);
    ctx.font = '700 46px "JetBrains Mono Variable", monospace';
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(this.t * 9);
    ctx.fillText(Math.random() < 0.07 ? '█▓▒?'[Math.floor(Math.random() * 4)] : String(n), w * 0.82, h * 0.62);
    ctx.globalAlpha = 1;
  }

  /** Claw marks along the walls, three at a time. */
  private drawScratches(): void {
    for (const s of this.scratches) {
      for (let k = 0; k < 3; k++) {
        const [x1, y1] = this.p(s.side, s.v + k * 0.04, s.d - 0.06);
        const [x2, y2] = this.p(s.side, s.v + k * 0.04 - 0.08, s.d + 0.04);
        this.line(x1, y1, x2, y2, '#c8ffd2', 1, 0.45);
      }
    }
  }

  private quad(a: [number, number], b: [number, number], c: [number, number], d: [number, number], fill: string): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...b);
    ctx.lineTo(...c);
    ctx.lineTo(...d);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  /** The corridor; tubes nearer the lens than it has gone out behind it. */
  private drawCorridor(lit: number, behind: number): void {
    const { ctx, w } = this;
    ctx.fillStyle = '#020805';
    ctx.fillRect(0, 0, w, this.h);
    const P = (u: number, v: number, d: number) => this.p(u, v, d);
    // Floor, walls, ceiling.
    this.quad(P(-1, 0, 0), P(1, 0, 0), P(1, 0, 1), P(-1, 0, 1), '#0c2216');
    this.quad(P(-1, 0, 0), P(-1, 1, 0), P(-1, 1, 1), P(-1, 0, 1), '#081a10');
    this.quad(P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1), '#081a10');
    this.quad(P(-1, 1, 0), P(1, 1, 0), P(1, 1, 1), P(-1, 1, 1), '#040e08');
    // Floor tiles and wall seams running to the door.
    for (let d = 0.1; d < 1; d += 0.12) {
      const [x1, y1] = P(-1, 0, d);
      const [x2] = P(1, 0, d);
      this.line(x1, y1, x2, y1, C.far, 1, 0.6);
    }
    for (const u of [-0.5, 0, 0.5]) {
      const [x1, y1] = P(u, 0, 0);
      const [x2, y2] = P(u, 0, 1);
      this.line(x1, y1, x2, y2, C.far, 1, 0.5);
    }
    // Doors along the walls, dark.
    for (const [side, d] of [[-1, 0.35], [1, 0.6]] as const) {
      this.quad(P(side, 0, d), P(side, 0.8, d), P(side, 0.8, d + 0.12), P(side, 0, d + 0.12), '#010403');
    }
    // Strip lights on the ceiling, each with its pool on the floor.
    for (const d of [0.08, 0.22, 0.38, 0.55, 0.75]) {
      const [x1, y1] = P(-0.15, 1, d);
      const [x2] = P(0.15, 1, d);
      // The light dies where it has passed under.
      const on = lit > 0.5 && !(behind >= 0 && d < behind - 0.05);
      ctx.fillStyle = on ? C.light : '#1c3a26';
      ctx.fillRect(x1, y1 - 1, x2 - x1, 2.5 * this.s(d) + 1);
      if (on) {
        const [fx, fy] = P(0, 0, d);
        const r = (w / 2) * this.s(d) * 0.8;
        const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
        g.addColorStop(0, 'rgb(200 255 210 / 0.16)');
        g.addColorStop(1, 'rgb(200 255 210 / 0)');
        ctx.fillStyle = g;
        ctx.fillRect(fx - r, fy - r, r * 2, r * 2);
      }
    }
  }

  private drawPrints(lit: number): void {
    const { ctx } = this;
    for (const p of this.prints) {
      const [x, y] = this.p(p.u, 0, p.d);
      const s = this.s(p.d);
      const a = Math.max(0, 1 - p.age / 60) * (lit > 0 ? 1 : 0.5);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#010302';
      ctx.strokeStyle = 'rgb(200 255 210 / 0.5)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.ellipse(x, y, 7 * s + 1, 3 * s + 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** The booth door at the far end, the player's: a lit window and a handle. */
  private drawDoor(v: CorridorView): void {
    const { ctx } = this;
    const P = (u: number, vv: number) => this.p(u, vv, 1);
    const knock = this.t - this.beatAt.knock;
    const shaking = knock < 1.4 && [0, 0.55, 1.1].some((k) => knock > k && knock < k + 0.18);
    ctx.save();
    if (shaking) ctx.translate(rnd(-1.5, 1.5), 0);
    // On a blow the door bulges, as if it might give.
    const bulge = shaking ? 0.06 : 0;
    this.quad(P(-0.4 - bulge, 0), P(-0.4 - bulge, 0.78 + bulge), P(0.4 + bulge, 0.78 + bulge), P(0.4 + bulge, 0), shaking ? '#24553a' : '#163b26');
    const [wx1, wy1] = P(-0.22, 0.66);
    const [wx2, wy2] = P(0.22, 0.48);
    ctx.fillStyle = '#c8ffd2';
    ctx.globalAlpha = 0.75;
    ctx.fillRect(wx1, wy1, wx2 - wx1, wy2 - wy1);
    ctx.globalAlpha = 1;
    // Breath on the window from outside, in the silence.
    if (v.phase === 'check' && v.held > 0 && this.leftAt < 0) {
      ctx.globalAlpha = 0.3 + 0.2 * Math.sin(this.t * 1.6);
      ctx.fillStyle = '#f0fff2';
      ctx.beginPath();
      ctx.ellipse((wx1 + wx2) / 2, (wy1 + wy2) / 2, (wx2 - wx1) * 0.35, (wy2 - wy1) * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // The handle, tried from outside.
    const rattle = this.t - this.beatAt.rattle;
    const angle = rattle < 0.8 ? Math.sin(rattle * 40) * 0.6 : 0;
    const [hx, hy] = P(0.28, 0.36);
    ctx.strokeStyle = C.light;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - Math.cos(angle) * 3, hy + Math.sin(angle) * 3);
    ctx.stroke();
    const [lx, ly] = P(0, 0.84);
    this.label('ОХРАНА', lx, ly, C.green);
    ctx.restore();
  }

  /**
   * The thing: a heap that walks. Black rubbish bags fused into a body that breathes,
   * long jointed legs of rusty pipe ending in fork prongs, cables dripping, and for a
   * head a cluster of gramophone horns, its ears, turning to every sound. On the walk it
   * shows only in a flicker or, faintly, while it stands listening, its horns sweeping the
   * corridor. At the door the horns are pressed to the door: it is listening to the player
   * through it. Through the silence they turn to the lens one by one, an eye glinting deep
   * in each, and at the end a bag tears open on teeth of broken glass.
   */
  private drawThing(v: CorridorView, lit: number): void {
    const going = this.leftAt >= 0 ? Math.min((this.t - this.leftAt) / 3, 1) : 0;
    let d: number;
    let alpha: number;
    if (v.phase === 'check' || going > 0) {
      d = 0.93 - going * 0.3;
      alpha = 1 - going;
    } else if (v.phase === 'walk') {
      d = Math.min(v.near * 0.95, 0.93);
      alpha = this.listening ? 0.45 : this.glimpse > 0 ? 1 : 0;
    } else return;
    if (alpha <= 0.01) return;
    const u = going > 0 ? -going * 0.9 : 0;
    const s = this.s(d);
    let [fx, fy] = this.p(u, 0, d);
    // It does not move smoothly: a few frames a second, each a little off.
    const frame = Math.floor(this.t * 10);
    fx += Math.sin(frame * 12.9898) * s * 6;
    fy += Math.cos(frame * 78.233) * s * 2;
    const size = (this.h - this.vy) * s * 2.2;

    // Which way its horns face: away, sweeping, or at the lens.
    let face = 0;
    let mouth = 0;
    let scan = 0;
    const turn = Math.min(Math.max((v.held - 1.5) / 7, 0), 1);
    if (v.phase === 'walk' && this.facing && this.glimpse > 0) {
      face = 1;
      mouth = 0.7;
    } else if (v.phase === 'walk' && this.listening) scan = 1;
    else if (v.phase === 'check' && going === 0) {
      face = turn;
      mouth = turn > 0.85 ? (turn - 0.85) / 0.15 : 0;
    }
    // A long arm up to the door: knocking, then on the handle.
    let reach: [number, number] | null = null;
    if (v.phase === 'check' && going === 0) {
      const knock = this.t - this.beatAt.knock;
      const rattle = this.t - this.beatAt.rattle;
      const [hx, hy] = this.p(0.28, 0.36, 1);
      if (rattle < 0.8) reach = [hx + Math.sin(rattle * 40), hy];
      else if (knock < 1.4) reach = [fx + size * 0.12, fy - size * 0.55 - (Math.sin(knock * 11) > 0 ? size * 0.05 : 0)];
    }
    this.ctx.save();
    this.ctx.globalAlpha = alpha * (lit > 0 ? 1 : 0.85);
    this.drawCreature(fx, fy, size, { face, mouth, scan, crawl: v.phase === 'walk' && !this.listening, reach });
    this.ctx.restore();
  }

  /** The heap that walks, `size` pixels tall, feet at x, y. */
  private drawCreature(
    x: number,
    y: number,
    size: number,
    o: { face: number; mouth: number; scan: number; crawl: boolean; reach: [number, number] | null },
  ): void {
    const { ctx } = this;
    const k = size / 100;
    const t = this.t;
    const rim = 'rgb(130 214 152 / 0.45)';
    const base = ctx.globalAlpha;
    const sheen = 'rgb(200 255 210 / 0.22)';
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const pipe = (pts: [number, number][], width: number) => {
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.strokeStyle = '#020403';
      ctx.lineWidth = width + 2.5;
      ctx.stroke();
      ctx.strokeStyle = '#2d4a33';
      ctx.lineWidth = width;
      ctx.stroke();
      for (const [px, py] of pts.slice(1, -1)) {
        ctx.beginPath();
        ctx.arc(px, py, width * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = '#0a120c';
        ctx.fill();
        ctx.strokeStyle = rim;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      // Fork prongs at the end.
      const [ex, ey] = pts[pts.length - 1];
      const [qx, qy] = pts[pts.length - 2];
      const a = Math.atan2(ey - qy, ex - qx);
      for (const da of [-0.45, 0, 0.45]) {
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + Math.cos(a + da) * 7, ey + Math.sin(a + da) * 7);
        ctx.strokeStyle = '#9fbfa4';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };

    // Legs of pipe, a spider's: knees high over the body, feet spread to the walls.
    const step = o.crawl ? t * 5 : 0;
    const legs: [number, number, number, number, number][] = [
      // hip x, hip y, knee x, foot x, foot y
      [-14, -40, -52, -78, 4],
      [14, -40, 52, 78, 4],
      [-10, -34, -40, -50, 0],
      [10, -34, 40, 50, 0],
      [-6, -30, -24, -26, -2],
      [6, -30, 24, 26, -2],
    ];
    legs.forEach(([hx, hy, kx, fx, fy], i) => {
      const lift = o.crawl ? Math.max(0, Math.sin(step + i * 1.1)) * 10 : 0;
      const slide = o.crawl ? Math.sin(step + i * 1.1) * 6 : 0;
      pipe([[hx, hy], [kx + slide * 0.5, -96 + Math.abs(kx) * 0.25 - lift], [fx + slide, fy - lift]], i < 2 ? 3.4 : 2.8);
    });

    // The body: bags fused together, breathing.
    const bags: [number, number, number, number][] = [
      [-20, -30, 22, 16],
      [20, -28, 21, 15],
      [0, -38, 26, 19],
      [-30, -44, 14, 12],
      [30, -42, 13, 11],
      [-12, -52, 17, 13],
      [13, -54, 16, 12],
      [0, -62, 14, 11],
      [-4, -24, 16, 10],
    ];
    bags.forEach(([bx, by, rx, ry], i) => {
      const br = 1 + 0.05 * Math.sin(t * 2.2 + i * 1.3);
      ctx.beginPath();
      ctx.ellipse(bx, by, rx * br, ry * br, Math.sin(i) * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = '#030605';
      ctx.fill();
      ctx.strokeStyle = rim;
      ctx.lineWidth = 0.9;
      ctx.stroke();
      // Plastic sheen.
      ctx.beginPath();
      ctx.ellipse(bx - rx * 0.3, by - ry * 0.35, rx * 0.45, ry * 0.25, -0.4, Math.PI * 1.1, Math.PI * 1.8);
      ctx.strokeStyle = sheen;
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Rebar and junk jutting out of the heap.
    for (const [jx, jy, ja, jl] of [[-26, -50, -2.4, 26], [24, -50, -0.7, 22], [-8, -66, -1.9, 18], [32, -34, 0.1, 16]] as const) {
      ctx.beginPath();
      ctx.moveTo(jx, jy);
      ctx.lineTo(jx + Math.cos(ja) * jl, jy + Math.sin(ja) * jl);
      ctx.strokeStyle = '#4f6f55';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // Cables hanging off it, swaying, dripping.
    for (const [cx, cy, len] of [[-24, -30, 26], [8, -26, 22], [26, -28, 24], [-6, -22, 18]] as const) {
      const sway = Math.sin(t * 1.7 + cx) * 5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(cx + sway, cy + len * 0.6, cx + sway * 1.6, cy + len);
      ctx.strokeStyle = '#1c3a26';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      const drip = (t * 0.9 + cx * 0.1) % 1;
      ctx.fillStyle = '#7fb08a';
      ctx.globalAlpha *= 0.8;
      ctx.fillRect(cx + sway * 1.6 - 0.6, cy + len + drip * 30, 1.2, 2.2);
      ctx.globalAlpha /= 0.8;
    }

    // A mouth: a bag torn open on teeth of broken glass.
    if (o.mouth > 0.02) {
      const mw = 20 * o.mouth + 4;
      const mh = 14 * o.mouth;
      ctx.beginPath();
      ctx.ellipse(0, -38, mw, mh, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.fillStyle = '#d8ffdc';
      // Shards, not teeth: uneven, some broken off, leaning every way.
      for (let i = -4; i <= 4; i++) {
        const tx = i * (mw / 5);
        const long = 0.25 + Math.abs(Math.sin(i * 7.3)) * 0.6;
        const lean = Math.sin(i * 3.1) * 2;
        ctx.beginPath();
        ctx.moveTo(tx - 1.8, -38 - mh * 0.85);
        ctx.lineTo(tx + lean, -38 - mh * (0.85 - long));
        ctx.lineTo(tx + 1.6, -38 - mh * 0.85);
        ctx.fill();
        const low = 0.2 + Math.abs(Math.cos(i * 5.7)) * 0.5;
        ctx.beginPath();
        ctx.moveTo(tx - 1.5, -38 + mh * 0.85);
        ctx.lineTo(tx - lean, -38 + mh * (0.85 - low));
        ctx.lineTo(tx + 2, -38 + mh * 0.85);
        ctx.fill();
      }
    }

    // The horns: its ears. Away from the lens they show their cones; turned, their bells
    // open at the lens one by one, an eye glinting deep in each.
    const horns: [number, number, number][] = [
      [-12, -62, -1.0],
      [-4, -66, -0.45],
      [4, -66, 0.1],
      [12, -62, 0.6],
      [0, -60, 1.1],
    ];
    horns.forEach(([hx, hy, spread], i) => {
      const f = Math.min(Math.max(o.face * 5 - i * 0.9, 0), 1);
      const twitch = Math.sin(t * 13 + i * 5) * 0.06 + (o.scan ? Math.sin(t * 0.9 + i * 1.7) * 0.7 : 0);
      const a = -Math.PI / 2 + spread * 0.75 + twitch;
      // A neck of cable, bending up and out, the horn at its end.
      const neck = 26 + (i % 2) * 8;
      const nx0 = hx + Math.cos(a) * neck;
      const ny0 = hy + Math.sin(a) * neck - 6;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.quadraticCurveTo(hx + Math.cos(a - 0.6) * neck * 0.7, hy + Math.sin(a - 0.6) * neck * 0.7, nx0, ny0);
      ctx.strokeStyle = '#020403';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = '#2d4a33';
      ctx.lineWidth = 2;
      ctx.stroke();
      const len = 20 * (1 - 0.6 * f);
      const ex = nx0 + Math.cos(a) * len;
      const ey = ny0 + Math.sin(a) * len;
      const bell = 10;
      const nx = Math.cos(a + Math.PI / 2);
      const ny = Math.sin(a + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(nx0 + nx * 2, ny0 + ny * 2);
      ctx.lineTo(ex + nx * bell, ey + ny * bell);
      ctx.lineTo(ex - nx * bell, ey - ny * bell);
      ctx.lineTo(nx0 - nx * 2, ny0 - ny * 2);
      ctx.closePath();
      ctx.fillStyle = '#0c1a10';
      ctx.fill();
      ctx.strokeStyle = rim;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      // The bell: edge-on away from the lens, a full dark mouth when turned to it.
      ctx.beginPath();
      ctx.ellipse(ex, ey, bell, bell * (0.2 + 0.8 * f), a + Math.PI / 2, 0, Math.PI * 2);
      ctx.fillStyle = f > 0.3 ? '#000' : '#1c3a26';
      ctx.fill();
      ctx.strokeStyle = '#9fbfa4';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      if (f > 0.6) {
        ctx.fillStyle = '#f0fff2';
        ctx.globalAlpha *= 0.6 + 0.4 * Math.sin(t * 9 + i);
        ctx.beginPath();
        ctx.arc(ex + Math.sin(t * 3 + i) * 2 + 2, ey + 1.5, 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = base;
      }
    });

    // A long arm up to the door.
    if (o.reach) {
      const lx = (o.reach[0] - x) / k;
      const ly = (o.reach[1] - y) / k;
      pipe([[14, -44], [lx * 0.5 + 30, ly * 0.5 - 40], [lx, ly]], 2.6);
    }
    ctx.restore();
  }

  /** What the corridor's microphone hears, on a strip at the bottom of the picture. */
  private drawAudio(): void {
    if (!this.audio || this.t > this.audio.until) return;
    const { ctx, w, h } = this;
    ctx.fillStyle = 'rgb(0 0 0 / 0.75)';
    ctx.fillRect(0, h - 14, w, 14);
    ctx.fillStyle = HUD_RED;
    ctx.font = '700 9px "JetBrains Mono Variable", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`АУДИО: ${this.audio.text}`, 8, h - 4);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = Math.random() < 0.7 - i * 0.07 ? HUD_RED : '#2a0c08';
      ctx.fillRect(w - 50 + i * 5, h - 11, 3, 8);
    }
  }
}
