// Owner: Ebin
// 60-day Feasibility Calendar (MVP slice of the Tier-1 12-month view): sites x landing dates, GO/MARGINAL/NO-GO.
// Phase 1 stub: renders a placeholder grid; Nived's background Scan computation fills in verdicts in Phase 4.
import { color } from '../../ui/tokens';

const DAYS = 60;

export function FeasibilityCalendar() {
  return (
    <div
      className="feasibility-calendar"
      style={{ display: 'grid', gridTemplateColumns: `repeat(${DAYS}, 1fr)`, gap: 1, height: '100%' }}
    >
      {Array.from({ length: DAYS }, (_, i) => (
        <div key={i} style={{ background: color.pending, opacity: 0.25 }} title={`day +${i} — provisional`} />
      ))}
    </div>
  );
}
