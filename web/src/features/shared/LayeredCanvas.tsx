// Owner: Ebin
// Shared base for every Fast Lane chart (Ribbon, PowerCurve, Barcode, SlipBar, TouchdownPad, compareVisuals).
// Two DPR-aware canvases stacked in one box: a STATIC layer (redrawn only when data/size changes) and an
// OVERLAY layer (redrawn every frame from the shared frame bus — crosshair line, ghost markers, readout chip
// backing). No CSS transitions on either canvas (FRONTEND_BUILD_GUIDE §1.3 Fast Lane rule 1).
import { useEffect, useRef } from 'react';
import { frameBus } from '../../state/frameBus';

export type DrawFn = (ctx: CanvasRenderingContext2D, widthCss: number, heightCss: number, dpr: number) => void;

export interface LayeredCanvasHandle {
  /** Re-run the static draw now (call after data changes; resize triggers it automatically). */
  redrawStatic(): void;
}

export interface LayeredCanvasProps {
  className?: string;
  /** Redrawn on mount and whenever the box resizes or `staticKey` changes. Cheap work only happens here. */
  drawStatic: DrawFn;
  /** Changing this value re-triggers `drawStatic` without waiting for a resize (e.g. new series loaded). */
  staticKey?: unknown;
  /**
   * Registered with the shared frame bus (`frameBus.loop`) while mounted — called at most once per frame.
   * Omit for charts with no hover/scrub/playback overlay (e.g. a static-only Sparkline).
   */
  drawOverlay?: DrawFn;
  /** Imperative handle for callers that need to force a static redraw outside the declarative props. */
  handleRef?: React.Ref<LayeredCanvasHandle>;
}

/**
 * Fills its parent slot (`width: 100%; height: 100%`). The parent `<Slot>` owns sizing — this component only
 * ever reads its own box, never sets it from content.
 */
export function LayeredCanvas({ className, drawStatic, staticKey, drawOverlay, handleRef }: LayeredCanvasProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const staticRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const drawStaticRef = useRef(drawStatic);
  const drawOverlayRef = useRef(drawOverlay);
  drawStaticRef.current = drawStatic;
  drawOverlayRef.current = drawOverlay;

  const runStatic = () => {
    const cv = staticRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const { w, h, dpr } = sizeRef.current;
    if (w <= 0 || h <= 0) return;
    ctx.save();
    ctx.clearRect(0, 0, cv.width, cv.height);
    drawStaticRef.current(ctx, w, h, dpr);
    ctx.restore();
  };

  useEffect(() => {
    if (handleRef && typeof handleRef === 'object') {
      (handleRef as React.MutableRefObject<LayeredCanvasHandle | null>).current = { redrawStatic: runStatic };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const resize = (w: number, h: number) => {
      sizeRef.current = { w, h, dpr };
      for (const cv of [staticRef.current, overlayRef.current]) {
        if (!cv) continue;
        cv.width = Math.max(1, Math.round(w * dpr));
        cv.height = Math.max(1, Math.round(h * dpr));
        cv.style.width = `${w}px`;
        cv.style.height = `${h}px`;
        const ctx = cv.getContext('2d');
        ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      runStatic();
    };

    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      resize(width, height);
    });
    ro.observe(box);
    const r = box.getBoundingClientRect();
    resize(r.width, r.height);
    return () => ro.disconnect();
  }, []);

  // staticKey changes (new data) redraw without waiting for a resize.
  useEffect(() => {
    runStatic();
  }, [staticKey]);

  const hasOverlay = drawOverlay !== undefined;
  useEffect(() => {
    if (!drawOverlayRef.current) return;
    return frameBus.loop(() => {
      const cv = overlayRef.current;
      const ctx = cv?.getContext('2d');
      const fn = drawOverlayRef.current;
      if (!cv || !ctx || !fn) return;
      const { w, h, dpr } = sizeRef.current;
      if (w <= 0 || h <= 0) return;
      ctx.save();
      ctx.clearRect(0, 0, cv.width, cv.height);
      fn(ctx, w, h, dpr);
      ctx.restore();
    });
  }, [hasOverlay]);

  return (
    <div ref={boxRef} className={['lc', className].filter(Boolean).join(' ')} data-hotpath style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={staticRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />
      {drawOverlay && <canvas ref={overlayRef} style={{ position: 'absolute', inset: 0, display: 'block', pointerEvents: 'none' }} />}
    </div>
  );
}
