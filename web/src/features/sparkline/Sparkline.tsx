// Owner: Ebin
// Tiny area/line chart for site cards (Abhinav's SiteCard imports this). Static only — no Fast Lane overlay.
import { color } from '../../ui/tokens';
import { LayeredCanvas } from '../shared/LayeredCanvas';

export interface SparklineProps {
  /** 0–100 per sample (e.g. daily sunlit % or link %), oldest first. */
  values: ArrayLike<number>;
  /** Index range to highlight (e.g. the current scenario window), inclusive. */
  highlight?: [number, number];
  tone?: 'sun' | 'earth';
  className?: string;
}

export function Sparkline({ values, highlight, tone = 'sun', className }: SparklineProps) {
  return (
    <LayeredCanvas
      className={['sparkline', className].filter(Boolean).join(' ')}
      staticKey={`${values.length}:${tone}:${highlight?.join(',')}`}
      drawStatic={(ctx, w, h) => {
        const n = values.length;
        if (n < 2) return;
        let max = 0;
        for (let i = 0; i < n; i++) if (values[i] > max) max = values[i];
        max = Math.max(max, 1);

        const xAt = (i: number) => (i / (n - 1)) * w;
        const yAt = (v: number) => h - (v / max) * (h - 2) - 1;

        if (highlight) {
          const [a, b] = highlight;
          ctx.fillStyle = tone === 'sun' ? color.sunSoft : color.earthSoft;
          ctx.fillRect(xAt(Math.max(0, a)), 0, xAt(Math.min(n - 1, b)) - xAt(Math.max(0, a)), h);
        }

        ctx.strokeStyle = tone === 'sun' ? color.sun : color.earth;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = xAt(i);
          const y = yAt(values[i]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }}
    />
  );
}
