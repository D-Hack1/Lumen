// Owner: Ebin
// Slope/aspect compass: downhill arrow, uphill (downhill + 180°), Sun/Earth azimuth ticks (PLAN_FINAL §5.6).
import { color } from '../../ui/tokens';
import { LayeredCanvas } from '../shared/LayeredCanvas';

export interface SlopeCompassProps {
  slopeDeg: number | null;
  downhillAzimuthDeg: number | null;
  sunAzDeg?: number | null;
  earthAzDeg?: number | null;
}

function arrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, azDeg: number, stroke: string) {
  const rad = ((azDeg - 90) * Math.PI) / 180; // 0° = up (north/Earth-referenced)
  const x = cx + r * Math.cos(rad);
  const y = cy + r * Math.sin(rad);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(x, y);
  ctx.stroke();
}

export function SlopeCompass({ slopeDeg, downhillAzimuthDeg, sunAzDeg, earthAzDeg }: SlopeCompassProps) {
  const uphillAz = downhillAzimuthDeg != null ? (downhillAzimuthDeg + 180) % 360 : null;

  return (
    <LayeredCanvas
      className="slope-compass"
      staticKey={`${slopeDeg}:${downhillAzimuthDeg}:${sunAzDeg}:${earthAzDeg}`}
      drawStatic={(ctx, w, h) => {
        const cx = w / 2;
        const cy = h / 2;
        const r = Math.min(w, h) / 2 - 6;

        ctx.strokeStyle = color.hairlineStrong;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        if (sunAzDeg != null) arrow(ctx, cx, cy, r, sunAzDeg, color.sun);
        if (earthAzDeg != null) arrow(ctx, cx, cy, r, earthAzDeg, color.earth);
        if (downhillAzimuthDeg != null) arrow(ctx, cx, cy, r * 0.8, downhillAzimuthDeg, color.textFaint);
        if (uphillAz != null) arrow(ctx, cx, cy, r * 0.5, uphillAz, color.textMuted);

        ctx.fillStyle = color.text;
        ctx.font = '12px var(--font-mono)';
        ctx.textAlign = 'center';
        ctx.fillText(slopeDeg != null ? `${slopeDeg.toFixed(1)}°` : '—', cx, cy + 4);
      }}
    />
  );
}
