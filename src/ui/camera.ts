import { C, HALO, phosphor } from './scene';
import { el } from './dom';

/**
 * Shared ground for the security cameras on the other tabs: the same night-vision look
 * as camera 01 over the dump (dim bodies, bright edges, a dark halo around what moves),
 * interference, and the REC overlay. Each camera draws its own room.
 */
export abstract class Camera<V> {
  readonly root: HTMLElement;
  protected ctx: CanvasRenderingContext2D;
  protected canvas: HTMLCanvasElement;
  protected w = 0;
  protected h = 0;
  protected t = 0;
  protected view: V | null = null;
  protected reducedMotion: boolean;
  private mode: 'scenery' | 'actor' | 'halo' = 'scenery';
  private glitchLeft = 0;
  private flashAlpha = 0;
  private clock: HTMLElement;

  constructor(label: string, aria: string) {
    this.root = el('div', 'feed cam');
    this.canvas = el('canvas', 'feed-canvas');
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', aria);
    this.clock = el('div', 'feed-clock', '00:00:00');
    this.root.append(this.canvas, el('div', 'feed-label', label), el('div', 'feed-rec', 'REC'), this.clock);
    this.ctx = this.canvas.getContext('2d')!;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    new ResizeObserver(() => this.resize()).observe(this.canvas);
  }

  private resize(): void {
    // One canvas pixel per CSS pixel, scaled up without smoothing, like camera 01.
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(rect.width);
    this.canvas.height = Math.round(rect.height);
    this.onResize();
  }

  /** For rooms that lay things out by size. */
  protected onResize(): void {}

  glitch(seconds: number): void {
    if (!this.reducedMotion) this.glitchLeft = Math.max(this.glitchLeft, seconds);
  }

  flash(): void {
    if (!this.reducedMotion) this.flashAlpha = 0.3;
  }

  /** Every frame while the camera is on screen. */
  update(dt: number, view: V): void {
    this.view = view;
    if (!this.w) this.resize();
    if (!this.w || !this.h) return;
    dt = Math.min(dt, 0.1);
    this.t += dt;
    if (!this.reducedMotion) this.simulate(dt);
    this.draw();
    if (this.flashAlpha > 0) {
      this.ctx.fillStyle = C.glow;
      this.ctx.globalAlpha = this.flashAlpha;
      this.ctx.fillRect(0, 0, this.w, this.h);
      this.ctx.globalAlpha = 1;
      this.flashAlpha = Math.max(0, this.flashAlpha - dt * 0.8);
    }
    if (this.glitchLeft > 0) {
      this.glitchLeft -= dt;
      this.drawGlitch();
    }
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    this.clock.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }

  protected abstract simulate(dt: number): void;
  protected abstract draw(): void;

  // ---- Drawing in the vector-terminal look ---------------------------------------------

  /** Fills and edges the current path: dim scenery, bright actors, or the dark halo behind actors. */
  protected paint(fill: string, line = 1.2): void {
    const { ctx } = this;
    if (this.mode === 'halo') {
      if (line <= 0) return;
      ctx.strokeStyle = HALO;
      ctx.lineWidth = line + 3.5;
      ctx.stroke();
      ctx.fillStyle = HALO;
      ctx.fill();
      return;
    }
    if (line <= 0) {
      ctx.fillStyle = fill;
      ctx.fill();
      return;
    }
    const p = phosphor(fill);
    const actor = this.mode === 'actor';
    ctx.fillStyle = actor ? p.actorBody : p.body;
    ctx.fill();
    ctx.strokeStyle = actor ? p.edge : p.dimEdge;
    ctx.lineWidth = line;
    ctx.stroke();
  }

  /** Draws a moving thing twice: a dark halo first, then bright on top. */
  protected actor(draw: () => void): void {
    this.mode = 'halo';
    draw();
    this.mode = 'actor';
    draw();
    this.mode = 'scenery';
  }

  protected box(x: number, y: number, w: number, h: number, fill: string, line = 1.2): void {
    this.ctx.beginPath();
    this.ctx.rect(x, y, w, h);
    this.paint(fill, line);
  }

  protected circle(x: number, y: number, r: number, fill: string, line = 1.2): void {
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.paint(fill, line);
  }

  protected poly(points: [number, number][], fill: string, line = 1.2): void {
    this.ctx.beginPath();
    points.forEach(([x, y], i) => (i ? this.ctx.lineTo(x, y) : this.ctx.moveTo(x, y)));
    this.ctx.closePath();
    this.paint(fill, line);
  }

  /** A thin bright line, for beams, cables and air. */
  protected line(x1: number, y1: number, x2: number, y2: number, color: string, width = 1, alpha = 1): void {
    const { ctx } = this;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Small text burned into the picture, like the labels on camera 01. */
  protected label(text: string, x: number, y: number, color: string = C.green, align: CanvasTextAlign = 'center'): void {
    const { ctx } = this;
    ctx.font = '700 8px "JetBrains Mono Variable", monospace';
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  /** Darkness around the edges, deeper as the threat rises. */
  protected vignette(threat: number): void {
    const { ctx, w, h } = this;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgb(0 0 0 / 0)');
    g.addColorStop(1, `rgb(0 0 0 / ${0.45 + threat * 0.4})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  private drawGlitch(): void {
    const { ctx, w, h } = this;
    for (let i = 0; i < 4; i++) {
      const y = Math.random() * h;
      const sh = 2 + Math.random() * 10;
      ctx.drawImage(this.canvas, 0, y, w, sh, (Math.random() - 0.5) * 36, y, w, sh);
    }
    ctx.fillStyle = C.glow;
    for (let i = 0; i < 90; i++) {
      ctx.globalAlpha = Math.random() * 0.5;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  }
}
