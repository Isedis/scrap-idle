import { Camera } from './camera';
import { C } from './scene';
import type { ScriptId } from '../game/scripts';

/** What camera 04 needs to know about the scripts. */
export interface ServerView {
  racks: { id: ScriptId; name: string; installed: boolean; on: boolean }[];
  /** The floodlight script is installed. */
  breaker: boolean;
  /** Seconds before the floodlight script tries again after a failure; 0 when it is ready. */
  cooldown: number;
  threat: number;
}

/** Camera 04: the server room. One rack per script; its lights blink when the script acts. */
export class ServerCam extends Camera<ServerView> {
  /** Per rack: how bright its activity lights are right now. */
  private activity = new Map<ScriptId, number>();
  /** Someone standing between the racks: where, and how long left. */
  private visitor: { x: number; left: number } | null = null;
  private visitorIn = 30;
  private lines: number[] = [];

  constructor() {
    super('КАМ-04 · СЕРВЕРНАЯ', 'Камера в серверной со скриптами');
    for (let i = 0; i < 6; i++) this.lines.push(0.3 + Math.random() * 0.7);
  }

  /** A script did something. */
  pulse(id: ScriptId): void {
    this.activity.set(id, 1);
  }

  /** A line no script wrote: someone stands between the racks for a while. */
  phantom(): void {
    this.visitor = { x: 0.2 + Math.random() * 0.6, left: 5 };
    this.glitch(0.6);
  }

  /** The floodlight failed: the breaker drops on its own. */
  failed(): void {
    this.glitch(0.8);
  }

  private get floor() {
    return this.h - 14;
  }

  protected simulate(dt: number): void {
    const v = this.view!;
    for (const [id, a] of this.activity) this.activity.set(id, Math.max(0, a - dt * 2.5));
    if (this.visitor) {
      this.visitor.left -= dt;
      if (this.visitor.left <= 0) this.visitor = null;
    }
    // Under pressure someone visits without a phantom line too.
    this.visitorIn -= dt;
    if (v.threat >= 0.7 && this.visitorIn <= 0 && !this.visitor) {
      this.visitor = { x: 0.2 + Math.random() * 0.6, left: 3 };
      this.visitorIn = 30 + Math.random() * 40 - v.threat * 20;
    }
    if (Math.random() < dt * 3) {
      this.lines.shift();
      this.lines.push(0.3 + Math.random() * 0.7);
    }
  }

  protected draw(): void {
    const { ctx, w, h } = this;
    const v = this.view!;
    const fl = this.floor;

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#020a05');
    bg.addColorStop(1, '#0a1e13');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    this.line(0, fl, w, fl, C.deep, 1.5);
    for (let x = 0; x < w; x += 24) this.line(x, fl, x - 12, h, C.far, 1, 0.6);

    // Racks, one per script.
    const right = w - 70;
    const n = v.racks.length;
    const rw = Math.min(34, (right - 12) / n - 6);
    const top = 30;
    v.racks.forEach((r, i) => {
      const x = 10 + i * (rw + 6);
      if (!r.installed) {
        ctx.setLineDash([3, 3]);
        this.box(x, top, rw, fl - top, '#000000', 0.8);
        ctx.setLineDash([]);
        this.label('—', x + rw / 2, (top + fl) / 2, C.deep);
      } else {
        this.box(x, top, rw, fl - top, C.far, 1.2);
        const act = this.activity.get(r.id) ?? 0;
        for (let k = 0; k < 7; k++) {
          const y = top + 8 + k * 9;
          if (y > fl - 10) break;
          this.line(x + 4, y, x + rw - 10, y, C.deep, 1);
          const lit = r.on && (act > 0 ? Math.random() < 0.4 + act * 0.6 : Math.sin(this.t * 1.7 + k + i) > 0.6);
          ctx.fillStyle = lit ? C.glow : C.far;
          ctx.fillRect(x + rw - 7, y - 1.5, 3, 3);
        }
        if (!r.on) this.label('ВЫКЛ', x + rw / 2, fl - 4, '#c86a5a');
      }
      this.label(r.name, x + rw / 2, top - 4, r.installed ? C.green : C.deep);
    });

    // The floodlight breaker on the wall: up while the script works, down after a failure.
    if (v.breaker) {
      const bx = right + 16;
      // Below the camera's clock in the top right corner.
      const by = 58;
      this.box(bx, by, 22, 40, C.far, 1.2);
      const down = v.cooldown > 0;
      const shake = down ? Math.sin(this.t * 30) * 0.6 : 0;
      this.actor(() => this.box(bx + 7 + shake, down ? by + 22 : by + 4, 8, 14, down ? '#c86a5a' : C.hub, 1.2));
      this.label('LIGHT', bx + 11, by - 4, down ? '#c86a5a' : C.green);
      if (down) this.label(`${Math.ceil(v.cooldown)} с`, bx + 11, by + 52, '#c86a5a');
    }

    // The operator's monitor: the log scrolling.
    const mx = right + 6;
    const my = fl - 34;
    this.box(mx, my, 44, 26, C.far, 1.2);
    this.lines.forEach((len, k) => this.line(mx + 4, my + 5 + k * 3.4, mx + 4 + 36 * len, my + 5 + k * 3.4, C.green, 1, 0.7));
    this.line(mx + 22, my + 26, mx + 22, fl, C.deep, 2);

    if (this.visitor) this.drawVisitor(10 + this.visitor.x * (right - 20), fl);
    this.vignette(v.threat);
  }

  /** A tall figure between the racks. It does not move. */
  private drawVisitor(x: number, fl: number): void {
    const fade = Math.min(1, (this.visitor?.left ?? 0) / 0.5);
    this.ctx.globalAlpha = fade * (0.7 + Math.random() * 0.3);
    this.actor(() => {
      this.poly([[x - 6, fl], [x - 4, fl - 50], [x + 4, fl - 50], [x + 6, fl]], '#0a1a10', 1.2);
      this.circle(x, fl - 56, 6, '#0a1a10', 1.2);
    });
    this.ctx.fillStyle = C.light;
    this.ctx.fillRect(x - 3, fl - 57, 1.5, 1.5);
    this.ctx.fillRect(x + 1.5, fl - 57, 1.5, 1.5);
    this.ctx.globalAlpha = 1;
  }
}
