// Owner: Abhinav
// InfoBadge — the "?" on every technical metric/control (PLAN §8.10): Formula · Impact · Source & σ · Learn more.
// Tooltip timing (§1.4): 300 ms open delay, 100 ms fade; 0 ms delay when moving between badges (warm window).
// Glossary binding (glossary.json → props) lives in features/guidance/InfoBadgeBinding (Phase 3).
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from './tokens';

export interface InfoBadgeProps {
  /** Glossary key (shown as fallback title until glossary.json is bound). */
  term: string;
  label?: ReactNode;
  formula?: ReactNode;
  impact?: ReactNode;
  source?: ReactNode;
  onLearnMore?: () => void;
}

let warmUntil = 0; // moving between badges within this window opens instantly

export function InfoBadge({ term, label, formula, impact, source, onLearnMore }: InfoBadgeProps) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);

  const show = useCallback(() => {
    window.clearTimeout(timer.current);
    const delay = performance.now() < warmUntil ? 0 : motion.delayTooltip;
    timer.current = window.setTimeout(() => setOpen(true), delay);
  }, []);
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    if (open) warmUntil = performance.now() + 500;
    setOpen(false);
  }, [open]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Position once on open (human speed); flip below if there is no room above.
  useLayoutEffect(() => {
    if (!open || !btn.current || !tip.current) return;
    const b = btn.current.getBoundingClientRect();
    const t = tip.current.getBoundingClientRect();
    const above = b.top - t.height - 6 >= 4;
    const top = above ? b.top - t.height - 6 : b.bottom + 6;
    const left = Math.min(Math.max(4, b.left + b.width / 2 - t.width / 2), window.innerWidth - t.width - 4);
    tip.current.style.left = `${Math.round(left)}px`;
    tip.current.style.top = `${Math.round(top)}px`;
    tip.current.style.transformOrigin = above ? 'bottom center' : 'top center';
  }, [open]);

  const name = typeof label === 'string' ? label : term;
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="ui-info"
        aria-label={`About ${name}`}
        aria-describedby={open ? id : undefined}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(e) => e.key === 'Escape' && hide()}
      >
        ?
      </button>
      {open &&
        createPortal(
          <div ref={tip} id={id} role="tooltip" className="ui-tooltip">
            <div className="ui-tooltip__title">{label ?? term}</div>
            {formula && (
              <div className="ui-tooltip__row">
                <span>Formula</span>
                <span className="num">{formula}</span>
              </div>
            )}
            {impact && (
              <div className="ui-tooltip__row">
                <span>Impact</span>
                <span>{impact}</span>
              </div>
            )}
            {source && (
              <div className="ui-tooltip__row">
                <span>Source &amp; σ</span>
                <span>{source}</span>
              </div>
            )}
            {onLearnMore && (
              <button type="button" className="ui-tooltip__more" onClick={onLearnMore}>
                Learn more →
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
