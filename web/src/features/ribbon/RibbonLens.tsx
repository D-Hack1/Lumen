// Owner: Ebin
// Horizon Lens — equal angular-scale window (~12°×6°) around the selected body, TRUE-SCALE disks (Sun 0.53°,
// Earth 1.9°, ratio ≈ 3.6:1), clipped by the terrain silhouette so the visible disk area matches the engine's
// disk fraction (guide §3.2, conflict C-1, check V-6). x is scaled by cos(el) so angular distances stay true.
import { useState } from 'react';
import { useScenario } from '../../state/scenarioStore';
import { useResult } from '../../engine/hooks';
import { crosshairBus } from '../../state/buses';
import { color } from '../../ui/tokens';
import { Segmented } from '../../ui/Segmented';
import { LayeredCanvas } from '../shared/LayeredCanvas';
import { nearestHeightIndex } from '../shared/ribbonGeometry';
import { useSiteMask } from './useSiteMask';

const SUN_DEG = 0.53;
const EARTH_DEG = 1.9;
const WINDOW_H_DEG = 6;
const WINDOW_W_DEG = 12;

// Module-level so the array reference is stable across renders (LayeredCanvas resubscribes when it changes).
const OVERLAY_BUSES = [crosshairBus] as const;

type Body = 'sun' | 'earth';

function sampleIndex(series: NonNullable<ReturnType<typeof useResult>['series']>, t: number): number {
  return Math.max(0, Math.min(series.sunElevDeg.length - 1, Math.round((t - series.t0) / series.stepMs)));
}

export function RibbonLens() {
  const [body, setBody] = useState<Body>('sun');
  const result = useResult();
  const series = result.series;
  const heightM = useScenario((s) => s.heightM);
  const mask = useSiteMask(result.meta?.siteId ?? null);
  const heightIdx = nearestHeightIndex(heightM);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '2px 0' }}>
        <Segmented<Body>
          size="sm"
          ariaLabel="Lens body"
          value={body}
          onChange={setBody}
          options={[
            { value: 'sun', label: 'Sun' },
            { value: 'earth', label: 'Earth' },
          ]}
        />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <LayeredCanvas
          className="ribbon-lens"
          staticKey={`${body}:${mask.mask?.siteId}:${heightIdx}`}
          drawOverlay={(ctx, w, h) => {
            if (!series) return;
            const { tScrub } = crosshairBus.get();
            const i = sampleIndex(series, tScrub);
            const az = body === 'sun' ? series.sunAzDeg[i] : series.earthAzDeg[i];
            const el = body === 'sun' ? series.sunElevDeg[i] : series.earthElevDeg[i];
            const diskPct = body === 'sun' ? series.sunDiskPct[i] : series.earthDiskPct[i];
            const diskDeg = body === 'sun' ? SUN_DEG : EARTH_DEG;

            const cosEl = Math.max(0.15, Math.cos((el * Math.PI) / 180));
            const pxPerDegV = h / WINDOW_H_DEG;
            const pxPerDegH = w / (WINDOW_W_DEG * cosEl);
            const xAt = (bodyAz: number) => w / 2 + ((((bodyAz - az + 540) % 360) - 180)) * pxPerDegH;
            const yAt = (bodyEl: number) => h / 2 - (bodyEl - el) * pxPerDegV;

            // Terrain silhouette within the window, used both to paint the ground and to clip the disk.
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, w, h);
            ctx.clip();

            const skyPath = new Path2D();
            const cols = 64;
            skyPath.moveTo(0, 0);
            for (let c = 0; c <= cols; c++) {
              const xp = (c / cols) * w;
              const bodyAz = az + (((xp - w / 2) / pxPerDegH));
              const terrainEl = mask.mask ? mask.mask.elevDeg[heightIdx * mask.mask.azimuthCount + (Math.floor((((bodyAz % 360) + 360) % 360) / mask.mask.binWidthDeg) % mask.mask.azimuthCount)] : -0.09;
              const ty = yAt(Number.isFinite(terrainEl) ? terrainEl : -0.09);
              skyPath.lineTo(xp, ty);
            }
            skyPath.lineTo(w, 0);
            skyPath.closePath();

            // Ground (below terrain); punch a transparent hole for the sky so the panel background shows there.
            ctx.fillStyle = color.terrain;
            ctx.fillRect(0, 0, w, h);
            ctx.save();
            ctx.clip(skyPath);
            ctx.clearRect(0, 0, w, h);
            ctx.restore();

            // Disk, clipped to the sky region only — the visible area is what makes it "disk-fraction honest".
            ctx.save();
            ctx.clip(skyPath);
            const r = (diskDeg / 2) * pxPerDegV;
            const cx = xAt(az);
            const cy = yAt(el);
            if (body === 'sun') {
              const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
              grad.addColorStop(0, color.sun);
              grad.addColorStop(1, '#c97e12');
              ctx.fillStyle = grad;
            } else {
              ctx.fillStyle = color.earth;
            }
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Terrain edge stroke.
            ctx.strokeStyle = color.terrainEdge;
            ctx.lineWidth = 1;
            ctx.stroke(skyPath);
            ctx.restore();

            // Readout.
            ctx.fillStyle = color.text;
            ctx.font = '11px var(--font-mono)';
            ctx.textAlign = 'left';
            ctx.fillText(`${body === 'sun' ? 'Sun' : 'Earth'} disk ${diskPct.toFixed(0)}% (engine)`, 6, h - 8);
            ctx.fillStyle = color.textFaint;
            ctx.fillText('true scale · clipped by terrain', 6, 12);
          }}
          drawStatic={() => {
            /* all drawing happens in the overlay, redrawn whenever crosshairBus changes (scrub/hover/play) */
          }}
          overlayBuses={OVERLAY_BUSES}
        />
      </div>
    </div>
  );
}
