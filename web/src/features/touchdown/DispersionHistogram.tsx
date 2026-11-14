// Owner: Ebin
// Dispersion slope histogram (Tier 1, PLAN_FINAL §4 P7 / §9). Stub: renders bars from raw bin counts.
import { color } from '../../ui/tokens';
import { LayeredCanvas } from '../shared/LayeredCanvas';

export interface DispersionHistogramProps {
  /** Slope bin counts across the 11×11 dispersion grid; index i = bin [i, i+1) degrees. */
  bins: ArrayLike<number>;
  toleranceDeg?: number;
}

export function DispersionHistogram({ bins, toleranceDeg }: DispersionHistogramProps) {
  return (
    <LayeredCanvas
      className="dispersion-histogram"
      staticKey={`${bins.length}:${toleranceDeg}`}
      drawStatic={(ctx, w, h) => {
        const n = bins.length;
        if (n === 0) return;
        let max = 1;
        for (let i = 0; i < n; i++) if (bins[i] > max) max = bins[i];
        const bw = w / n;
        for (let i = 0; i < n; i++) {
          const bh = (bins[i] / max) * h;
          ctx.fillStyle = toleranceDeg != null && i >= toleranceDeg ? color.nogo : color.both;
          ctx.fillRect(i * bw, h - bh, Math.max(1, bw - 1), bh);
        }
      }}
    />
  );
}
