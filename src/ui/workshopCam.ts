import { Camera } from './camera';
import { C } from './scene';

/** What camera 05 needs to know about upgrades. */
export interface WorkshopView {
  /** Upgrades bought this run, and how many there are in all. */
  bought: number;
  total: number;
  compact: number;
  bulk: number;
  dark: number;
  threat: number;
}

/** Tool shapes on the pegboard, picked by slot so each keeps its look. */
const TOOLS = 5;

/** Camera 05: the workshop. Every upgrade hangs on the wall as a tool; the endless ones are machines. */
export class WorkshopCam extends Camera<WorkshopView> {
  /** The newest tool glows for a moment. */
  private fresh = 0;
  private pump = 0;
  /** Under the compactor's plate something moves now and then. */
  private twitch = 0;
  private twitchIn = 15;

  constructor() {
    super('КАМ-05 · МАСТЕРСКАЯ', 'Камера в мастерской с улучшениями');
  }

  /** Something was bought: the newest tool lights up. */
  bought(): void {
    this.fresh = 1.2;
    this.pump = 1;
  }

  private get floor() {
    return this.h - 14;
  }

  protected simulate(dt: number): void {
    const v = this.view!;
    this.fresh = Math.max(0, this.fresh - dt);
    this.pump = Math.max(0, this.pump - dt * 1.5);
    this.twitchIn -= dt;
    if (v.threat >= 0.6 && this.twitchIn <= 0) {
      this.twitch = 1.5;
      this.twitchIn = 12 + Math.random() * 20 - v.threat * 8;
    }
    this.twitch = Math.max(0, this.twitch - dt);
  }

  protected draw(): void {
    const { ctx, w, h } = this;
    const v = this.view!;
    const fl = this.floor;

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#030c07');
    bg.addColorStop(1, '#0c2216');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    this.line(0, fl, w, fl, C.deep, 1.5);

    // Pegboard: one hook per upgrade in the catalogue, a tool on each one bought.
    const bx = 10;
    const by = 26;
    const bw = Math.min(w * 0.5, 200);
    const cols = 13;
    const cell = bw / cols;
    const rows = Math.ceil(v.total / cols);
    this.box(bx - 4, by - 4, bw + 8, rows * cell + 8, C.far, 1);
    for (let i = 0; i < v.total; i++) {
      const x = bx + (i % cols) * cell + cell / 2;
      const y = by + Math.floor(i / cols) * cell + cell / 2;
      if (i >= v.bought) {
        ctx.fillStyle = C.far;
        ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
        continue;
      }
      const glow = i === v.bought - 1 && this.fresh > 0;
      this.drawTool(i % TOOLS, x, y, cell * 0.38, glow ? C.light : C.green);
    }
    this.label(`ИНСТРУМЕНТ ${v.bought}/${v.total}`, bx + bw / 2, by + rows * cell + 14, C.deep);

    // Workbench with the dark deal on it: one signature per level.
    const tx = bx;
    const ty = fl - 16;
    this.box(tx, ty, bw * 0.7, 4, C.deep, 1);
    this.line(tx + 4, ty + 4, tx + 4, fl, C.deep, 1);
    this.line(tx + bw * 0.7 - 4, ty + 4, tx + bw * 0.7 - 4, fl, C.deep, 1);
    if (v.dark > 0) {
      this.box(tx + 10, ty - 8, 22, 8, '#c8e8c8', 0.8);
      for (let k = 0; k < Math.min(v.dark, 6); k++) this.line(tx + 13 + k * 3, ty - 3, tx + 15 + k * 3, ty - 5, '#c86a5a', 1);
      this.label('ДОГОВОР', tx + 21, ty - 11, C.deep);
    }

    // Crates from the bulk supplier by the door.
    const cx = bx + bw + 20;
    for (let k = 0; k < Math.min(v.bulk, 12); k++) {
      const col = k % 3;
      const row = Math.floor(k / 3);
      this.box(cx + col * 13, fl - 12 - row * 11, 12, 10, '#5f8f68', 1);
    }
    if (v.bulk > 0) this.label('ОПТ', cx + 19, fl - 14 - Math.ceil(Math.min(v.bulk, 12) / 3) * 11, C.deep);

    // The compactor: its plate sits lower with every level, pressing a block that keeps getting thinner.
    const kx = w - 46;
    // The frame starts below the camera's clock in the top right corner.
    const top = 48;
    const low = Math.min(1, Math.log2(v.compact + 1) / 6);
    const blockH = Math.max(6, 36 * (1 - low));
    const plateY = fl - blockH - 8 + this.pump * 4;
    this.box(kx - 26, top + 4, 4, fl - top - 4, C.deep, 1);
    this.box(kx + 22, top + 4, 4, fl - top - 4, C.deep, 1);
    this.box(kx - 26, top, 52, 6, C.far, 1);
    this.line(kx, top + 6, kx, plateY, C.deep, 3);
    const shake = this.twitch > 0 ? Math.sin(this.t * 40) * 1.5 : 0;
    this.box(kx - 20 + shake, fl - blockH, 40, blockH, '#3f7a52', 1);
    this.actor(() => this.box(kx - 22, plateY, 44, 8, C.hub, 1.4));
    if (this.twitch > 0) {
      // Something under the plate pushes back.
      for (let k = -1; k <= 1; k++) this.line(kx + k * 8 + shake, fl - blockH, kx + k * 9 + shake, fl - blockH - 5, C.light, 1);
    }
    this.label(v.compact > 0 ? `УПЛОТНЕНИЕ ${v.compact}` : 'УПЛОТНИТЕЛЬ', kx, top - 4, v.compact > 0 ? C.green : C.deep);

    this.vignette(v.threat);
  }

  private drawTool(kind: number, x: number, y: number, r: number, color: string): void {
    switch (kind) {
      case 0: // wrench
        this.line(x - r, y + r, x + r * 0.6, y - r * 0.6, color, 1.2);
        this.circle(x + r * 0.7, y - r * 0.7, r * 0.35, color, 0.8);
        break;
      case 1: // hammer
        this.line(x, y + r, x, y - r * 0.4, color, 1.2);
        this.box(x - r * 0.7, y - r, r * 1.4, r * 0.6, color, 0.8);
        break;
      case 2: // saw
        this.poly([[x - r, y + r * 0.4], [x + r, y - r * 0.4], [x + r, y], [x - r, y + r * 0.8]], color, 0.8);
        break;
      case 3: // pliers
        this.line(x - r * 0.5, y + r, x + r * 0.3, y - r, color, 1.2);
        this.line(x + r * 0.5, y + r, x - r * 0.3, y - r, color, 1.2);
        break;
      default: // screwdriver
        this.line(x, y - r, x, y + r * 0.2, color, 1);
        this.box(x - r * 0.3, y + r * 0.2, r * 0.6, r * 0.8, color, 0.8);
    }
  }
}
