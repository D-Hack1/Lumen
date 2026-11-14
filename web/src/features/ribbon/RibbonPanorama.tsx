// Owner: Ebin
// Unrolled 360° panorama (PLAN_FINAL §8.3, guide §3.2): terrain silhouette from the real site mask, ±σ
// translucent envelope, Sun track (amber) and Earth loop (blue) over the scenario window — solid where up,
// dashed where blocked — "V ×N" exaggeration tag, current-body markers at scrub time, ghost markers at hover.
// Near-zone occluder hatch (N⁺) and the "not to scale" minimum-symbol-size rule land in Phase 3 once P6/D-9
// data is wired through; this already draws real terrain, not a placeholder line.
import { useRef } from 'react';
import { useScenario } from '../../state/scenarioStore';
import { useResult } from '../../engine/hooks';
import { crosshairBus } from '../../state/buses';
import { color } from '../../ui/tokens';
import { LayeredCanvas } from '../shared/LayeredCanvas';
import { buildPanoramaScale, maskElevRange, nearestHeightIndex, type PanoramaScale } from '../shared/ribbonGeometry';
import { useSiteMask } from './useSiteMask';

const MIN_MARKER_PX = 4;

function sampleIndex(series: NonNullable<ReturnType<typeof useResult>['series']>, t: number): number {
  return Math.max(0, Math.min(series.sunElevDeg.length - 1, Math.round((t - series.t0) / series.stepMs)));
}

export function RibbonPanorama() {
  const result = useResult();
  const series = result.series;
  const heightM = useScenario((s) => s.heightM);
  const mask = useSiteMask(result.meta?.siteId ?? null);
  const heightIdx = nearestHeightIndex(heightM);

  // Scale is shared between the static silhouette and the per-frame overlay markers; recomputed in drawStatic,
  // read (not recomputed) in drawOverlay so both agree on the same pixel mapping within a frame. A real ref
  // (not a plain object) so it survives re-renders that don't also re-run drawStatic.
  const scaleRef = useRef<PanoramaScale | null>(null);

  return (
    <div style={{ height: '100%', minHeight: 0 }}>
      <div style={{ height: '100%' }}>
        <LayeredCanvas
          className="ribbon-panorama"
          staticKey={`${mask.mask ? mask.mask.siteId : 'none'}:${heightIdx}:${series ? series.t0 : 0}`}
          drawStatic={(ctx, w, h) => {
            const { min, max } = mask.mask ? maskElevRange(mask.mask, heightIdx) : { min: -2, max: 6 };
            const scale = buildPanoramaScale(w, h, min, max);
            scaleRef.current = scale;

            // Sample the silhouette once per column; reused for the fill, the ±σ envelope and the stroke.
            const cols = Math.max(180, Math.round(w));
            const colElev = new Float32Array(cols + 1);
            for (let x = 0; x <= cols; x++) {
              const az = (x / cols) * 360;
              const elev = mask.mask ? mask.mask.elevDeg[heightIdx * mask.mask.azimuthCount + (Math.floor((az / 360) * mask.mask.azimuthCount) % mask.mask.azimuthCount)] : -0.09; // Tier C / unavailable: smooth-Moon flat horizon
              colElev[x] = Number.isFinite(elev) ? elev : -0.09;
            }

            // ±σ translucent envelope — uniform thickness from the series' sigmaBandDeg (the mask uncertainty
            // at the Sun's current azimuth) until per-azimuth sigma (terrain/sigma/<site>.bin) lands in Phase 3.
            const sigma = series ? series.sigmaBandDeg[sampleIndex(series, series.t0)] || 0 : 0;
            if (sigma > 0) {
              ctx.fillStyle = color.sigmaBand;
              ctx.beginPath();
              ctx.moveTo(0, scale.elevToY(colElev[0] + sigma));
              for (let x = 1; x <= cols; x++) ctx.lineTo((x / cols) * w, scale.elevToY(colElev[x] + sigma));
              for (let x = cols; x >= 0; x--) ctx.lineTo((x / cols) * w, scale.elevToY(colElev[x] - sigma));
              ctx.closePath();
              ctx.fill();
            }

            // Terrain silhouette.
            ctx.fillStyle = color.terrain;
            ctx.strokeStyle = color.terrainEdge;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, h);
            for (let x = 0; x <= cols; x++) ctx.lineTo((x / cols) * w, scale.elevToY(colElev[x]));
            ctx.lineTo(w, h);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Horizon reference line at 0° elevation.
            ctx.strokeStyle = color.hairline;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(0, scale.elevToY(0));
            ctx.lineTo(w, scale.elevToY(0));
            ctx.stroke();
            ctx.setLineDash([]);

            // Sun track + Earth loop over the whole window, solid where up / dashed where blocked.
            if (series) {
              drawTrack(ctx, scale, series.sunAzDeg, series.sunElevDeg, series.sunUp, color.sun);
              drawTrack(ctx, scale, series.earthAzDeg, series.earthElevDeg, series.earthUp, color.earth);
            }

            // "V ×N" exaggeration tag + not-to-scale note.
            ctx.fillStyle = color.textFaint;
            ctx.font = '10px var(--font-mono)';
            ctx.textAlign = 'left';
            ctx.fillText(`V ×${scale.exaggeration.toFixed(1)} · not to scale`, 6, 12);
            if (mask.unavailable) ctx.fillText('no terrain mask (Tier C / smooth-Moon bound)', 6, h - 6);
          }}
          drawOverlay={(ctx) => {
            const scale = scaleRef.current;
            if (!scale || !series) return;
            const { tHover, tScrub } = crosshairBus.get();

            const drawBody = (t: number, ghost: boolean) => {
              const i = sampleIndex(series, t);
              drawMarker(ctx, scale, series.sunAzDeg[i], series.sunElevDeg[i], color.sun, ghost);
              drawMarker(ctx, scale, series.earthAzDeg[i], series.earthElevDeg[i], color.earth, ghost);
            };
            drawBody(tScrub, false);
            if (tHover != null) drawBody(tHover, true);
          }}
        />
      </div>
    </div>
  );
}

function drawTrack(
  ctx: CanvasRenderingContext2D,
  scale: PanoramaScale,
  az: Float32Array,
  elev: Float32Array,
  up: Uint8Array,
  stroke: string,
) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.25;
  let lastUp: number | null = null;
  let drawing = false;
  for (let i = 0; i < az.length; i++) {
    const x = scale.azToX(az[i]);
    const y = scale.elevToY(elev[i]);
    if (up[i] !== lastUp) {
      if (drawing) ctx.stroke();
      ctx.beginPath();
      ctx.setLineDash(up[i] ? [] : [2, 3]);
      ctx.moveTo(x, y);
      drawing = true;
      lastUp = up[i];
    } else if (drawing) {
      // Azimuth wraps 0/360 as the window progresses; break the segment rather than drawing a seam.
      ctx.lineTo(x, y);
    }
  }
  if (drawing) ctx.stroke();
  ctx.setLineDash([]);
}

function drawMarker(ctx: CanvasRenderingContext2D, scale: PanoramaScale, az: number, elev: number, fill: string, ghost: boolean) {
  const x = scale.azToX(az);
  const y = scale.elevToY(elev);
  ctx.globalAlpha = ghost ? 0.45 : 1;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, MIN_MARKER_PX, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
