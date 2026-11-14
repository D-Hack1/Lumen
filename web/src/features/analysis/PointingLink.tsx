// Owner: Ebin
// Pointing & Link: Earth/Sun az/el/range/light-time/disk/margin at scrub time + DSN lanes (PLAN_FINAL §5.5, §8.3).
// Fast Lane fix (teammate review): this used to call React setState on every crosshairBus tick, so scrubbing
// re-rendered the whole tab every frame. Values now write straight into DOM refs from the bus subscription —
// `series` itself only changes at human rate (new scenario), so that part can stay a normal render.
import { useEffect, useRef } from 'react';
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
  const sunRef = useRef<HTMLElement>(null);
  const earthRef = useRef<HTMLElement>(null);
  const diskRef = useRef<HTMLElement>(null);
  const linkRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!series) return;
    const paint = (t: number) => {
      const s = sampleAt(series, t);
      if (sunRef.current) sunRef.current.textContent = `${s.sunAzDeg.toFixed(1)}° / ${s.sunElevDeg.toFixed(1)}°`;
      if (earthRef.current) earthRef.current.textContent = `${s.earthAzDeg.toFixed(1)}° / ${s.earthElevDeg.toFixed(1)}°`;
      if (diskRef.current) diskRef.current.textContent = `${s.earthDiskPct.toFixed(0)}%`;
      if (linkRef.current) {
        linkRef.current.textContent = s.linkUp ? 'UP' : 'DOWN';
        linkRef.current.style.color = s.linkUp ? color.go : color.nogo;
      }
    };
    paint(crosshairBus.get().tScrub);
    return crosshairBus.subscribe((v) => paint(v.tScrub));
  }, [series]);

  if (!series) return <div className="pointing-link">loading…</div>;

  return (
    <div className="pointing-link" style={{ display: 'flex', gap: 'var(--sp-7)', height: '100%' }}>
      <dl className="num" style={{ flex: 1 }}>
        <dt>Sun az / el</dt>
        <dd ref={sunRef} />
        <dt>Earth az / el</dt>
        <dd ref={earthRef} />
        <dt>Earth disk</dt>
        <dd ref={diskRef} />
        <dt>Link</dt>
        <dd ref={linkRef} />
      </dl>
      <div style={{ flex: 1, color: color.textFaint, fontSize: 'var(--fs-sm)' }}>
        DSN lanes (Goldstone / Canberra / Madrid) land in Phase 3 once `dsn.bin` is wired through the engine.
      </div>
    </div>
  );
}
