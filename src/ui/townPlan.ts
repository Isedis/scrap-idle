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

    DISTRICTS.forEach((d, i) => {
      const cell = inset(cells[i], 0.008).map(S);
      const owned = city.owned.includes(d.id);
      const seen = visible(city, d.id);
      const next = !owned && seen && (d.type !== 'pit' || pitReady(city));
      // The pit shows through the fog: everyone in town knows where it is.
      if (!seen && d.type !== 'pit') {
        this.fog(cell, i, d.id === this.selected);
        return;
      }
      this.path(cell);
      ctx.fillStyle = d.type === 'pit' ? '#000' : d.type === 'river' ? '#081d1c' : '#0c2216';
      ctx.fill();
      ctx.save();
      this.path(cell);
      ctx.clip();
      const [cx, cy] = S([d.x, d.y]);
      const size = w * 0.05;
      if (d.type === 'river') this.water(cell);
      if (owned) this.heap(cell, i, d.type === 'dump');
      else this.glyph(d.type, cx, cy, size, seen || d.type !== 'pit' ? 1 : 0.6);
      ctx.restore();
      // Outlines: the landfill's own in green, the next ones pulsing amber, the pit in red.
      this.path(cell);
      ctx.lineWidth = 1;
      ctx.strokeStyle = d.type === 'pit' ? RED : owned ? GLOW : DIM;
      ctx.globalAlpha = owned ? 0.8 : 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (next) {
        this.path(cell);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = AMBER;
        ctx.globalAlpha = 0.45 + 0.4 * Math.sin(this.t * 3 + i);
        ctx.stroke();
        ctx.globalAlpha = 1;
        this.text(`${format(annexCost(city, d.id))} га`, cx, cy + size * 1.1, AMBER, 9);
      } else if (d.type === 'pit' && !owned) {
        this.text('ПОСЛЕДНЯЯ', cx, cy + size * 1.5, RED, 8);
      }
      if (d.id === this.selected) {
        this.path(cell);
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = owned ? GLOW : AMBER;
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

  /** A district nobody from the landfill has seen yet: grey murk, drifting. */
  private fog(cell: Point[], seedBase: number, picked: boolean): void {
    const { ctx } = this;
    this.path(cell);
    ctx.fillStyle = '#0a0f0c';
    ctx.fill();
    ctx.save();
    this.path(cell);
    ctx.clip();
    const xs = cell.map((p) => p[0]);
    const ys = cell.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const bw = Math.max(...xs) - x0;
    const bh = Math.max(...ys) - y0;
    let seed = 7 + seedBase * 131;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 5; k++) {
      const px = x0 + ((r() * bw + this.t * (2 + k)) % bw);
      const py = y0 + r() * bh;
      const g = ctx.createRadialGradient(px, py, 0, px, py, bw * 0.45);
      g.addColorStop(0, 'rgb(120 140 128 / 0.14)');
      g.addColorStop(1, 'rgb(120 140 128 / 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x0, y0, bw, bh);
    }
    ctx.restore();
    this.path(cell);
    ctx.lineWidth = picked ? 2 : 1;
    ctx.strokeStyle = picked ? 'rgb(150 170 158 / 0.7)' : 'rgb(80 100 88 / 0.35)';
    ctx.stroke();
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
      case 'pit': {
        for (let k = 4; k >= 1; k--) {
          ctx.strokeStyle = `rgb(255 107 87 / ${0.12 * k})`;
          ctx.beginPath();
          ctx.ellipse(x, y, s * 0.35 * k + Math.sin(this.t * 0.8 + k) * 1.5, s * 0.22 * k, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
      default:
        break;
    }
    ctx.restore();
  }
}
