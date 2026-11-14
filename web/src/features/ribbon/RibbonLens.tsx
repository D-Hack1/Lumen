// Owner: Ebin
// Horizon Lens — equal angular-scale window (~12°×6°) showing the selected body as a TRUE-SCALE disk
// (Sun 0.53°, Earth 1.9°, ratio ≈ 3.6:1), clipped by the terrain silhouette (guide §3.2, conflict C-1).
// Phase 1 stub: draws the two disks at their true relative size with no clipping yet.
import { useResult } from '../../engine/hooks';
import { color } from '../../ui/tokens';
import { LayeredCanvas } from '../shared/LayeredCanvas';

const SUN_DEG = 0.53;
const EARTH_DEG = 1.9;

export interface RibbonLensProps {
  body: 'sun' | 'earth';
}

export function RibbonLens({ body }: RibbonLensProps) {
  const result = useResult();

  return (
    <LayeredCanvas
      className="ribbon-lens"
      staticKey={`${body}:${result.status}`}
      drawStatic={(ctx, w, h) => {
        const pxPerDeg = Math.min(w, h) / 8; // ~12°x6° window placeholder scale
        const deg = body === 'sun' ? SUN_DEG : EARTH_DEG;
        const r = (deg / 2) * pxPerDeg;
        ctx.fillStyle = body === 'sun' ? color.sun : color.earth;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, Math.max(2, r), 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = color.textFaint;
        ctx.font = '10px var(--font-mono)';
        ctx.fillText('not to scale · Phase 2 clips this disk to terrain', 8, h - 8);
      }}
    />
  );
}
