// Owner: Nived
// L0 of the Basemap (guide 3.1): seeded procedural crater relief drawn ONCE to a canvas. It is the always-on fallback
// ("schematic relief") so the map looks finished before any raster lands. Light comes from a fixed low azimuth.
// Deterministic: same extent -> same picture. No randomness outside the seeded generator.
const TAU = Math.PI * 2;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Crater {
  x: number; // 0..1 across the image
  y: number;
  r: number; // fraction of the image width
}

export function seededCraters(seed: number, count = 70): Crater[] {
  const rnd = mulberry32(seed);
  const out: Crater[] = [];
  for (let i = 0; i < count; i++) {
    // big craters are rare: radius ~ 1/u^0.7
    const r = 0.012 + 0.07 * Math.pow(rnd(), 2.2);
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd()) * 0.5;
    out.push({ x: 0.5 + Math.cos(a) * d, y: 0.5 + Math.sin(a) * d, r });
  }
  return out;
}

/** Draw the relief into `ctx` (size x size, already DPR-scaled by the caller). */
export function drawRelief(ctx: CanvasRenderingContext2D, size: number, seed: number): void {
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, TAU);
  ctx.clip();
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, '#2a2f3a');
  g.addColorStop(1, '#1a1e27');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const lx = Math.cos((200 * Math.PI) / 180); // light from the lower left, low
  const ly = Math.sin((200 * Math.PI) / 180);
  for (const c of seededCraters(seed)) {
    const cx = c.x * size;
    const cy = c.y * size;
    const r = c.r * size;
    const floor = ctx.createRadialGradient(cx - lx * r * 0.3, cy - ly * r * 0.3, r * 0.1, cx, cy, r);
    floor.addColorStop(0, 'rgba(8,10,14,0.55)');
    floor.addColorStop(1, 'rgba(8,10,14,0.1)');
    ctx.fillStyle = floor;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    // lit rim on the side facing the light, shaded rim on the far side
    ctx.lineWidth = Math.max(0.8, r * 0.14);
    ctx.strokeStyle = 'rgba(200,205,215,0.28)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.atan2(ly, lx) + Math.PI * 0.5, Math.atan2(ly, lx) + Math.PI * 1.5);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.atan2(ly, lx) - Math.PI * 0.5, Math.atan2(ly, lx) + Math.PI * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}
