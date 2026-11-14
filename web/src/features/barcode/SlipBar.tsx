// Owner: Ebin
// Slip Bar — native range input (no spring/thumb animation per the matrix), ±30 d, −1/+1 d, reset.
// Live drag writes slipBus only (Fast Lane); release commits via useScenario().setSlip (WORK_DISTRIBUTION §5).
import { useEffect, useRef, useState } from 'react';
import { useScenario } from '../../state/scenarioStore';
import { slipBus } from '../../state/buses';
import { useCopy } from '../../state/copy';

export function SlipBar() {
  const committed = useScenario((s) => s.slipDays);
  const setSlip = useScenario((s) => s.setSlip);
  const [live, setLive] = useState(committed);
  const chipRef = useRef<HTMLSpanElement>(null);
  const label = useCopy('slip.label');

  useEffect(() => setLive(committed), [committed]);
  useEffect(() => {
    if (chipRef.current) chipRef.current.textContent = live === 0 ? '' : `slipped ${live > 0 ? '+' : ''}${live} d`;
  }, [live]);

  const commit = (v: number) => {
    setLive(v);
    setSlip(v);
  };

  return (
    <div className="slipbar" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', height: '100%' }}>
      <button type="button" aria-label="−1 day" onClick={() => commit(Math.max(-30, live - 1))}>
        ◀
      </button>
      <input
        type="range"
        min={-30}
        max={30}
        step={1}
        value={live}
        aria-label={label}
        onChange={(e) => {
          const v = Number(e.target.value);
          setLive(v);
          slipBus.set({ slipDays: v, dragging: true });
        }}
        onPointerUp={() => commit(live)}
        onKeyUp={() => commit(live)}
        style={{ flex: 1 }}
      />
      <button type="button" aria-label="+1 day" onClick={() => commit(Math.min(30, live + 1))}>
        ▶
      </button>
      <button type="button" onClick={() => commit(0)}>
        reset
      </button>
      <span ref={chipRef} className="num slipbar__chip" />
    </div>
  );
}
