import { Camera } from './camera';
import { C } from './scene';

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
}

interface Bale {
  x: number;
  y: number;
  state: 'ride' | 'drop';
  t: number;
}

interface Pellet {
  x: number;
  y: number;
  vy: number;
}

const BALE_SPEED = 22;

/** Camera 03: the recycling plant. Bales ride into the shredder, pellets pour into the silo, the press comes down on a recycle. */
export class PlantCam extends Camera<PlantView> {
  private bales: Bale[] = [];
  private pellets: Pellet[] = [];
  private baleIn = 0;
  private belt = 0;
  /** The press: 0 up, 1 down. Driven by a recycle, or by itself under pressure. */
  private press = 0;
  private pressT = -1;
  private ghostPressIn = 20;
  private armT = 0;

  constructor() {
    super('КАМ-03 · ЦЕХ', 'Камера в цехе переработки');
  }

  /** A recycle: the press comes down on everything. */
  slam(): void {
    this.pressT = 0;
    this.bales = [];
    this.flash();
  }

  private get floor() {
    return this.h - 18;
  }
  private get shredX() {
    return this.w * 0.46;
  }
  private get siloX() {
    return this.w - 64;
  }

  protected simulate(dt: number): void {
    const v = this.view!;
    this.belt = (this.belt + BALE_SPEED * dt) % 10;
    this.armT += dt;

    // Bales come faster the closer the run is to a recycle.
    this.baleIn -= dt;
    if (this.baleIn <= 0) {
      this.baleIn = 3.2 - Math.min(v.progress, 1) * 2;
      this.bales.push({ x: -16, y: this.floor - 34, state: 'ride', t: 0 });
    }
    for (const b of this.bales) {
      b.t += dt;
      if (b.state === 'ride') {
        b.x += BALE_SPEED * dt;
        if (b.x >= this.shredX - 18) {
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
      if (b.state === 'drop' && b.y > this.floor - 30) {
        for (let k = 0; k < 4; k++) this.pellets.push({ x: this.shredX + (Math.random() - 0.5) * 8, y: this.floor - 8, vy: 0 });
      }
    }
    this.bales = this.bales.filter((b) => !(b.state === 'drop' && b.y > this.floor - 30));
    for (const p of this.pellets) {
      p.x += 40 * dt;
      if (p.x > this.siloX - 14) {
        p.vy -= 160 * dt;
        p.y += p.vy * dt;
      }
    }
    this.pellets = this.pellets.filter((p) => p.y > 24 && p.x < this.siloX + 4);

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
  }

  protected draw(): void {
    const { ctx, w, h } = this;
    const v = this.view!;
    const fl = this.floor;
    const has = (id: string) => v.nodes.includes(id);

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#030c07');
    bg.addColorStop(1, '#0b2116');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    for (let x = 10; x < w; x += 38) this.line(x, 0, x, fl, C.far, 1, 0.35);
    this.line(0, fl, w, fl, C.deep, 1.5);

    // Night watchman's booth, once offline work is bought.
    if (has('o1')) {
      this.box(6, fl - 44, 26, 44, C.far, 1);
      this.box(11, fl - 38, 16, 10, has('o2') ? C.light : C.green, 0.8);
      this.label('ОХРАНА', 19, fl - 48, C.deep);
    }

    // Belt of bales into the shredder.
    const by = fl - 26;
    this.box(0, by, this.shredX - 18, 5, C.far, 1);
    for (let x = this.belt; x < this.shredX - 18; x += 10) this.line(x, by + 1, x, by + 4, C.deep, 1);

    // Shredder: a hopper with turning teeth.
    const sx = this.shredX;
    this.poly([[sx - 22, fl - 46], [sx + 22, fl - 46], [sx + 12, fl - 22], [sx - 12, fl - 22]], C.deep, 1.2);
    const a = this.t * 6;
    for (const dx of [-6, 6]) {
      this.circle(sx + dx, fl - 16, 6, C.tyre, 1.2);
      for (let k = 0; k < 4; k++) this.line(sx + dx, fl - 16, sx + dx + Math.cos(a * Math.sign(dx) + k * 1.57) * 6, fl - 16 + Math.sin(a * Math.sign(dx) + k * 1.57) * 6, C.green, 1);
    }
    if (v.progress >= 1) this.label('ГОТОВО К ПЕРЕРАБОТКЕ', sx, fl - 52, C.light);

    // The press above the shredder.
    const py = 14 + this.press * (fl - 70);
    this.line(sx, 0, sx, py, C.deep, 3);
    this.actor(() => this.box(sx - 26, py, 52, 10, C.hub, 1.4));

    // Pellet chute to the silo.
    this.box(sx + 12, fl - 8, this.siloX - sx - 26, 4, C.far, 1);
    ctx.fillStyle = C.light;
    for (const p of this.pellets) ctx.fillRect(p.x, p.y, 2, 2);

    // Silo of Recycled material, filling on a log scale.
    const sxl = this.siloX;
    const fill = Math.min(1, v.pointsLog / 8);
    // The camera's clock sits in the top right corner, so the silo starts below it.
    const top = 50;
    this.box(sxl - 14, top, 36, fl - top, C.far, 1.2);
    if (fill > 0) this.box(sxl - 13, fl - (fl - top - 2) * fill, 34, (fl - top - 2) * fill, C.green, 0);
    this.label('ВТОРСЫРЬЁ', sxl + 4, top - 5, C.green);

    // Robotic arm sorting bales, once the auto-buyer is bought.
    if (has('a1')) {
      const swing = Math.sin(this.armT * (has('a2') ? 2.4 : 1)) * 0.6;
      const ax = sx - 60;
      const ay = 30;
      const ex = ax + Math.cos(swing + 1.2) * 28;
      const ey = ay + Math.sin(swing + 1.2) * 28;
      this.line(ax, 14, ax, ay, C.deep, 2);
      this.line(ax, ay, ex, ey, C.green, 2);
      this.circle(ex, ey, 2.5, C.light, 1);
    }

    for (const b of this.bales) this.actor(() => this.box(b.x - 7, b.y - 7, 14, 10, '#6a9f74', 1));

    // The board: one lamp per tree node.
    const bx = 8;
    const bty = 8;
    v.allNodes.forEach((id, i) => {
      const lit = has(id);
      ctx.fillStyle = lit ? C.glow : C.far;
      ctx.globalAlpha = lit ? 0.6 + 0.4 * Math.sin(this.t * 2 + i) : 1;
      ctx.fillRect(bx + (i % 7) * 6, bty + Math.floor(i / 7) * 6 + 14, 3, 3);
      ctx.globalAlpha = 1;
    });
    if (v.nodes.length && !has('o1')) this.label('ДЕРЕВО', bx + 20, bty + 34, C.deep);

    this.vignette(v.threat);
  }
}
