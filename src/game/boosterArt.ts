// Booster art: the bar icons and the propeller a flying jelly wears. One drawing per booster
// id (the Record type makes a new booster fail to compile until it has an icon).

import type { BoosterId } from '../sim/boosters';
import { drawJelly, shade } from './jelly';

/** A two-blade propeller on a little mast, spinning; (x, y) is the hub. */
export function drawPropeller(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, t: number) {
  ctx.save();
  ctx.translate(x, y);
  // Mast.
  ctx.fillStyle = '#6b6f86';
  ctx.beginPath();
  ctx.roundRect(-size * 0.035, 0, size * 0.07, size * 0.2, size * 0.03);
  ctx.fill();
  // Blades seen from the side: their length swings with the spin.
  const spin = t * 26;
  for (let k = 0; k < 2; k++) {
    const a = spin + k * Math.PI;
    const len = Math.cos(a) * size * 0.5;
    const front = Math.sin(a) > 0;
    ctx.fillStyle = front ? '#ff5a6e' : '#c9364a';
    ctx.beginPath();
    ctx.ellipse(len / 2, 0, Math.abs(len / 2) + size * 0.02, size * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    if (front) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.ellipse(len / 2, -size * 0.025, Math.abs(len / 2) * 0.7, size * 0.022, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Motion blur disc.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.52, size * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  // Hub.
  const g = ctx.createRadialGradient(-size * 0.02, -size * 0.03, 0, 0, 0, size * 0.08);
  g.addColorStop(0, '#fff3a6');
  g.addColorStop(1, '#e0a400');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.075, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function propellerIcon(ctx: CanvasRenderingContext2D, s: number, t: number) {
  drawJelly(ctx, s * 0.5, s * 0.6, s * 0.72, '#ff3d5f', '', { face: true, mood: 'happy', look: { x: 0, y: 0.2 } });
  drawPropeller(ctx, s * 0.5, s * 0.2, s * 0.62, t);
}

function craneIcon(ctx: CanvasRenderingContext2D, s: number, t: number) {
  const swing = Math.sin(t * 2.4) * s * 0.03;
  // Arm across the top.
  ctx.fillStyle = '#ffc21a';
  ctx.strokeStyle = '#b57800';
  ctx.lineWidth = s * 0.035;
  ctx.beginPath();
  ctx.roundRect(s * 0.1, s * 0.08, s * 0.8, s * 0.12, s * 0.04);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(181,120,0,0.6)';
  ctx.lineWidth = s * 0.02;
  for (let i = 0; i < 5; i++) {
    const x = s * (0.17 + i * 0.15);
    ctx.beginPath();
    ctx.moveTo(x, s * 0.09);
    ctx.lineTo(x + s * 0.08, s * 0.19);
    ctx.stroke();
  }
  // Cable and claw.
  const cx = s * 0.5 + swing;
  ctx.strokeStyle = '#4b4f66';
  ctx.lineWidth = s * 0.025;
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.2);
  ctx.lineTo(cx, s * 0.38);
  ctx.stroke();
  drawJelly(ctx, cx, s * 0.66, s * 0.5, '#2f8cff', '', { face: true, mood: 'happy', look: { x: 0, y: -0.5 } });
  ctx.strokeStyle = '#6b6f86';
  ctx.lineWidth = s * 0.05;
  ctx.lineCap = 'round';
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx, s * 0.38);
    ctx.quadraticCurveTo(cx + d * s * 0.22, s * 0.42, cx + d * s * 0.2, s * 0.56);
    ctx.stroke();
  }
  ctx.fillStyle = '#4b4f66';
  ctx.beginPath();
  ctx.roundRect(cx - s * 0.07, s * 0.35, s * 0.14, s * 0.07, s * 0.02);
  ctx.fill();
}

function mergeIcon(ctx: CanvasRenderingContext2D, s: number, t: number) {
  const squeeze = Math.max(0, Math.sin(t * 3)) * s * 0.04;
  drawJelly(ctx, s * 0.3 + squeeze, s * 0.6, s * 0.46, '#3fcf5c', '', { face: true, mood: 'happy', look: { x: 1, y: 0 }, squash: 0.1 });
  drawJelly(ctx, s * 0.7 - squeeze, s * 0.6, s * 0.46, '#3fcf5c', '', { face: true, mood: 'happy', look: { x: -1, y: 0 }, squash: 0.1 });
  // Sparkle where they meet.
  ctx.save();
  ctx.translate(s * 0.5, s * 0.25);
  ctx.rotate(t);
  ctx.fillStyle = '#fff6a0';
  ctx.strokeStyle = shade('#ffc21a', -0.2);
  ctx.lineWidth = s * 0.02;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? s * 0.05 : s * 0.13;
    const a = (i / 8) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

const ART: Record<BoosterId, (ctx: CanvasRenderingContext2D, s: number, t: number) => void> = {
  propeller: propellerIcon,
  crane: craneIcon,
  merge: mergeIcon,
};

/** Draw a booster's icon filling a `size` square at the origin; `t` animates it. */
export function drawBoosterIcon(ctx: CanvasRenderingContext2D, id: BoosterId, size: number, t = 0) {
  ART[id](ctx, size, t);
}
