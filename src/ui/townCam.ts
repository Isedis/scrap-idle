import { Camera } from './camera';
import { C } from './scene';

/** What camera 08 needs to know about the town. */
export interface TownView {
  /** Share of the town the landfill holds, 0..1. */
  taken: number;
  /** The pit has been taken. */
  pit: boolean;
}

interface House {
  x: number;
  w: number;
  h: number;
  row: number;
  windows: [number, number][];
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Camera 08: Glukhovo at night from the hill. Rows of roofs with a few lit windows, a
 * church spire, the pit glowing faintly in the middle of the old town, and the heap
 * coming over the town from the left as districts are taken. Under the heap, now and
 * then, a window still lights up, red. Sometimes every window in town goes out at once.
 */
export class TownCam extends Camera<TownView> {
  private houses: House[] = [];
  /** Seconds of the whole town dark. */
  private blackout = 0;
  private blackoutIn = 25;

  constructor() {
    super('КАМ-08 · ГЛУХОВО', 'Камера на холме над городом');
  }

  protected onResize(): void {
    // Houses in four rows, the nearer rows bigger; laid out once per size, the same every time.
    let seed = 7;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    this.houses = [];
    for (let row = 0; row < 4; row++) {
      for (let x = -10; x < this.w + 10; ) {
        const w = 14 + r() * 18 + row * 5;
        const h = 10 + r() * 16 + row * 5;
        const windows: [number, number][] = [];
        for (let k = 0; k < 3; k++) if (r() < 0.5) windows.push([r(), r()]);
        this.houses.push({ x, w, h, row, windows });
        x += w + 3 + r() * 6;
      }
    }
  }

  protected simulate(dt: number): void {
    this.blackout -= dt;
    this.blackoutIn -= dt;
    if (this.blackoutIn <= 0) {
      this.blackout = rnd(0.8, 2);
      this.blackoutIn = rnd(30, 70);
    }
  }

  /** Where the heap's edge is across the picture, at height y: it leans over the town. */
  private heapEdge(): number {
    return this.w * (0.12 + 0.75 * this.view!.taken);
  }

  protected draw(): void {
    const { ctx, w, h } = this;
    const v = this.view!;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#020a05');
    sky.addColorStop(1, '#0d2818');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    const edge = this.heapEdge();
    const dark = this.blackout > 0;

    // The church spire behind the houses, right of the town.
    const sx = w * 0.84;
    this.box(sx, h * 0.18, 8, h * 0.34, '#16402a', 1);
    this.poly([[sx - 3, h * 0.18], [sx + 4, h * 0.06], [sx + 11, h * 0.18]], '#16402a', 1);

    for (const hs of this.houses) {
      const y = h * (0.45 + hs.row * 0.14);
      const buried = hs.x + hs.w < edge - hs.row * 6;
      ctx.fillStyle = buried ? '#06120a' : ['#0b2216', '#0e2a1b', '#123321', '#16402a'][hs.row];
      ctx.fillRect(hs.x, y - hs.h, hs.w, hs.h);
      ctx.beginPath();
      ctx.moveTo(hs.x - 2, y - hs.h);
      ctx.lineTo(hs.x + hs.w / 2, y - hs.h - 6 - hs.row);
      ctx.lineTo(hs.x + hs.w + 2, y - hs.h);
      ctx.fill();
      for (const [wx, wy] of hs.windows) {
        const px = hs.x + 3 + wx * (hs.w - 6);
        const py = y - hs.h + 3 + wy * (hs.h - 6);
        if (buried) {
          // Nobody lives there any more. A window lights up anyway.
          if (Math.sin(this.t * 0.7 + hs.x) > 0.97) {
            ctx.fillStyle = '#ff6b57';
            ctx.globalAlpha = 0.8;
            ctx.fillRect(px, py, 2.5, 2.5);
            ctx.globalAlpha = 1;
          }
        } else if (!dark) {
          ctx.fillStyle = C.light;
          ctx.globalAlpha = 0.55 + 0.1 * Math.sin(this.t + hs.x);
          ctx.fillRect(px, py, 2.5, 2.5);
          ctx.globalAlpha = 1;
        }
      }
    }

    // The pit in the old town, glowing a little from below.
    const px = w * 0.62;
    const py = h * 0.74;
    const glow = ctx.createRadialGradient(px, py, 2, px, py, 46);
    glow.addColorStop(0, v.pit ? 'rgb(255 107 87 / 0.35)' : 'rgb(255 107 87 / 0.15)');
    glow.addColorStop(1, 'rgb(255 107 87 / 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(px - 46, py - 46, 92, 92);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(px, py, 30, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // The heap, coming over the town from the left.
    ctx.fillStyle = '#1f4a30';
    ctx.strokeStyle = '#5fb07a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.2);
    for (let x = 0; x <= edge; x += 6) {
      const u = x / Math.max(edge, 1);
      ctx.lineTo(x, h * 0.2 + u ** 1.5 * h * 0.75 + Math.sin(x * 0.31 + this.t * 0.2) * 3);
    }
    ctx.lineTo(edge, h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Junk on its slope.
    let seed = 3;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 40; i++) {
      const x = r() * edge;
      const u = x / Math.max(edge, 1);
      const y = h * 0.2 + u ** 1.5 * h * 0.75 + 4 + r() * 30;
      this.box(x, y, 3 + r() * 5, 2 + r() * 3, '#3f7a52', 0.6);
    }
    if (dark) {
      ctx.fillStyle = 'rgb(0 0 0 / 0.35)';
      ctx.fillRect(0, 0, w, h);
    }
    this.vignette(0.3);
  }
}
