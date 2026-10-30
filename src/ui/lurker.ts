/**
 * While the one that listens is walking, a tall shape flickers on every camera: never
 * nearer, never in the same place twice, more often as it comes. Shared by camera 01
 * and the cameras on the other tabs.
 */

/** How near it is, 0..1; the app sets it every frame. */
export const hunt = { near: 0 };

const hash = (n: number) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

/** Draws the shape when it is due on this camera's clock `t`. */
export function drawLurker(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const near = hunt.near;
  if (near <= 0) return;
  // An appearance every 7 seconds at first, every 2 at the end, each a third of a second.
  const every = 7 - 5 * near;
  const n = Math.floor(t / every);
  const into = t - n * every;
  if (into > 0.35 || hash(n) > 0.4 + 0.6 * near) return;
  const x = w * (0.12 + 0.76 * hash(n + 0.5));
  const tall = h * (0.55 + 0.25 * hash(n + 0.7));
  const foot = h * 0.97;
  const head = tall * 0.09;
  ctx.save();
  ctx.globalAlpha = 0.85 * (1 - into / 0.35) + 0.15;
  ctx.fillStyle = '#000';
  ctx.strokeStyle = 'rgb(130 214 152 / 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  // Too tall, too thin, the arms longer than they should be.
  ctx.ellipse(x, foot - tall + head, head * 0.8, head, 0, 0, Math.PI * 2);
  ctx.moveTo(x - head * 1.1, foot - tall + head * 2.2);
  ctx.lineTo(x + head * 1.1, foot - tall + head * 2.2);
  ctx.lineTo(x + head * 0.7, foot - tall * 0.45);
  ctx.lineTo(x + head * 1.6, foot - tall * 0.12);
  ctx.lineTo(x + head * 0.4, foot - tall * 0.45);
  ctx.lineTo(x + head * 0.5, foot);
  ctx.lineTo(x - head * 0.5, foot);
  ctx.lineTo(x - head * 0.4, foot - tall * 0.45);
  ctx.lineTo(x - head * 1.6, foot - tall * 0.1);
  ctx.lineTo(x - head * 0.7, foot - tall * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Two points of eyeshine, not quite level.
  ctx.fillStyle = 'rgb(220 255 225 / 0.9)';
  ctx.fillRect(x - head * 0.45, foot - tall + head * 0.9, 1.5, 1.5);
  ctx.fillRect(x + head * 0.3, foot - tall + head * 1.05, 1.5, 1.5);
  // Interference around it.
  ctx.fillStyle = 'rgb(125 255 154 / 0.5)';
  for (let i = 0; i < 40; i++) ctx.fillRect(x + (Math.random() - 0.5) * head * 8, foot - Math.random() * tall, 1.5, 1.5);
  ctx.restore();
}
