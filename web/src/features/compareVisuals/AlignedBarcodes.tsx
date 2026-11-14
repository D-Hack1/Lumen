// Owner: Ebin
// Aligned Barcodes: ≤4 compare rows stacked, aligned to days since landing, shared crosshair (PLAN_FINAL §8.6).
import { useCompareResults } from '../../engine/hooks';
import { crosshairBus } from '../../state/buses';
import { color } from '../../ui/tokens';
import { LayeredCanvas } from '../shared/LayeredCanvas';

export function AlignedBarcodes() {
  const compare = useCompareResults();

  return (
    <div className="aligned-barcodes" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', height: '100%' }}>
      {compare.rows.map((row) => {
        const series = row.result.series;
        return (
          <div key={row.scenarioId} style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
            <span className="num" style={{ width: 20, color: color.textMuted }}>{row.scenarioId}</span>
            <div style={{ flex: 1, height: '100%' }}>
              <LayeredCanvas
                staticKey={series}
                drawStatic={(ctx, w, h) => {
                  if (!series) return;
                  const n = series.sunUp.length;
                  const cw = w / Math.max(1, n);
                  for (let i = 0; i < n; i++) {
                    ctx.fillStyle = series.sunUp[i] && series.earthUp[i] ? color.both : series.sunUp[i] ? color.sun : color.blocked;
                    ctx.fillRect(i * cw, 0, Math.max(1, cw), h);
                  }
                }}
                drawOverlay={(ctx, w, h) => {
                  if (!series) return;
                  const { tScrub } = crosshairBus.get();
                  const total = series.stepMs * series.sunUp.length;
                  const x = ((tScrub - series.t0) / total) * w;
                  ctx.strokeStyle = color.focus;
                  ctx.beginPath();
                  ctx.moveTo(x, 0);
                  ctx.lineTo(x, h);
                  ctx.stroke();
                }}
              />
            </div>
          </div>
        );
      })}
      {compare.rows.length === 0 && <div style={{ color: color.textFaint }}>Add scenarios to Compare to see them here.</div>}
    </div>
  );
}
