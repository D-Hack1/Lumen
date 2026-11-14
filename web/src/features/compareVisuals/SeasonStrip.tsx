// Owner: Ebin
// Season Strip (MVP): per site, 12 monthly cells of sunlit % and link % for the chosen year (PLAN_FINAL §8.6).
import { useCatalog } from '../../engine/hooks';
import { useScenario } from '../../state/scenarioStore';
import { color } from '../../ui/tokens';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export function SeasonStrip() {
  const catalog = useCatalog();
  const site = useScenario((s) => s.site);
  const siteId = site.kind === 'site' ? site.id : null;
  const sparkline = siteId ? catalog.sparklines[siteId] : null;

  if (!sparkline) return <div style={{ color: color.textFaint }}>No sparkline data for this site/point yet.</div>;

  // Fold the daily sparkline into 12 monthly averages — placeholder until P12 ships real monthly aggregates.
  const monthly: number[] = Array.from({ length: 12 }, () => 0);
  const counts = Array.from({ length: 12 }, () => 0);
  const start = new Date(sparkline.startUtc);
  for (let i = 0; i < sparkline.sunlitPct.length; i++) {
    const d = new Date(start.getTime());
    d.setUTCDate(d.getUTCDate() + i);
    const m = d.getUTCMonth();
    monthly[m] += sparkline.sunlitPct[i];
    counts[m]++;
  }

  return (
    <div className="season-strip" style={{ display: 'flex', gap: 2, height: '100%' }}>
      {MONTHS.map((label, m) => {
        const pct = counts[m] ? monthly[m] / counts[m] : 0;
        return (
          <div key={m} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{ height: `${pct}%`, background: color.sun, minHeight: 2 }} />
            <span className="num" style={{ fontSize: 'var(--fs-2xs)', textAlign: 'center', color: color.textFaint }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
