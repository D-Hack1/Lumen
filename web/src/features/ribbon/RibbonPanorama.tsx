// Owner: Ebin
// Unrolled 360° panorama: x = azimuth (Earth-referenced for polar sites), y = elevation.
// Phase 1 stub: renders the layered canvas and a flat horizon line from whatever `useResult().series` gives us
// (mock data today). Phase 2 adds the terrain silhouette, ±σ band, Sun/Earth tracks, "V ×N" exaggeration tag,
// ghost markers and the near-zone occluder hatch (FRONTEND_BUILD_GUIDE §3.2).
import { useResult } from '../../engine/hooks';
import { color } from '../../ui/tokens';
import { LayeredCanvas } from '../shared/LayeredCanvas';

export function RibbonPanorama() {
  const result = useResult();
  const series = result.series;

  return (
    <LayeredCanvas
      className="ribbon-panorama"
      staticKey={series}
      drawStatic={(ctx, w, h) => {
        // Horizon line placeholder; real silhouette comes from the site mask in Phase 2.
        ctx.strokeStyle = color.terrainEdge;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h * 0.72);
        ctx.lineTo(w, h * 0.72);
        ctx.stroke();

        if (!series) return;
        const n = series.sunElevDeg.length;
        if (n < 2) return;
        ctx.strokeStyle = color.sun;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * w;
          const elev = series.sunElevDeg[i];
          const y = h * 0.72 - elev * (h / 40); // placeholder scale, replaced by real elevation mapping
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }}
    />
  );
}
