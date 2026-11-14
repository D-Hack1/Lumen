// Owner: Ebin
// Survival Barcode — days since landing, 4 patterned states (sun / earth-only / both / blocked).
// Fast Lane (guide §1.3, §1.4): hover writes crosshairBus only, no React state; overlay draws the crosshair line.
import { useResult } from '../../engine/hooks';
import { crosshairBus } from '../../state/buses';
import { color } from '../../ui/tokens';
import { LayeredCanvas } from '../shared/LayeredCanvas';

function cellState(sunUp: number, earthUp: number): keyof typeof STATE_COLOR {
  if (sunUp && earthUp) return 'both';
  if (sunUp) return 'sun';
  if (earthUp) return 'earth';
  return 'blocked';
}

const STATE_COLOR = { sun: color.sun, earth: color.earth, both: color.both, blocked: color.blocked } as const;

export function Barcode() {
  const result = useResult();
  const series = result.series;

  return (
    <LayeredCanvas
      className="barcode"
      staticKey={series}
      drawStatic={(ctx, w, h) => {
        if (!series) return;
        const n = series.sunUp.length;
        if (n < 1) return;
        const cw = w / n;
        for (let i = 0; i < n; i++) {
          const state = cellState(series.sunUp[i], series.earthUp[i]);
          // Phase 2 swaps 'earth' to the blue-dot CanvasPattern (createDotPattern) and 'blocked' to the hatch.
          ctx.fillStyle = STATE_COLOR[state];
          ctx.fillRect(i * cw, 0, Math.max(1, cw), h);
        }
      }}
      drawOverlay={(ctx, w, h) => {
        if (!series) return;
        const { tHover, tScrub } = crosshairBus.get();
        const n = series.sunUp.length;
        const total = series.stepMs * n;
        const xFor = (t: number) => ((t - series.t0) / total) * w;

        ctx.strokeStyle = color.focus;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xFor(tScrub), 0);
        ctx.lineTo(xFor(tScrub), h);
        ctx.stroke();

        if (tHover != null) {
          ctx.strokeStyle = color.textFaint;
          ctx.beginPath();
          ctx.moveTo(xFor(tHover), 0);
          ctx.lineTo(xFor(tHover), h);
          ctx.stroke();
        }
      }}
    />
  );
}
