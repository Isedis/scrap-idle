import type { BottomState } from '../game/bottom';
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
  equipment: BottomState['equipment'];
  auto: number;
  depth: number;
  work: 'depth' | 'site' | 'seam';
  benchMode: BottomState['benchMode'];
  object: { id: 'hoist' | 'bench' | 'borer'; progress: number } | null;
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
    if (this.reducedMotion) return;
    this.flashColor = color;
    this.flashLeft = 0.9;
  }

  protected simulate(dt: number): void {
    const v = this.view!;
    // Trash down the shaft: more of it the more falls.
    if (Math.random() < dt * Math.min(30, 2 + v.fall * 0.8)) {
      this.bits.push({ x: this.w * rnd(0.18, 0.27), y: this.h * 0.12, vy: rnd(40, 80), s: rnd(1.5, 3.5), c: C.items[Math.floor(Math.random() * C.items.length)] });
    }
    for (const b of this.bits) {
      b.vy += 160 * dt;
      b.y += b.vy * dt;
      b.x += Math.sin(b.y * 0.05) * 0.3;
    }
    const ground = this.heapTop(this.w * 0.23);
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
    const u = (x - w * 0.23) / (w * 0.42);
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
    ctx.ellipse(w * 0.23, h * 0.08, w * 0.07, h * 0.025, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgb(170 230 190 / 0.12)';
    ctx.fill();
    // The walls of the shaft narrowing down into the dark.
    ctx.strokeStyle = 'rgb(60 110 80 / 0.25)';
    ctx.beginPath();
    ctx.moveTo(w * 0.16, h * 0.09);
    ctx.lineTo(w * 0.05, h * 0.75);
    ctx.moveTo(w * 0.30, h * 0.09);
    ctx.lineTo(w * 0.39, h * 0.75);
    ctx.stroke();

    // Exposed layers belong to the excavation, independently of the supply heap.
    const strata = Math.min(4, Math.floor(v.depth / 1000));
    for (let i = 0; i < 4; i++) {
      const y = h * (0.37 + i * 0.12);
      this.line(w * 0.44, y, w * 0.96, y + 3, i <= strata ? '#356b49' : '#193724', 1, 0.55);
    }
    this.label('ПОТОК СВЕРХУ', w * 0.22, h * 0.30, '#79aa88');

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
      for (let k = 0; k < Math.min(n, 2) && x + bw < w - 8; k++) {
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

    this.machines();
    this.buriedObject();
    this.workflow();
    const minerX = w * (v.work === 'site' ? 0.65 : v.work === 'seam' ? 0.80 : 0.55);
    this.miner(minerX, this.heapTop(minerX));

    if (this.flashLeft > 0) {
      ctx.fillStyle = this.flashColor;
      ctx.globalAlpha = 0.25 * this.flashLeft;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    this.vignette(0.5);
  }

  /** Routes show actual work allocation; animation only presents simulation state. */
  private workflow(): void {
    const { w, h, ctx } = this;
    const v = this.view!;
    const depthOn = v.work === 'depth' || (v.work === 'site' && v.equipment.hoist);
    const green = '#91c49b', dim = '#284c35', amber = '#d0b56d';
    // The excavation shaft is separate from the surface supply heap.
    const x = w * 0.56, y = h * 0.73, bottom = h * 0.94;
    this.box(x - 12, y, 25, bottom - y, '#030b06');
    this.line(x - 13, y, x - 13, bottom, depthOn ? green : dim);
    this.line(x + 14, y, x + 14, bottom, depthOn ? green : dim);
    for (let i = 0; i < 4; i++) {
      const phase = this.reducedMotion || !depthOn ? i / 4 : (i / 4 + this.t * 0.22) % 1;
      const py = y + phase * (bottom - y - 7);
      this.line(x - 4, py, x, py + 4, depthOn ? green : dim);
      this.line(x, py + 4, x + 4, py, depthOn ? green : dim);
    }
    // Material leaving the surface heap has a visible destination.
    const beltY = h * 0.93;
    this.line(w * 0.06, beltY, w * 0.34, beltY, '#4b7855', 2);
    for (let i = 0; i < (v.heap > 0 || v.fall > 0 ? 4 : 0); i++) {
      const phase = this.reducedMotion ? i / 4 : (i / 4 + this.t * 0.12) % 1;
      this.box(w * (0.06 + phase * 0.26), beltY - 5, 4, 3, '#8ca27d');
    }
    this.label(v.equipment.bench ? v.benchMode === 'scrap' ? '→ ЛОМ' : '→ ЦВЕТМЕТ' : '→ ТРУХА', w * 0.20, h * 0.98, '#91aa88');
    // A distinct mineral face identifies the seam, even with motion disabled.
    if (v.equipment.borer > 0) {
      for (let i = 0; i < 5; i++) {
        const sx = w * (0.86 + (i % 2) * 0.035), sy = h * (0.57 + i * 0.05);
        this.poly([[sx, sy - 4], [sx + 4, sy], [sx, sy + 5], [sx - 3, sy]], v.work === 'seam' ? amber : '#46573d');
      }
    }
    ctx.fillStyle = 'rgb(2 9 5 / 0.86)';
    ctx.fillRect(w * 0.41, h * 0.14, w * 0.57, h * 0.14);
    this.label(v.work === 'site' ? 'РАСКОПКА МАШИНЫ' : v.work === 'seam' ? 'ЖИЛА → АНОМАЛИИ' : 'ПРОХОД В ГЛУБИНУ', w * 0.70, h * 0.19, v.work === 'seam' ? amber : green);
    this.label(v.work === 'site' ? v.equipment.hoist ? '75% ОБЪЕКТ · 25% ВНИЗ' : 'ГЛУБИНА СТОИТ' : v.work === 'seam' ? 'ГЛУБИНА СТОИТ' : 'ГЛУБИНА РАСТЁТ', w * 0.70, h * 0.25, '#7b9d82');
  }

  /** Purchased machinery has a distinct silhouette and keeps a static reduced-motion view. */
  private buriedObject(): void {
    const v = this.view!;
    if (!v.object) return;
    const { w, h } = this;
    const x = w * 0.72, y = h * 0.49;
    const p = Math.max(0, Math.min(1, v.object.progress));
    const color = p >= 1 ? '#b2c587' : '#608c70';
    if (v.object.id === 'hoist') {
      this.box(x, y, 4, h * 0.22, color);
      this.box(x + 38, y, 4, h * 0.22, color);
      this.box(x, y, 42, 5, color);
      this.box(x + 10, y + h * 0.14, 23, 10, color);
    } else if (v.object.id === 'bench') {
      this.box(x, y + 20, 49, 6, color);
      this.box(x + 5, y + 25, 4, h * 0.17, color);
      this.box(x + 41, y + 25, 4, h * 0.17, color);
      this.box(x + 12, y + 7, 28, 12, color);
    } else {
      this.box(x + 2, y + 24, 47, 23, color);
      this.poly([[x + 2, y + 23], [x - 14, y + 35], [x + 2, y + 46]], color);
      for (let i = 0; i < 3; i++) this.circle(x + 12 + i * 13, y + 49, 4, color);
    }
    if (p < 1) {
      const edge = y + Math.floor(p * 4) / 4 * h * 0.30;
      const points: [number, number][] = [[x - 8, y + h * 0.31]];
      for (let i = 0; i <= 8; i++) points.push([x - 8 + i * w * 0.032, edge + Math.sin(i * 4.7) * 4]);
      points.push([x + w * 0.25, y + h * 0.31]);
      this.poly(points, '#0c2116');
      for (let i = 0; i < 9; i++) {
        const sx = x - 4 + (i % 5) * 15, sy = edge + 7 + Math.floor(i / 5) * 11;
        if (sy < y + h * 0.30) this.line(sx, sy, sx + 5, sy + 2, '#284b32');
      }
      if (v.work === 'site') for (let i = 0; i < 3; i++) {
        const phase = this.reducedMotion ? i / 3 : (this.t * 0.6 + i / 3) % 1;
        this.box(x - 6 - phase * 8, edge + phase * 14, 2, 2, '#84977c');
      }
    }
    this.label(p >= 1 ? 'ГОТОВО' : `ОТКОПАНО ${Math.floor(p * 100)}%`, x + 10, y - 10, '#8bb997');
  }

  /** Purchased machinery has a distinct silhouette and keeps a static reduced-motion view. */
  private machines(): void {
    const { w, h } = this;
    const v = this.view!;
    if (v.equipment.hoist) {
      const left = w * 0.42, right = w * 0.64, top = h * 0.38, floor = h * 0.91;
      this.box(left, top, 4, floor - top, '#386747');
      this.box(right, top, 4, floor - top, '#386747');
      this.box(left - 3, top - 4, right - left + 10, 6, '#568568');
      this.circle((left + right) / 2, top + 5, 5, '#759c7d');
      const travel = this.reducedMotion ? 0.45 : (1 + Math.sin(this.t * 0.8)) / 2;
      const y = top + 20 + travel * (floor - top - 40);
      this.line((left + right) / 2, top + 5, (left + right) / 2, y, '#93b795');
      this.box((left + right) / 2 - 9, y, 18, 11, '#467653');
    }
    if (v.equipment.bench || v.auto > 0) {
      const x = w * 0.07, y = h * 0.83;
      this.box(x, y, w * 0.23, 5, '#6c9472');
      this.box(x + 4, y + 5, 3, h * 0.1, '#386747');
      this.box(x + w * 0.20, y + 5, 3, h * 0.1, '#386747');
      this.box(x + 7, y - 12, 12, 11, '#4f8059');
      if (v.equipment.bench) {
        this.box(x + w * 0.13, y - 17, 14, 16, '#527c62');
        this.circle(x + w * 0.13 + 7, y - 9, 4, '#9fbea0');
        const phase = this.reducedMotion ? 0.5 : (this.t * 0.5) % 1;
        this.box(x + phase * w * 0.18, y - 4, 4, 3, '#a1b39a');
      }
    }
    if (v.equipment.borer > 0) {
      const x = w * 0.73, y = h * 0.91;
      this.box(x, y - 19, w * 0.16, 16, '#56765e');
      this.box(x - 12, y - 14, 12, 5, '#a4b8a1');
      this.poly([[x - 12, y - 19], [x - 21, y - 12], [x - 12, y - 5]], '#6a9479');
      for (let i = 0; i < 3; i++) this.circle(x + 6 + i * 12, y - 1, 5, '#35583e');
      const phase = this.reducedMotion ? 0 : Math.sin(this.t * 8) * 2;
      this.line(x - 18, y - 15 + phase, x - 12, y - 10 + phase, '#b7ccb5');
    }
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
