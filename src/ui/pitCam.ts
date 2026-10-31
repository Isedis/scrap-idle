import { Camera } from './camera';
import { C } from './scene';

/** What camera 09 needs to know about the bottom. */
export interface PitView {
  /** Tonnes lying on the heap. */
  heap: number;
  /** Tonnes a minute falling in from above. */
  fall: number;
  /** Tonnes a minute Ignatyev digs, if there is anything to dig. */
  dig: number;
  /** Containers dug out and waiting, by kind, sack first. */
  stock: number[];
}

interface Bit {
  x: number;
  y: number;
  vy: number;
  s: number;
  c: string;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Camera 09 at the bottom of the pit: far up, the mouth of the pit, a pale ring with the
 * world above in it; down its shaft the trash keeps falling onto the heap. On the heap a
 * man in a padded jacket with a headlamp swings a pick: Ignatyev, here since 1987. Beside
 * him, what he has dug out: sacks, crates, a suitcase, a safe, now and then a coffin. Now
 * and then he stops, straightens and looks up into the camera.
 */
export class PitCam extends Camera<PitView> {
  private bits: Bit[] = [];
  private swing = 0;
  private lookUp = 0;
  private lookIn = 30;
  private flashColor = '';
  private flashLeft = 0;

  constructor() {
    super('КАМ-09 · ДНО', 'Камера на дне ямы');
    this.root.classList.add('pit');
    this.lurks = false;
  }

  /** A rare find: the frame lights in its colour for a moment. */
  find(color: string): void {
    this.flashColor = color;
    this.flashLeft = 0.9;
  }

  protected simulate(dt: number): void {
    const v = this.view!;
    // Trash down the shaft: more of it the more falls.
    if (Math.random() < dt * Math.min(30, 2 + v.fall * 0.8)) {
      this.bits.push({ x: this.w * rnd(0.42, 0.58), y: this.h * 0.12, vy: rnd(40, 80), s: rnd(1.5, 3.5), c: C.items[Math.floor(Math.random() * C.items.length)] });
    }
    for (const b of this.bits) {
      b.vy += 160 * dt;
      b.y += b.vy * dt;
      b.x += Math.sin(b.y * 0.05) * 0.3;
    }
    const ground = this.heapTop(this.w * 0.5);
    this.bits = this.bits.filter((b) => b.y < ground);
    if (v.dig > 0 && this.lookUp <= 0) this.swing += dt * (2.4 + Math.min(4, v.dig * 0.15));
    this.lookIn -= dt;
    if (this.lookIn <= 0) {
      this.lookUp = rnd(2, 3.5);
      this.lookIn = rnd(40, 90);
    }
    this.lookUp = Math.max(0, this.lookUp - dt);
    this.flashLeft = Math.max(0, this.flashLeft - dt);
  }

  /** The heap's height at x: a wide mound, higher the more lies on it. */
  private heapTop(x: number): number {
    const { w, h } = this;
    const v = this.view!;
    const tall = Math.min(0.42, 0.12 + Math.log10(1 + v.heap) * 0.08);
    const u = (x - w * 0.5) / (w * 0.75);
    return h - h * tall * Math.max(0, 1 - u * u) - h * 0.06;
  }

  protected draw(): void {
    const { ctx, w, h } = this;
    const v = this.view!;
    // The cavern: black, the walls catching a little of the light from above.
    ctx.fillStyle = '#020604';
    ctx.fillRect(0, 0, w, h);
    const shaft = ctx.createRadialGradient(w * 0.5, h * 0.08, 0, w * 0.5, h * 0.5, h * 1.1);
    shaft.addColorStop(0, 'rgb(130 200 150 / 0.22)');
    shaft.addColorStop(0.35, 'rgb(60 110 80 / 0.08)');
    shaft.addColorStop(1, 'rgb(0 0 0 / 0)');
    ctx.fillStyle = shaft;
    ctx.fillRect(0, 0, w, h);
    // The mouth of the pit, far up: a pale ring, the world above in it.
    ctx.strokeStyle = 'rgb(170 230 190 / 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.08, w * 0.09, h * 0.025, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgb(170 230 190 / 0.12)';
    ctx.fill();
    // The walls of the shaft narrowing down into the dark.
    ctx.strokeStyle = 'rgb(60 110 80 / 0.25)';
    ctx.beginPath();
    ctx.moveTo(w * 0.41, h * 0.09);
    ctx.lineTo(w * 0.05, h * 0.75);
    ctx.moveTo(w * 0.59, h * 0.09);
    ctx.lineTo(w * 0.95, h * 0.75);
    ctx.stroke();

    // Falling trash.
    for (const b of this.bits) {
      ctx.fillStyle = b.c;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(b.x, b.y, b.s, b.s);
    }
    ctx.globalAlpha = 1;

    // The heap, with junk on its slope.
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) ctx.lineTo(x, this.heapTop(x) + Math.sin(x * 0.27) * 2);
    ctx.lineTo(w, h);
    ctx.closePath();
    this.paint(C.heapBack, 1.2);
    let seed = 5;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 40; i++) {
      const x = r() * w;
      const y = this.heapTop(x) + 4 + r() * (h - this.heapTop(x));
      this.box(x, y, 2 + r() * 5, 1.5 + r() * 3, C.heapFront, 0.6);
    }

    // What he has dug out, stacked by his side.
    const baseX = w * 0.68;
    let x = baseX;
    const shapes: [number, number, string][] = [
      [9, 7, '#2f6b45'],
      [11, 9, '#3f7a52'],
      [13, 9, '#4f8a60'],
      [11, 11, '#6a9f74'],
      [20, 7, '#1a2a20'],
    ];
    v.stock.forEach((n, i) => {
      const [bw, bh, c] = shapes[i];
      for (let k = 0; k < Math.min(n, i === 0 ? 5 : 3); k++) {
        const y = this.heapTop(x) - bh;
        this.box(x, y - (k % 2) * 2, bw, bh, c, 1);
        if (i === 4) {
          // A coffin: a cross scratched on the lid.
          ctx.strokeStyle = 'rgb(255 107 87 / 0.6)';
          ctx.beginPath();
          ctx.moveTo(x + bw / 2, y + 1);
          ctx.lineTo(x + bw / 2, y + bh - 1);
          ctx.moveTo(x + bw / 2 - 3, y + 3);
          ctx.lineTo(x + bw / 2 + 3, y + 3);
          ctx.stroke();
        }
        x += bw + 2;
      }
    });

    this.miner(w * 0.46, this.heapTop(w * 0.46));

    if (this.flashLeft > 0) {
      ctx.fillStyle = this.flashColor;
      ctx.globalAlpha = 0.25 * this.flashLeft;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    this.vignette(0.5);
  }

  /** Ignatyev: a padded jacket, a cap with a lamp, the pick going up and down. */
  private miner(x: number, ground: number): void {
    const { ctx } = this;
    const looking = this.lookUp > 0;
    const a = looking ? -0.2 : Math.sin(this.swing) * 0.9 - 0.3;
    const head: [number, number] = [x, ground - 30];
    // The lamp's beam: down at the heap, or up into the camera when he looks.
    const beam = ctx.createRadialGradient(head[0], head[1], 0, head[0], head[1], 70);
    beam.addColorStop(0, 'rgb(220 255 210 / 0.35)');
    beam.addColorStop(1, 'rgb(220 255 210 / 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(head[0], head[1]);
    const dir = looking ? -Math.PI / 2 : Math.PI * 0.2;
    ctx.arc(head[0], head[1], 70, dir - 0.35, dir + 0.35);
    ctx.closePath();
    ctx.fill();
    this.actor(() => {
      // Legs, body, the head with its cap.
      this.poly([[x - 6, ground], [x - 3, ground - 14], [x + 3, ground - 14], [x + 6, ground]], '#0e2015', 1);
      this.poly([[x - 7, ground - 13], [x - 6, ground - 26], [x + 6, ground - 26], [x + 7, ground - 13]], '#16402a', 1.2);
      this.circle(head[0], head[1], 4.5, '#0e2015', 1.2);
      this.box(head[0] - 5, head[1] - 6, 10, 2.5, '#16402a', 1);
      // The arm and the pick.
      const hx = x + 4 + Math.cos(a) * 10;
      const hy = ground - 22 + Math.sin(a) * 10;
      ctx.beginPath();
      ctx.moveTo(x + 4, ground - 22);
      ctx.lineTo(hx, hy);
      this.paint('#16402a', 2);
      ctx.beginPath();
      ctx.moveTo(hx - Math.sin(a) * 6, hy + Math.cos(a) * 6);
      ctx.lineTo(hx + Math.sin(a) * 6, hy - Math.cos(a) * 6);
      this.paint('#6a9f74', 1.5);
    });
    // The lamp itself.
    ctx.fillStyle = '#e8ffe8';
    ctx.fillRect(head[0] - 1, head[1] - 5, 2.5, 2.5);
  }
}
