// Owner: Ebin
// Per-panel power bars vs flat-ground baseline (PLAN_FINAL §5.6 power presets).
import { color } from '../../ui/tokens';

export interface PanelPowerBarsProps {
  /** Watts per panel for the current attitude, and the flat-ground baseline for comparison. */
  panels: Array<{ label: string; watts: number; baselineWatts: number }>;
}

export function PanelPowerBars({ panels }: PanelPowerBarsProps) {
  const max = Math.max(1, ...panels.map((p) => Math.max(p.watts, p.baselineWatts)));
  return (
    <div className="panel-power-bars num" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
      {panels.map((p) => (
        <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          <span style={{ width: 90, fontSize: 'var(--fs-xs)', color: color.textMuted }}>{p.label}</span>
          <div style={{ flex: 1, height: 10, background: color.surface3, position: 'relative' }}>
            <div
              style={{ position: 'absolute', inset: 0, width: `${(p.watts / max) * 100}%`, background: color.sun }}
            />
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${(p.baselineWatts / max) * 100}%`,
                width: 1,
                background: color.textFaint,
              }}
            />
          </div>
          <span style={{ width: 48, textAlign: 'right' }}>{p.watts.toFixed(0)} W</span>
        </div>
      ))}
    </div>
  );
}
