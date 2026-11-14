// Owner: Ebin
// Power & Elevation: power (W) + Sun/Earth clearance curves with ±σ shading (PLAN_FINAL §8.3). Fast Lane.
import { useResult } from '../../engine/hooks';
import { crosshairBus } from '../../state/buses';
import { color } from '../../ui/tokens';
import { LayeredCanvas } from '../shared/LayeredCanvas';

// Module-level so the array reference is stable across renders (LayeredCanvas resubscribes when it changes).
const OVERLAY_BUSES = [crosshairBus] as const;

function plot(ctx: CanvasRenderingContext2D, values: Float32Array, w: number, h: number, stroke: string) {
  const n = values.length;
  if (n < 2) return;
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < n; i++) {
    if (values[i] < min) min = values[i];
    if (values[i] > max) max = values[i];
  }
  const range = Math.max(max - min, 1e-6);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * w;
    const y = h - ((values[i] - min) / range) * (h - 4) - 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export function PowerCurve() {
  const result = useResult();
  const series = result.series;

  return (
    <LayeredCanvas
      className="power-curve"
      staticKey={series}
      drawStatic={(ctx, w, h) => {
        if (!series) return;
        plot(ctx, series.powerW, w, h * 0.5, color.both);
        plot(ctx, series.sunClearanceDeg, w, h * 0.5, color.sun);
        // Phase 2: translate sigmaBandDeg into a translucent envelope around the clearance curve.
      }}
      drawOverlay={(ctx, w, h) => {
        if (!series) return;
        const { tScrub } = crosshairBus.get();
        const total = series.stepMs * series.powerW.length;
        const x = ((tScrub - series.t0) / total) * w;
        ctx.strokeStyle = color.focus;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }}
      overlayBuses={OVERLAY_BUSES}
    />
  );
}
