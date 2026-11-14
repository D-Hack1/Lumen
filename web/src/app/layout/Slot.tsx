// Owner: Abhinav
// Slot — one bento cell. Fixed size comes from the grid (tokens → CSS vars); the slot never sizes itself from
// content, so nothing inside can create page scroll. Renders the owner's component (children) and, until it is
// built, a labelled placeholder showing owner, component, status, budget and live size.
import { useEffect, useRef, type ReactNode } from 'react';
import { useCopy } from '../../state/copy';
import { useFixture } from './fixture';
import { SLOTS, type SlotId } from './slots';

export interface SlotProps {
  id: SlotId;
  children?: ReactNode;
  className?: string;
  /** Hide the placeholder chrome even when the slot is not live (e.g. a stub that already draws something). */
  bare?: boolean;
}

const STATUS_TEXT = { stub: 'stub', missing: 'stub missing', later: 'phase', live: 'live' } as const;

export function Slot({ id, children, className, bare }: SlotProps) {
  const spec = SLOTS[id];
  const label = useCopy(`slot.${id}`);
  const fixture = useFixture()?.slots[id];
  const sizeRef = useRef<HTMLSpanElement>(null);
  const boxRef = useRef<HTMLElement>(null);

  // Live size readout for placeholders (human-speed: resize only). Writes textContent — no React state.
  useEffect(() => {
    const box = boxRef.current;
    const out = sizeRef.current;
    if (!box || !out) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      out.textContent = `${Math.round(width)}×${Math.round(height)}`;
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [fixture]);

  const showPlaceholder = !bare && !fixture && spec.status !== 'live';
  const status = spec.status === 'later' ? `phase ${spec.phase}` : STATUS_TEXT[spec.status];

  return (
    <section
      ref={boxRef}
      className={['slot', `slot--${id}`, className].filter(Boolean).join(' ')}
      data-slot={id}
      data-owner={spec.owner}
      data-status={spec.status}
      data-budget={spec.budget}
      data-scroll={spec.scroll ? 'allowed' : undefined}
      aria-label={label}
    >
      {fixture ?? children}
      {showPlaceholder && (
        <div className="slot__ph" aria-hidden={children ? 'true' : undefined}>
          <span className="slot__ph-label">{label}</span>
          <span className="slot__ph-meta">
            {spec.owner} · {spec.component}
          </span>
          <span className={`slot__ph-status slot__ph-status--${spec.status}`}>{status}</span>
          <span className="slot__ph-size num" ref={sizeRef} />
        </div>
      )}
    </section>
  );
}
