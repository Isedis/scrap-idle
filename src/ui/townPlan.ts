import { DISTRICTS, PLAN_H, annexCost, pitReady, plan, visible, type CityState, type DistrictType, type Point } from '../game/city';
import { format } from '../game/num';
import { el } from './dom';

const GLOW = '#7dff9a';
const MID = '#82d698';
const DIM = '#3d7a50';
const AMBER = '#ffbf47';
const RED = '#ff6b57';

/** Points of a cell pulled toward its centre, leaving room for the streets. */
function inset(cell: Point[], by: number): Point[] {
  const cx = cell.reduce((s, p) => s + p[0], 0) / cell.length;
  const cy = cell.reduce((s, p) => s + p[1], 0) / cell.length;
  return cell.map(([x, y]) => {
    const d = Math.hypot(x - cx, y - cy) || 1;
    return [x - ((x - cx) / d) * by, y - ((y - cy) / d) * by];
  });
}

function inside(p: Point, poly: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * A small tile of soft cloud: value noise on a coarse grid, summed over two octaves,
 * as alpha over a grey-green. Drawn stretched, it blurs into murk. Wraps at its edges.
 */
function cloudNoise(): HTMLCanvasElement {
  const W = 64;
  const H = 64;
  let seed = 1234;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const grid = (n: number) => Array.from({ length: n * n }, rnd);
  const sample = (g: number[], n: number, x: number, y: number) => {
    const gx = (x / W) * n;
    const gy = (y / H) * n;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const at = (i: number, j: number) => g[((j + n) % n) * n + ((i + n) % n)];
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
    const bottom = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
    return top * (1 - sy) + bottom * sy;
  };
  const g1 = grid(4);
  const g2 = grid(8);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = sample(g1, 4, x, y) * 0.65 + sample(g2, 8, x, y) * 0.35;
      const k = (y * W + x) * 4;
      img.data[k] = 92;
      img.data[k + 1] = 116;
      img.data[k + 2] = 102;
      img.data[k + 3] = Math.max(0, Math.min(255, (v - 0.3) * 2.2 * 255));
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * The plan of Glukhovo, drawn like an old survey sheet on a terminal: districts as the
 * shapes the streets cut, each marked with what it is; the landfill's stain spreading
 * over the ones it holds; the ones it can take next pulsing, with their price. A tap
 * picks a district.
 */
export class TownPlan {
  readonly root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private t = 0;
  private fogCanvas: HTMLCanvasElement | null = null;
  private noise: HTMLCanvasElement | null = null;
  selected = 'dump';

  constructor(private onPick: (id: string) => void) {
    this.root = el('div', 'town-plan');
    this.canvas = el('canvas', 'town-canvas');
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'План города Глухово');
    this.ctx = this.canvas.getContext('2d')!;
    this.root.append(this.canvas);
    this.canvas.addEventListener('click', (e) => {
      const box = this.canvas.getBoundingClientRect();
      const p: Point = [(e.clientX - box.left) / this.w, (e.clientY - box.top) / this.w];
      const i = plan().cells.findIndex((cell) => inside(p, cell));
      if (i >= 0) {
        this.selected = DISTRICTS[i].id;
        this.onPick(this.selected);
      }
    });
    new ResizeObserver(() => this.resize()).observe(this.root);
  }

  private resize(): void {
    const rect = this.root.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.width * PLAN_H;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.style.height = `${this.h}px`;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Every frame while the plan is on screen. */
  draw(dt: number, city: CityState): void {
    if (!this.w) this.resize();
    if (!this.w) return;
    this.t += dt;
    const { ctx, w, h } = this;
    const { cells } = plan();
    const S = (p: Point): Point => [p[0] * w, p[1] * w];

    // The sheet: dark, with a faint survey grid.
    ctx.fillStyle = '#06140c';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgb(61 122 80 / 0.18)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += w / 12) this.seg([x, 0], [x, h]);
    for (let y = 0; y < h; y += w / 12) this.seg([0, y], [w, y]);

    const pitIndex = DISTRICTS.findIndex((d) => d.type === 'pit');
    const seen = DISTRICTS.map((d) => visible(city, d.id));
    const shapes = cells.map((c) => inset(c, 0.008).map(S));

    // The districts: what the landfill can see in full, the rest only as streets under the fog.
    DISTRICTS.forEach((d, i) => {
      if (i === pitIndex) return;
      const cell = shapes[i];
      const owned = city.owned.includes(d.id);
      this.path(cell);
      if (!seen[i]) {
        ctx.fillStyle = '#081109';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgb(61 122 80 / 0.22)';
        ctx.stroke();
        return;
      }
      ctx.fillStyle = d.type === 'river' ? '#081d1c' : '#0c2216';
      ctx.fill();
      ctx.save();
      this.path(cell);
      ctx.clip();
      const [cx, cy] = S([d.x, d.y]);
      if (d.type === 'river') this.water(cell);
      if (owned) this.heap(cell, i, d.type === 'dump');
      else this.glyph(d.type, cx, cy, w * 0.05, 1);
      ctx.restore();
      this.path(cell);
      ctx.lineWidth = 1;
      ctx.strokeStyle = owned ? GLOW : DIM;
      ctx.globalAlpha = owned ? 0.8 : 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    this.drawFog(shapes, seen, pitIndex);
    // The pit goes over the fog: everyone in town knows where it is.
    this.abyss(shapes[pitIndex], S([DISTRICTS[pitIndex].x, DISTRICTS[pitIndex].y]), city.owned.includes('pit'));

    // Owned neighbours contributing to the selected district's cluster.
    const selected = DISTRICTS.find(d => d.id === this.selected)!;
    if (visible(city, selected.id) && selected.type !== 'school' && selected.type !== 'dump' && selected.type !== 'pit') {
      for (const id of plan().neighbours.get(selected.id) ?? []) {
        const index = DISTRICTS.findIndex(d => d.id === id);
        if (!city.owned.includes(id) || DISTRICTS[index].type !== selected.type) continue;
        this.path(shapes[index]);ctx.strokeStyle = GLOW;ctx.lineWidth = 1.8;
        ctx.setLineDash([3, 3]);ctx.stroke();ctx.setLineDash([]);
      }
    }
    // Prices and the picked district, crisp over everything.
    DISTRICTS.forEach((d, i) => {
      const cell = shapes[i];
      const owned = city.owned.includes(d.id);
      const [cx, cy] = S([d.x, d.y]);
      const size = w * 0.05;
      if (!owned && seen[i] && (d.type !== 'pit' || pitReady(city))) {
        this.path(cell);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = AMBER;
        ctx.globalAlpha = 0.45 + 0.4 * Math.sin(this.t * 3 + i);
        ctx.stroke();
        ctx.globalAlpha = 1;
        this.text(`${format(annexCost(city, d.id))} га`, cx, cy + size * (d.type === 'pit' ? 2.2 : 1.1), AMBER, 9);
      }
      if (d.id === this.selected) {
        this.path(cell);
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = owned ? GLOW : seen[i] || d.type === 'pit' ? AMBER : 'rgb(170 190 178 / 0.7)';
        ctx.stroke();
      }
    });

    // The selected district's name in a label at the top of the sheet.
    const sel = DISTRICTS.find((d) => d.id === this.selected)!;
    const selName = visible(city, sel.id) || sel.type === 'pit' ? sel.name.toUpperCase() : '? ? ?';
    ctx.fillStyle = 'rgb(0 0 0 / 0.65)';
    ctx.fillRect(0, 0, w, 16);
    this.text(selName, 6, 11, MID, 9, 'left');
    this.text('ГЛУХОВО · ПЛАН 1903 г.', w - 6, 11, DIM, 9, 'right');
  }

  private path(poly: Point[]): void {
    const { ctx } = this;
    ctx.beginPath();
    poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }

  private seg(a: Point, b: Point): void {
    this.ctx.beginPath();
    this.ctx.moveTo(...a);
    this.ctx.lineTo(...b);
    this.ctx.stroke();
  }

  private text(s: string, x: number, y: number, color: string, size: number, align: CanvasTextAlign = 'center'): void {
    const { ctx } = this;
    ctx.font = `700 ${size}px "JetBrains Mono Variable", monospace`;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  /**
   * One sheet of fog over the whole plan, drifting in two layers; it thins out over what
   * the landfill holds and borders, with soft edges that follow the streets.
   */
  private drawFog(shapes: Point[][], seen: boolean[], skip: number): void {
    const { w, h } = this;
    if (!this.fogCanvas || this.fogCanvas.width !== Math.ceil(w) || this.fogCanvas.height !== Math.ceil(h)) {
      this.fogCanvas = document.createElement('canvas');
      this.fogCanvas.width = Math.ceil(w);
      this.fogCanvas.height = Math.ceil(h);
    }
    const noise = (this.noise ??= cloudNoise());
    const f = this.fogCanvas.getContext('2d')!;
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, w, h);
    f.fillStyle = 'rgb(5 11 8 / 0.86)';
    f.fillRect(0, 0, w, h);
    // Two layers of cloud, sliding at different speeds and scales: the murk moves.
    f.imageSmoothingEnabled = true;
    const layer = (scale: number, speed: number, alpha: number) => {
      const tw = w * scale;
      const th = tw * (noise.height / noise.width);
      const ox = -((this.t * speed) % tw);
      const oy = -((this.t * speed * 0.35) % th);
      f.globalAlpha = alpha;
      for (let x = ox; x < w; x += tw) for (let y = oy; y < h; y += th) f.drawImage(noise, x, y, tw, th);
      f.globalAlpha = 1;
    };
    layer(1.3, 5, 0.55);
    layer(0.8, 9, 0.35);
    // Clear the fog over what is seen, feathered: each cell again, a little larger and fainter.
    f.globalCompositeOperation = 'destination-out';
    shapes.forEach((cell, i) => {
      if (!seen[i] || i === skip) return;
      const cx = cell.reduce((a, p) => a + p[0], 0) / cell.length;
      const cy = cell.reduce((a, p) => a + p[1], 0) / cell.length;
      [
        [1, 1],
        [1.1, 0.45],
        [1.22, 0.25],
        [1.36, 0.12],
      ].forEach(([k, a]) => {
        f.globalAlpha = a;
        f.beginPath();
        cell.forEach(([x, y], n) => {
          const px = cx + (x - cx) * k;
          const py = cy + (y - cy) * k;
          if (n) f.lineTo(px, py);
          else f.moveTo(px, py);
        });
        f.closePath();
        f.fill();
      });
    });
    f.globalAlpha = 1;
    f.globalCompositeOperation = 'source-over';
    this.ctx.drawImage(this.fogCanvas, 0, 0, w, h);
  }

  /**
   * The black pit: wider than any district, deeper than the sheet. Rings sink into it,
   * junk spirals down, cracks run out into the streets around, and far down something
   * glows. Once it is the landfill's, it glows back.
   */
  private abyss(cell: Point[], centre: Point, open: boolean): void {
    const { ctx, t } = this;
    const [cx, cy] = centre;
    const r = Math.max(...cell.map(([x, y]) => Math.hypot(x - cx, y - cy)));
    // Shadow over the streets around: the ground sags toward it.
    const halo = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.5);
    halo.addColorStop(0, 'rgb(0 0 0 / 0.7)');
    halo.addColorStop(1, 'rgb(0 0 0 / 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
    ctx.fill();
    // Cracks into the neighbours, flickering faintly red.
    ctx.strokeStyle = RED;
    ctx.lineWidth = 1;
    for (let k = 0; k < 9; k++) {
      let seed = 3 + k * 53;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const a0 = (k / 9) * Math.PI * 2 + rnd() * 0.5;
      ctx.globalAlpha = 0.15 + 0.15 * Math.sin(t * 1.3 + k * 1.7);
      ctx.beginPath();
      let x = cx + Math.cos(a0) * r * 0.75;
      let y = cy + Math.sin(a0) * r * 0.75;
      ctx.moveTo(x, y);
      const len = r * (0.5 + rnd() * 0.5);
      for (let d = 0; d < len; d += r * 0.12) {
        const a = a0 + (rnd() - 0.5) * 0.9;
        x += Math.cos(a) * r * 0.12;
        y += Math.sin(a) * r * 0.12;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.save();
    this.path(cell);
    ctx.clip();
    // Depth: black at the middle, the faintest red at the lip.
    const deep = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    deep.addColorStop(0, '#000');
    deep.addColorStop(0.7, '#050102');
    deep.addColorStop(1, open ? '#2a0806' : '#140405');
    ctx.fillStyle = deep;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    // Rings sinking in: born at the lip, fading as they shrink toward the middle.
    for (let k = 0; k < 6; k++) {
      const p = (t * 0.07 + k / 6) % 1;
      const rr = r * (1 - p) * 0.95;
      ctx.strokeStyle = `rgb(255 107 87 / ${0.32 * (1 - p) * p * 4 * (open ? 1.5 : 1)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rr, rr * 0.82, t * 0.05, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Spiral arms, turning slowly the way water goes down a drain.
    ctx.lineWidth = 1.2;
    for (let arm = 0; arm < 3; arm++) {
      ctx.strokeStyle = 'rgb(255 107 87 / 0.18)';
      ctx.beginPath();
      for (let s = 0; s <= 1; s += 0.04) {
        const a = -t * 0.25 + arm * ((Math.PI * 2) / 3) + s * 4.2;
        const rr = r * (1 - s) * 0.92;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr * 0.82;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Junk going down: each speck spirals in and starts again at the lip.
    for (let k = 0; k < 22; k++) {
      const p = (t * (0.04 + (k % 5) * 0.012) + k * 0.137) % 1;
      const rr = r * (1 - p) * 0.9;
      const a = k * 2.4 - t * (0.3 + p * 1.6);
      ctx.globalAlpha = 0.8 * (1 - p);
      ctx.fillStyle = ['#6a9f74', '#4f8a60', '#9fe8a8'][k % 3];
      const size = 2.2 * (1 - p) + 0.6;
      ctx.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.82, size, size);
    }
    ctx.globalAlpha = 1;
    // Far down: a slow ember, now and then an opening of light, as if it looked up.
    const beat = 0.5 + 0.5 * Math.sin(t * 0.9);
    const ember = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.35);
    ember.addColorStop(0, `rgb(255 80 60 / ${(open ? 0.55 : 0.25) + 0.2 * beat})`);
    ember.addColorStop(1, 'rgb(255 80 60 / 0)');
    ctx.fillStyle = ember;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    if (Math.sin(t * 0.37) > 0.97) {
      ctx.fillStyle = 'rgb(255 190 170 / 0.8)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.12, r * 0.025, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // The lip.
    this.path(cell);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = RED;
    ctx.globalAlpha = 0.55 + 0.2 * Math.sin(t * 0.8);
    ctx.stroke();
    ctx.globalAlpha = 1;
    this.text(open ? 'ЯМА ОТКРЫТА' : 'ЧЁРНАЯ ЯМА', cx, cy + r * 0.78, 'rgb(255 107 87 / 0.75)', 8);
  }

  /** Water: lines drifting across the cell. */
  private water(cell: Point[]): void {
    const { ctx } = this;
    const ys = cell.map((p) => p[1]);
    const xs = cell.map((p) => p[0]);
    ctx.strokeStyle = 'rgb(111 207 138 / 0.35)';
    ctx.lineWidth = 1;
    for (let y = Math.min(...ys); y < Math.max(...ys); y += 6) {
      ctx.beginPath();
      for (let x = Math.min(...xs); x < Math.max(...xs); x += 4) {
        const yy = y + Math.sin(x * 0.15 + this.t * 1.5) * 1.5;
        if (x === Math.min(...xs)) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  /** The landfill's stain over a district: dark, piled, junk in it; now and then a red light. */
  private heap(cell: Point[], seedBase: number, home: boolean): void {
    const { ctx } = this;
    const xs = cell.map((p) => p[0]);
    const ys = cell.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const bw = Math.max(...xs) - x0;
    const bh = Math.max(...ys) - y0;
    ctx.fillStyle = home ? '#1f4a30' : '#122f1e';
    ctx.fillRect(x0, y0, bw, bh);
    let seed = 11 + seedBase * 97;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // Piles over what was there, lit along their tops.
    for (let k = 0; k < 7; k++) {
      const px = x0 + r() * bw;
      const py = y0 + r() * bh;
      const rx = 7 + r() * 14;
      const ry = 4 + r() * 7;
      ctx.beginPath();
      ctx.ellipse(px, py, rx, ry, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = ['#1f4a30', '#2f6b45', '#173a26'][k % 3];
      ctx.fill();
      ctx.strokeStyle = 'rgb(95 176 122 / 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(px, py, rx, ry, 0, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    // Junk.
    for (let k = 0; k < 26; k++) {
      ctx.fillStyle = ['#6a9f74', '#4f8a60', '#9fe8a8'][k % 3];
      ctx.globalAlpha = 0.7;
      ctx.fillRect(x0 + r() * bw, y0 + r() * bh, 1.5 + r() * 3, 1.5 + r() * 2);
    }
    ctx.globalAlpha = 1;
    // Someone is still there.
    if (!home && Math.sin(this.t * 0.6 + seedBase * 2.1) > 0.985) {
      ctx.fillStyle = RED;
      ctx.fillRect(x0 + bw * 0.5, y0 + bh * 0.5, 2.5, 2.5);
    }
    if (home) this.text('ПОЛИГОН', x0 + bw / 2, y0 + bh / 2 + 3, GLOW, 8);
  }

  /** What a district is, drawn small: houses, a chimney, a cross, crosses, a book… */
  private glyph(type: DistrictType, x: number, y: number, s: number, a: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = MID;
    ctx.fillStyle = '#0c2216';
    ctx.lineWidth = 1.2;
    const house = (hx: number, hy: number, hw: number) => {
      ctx.beginPath();
      ctx.moveTo(hx - hw, hy);
      ctx.lineTo(hx - hw, hy - hw);
      ctx.lineTo(hx, hy - hw * 1.7);
      ctx.lineTo(hx + hw, hy - hw);
      ctx.lineTo(hx + hw, hy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };
    switch (type) {
      case 'live':
        house(x - s * 0.6, y + s * 0.3, s * 0.32);
        house(x + s * 0.1, y + s * 0.15, s * 0.4);
        house(x + s * 0.75, y + s * 0.35, s * 0.3);
        ctx.fillStyle = 'rgb(200 255 210 / 0.7)';
        ctx.fillRect(x + s * 0.05, y - s * 0.2, 2, 2);
        break;
      case 'prom':
      case 'boiler': {
        ctx.strokeRect(x - s * 0.6, y - s * 0.1, s * 1.1, s * 0.5);
        ctx.strokeRect(x + (type === 'boiler' ? -0.15 : 0.25) * s, y - s * (type === 'boiler' ? 1.2 : 0.8), s * 0.22, s * (type === 'boiler' ? 1.1 : 0.7));
        // Smoke.
        const sx = x + (type === 'boiler' ? -0.04 : 0.36) * s;
        const sy = y - s * (type === 'boiler' ? 1.25 : 0.85);
        ctx.strokeStyle = 'rgb(130 214 152 / 0.5)';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(sx + s * 0.3, sy - s * 0.3 + Math.sin(this.t) * 2, sx + s * 0.1, sy - s * 0.6);
        ctx.stroke();
        break;
      }
      case 'market':
        for (let k = 0; k < 2; k++) {
          const mx = x + (k - 0.5) * s * 0.9;
          ctx.strokeRect(mx - s * 0.35, y - s * 0.1, s * 0.7, s * 0.45);
          ctx.beginPath();
          ctx.moveTo(mx - s * 0.45, y - s * 0.1);
          for (let z = 0; z <= 4; z++) ctx.lineTo(mx - s * 0.45 + z * s * 0.225, y - s * (z % 2 ? 0.35 : 0.1));
          ctx.stroke();
        }
        break;
      case 'school':
        house(x, y + s * 0.3, s * 0.6);
        ctx.beginPath();
        ctx.moveTo(x, y - s * 0.7);
        ctx.lineTo(x, y - s * 1.2);
        ctx.lineTo(x + s * 0.35, y - s * 1.08);
        ctx.lineTo(x, y - s * 0.96);
        ctx.stroke();
        break;
      case 'church':
        house(x, y + s * 0.4, s * 0.45);
        ctx.beginPath();
        ctx.moveTo(x, y - s * 0.38);
        ctx.lineTo(x, y - s * 1.0);
        ctx.moveTo(x - s * 0.18, y - s * 0.8);
        ctx.lineTo(x + s * 0.18, y - s * 0.8);
        ctx.stroke();
        break;
      case 'cemetery':
        for (let k = 0; k < 5; k++) {
          const gx = x + ((k % 3) - 1) * s * 0.55;
          const gy = y + Math.floor(k / 3) * s * 0.6 - s * 0.2;
          ctx.beginPath();
          ctx.moveTo(gx, gy - s * 0.3);
          ctx.lineTo(gx, gy + s * 0.2);
          ctx.moveTo(gx - s * 0.13, gy - s * 0.15);
          ctx.lineTo(gx + s * 0.13, gy - s * 0.15);
          ctx.stroke();
        }
        break;
      case 'archive':
        ctx.strokeRect(x - s * 0.5, y - s * 0.4, s, s * 0.75);
        for (let k = 1; k < 4; k++) {
          ctx.beginPath();
          ctx.moveTo(x - s * 0.35, y - s * 0.4 + k * s * 0.18);
          ctx.lineTo(x + s * 0.35, y - s * 0.4 + k * s * 0.18);
          ctx.stroke();
        }
        break;
      case 'hospital':
        ctx.strokeRect(x - s * 0.6, y - s * 0.45, s * 1.2, s * 0.85);
        ctx.lineWidth = 2;
        ctx.strokeStyle = RED;
        ctx.beginPath();
        ctx.moveTo(x, y - s * 0.3);
        ctx.lineTo(x, y + s * 0.25);
        ctx.moveTo(x - s * 0.27, y - s * 0.02);
        ctx.lineTo(x + s * 0.27, y - s * 0.02);
        ctx.stroke();
        break;
      case 'depot':
        // A lorry: box, cab, two wheels.
        ctx.strokeRect(x - s * 0.7, y - s * 0.45, s * 0.9, s * 0.6);
        ctx.strokeRect(x + s * 0.2, y - s * 0.2, s * 0.45, s * 0.35);
        ctx.beginPath();
        ctx.arc(x - s * 0.4, y + s * 0.28, s * 0.13, 0, Math.PI * 2);
        ctx.moveTo(x + s * 0.55, y + s * 0.28);
        ctx.arc(x + s * 0.42, y + s * 0.28, s * 0.13, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'post':
        ctx.strokeRect(x - s * 0.55, y - s * 0.35, s * 1.1, s * 0.7);
        ctx.beginPath();
        ctx.moveTo(x - s * 0.55, y - s * 0.35);
        ctx.lineTo(x, y + s * 0.05);
        ctx.lineTo(x + s * 0.55, y - s * 0.35);
        ctx.stroke();
        break;
      case 'station':
        // Rails running through, a platform roof over them.
        ctx.beginPath();
        ctx.moveTo(x - s, y + s * 0.2);
        ctx.lineTo(x + s, y + s * 0.2);
        ctx.moveTo(x - s, y + s * 0.45);
        ctx.lineTo(x + s, y + s * 0.45);
        for (let k = -4; k <= 4; k++) {
          ctx.moveTo(x + k * s * 0.22, y + s * 0.12);
          ctx.lineTo(x + k * s * 0.22, y + s * 0.53);
        }
        ctx.moveTo(x - s * 0.6, y - s * 0.4);
        ctx.lineTo(x + s * 0.6, y - s * 0.4);
        ctx.moveTo(x - s * 0.45, y - s * 0.4);
        ctx.lineTo(x - s * 0.45, y + s * 0.05);
        ctx.moveTo(x + s * 0.45, y - s * 0.4);
        ctx.lineTo(x + s * 0.45, y + s * 0.05);
        ctx.stroke();
        break;
      case 'river':
        break;
      default:
        break;
    }
    ctx.restore();
  }
}
