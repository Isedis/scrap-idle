import { Camera } from './camera';
import { C } from './scene';
import type { EventKind } from '../game/story';

/** What camera 03 needs to know about Recycling. */
export interface PlantView {
  /** 0..1: how far this run is toward a recycle; past 1 the hopper overflows. */
  progress: number;
  /** Recycled material on hand, as its order of magnitude: the silo fills on a log scale. */
  pointsLog: number;
  /** Tree nodes bought: each lights a lamp on the board, some add machines. */
  nodes: readonly string[];
  /** All tree nodes, in board order. */
  allNodes: readonly string[];
  threat: number;
  /** The plant's load, 0..2; 1 before the noise slider exists. */
  noise: number;
  /** The noise slider exists: the meter on the wall shows. */
  loud: boolean;
  /** The one that listens: walking (how near, 0..1), at the door, or seconds of silence held there. */
  hunt: { phase: 'idle' | 'walk' | 'check' | 'caught'; near: number; held: number };
}

interface Bale {
  x: number;
  y: number;
  state: 'ride' | 'drop';
  t: number;
}

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  kind: 'pellet' | 'steam' | 'spark' | 'dust';
}

/** A recording playing on this camera. */
interface Playing {
  kind: EventKind;
  /** performance.now() at the start: a recording runs on real time, seen or not. */
  start: number;
  seconds: number;
}

const BALE_SPEED = 22;
/** The review desk's marks, the same red as on camera 01. */
const HUD_RED = '#ff6b57';

/** How long each recording on this camera plays, seconds. */
export const PLANT_SECONDS: Partial<Record<EventKind, number>> = {
  plantShred: 5,
  plantListener: 7,
  plantBale: 6,
  plantEcho: 6,
  plantBooth: 6,
  plantRat: 5,
  plantSteam: 5,
};

/** Recordings during which the plant stands still. */
const STILL: readonly EventKind[] = ['plantShred', 'plantListener', 'plantEcho'];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Camera 03: the recycling plant. A hall under steel trusses, moonlight through high
 * windows and two hanging lamps. Bales ride into the shredder, pellets pour into the
 * silo, the press comes down on a recycle. The whole plant follows the noise slider:
 * still at zero, shaking, steaming and sparking past normal load.
 */
export class PlantCam extends Camera<PlantView> {
  private bales: Bale[] = [];
  private bits: Bit[] = [];
  private baleIn = 0;
  private belt = 0;
  private teeth = 0;
  /** The press: 0 up, 1 down. Driven by a recycle, or by itself under pressure. */
  private press = 0;
  private pressT = -1;
  private ghostPressIn = 20;
  private armT = 0;
  private beacon = 0;
  private steamIn = 0;
  /** Lamps off for a moment, when something is near. */
  private lampsOff = 0;
  private playing: Playing | null = null;
  private replay: string | null = null;
  // ---- The one that listens, as this camera sees it ----
  /** Wet prints on the floor, from the far end toward the booth. */
  private prints: { x: number; y: number; age: number }[] = [];
  private leftFoot = false;
  /** The picture jolts on a step, harder on the step after a stop. */
  private jolt = 0;
  /** It stopped to listen: the lights go out and the plant holds still. */
  listening = false;
  /** What the plant's microphone hears, written on the picture. */
  private audio: { text: string; until: number } | null = null;
  /** Camera time of the last knock, rattle and whisper at the door. */
  private beatAt = { knock: -99, rattle: -99, whisper: -99 };
  /** Camera time it started to leave, or below zero. */
  private leftAt = -1;

  constructor() {
    super('КАМ-03 · ЦЕХ', 'Камера в цехе переработки');
    // The plant's camera is the tab's centrepiece: taller than the others.
    this.root.classList.add('plant');
  }

  /** A recycle: the press comes down on everything. */
  slam(): void {
    this.pressT = 0;
    this.bales = [];
    this.flash();
  }

  /** Plays a recording on this camera; `replay` puts the archive mark on it. */
  playEvent(kind: EventKind, replay: string | null = null): number {
    const seconds = PLANT_SECONDS[kind] ?? 5;
    this.playing = { kind, start: performance.now(), seconds };
    this.replay = replay;
    this.glitch(0.3);
    return seconds;
  }

  /** The recording on screen now, for a tap to catch it live. */
  get live(): EventKind | null {
    return this.playing && !this.replay ? this.playing.kind : null;
  }

  private get evT(): number {
    return this.playing ? (performance.now() - this.playing.start) / 1000 : 0;
  }

  private is(kind: EventKind): boolean {
    return this.playing?.kind === kind;
  }

  private get floor() {
    return this.h - 18;
  }
  private get shredX() {
    return this.w * 0.5;
  }
  private get siloX() {
    return this.w - 60;
  }
  private get beltY() {
    return this.floor - 26;
  }
  /** How fast the machines run: the load, or nothing while a recording holds them still. */
  private get speed() {
    if (this.playing && STILL.includes(this.playing.kind)) return 0;
    if (this.listening) return 0;
    return this.view!.noise;
  }

  // ---- The one that listens ------------------------------------------------------------

  /** A step: a wet print further along the floor toward the booth, dust off the trusses, a jolt. */
  huntStep(near: number, pan: number): void {
    this.leftFoot = !this.leftFoot;
    const x = this.w - 26 - (this.w - 72) * near;
    this.prints.push({ x: x + (this.leftFoot ? -3 : 3), y: this.floor - (this.leftFoot ? 3 : 8), age: 0 });
    this.jolt = Math.max(this.jolt, 0.15 + 0.35 * near);
    for (let i = 0; i < 4 + near * 8; i++) this.bits.push({ x: rnd(0, this.w), y: 18, vx: rnd(-3, 3), vy: rnd(5, 20), life: rnd(1.5, 2.5), kind: 'dust' });
    if (Math.random() < 0.5) this.lampsOff = rnd(0.05, 0.2);
    this.say(`ШАГИ · ${pan < -0.35 ? 'СЛЕВА' : pan > 0.35 ? 'СПРАВА' : 'В ЦЕХУ'}`, 1.6);
  }

  /** The hard step after a stop. */
  huntLunge(): void {
    this.jolt = 1;
    this.flash();
    this.glitch(0.5);
    this.say('УДАР · СОВСЕМ РЯДОМ', 2);
  }

  /** Knocks, the handle, a whisper: the booth answers on the picture. */
  huntBeat(kind: 'knock' | 'rattle' | 'whisper'): void {
    this.beatAt[kind] = this.t;
    if (kind === 'knock') this.jolt = 0.8;
    this.say(kind === 'knock' ? 'СТУК В ДВЕРЬ БУДКИ ×3' : kind === 'rattle' ? 'ДЁРГАЮТ РУЧКУ' : 'ШЁПОТ: «Я ЗНАЮ, ЧТО ТЫ ТАМ»', 2.6);
  }

  /** It leaves: the figure goes, the prints dry. */
  huntLeave(): void {
    this.leftAt = this.t;
    this.say('ШАГИ УДАЛЯЮТСЯ', 3);
  }

  huntClear(): void {
    this.prints = [];
    this.leftAt = -1;
    this.listening = false;
  }

  /** What the microphone hears, on the picture for `seconds`. */
  say(text: string, seconds: number): void {
    this.audio = { text, until: this.t + seconds };
  }

  protected simulate(dt: number): void {
    const v = this.view!;
    if (this.playing && this.evT > this.playing.seconds) {
      this.playing = null;
      this.replay = null;
    }
    this.updateZoom(dt);
    this.jolt = Math.max(0, this.jolt - dt * 3);
    for (const p of this.prints) p.age += dt * (this.leftAt >= 0 ? 8 : 1);
    this.prints = this.prints.filter((p) => p.age < 40).slice(-14);
    if (this.view!.hunt.phase === 'idle' && this.leftAt >= 0 && this.t - this.leftAt > 5) this.huntClear();
    const speed = this.speed;
    this.belt = (this.belt + BALE_SPEED * speed * dt) % 12;
    this.teeth += 6 * speed * dt;
    this.armT += dt * Math.max(speed, 0.2);
    this.beacon += dt * 5 * Math.max(0, v.noise - 1) * 2;

    // Bales come faster the closer the run is to a recycle, and with the load.
    this.baleIn -= dt * speed;
    if (this.baleIn <= 0) {
      this.baleIn = 3.2 - Math.min(v.progress, 1) * 2;
      this.bales.push({ x: 20, y: this.beltY - 8, state: 'ride', t: 0 });
    }
    for (const b of this.bales) {
      b.t += dt;
      if (b.state === 'ride') {
        b.x += BALE_SPEED * speed * dt;
        if (b.x >= this.shredX - 20) {
          b.state = 'drop';
          b.t = 0;
        }
      } else {
        b.y += 50 * dt;
        b.x += (this.shredX - 6 - b.x) * Math.min(dt * 4, 1);
      }
    }
    // A bale that reaches the teeth turns into a few pellets.
    for (const b of this.bales) {
      if (b.state === 'drop' && b.y > this.floor - 32) {
        for (let k = 0; k < 4; k++) this.bits.push({ x: this.shredX + rnd(-4, 4), y: this.floor - 8, vx: 40, vy: 0, life: 9, kind: 'pellet' });
      }
    }
    this.bales = this.bales.filter((b) => !(b.state === 'drop' && b.y > this.floor - 32));

    // Steam from the shredder, thicker with the load; sparks past normal.
    this.steamIn -= dt * (0.6 + 2.5 * speed);
    if (this.steamIn <= 0) {
      this.steamIn = 1;
      this.bits.push({ x: this.shredX + rnd(-12, 12), y: this.floor - 50, vx: rnd(-4, 4), vy: rnd(-14, -8), life: rnd(2, 3.5), kind: 'steam' });
    }
    if (speed > 1.2 && Math.random() < (speed - 1.2) * dt * 20) {
      for (let k = 0; k < 3; k++) this.bits.push({ x: this.shredX + rnd(-8, 8), y: this.floor - 18, vx: rnd(-50, 50), vy: rnd(-70, -30), life: rnd(0.3, 0.6), kind: 'spark' });
    }
    if (this.is('plantSteam') && this.evT < 2.5) {
      for (let k = 0; k < 3; k++) this.bits.push({ x: this.shredX + rnd(-16, 16), y: this.floor - 48, vx: rnd(-20, 20), vy: rnd(-40, -15), life: rnd(2.5, 4), kind: 'steam' });
    }
    for (const p of this.bits) {
      p.life -= dt;
      if (p.kind === 'pellet') {
        p.x += p.vx * dt * Math.max(speed, 0.3);
        if (p.x > this.siloX - 18) {
          p.vy -= 160 * dt;
          p.y += p.vy * dt;
        }
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind === 'spark' || p.kind === 'dust') p.vy += (p.kind === 'spark' ? 200 : 30) * dt;
      }
    }
    this.bits = this.bits.filter((p) => p.life > 0 && (p.kind !== 'pellet' || (p.y > 40 && p.x < this.siloX)));

    // The press: down fast, back up slow.
    if (this.pressT >= 0) {
      this.pressT += dt;
      this.press = this.pressT < 0.25 ? this.pressT / 0.25 : Math.max(0, 1 - (this.pressT - 0.6) / 1.4);
      if (this.pressT > 2) this.pressT = -1;
    }
    // Under pressure it comes down on its own, with nobody at the board.
    this.ghostPressIn -= dt;
    if (v.threat >= 0.6 && this.ghostPressIn <= 0 && this.pressT < 0) {
      this.pressT = 0;
      this.glitch(0.4);
      this.ghostPressIn = 25 + Math.random() * 30 - v.threat * 15;
    }
    // The lamps falter under pressure.
    this.lampsOff -= dt;
    if (this.lampsOff < -1 && Math.random() < dt * v.threat * 0.6) this.lampsOff = rnd(0.05, 0.3);
  }

  protected draw(): void {
    const { ctx, w, h } = this;
    const v = this.view!;
    const has = (id: string) => v.nodes.includes(id);
    const still = this.speed === 0;
    // Recordings that stop the plant, and its stops to listen, bring the lights down.
    const lit = this.listening ? 0.08 : this.lampsOff > 0 || (still && this.playing) ? 0.25 : 1;
    const shake = this.speed > 1 && !this.reducedMotion ? (this.speed - 1) * 1.6 : 0;
    const jx = () => (shake ? rnd(-shake, shake) : 0);
    const hunt = v.hunt;

    ctx.save();
    if (this.jolt > 0 && !this.reducedMotion) ctx.translate(rnd(-1, 1) * this.jolt * 5, rnd(-1, 1) * this.jolt * 4);
    this.applyZoom();
    this.drawHall(lit);
    ctx.save();
    // Knocks shake the booth.
    const knock = this.t - this.beatAt.knock;
    if (knock < 1.4 && [0, 0.55, 1.1].some((k) => knock > k && knock < k + 0.18)) ctx.translate(rnd(-2, 2), rnd(-1, 1));
    this.drawBooth(has('o1'), has('o2'));
    ctx.restore();
    if (hunt.phase === 'check' || (this.leftAt >= 0 && this.t - this.leftAt < 3)) this.drawVisitor(hunt.held);
    this.drawBelt();
    for (const b of this.bales) this.actor(() => this.box(b.x - 7, b.y - 7, 14, 10, '#6a9f74', 1));
    if (this.is('plantBale')) this.drawStrayBale();
    if (this.is('plantRat')) this.drawRat();

    ctx.save();
    ctx.translate(jx(), jx());
    this.drawShredder(v);
    this.drawPress();
    ctx.restore();

    this.drawSilo(v.pointsLog);
    // On the floor in front of the machines.
    this.drawPrints();
    this.drawBits();
    if (has('a1')) this.drawArm(has('a2'));
    this.drawBoard(v, has);
    if (v.loud) this.drawMeter(v.noise);
    if (this.is('plantListener')) this.drawListener();
    ctx.restore();
    this.drawAudio();

    if (this.is('plantEcho')) this.drawEcho();
    if (lit < 1) {
      ctx.fillStyle = `rgb(0 0 0 / ${0.45 * (1 - lit)})`;
      ctx.fillRect(0, 0, w, h);
    }
    this.drawReticle();
    if (this.replay) {
      ctx.fillStyle = 'rgb(0 0 0 / 0.6)';
      ctx.fillRect(w / 2 - 70, h - 16, 140, 13);
      this.label(this.replay, w / 2, h - 6, C.light);
    }
    this.vignette(v.threat);
  }

  // ---- Replay zoom: like camera 01, the review desk closes in on what happened ---------

  /** Where each recording happens, or null for one without a spot. */
  private anchor(): [number, number] | null {
    const t = this.evT;
    const fl = this.floor;
    switch (this.playing?.kind) {
      case 'plantShred':
        return [this.shredX, fl - 18];
      case 'plantListener':
        return [this.siloX - 18, fl - 96];
      case 'plantBale': {
        const from = this.shredX - 26;
        return [from - (from - 70) * Math.min(t / 4, 1), this.beltY - 10];
      }
      case 'plantBooth':
        return [19, fl - 32];
      case 'plantRat':
        return [this.ratX(t), this.beltY - 4];
      case 'plantSteam':
        return [this.shredX, fl - 62];
      default:
        return null;
    }
  }

  /** What changed in the picture, written on the review desk. */
  private static readonly FINDINGS: Partial<Record<EventKind, string>> = {
    plantShred: 'ВРАЩЕНИЕ БЕЗ ПИТАНИЯ',
    plantListener: 'ПОСТОРОННИЙ У СИЛОСА',
    plantBale: 'ДВИЖЕНИЕ ПРОТИВ ЛЕНТЫ',
    plantBooth: 'ДВЕРЬ ОТКРЫТА ИЗНУТРИ',
    plantRat: 'ЖИВОТНОЕ НА ЛЕНТЕ',
    plantSteam: 'ВЫБРОС ПАРА',
  };

  private zoom = { scale: 1, x: 0, y: 0 };

  /** Eases in on a replayed recording, follows it, and eases out before the end. */
  private updateZoom(dt: number): void {
    // A replay closes in on what happened; at the door, the camera finds the booth.
    const door = this.view!.hunt.phase === 'check' && !this.replay;
    const a: [number, number] | null = door ? [44, this.floor - 58] : this.replay ? this.anchor() : null;
    const want = door ? 1.6 : a && this.playing && this.evT < this.playing.seconds - 0.7 ? 2.5 : 1;
    const k = this.reducedMotion ? 1 : Math.min(dt * 3.5, 1);
    this.zoom.scale += (want - this.zoom.scale) * k;
    if (a) {
      if (this.zoom.scale < 1.02) [this.zoom.x, this.zoom.y] = a;
      this.zoom.x += (a[0] - this.zoom.x) * k;
      this.zoom.y += (a[1] - this.zoom.y) * k;
    }
  }

  /** Translation that puts the zoom point in the middle, without showing past the edges. */
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

  /** Corner brackets around the object, the zoom readout and what changed. */
  private drawReticle(): void {
    const a = this.replay ? this.anchor() : null;
    if (!a || this.zoom.scale < 1.3) return;
    const { ctx } = this;
    const [ox, oy] = this.zoomOffset();
    const sx = a[0] * this.zoom.scale + ox;
    const sy = a[1] * this.zoom.scale + oy;
    const r = 14 * this.zoom.scale;
    const c = r * 0.45;
    ctx.strokeStyle = HUD_RED;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = Math.sin(this.evT * 8) > -0.3 ? 0.95 : 0.5;
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
    ctx.textAlign = 'left';
    ctx.fillText(`ZOOM ×${this.zoom.scale.toFixed(1)}`, 8, this.h - 22);
    const finding = this.playing && PlantCam.FINDINGS[this.playing.kind];
    if (finding) ctx.fillText(finding, 8, 34);
    ctx.fillText('ОБЪЕКТ', Math.min(sx + r + 4, this.w - 44), Math.max(sy - r + 8, 12));
  }

  // ---- The hall -----------------------------------------------------------------------

  private drawHall(lit: number): void {
    const { ctx, w } = this;
    const fl = this.floor;
    const bg = ctx.createLinearGradient(0, 0, 0, this.h);
    bg.addColorStop(0, '#020a05');
    bg.addColorStop(0.75, '#0a1f13');
    bg.addColorStop(1, '#0d2818');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, this.h);
    // Corrugated wall.
    for (let x = 4; x < w; x += 7) this.line(x, 22, x, fl - 40, C.far, 1, 0.45);
    this.line(0, fl - 40, w, fl - 40, C.far, 1.5, 0.8);
    // High windows with moonlight falling across the floor.
    for (const wx of [w * 0.2, w * 0.34]) {
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = C.light;
      ctx.beginPath();
      ctx.moveTo(wx - 12, 50);
      ctx.lineTo(wx + 12, 50);
      ctx.lineTo(wx + 56, fl);
      ctx.lineTo(wx + 14, fl);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      this.box(wx - 12, 28, 24, 22, '#163b26', 1);
      this.line(wx, 28, wx, 50, C.deep, 1);
      this.line(wx - 12, 39, wx + 12, 39, C.deep, 1);
    }
    // Trusses under the roof.
    this.line(0, 6, w, 6, C.deep, 2);
    this.line(0, 18, w, 18, C.deep, 1.5);
    for (let x = 0; x < w; x += 24) {
      this.line(x, 6, x + 12, 18, C.far, 1);
      this.line(x + 12, 18, x + 24, 6, C.far, 1);
    }
    // Hanging lamps, each with its cone of light.
    for (const lx of [w * 0.27, w * 0.7]) {
      this.line(lx, 18, lx, 34, C.deep, 1);
      this.poly([[lx - 7, 40], [lx + 7, 40], [lx + 3, 34], [lx - 3, 34]], C.hub, 1);
      if (lit > 0.5) {
        const cone = ctx.createLinearGradient(0, 40, 0, fl);
        cone.addColorStop(0, 'rgb(200 255 210 / 0.22)');
        cone.addColorStop(1, 'rgb(200 255 210 / 0.02)');
        ctx.fillStyle = cone;
        ctx.beginPath();
        ctx.moveTo(lx - 6, 40);
        ctx.lineTo(lx + 6, 40);
        ctx.lineTo(lx + 42, fl);
        ctx.lineTo(lx - 42, fl);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = C.light;
        ctx.fillRect(lx - 3, 39, 6, 2);
      }
    }
    // Floor: boards running to the back wall, and the danger zone under the press.
    this.line(0, fl, w, fl, C.deep, 1.5);
    for (let x = -w; x < w * 2; x += 30) this.line(w / 2 + (x - w / 2) * 0.55, fl - 40, x, this.h, C.far, 1, 0.5);
    const sx = this.shredX;
    for (let x = sx - 34; x < sx + 34; x += 8) this.line(x, fl + 4, x + 5, fl + 12, C.deep, 2, 0.8);
  }

  private drawBooth(watchman: boolean, bright: boolean): void {
    const fl = this.floor;
    const t = this.evT;
    this.box(4, fl - 50, 30, 50, C.far, 1);
    this.box(9, fl - 44, 20, 12, watchman ? (bright ? C.light : C.green) : '#0a1a10', 0.8);
    // The door: swung open from inside in one recording.
    const open = this.is('plantBooth') ? Math.min(1, Math.max(0, (t - 0.8) / 1.5)) : 0;
    const dw = 12 * (1 - open);
    this.box(13, fl - 28, Math.max(dw, 1), 28, '#081a0f', 1);
    if (open > 0) this.box(13, fl - 28, 12, 28, '#000', 0);
    // Breath on the glass, from outside.
    if (this.is('plantBooth') && t > 2.5) {
      const a = Math.sin(Math.min((t - 2.5) / 3, 1) * Math.PI) * 0.6;
      this.ctx.globalAlpha = a;
      this.ctx.fillStyle = C.light;
      this.ctx.beginPath();
      this.ctx.ellipse(19, fl - 38, 7, 4, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.globalAlpha = 1;
    }
    this.label('ОХРАНА', 19, fl - 54, C.deep);
  }

  /** Wet bare prints on the floor, fresh ones glinting, old ones drying. */
  private drawPrints(): void {
    const { ctx } = this;
    for (const p of this.prints) {
      const a = Math.max(0, 1 - p.age / 40);
      // Dark and wet, with a pale rim where the light catches the edge.
      ctx.globalAlpha = a;
      ctx.fillStyle = '#010302';
      ctx.strokeStyle = 'rgb(200 255 210 / 0.55)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 3.2, 5.2, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.arc(p.x - 3 + k * 2, p.y - 7 + Math.abs(k - 1.5) * 0.6, 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      // A wet glint while fresh.
      if (p.age < 6) {
        ctx.globalAlpha = (1 - p.age / 6) * 0.6;
        ctx.fillStyle = C.light;
        ctx.fillRect(p.x - 0.5, p.y - 1, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * At the door: a tall shape by the booth. During the silence it leans to the window,
   * and at the whisper its eyes show behind the glass. It leaves when it is lived through.
   */
  private drawVisitor(held: number): void {
    const { ctx } = this;
    const fl = this.floor;
    const going = this.leftAt >= 0 ? Math.min((this.t - this.leftAt) / 3, 1) : 0;
    const x = 44 + going * (this.w * 0.6);
    const tall = 104;
    const lean = Math.min(held / 4, 1) * (1 - going);
    ctx.save();
    ctx.globalAlpha = 1 - going * 0.8;
    ctx.fillStyle = '#000';
    ctx.strokeStyle = 'rgb(130 214 152 / 0.4)';
    ctx.lineWidth = 1;
    const hx = x - lean * 12;
    const hy = fl - tall + 8 + lean * 18;
    ctx.beginPath();
    ctx.ellipse(hx, hy, 6, 8, -lean * 0.6, 0, Math.PI * 2);
    ctx.moveTo(x - 7, fl - tall + 20);
    ctx.lineTo(x + 7, fl - tall + 20);
    ctx.lineTo(x + 4, fl - 46);
    ctx.lineTo(x + 5, fl);
    ctx.lineTo(x - 5, fl);
    ctx.lineTo(x - 4, fl - 46);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // One long arm up to the door handle.
    const rattle = this.t - this.beatAt.rattle;
    const reach = rattle < 0.8 ? Math.sin(rattle * 40) * 2 : 0;
    this.line(x - 7, fl - tall + 24, 30 + reach, fl - 16 + reach, '#000', 2.5);
    ctx.restore();
    // The handle, tried from outside.
    ctx.strokeStyle = C.light;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const angle = rattle < 0.8 ? Math.sin(rattle * 40) * 0.6 : 0;
    ctx.moveTo(23, fl - 16);
    ctx.lineTo(23 + Math.cos(angle) * 5, fl - 16 + Math.sin(angle) * 5);
    ctx.stroke();
    // Its eyes at the booth window, after the whisper.
    if (this.t - this.beatAt.whisper < 30 && going === 0) {
      ctx.fillStyle = C.light;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 6);
      ctx.fillRect(hx - 4, hy - 1, 2, 2);
      ctx.fillRect(hx + 1, hy - 1, 2, 2);
      ctx.globalAlpha = 1;
    }
    // Breath on the glass from outside, in and out.
    if (held > 0 && going === 0) {
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(this.t * 1.6);
      ctx.fillStyle = C.light;
      ctx.beginPath();
      ctx.ellipse(28, fl - 38, 5, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /** The plant's microphone: what it hears, on a strip at the bottom of the picture. */
  private drawAudio(): void {
    if (!this.audio || this.t > this.audio.until) return;
    const { ctx, w, h } = this;
    ctx.fillStyle = 'rgb(0 0 0 / 0.75)';
    ctx.fillRect(0, h - 14, w, 14);
    ctx.fillStyle = HUD_RED;
    ctx.font = '700 9px "JetBrains Mono Variable", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`АУДИО: ${this.audio.text}`, 8, h - 4);
    // A level that jumps with what it hears.
    for (let i = 0; i < 8; i++) {
      const on = Math.random() < 0.7 - i * 0.07;
      ctx.fillStyle = on ? HUD_RED : '#2a0c08';
      ctx.fillRect(w - 50 + i * 5, h - 11, 3, 8);
    }
  }

  private drawBelt(): void {
    const by = this.beltY;
    const end = this.shredX - 20;
    this.box(38, by, end - 38, 4, C.far, 1);
    for (let x = 38 + this.belt; x < end; x += 12) this.line(x, by, x, by + 4, C.deep, 1);
    // Rollers and legs.
    for (let x = 44; x < end; x += 22) {
      this.circle(x, by + 7, 3, C.tyre, 1);
      this.line(x, by + 10, x, this.floor, C.far, 1.5);
    }
  }

  private drawShredder(v: PlantView): void {
    const { ctx } = this;
    const sx = this.shredX;
    const fl = this.floor;
    this.poly([[sx - 24, fl - 50], [sx + 24, fl - 50], [sx + 14, fl - 26], [sx - 14, fl - 26]], C.deep, 1.2);
    // Body with a hazard band.
    this.box(sx - 18, fl - 26, 36, 26, '#163b26', 1.2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx - 18, fl - 6, 36, 5);
    ctx.clip();
    for (let x = sx - 22; x < sx + 22; x += 6) this.line(x, fl, x + 5, fl - 6, C.green, 2.2);
    ctx.restore();
    // Teeth: three turns on their own in one recording.
    const turn = this.is('plantShred') ? Math.min(Math.max((this.evT - 0.8) / 2.6, 0), 1) * Math.PI * 6 : 0;
    const a = this.teeth + turn;
    for (const dx of [-7, 7]) {
      this.circle(sx + dx, fl - 16, 6, C.tyre, 1.2);
      for (let k = 0; k < 4; k++) this.line(sx + dx, fl - 16, sx + dx + Math.cos(a * Math.sign(dx) + k * 1.57) * 6, fl - 16 + Math.sin(a * Math.sign(dx) + k * 1.57) * 6, C.green, 1);
    }
    // Four kilograms out of an empty shredder.
    if (this.is('plantShred') && this.evT > 3.6) {
      const f = Math.min((this.evT - 3.6) * 40, 14);
      ctx.fillStyle = C.light;
      for (let k = 0; k < 4; k++) ctx.fillRect(sx - 6 + k * 4, fl - 10 + f * (0.6 + k * 0.1) - 4, 2.5, 2.5);
    }
    // A beacon on the hopper, turning past normal load.
    const bx = sx + 20;
    const by = fl - 56;
    this.box(bx - 3, by, 6, 5, C.far, 1);
    if (v.noise > 1 && this.speed > 0) {
      const p = (Math.sin(this.beacon) + 1) / 2;
      ctx.globalAlpha = 0.3 + 0.7 * p;
      ctx.fillStyle = C.light;
      ctx.fillRect(bx - 2, by + 1, 4, 3);
      ctx.globalAlpha = 0.12 * p;
      ctx.beginPath();
      ctx.moveTo(bx, by + 2);
      ctx.lineTo(bx + Math.cos(this.beacon) * 60, by - 20);
      ctx.lineTo(bx + Math.cos(this.beacon) * 60, by + 20);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (v.progress >= 1) this.label('ГОТОВО К ПЕРЕРАБОТКЕ', sx, fl - 62, C.light);
  }

  private drawPress(): void {
    const sx = this.shredX;
    const fl = this.floor;
    const py = 30 + this.press * (fl - 84);
    // The cylinder under the truss and two rods down to the plate.
    this.box(sx - 14, 18, 28, 10, C.far, 1.2);
    for (const dx of [-9, 9]) this.line(sx + dx, 28, sx + dx, py, C.hub, 2);
    this.actor(() => {
      this.box(sx - 28, py, 56, 10, C.hub, 1.4);
    });
    for (let x = sx - 24; x < sx + 24; x += 8) this.line(x, py + 9, x + 4, py + 1, C.deep, 1.5, 0.8);
  }

  private drawSilo(pointsLog: number): void {
    const { ctx } = this;
    const sxl = this.siloX;
    const fl = this.floor;
    // The camera's clock sits in the top right corner, so the silo starts below it.
    const top = 52;
    const sw = 40;
    // Chute from the shredder.
    this.box(this.shredX + 14, fl - 8, sxl - this.shredX - 18, 4, C.far, 1);
    this.box(sxl - 4, top, sw, fl - top, '#11301e', 1.2);
    ctx.beginPath();
    ctx.ellipse(sxl - 4 + sw / 2, top, sw / 2, 5, 0, Math.PI, 0);
    this.paint('#11301e', 1.2);
    const fill = Math.min(1, pointsLog / 8);
    if (fill > 0) this.box(sxl - 3, fl - (fl - top - 2) * fill, sw - 2, (fl - top - 2) * fill, C.green, 0);
    for (let y = top + 16; y < fl; y += 18) this.line(sxl - 4, y, sxl - 4 + sw, y, C.deep, 1, 0.7);
    // Ladder up the side.
    this.line(sxl - 10, top + 4, sxl - 10, fl, C.deep, 1);
    this.line(sxl - 6, top + 4, sxl - 6, fl, C.deep, 1);
    for (let y = top + 8; y < fl; y += 6) this.line(sxl - 10, y, sxl - 6, y, C.far, 1);
    this.label('ВТОРСЫРЬЁ', sxl + sw / 2 - 4, top - 8, C.green);
  }

  private drawBits(): void {
    const { ctx } = this;
    for (const p of this.bits) {
      if (p.kind === 'pellet') {
        ctx.fillStyle = C.light;
        ctx.fillRect(p.x, p.y, 2, 2);
      } else if (p.kind === 'steam') {
        ctx.globalAlpha = Math.min(p.life, 1) * 0.18;
        ctx.fillStyle = C.light;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 + (3.5 - p.life) * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (p.kind === 'dust') {
        ctx.fillStyle = C.green;
        ctx.globalAlpha = Math.min(p.life, 1) * 0.7;
        ctx.fillRect(p.x, p.y, 1, 1);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = C.light;
        ctx.globalAlpha = p.life * 2;
        ctx.fillRect(p.x, p.y, 1.5, 1.5);
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawArm(fast: boolean): void {
    const swing = Math.sin(this.armT * (fast ? 2.4 : 1)) * 0.6;
    const ax = this.shredX - 40;
    const ay = 34;
    const ex = ax + Math.cos(swing + 1.2) * 28;
    const ey = ay + Math.sin(swing + 1.2) * 28;
    this.line(ax, 18, ax, ay, C.deep, 2);
    this.line(ax, ay, ex, ey, C.green, 2);
    this.circle(ex, ey, 2.5, C.light, 1);
  }

  /** The board: one lamp per tree node. */
  private drawBoard(v: PlantView, has: (id: string) => boolean): void {
    const { ctx } = this;
    const bx = 8;
    const by = 24;
    v.allNodes.forEach((id, i) => {
      const on = has(id);
      ctx.fillStyle = on ? C.glow : C.far;
      ctx.globalAlpha = on ? 0.6 + 0.4 * Math.sin(this.t * 2 + i) : 1;
      ctx.fillRect(bx + (i % 7) * 6, by + Math.floor(i / 7) * 6, 3, 3);
      ctx.globalAlpha = 1;
    });
  }

  /** The noise on the wall: ten bars, the upper half marked. */
  private drawMeter(noise: number): void {
    const { ctx } = this;
    const x = 8;
    const y = 54;
    const level = (this.speed === 0 ? 0 : noise) * 5 + (noise > 0 ? Math.sin(this.t * 13) * 0.4 : 0);
    for (let i = 0; i < 10; i++) {
      const on = i < level;
      ctx.fillStyle = on ? (i >= 5 ? C.light : C.green) : C.far;
      ctx.fillRect(x + i * 5, y + 14 - i, 3, 4 + i);
    }
    this.label(`ШУМ ${Math.round(noise * 100)}%`, x, y + 26, noise > 1 ? C.light : C.deep, 'left');
  }

  // ---- Recordings ----------------------------------------------------------------------

  /** A tall figure at the silo, head pressed to it; at the end it turns to the camera. */
  private drawListener(): void {
    const { ctx } = this;
    const t = this.evT;
    const fl = this.floor;
    const x = this.siloX - 18;
    const tall = 112;
    const turned = t > 5;
    if (turned && t < 5.2) this.glitch(0.3);
    ctx.save();
    ctx.globalAlpha = Math.min(t / 1.2, 1);
    ctx.fillStyle = '#000';
    ctx.strokeStyle = 'rgb(130 214 152 / 0.45)';
    ctx.lineWidth = 1;
    const head = 9;
    const hx = turned ? x : x + 6;
    ctx.beginPath();
    ctx.ellipse(hx, fl - tall + head, head * 0.8, head, turned ? 0 : 0.5, 0, Math.PI * 2);
    ctx.moveTo(x - 9, fl - tall + 20);
    ctx.lineTo(x + 9, fl - tall + 20);
    ctx.lineTo(x + 5, fl - 50);
    ctx.lineTo(x + 6, fl);
    ctx.lineTo(x - 6, fl);
    ctx.lineTo(x - 5, fl - 50);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Arms hanging past the knees.
    this.line(x - 9, fl - tall + 22, x - 13, fl - 20, '#000', 3);
    this.line(x + 9, fl - tall + 22, x + 12, fl - 22, '#000', 3);
    if (turned) {
      ctx.fillStyle = C.light;
      ctx.fillRect(x - 4, fl - tall + 8, 2, 2);
      ctx.fillRect(x + 2, fl - tall + 9, 2, 2);
    }
    ctx.restore();
  }

  /** A bale that never went through sorting, riding the wrong way. */
  private drawStrayBale(): void {
    const t = this.evT;
    const from = this.shredX - 26;
    const x = from - (from - 70) * Math.min(t / 4, 1);
    const y = this.beltY - 8;
    this.actor(() => this.box(x - 8, y - 8, 16, 12, '#2a4a32', 1.4));
    if (t > 4) this.label('?', x, y - 12, C.light);
  }

  /** Runs, stops to sniff, runs on. */
  private ratX(t: number): number {
    const run = t < 1.5 ? t : t < 2.6 ? 1.5 : t - 1.1;
    return 40 + run * 50;
  }

  private drawRat(): void {
    const { ctx } = this;
    const t = this.evT;
    const x = this.ratX(t);
    const y = this.beltY - 3;
    this.actor(() => {
      ctx.beginPath();
      ctx.ellipse(x, y, 5, 2.5, 0, 0, Math.PI * 2);
      this.paint(C.hub, 1);
    });
    this.line(x - 5, y, x - 12, y - 2 + Math.sin(t * 20), C.green, 1);
  }

  /** The plant's microphone: a waveform of a plant that is standing still. */
  private drawEcho(): void {
    const { ctx, w } = this;
    const t = this.evT;
    const y = 112;
    ctx.fillStyle = 'rgb(0 0 0 / 0.55)';
    ctx.fillRect(w / 2 - 80, y - 26, 160, 46);
    this.label('МИК ЦЕХА · ЦЕХ ОСТАНОВЛЕН', w / 2, y - 15, C.green);
    ctx.strokeStyle = C.light;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -70; x <= 70; x += 2) {
      // Machines, then at the end a single breath.
      const amp = t < 4.5 ? 6 + 5 * Math.sin(t * 3 + x * 0.05) : 12 * Math.sin(((t - 4.5) / 1.5) * Math.PI);
      const yy = y + Math.sin(x * 0.4 + t * 20) * amp * Math.random();
      if (x === -70) ctx.moveTo(w / 2 + x, yy);
      else ctx.lineTo(w / 2 + x, yy);
    }
    ctx.stroke();
  }
}
