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
   * The thing: seen from behind, too tall for the corridor. On the walk only in a flicker
   * or, faintly, while it stands listening; at the door it stays, knocks with a long arm,
   * and at the whisper turns its head to the lens.
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
      alpha = this.listening ? 0.35 : this.glimpse > 0 ? 0.9 : 0;
    } else return;
    if (alpha <= 0.01) return;
    const { ctx } = this;
    const u = going > 0 ? -going * 0.9 : 0;
    const s = this.s(d);
    let [fx, fy] = this.p(u, 0, d);
    // It does not move smoothly: a few frames a second, each a little off.
    const frame = Math.floor(this.t * 10);
    fx += Math.sin(frame * 12.9898) * s * 6;
    fy += Math.cos(frame * 78.233) * s * 2;
    const tall = (this.h - this.vy) * s * 2.1;
    const half = (this.w / 2) * s * 0.16;
    ctx.save();
    ctx.globalAlpha = alpha * (lit > 0 ? 1 : 0.8);
    ctx.fillStyle = '#000';
    ctx.strokeStyle = 'rgb(130 214 152 / 0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(fx, fy - tall + half * 1.1, half * 0.8, half * 1.1, 0, 0, Math.PI * 2);
    ctx.moveTo(fx - half * 1.3, fy - tall + half * 2.4);
    ctx.lineTo(fx + half * 1.3, fy - tall + half * 2.4);
    ctx.lineTo(fx + half * 0.7, fy - tall * 0.45);
    ctx.lineTo(fx + half * 0.8, fy);
    ctx.lineTo(fx - half * 0.8, fy);
    ctx.lineTo(fx - half * 0.7, fy - tall * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Facing the lens in a glimpse: eyes and a mouth that is too wide.
    const ey = fy - tall + half * 1.1;
    if (v.phase === 'walk' && this.facing && this.glimpse > 0) {
      ctx.fillStyle = C.light;
      ctx.fillRect(fx - half * 0.45, ey - half * 0.2, Math.max(1, half * 0.3), Math.max(1, half * 0.3));
      ctx.fillRect(fx + half * 0.15, ey - half * 0.1, Math.max(1, half * 0.3), Math.max(1, half * 0.3));
      ctx.fillStyle = '#d8ffdc';
      ctx.fillRect(fx - half * 0.35, ey + half * 0.45, half * 0.7, Math.max(1, half * 0.25));
    }
    if (v.phase === 'check' && going === 0) {
      // An arm up to the door: knocking, then on the handle.
      const knock = this.t - this.beatAt.knock;
      const rattle = this.t - this.beatAt.rattle;
      const [hx, hy] = this.p(0.28, 0.36, 1);
      const reach: [number, number] =
        rattle < 0.8 ? [hx + Math.sin(rattle * 40), hy] : knock < 1.4 ? [fx + half * 0.5, fy - tall * 0.55 - (Math.sin(knock * 11) > 0 ? 2 : 0)] : [fx + half * 1.6, fy - tall * 0.3];
      this.line(fx + half * 1.2, fy - tall + half * 2.6, reach[0], reach[1], '#000', Math.max(1.5, half * 0.5));
      // Through the silence its head turns, slowly, all the way round to the lens.
      const turn = Math.min(Math.max((v.held - 2) / 6, 0), 1);
      if (turn > 0.35) {
        ctx.fillStyle = C.light;
        ctx.globalAlpha = (turn - 0.35) / 0.65 * (0.7 + 0.3 * Math.sin(this.t * 7));
        const shift = (1 - turn) * half * 0.6;
        ctx.fillRect(fx - half * 0.45 + shift, ey, Math.max(1, half * 0.3), Math.max(1, half * 0.3));
        ctx.fillRect(fx + half * 0.15 + shift, ey + 0.4, Math.max(1, half * 0.3), Math.max(1, half * 0.3));
        // At the end the mouth opens.
        if (turn > 0.85) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#000';
          ctx.beginPath();
          ctx.ellipse(fx + shift * 0.5, ey + half * 0.75, half * 0.3, half * 0.5 * ((turn - 0.85) / 0.15), 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgb(200 255 210 / 0.5)';
          ctx.stroke();
        }
      }
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
