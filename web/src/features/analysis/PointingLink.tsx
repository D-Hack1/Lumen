// Owner: Ebin
// Pointing & Link: Earth/Sun az/el/range/light-time/disk/margin at scrub time + DSN lanes (PLAN_FINAL §5.5, §8.3).
import { useEffect, useState } from 'react';
import { useResult } from '../../engine/hooks';
import { crosshairBus } from '../../state/buses';
import { color } from '../../ui/tokens';

function sampleAt(series: NonNullable<ReturnType<typeof useResult>['series']>, t: number) {
  const i = Math.max(0, Math.min(series.sunElevDeg.length - 1, Math.round((t - series.t0) / series.stepMs)));
  return {
    sunElevDeg: series.sunElevDeg[i],
    sunAzDeg: series.sunAzDeg[i],
    earthElevDeg: series.earthElevDeg[i],
    earthAzDeg: series.earthAzDeg[i],
    earthDiskPct: series.earthDiskPct[i],
    linkUp: series.linkUp[i],
  };
}

export function PointingLink() {
  const result = useResult();
  const series = result.series;
  const [tScrub, setTScrub] = useState(() => crosshairBus.get().tScrub);

  useEffect(() => crosshairBus.subscribe((v) => setTScrub(v.tScrub)), []);

  if (!series) return <div className="pointing-link">loading…</div>;
  const s = sampleAt(series, tScrub);

  return (
    <div className="pointing-link" style={{ display: 'flex', gap: 'var(--sp-7)', height: '100%' }}>
      <dl className="num" style={{ flex: 1 }}>
        <dt>Sun az / el</dt>
        <dd>{s.sunAzDeg.toFixed(1)}° / {s.sunElevDeg.toFixed(1)}°</dd>
        <dt>Earth az / el</dt>
        <dd>{s.earthAzDeg.toFixed(1)}° / {s.earthElevDeg.toFixed(1)}°</dd>
        <dt>Earth disk</dt>
        <dd>{s.earthDiskPct.toFixed(0)}%</dd>
        <dt>Link</dt>
        <dd style={{ color: s.linkUp ? color.go : color.nogo }}>{s.linkUp ? 'UP' : 'DOWN'}</dd>
      </dl>
      <div style={{ flex: 1, color: color.textFaint, fontSize: 'var(--fs-sm)' }}>
        DSN lanes (Goldstone / Canberra / Madrid) land in Phase 3 once `dsn.bin` is wired through the engine.
      </div>
    </div>
  );
}
