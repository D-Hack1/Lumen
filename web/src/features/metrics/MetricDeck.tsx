// Owner: Nived
// Metric Deck: Sun elevation hero tile + 2x4 tiles, each with its +/- (or [lo-hi]) and an InfoBadge.
// Reads the live result; `metrics` overrides it (forced-state fixtures, tests). `?fixture=worst-case` shows the worst-case strings.
import { useFixture } from '../../app/layout/fixture';
import { fmtPm } from '../../engine/format';
import { useResult } from '../../engine/hooks';
import type { MetricSet } from '../../engine/types';
import { metricTiles } from './metricTiles';
import { WORST_CASE_METRICS } from '../../mocks/forced';
import { useCopyFn } from '../../state/copy';
import { InfoBadge } from '../../ui/InfoBadge';
import './metrics.css';

export function MetricDeck({ metrics }: { metrics?: MetricSet }) {
  const t = useCopyFn();
  const result = useResult();
  const worst = useFixture()?.name === 'worst-case';
  const m = metrics ?? (worst ? WORST_CASE_METRICS : result.metrics);
  if (!m) {
    return (
      <div className="metric-deck" aria-busy={result.status === 'loading'}>
        <div className="metric-deck__hero-label">{t('metric.empty')}</div>
      </div>
    );
  }
  const hero = fmtPm(m.sunElevationDeg, 2, '°');
  return (
    <div className="metric-deck" data-tier={result.meta?.tier}>
      <div>
        <div className="metric-deck__hero-label">
          {t('metric.sunElevation')} <InfoBadge term="Sun elevation" />
        </div>
        <div className="metric-deck__hero">
          <span>{hero.value}</span>
          {hero.pm && <span className="metric-deck__pm">{hero.pm}</span>}
        </div>
      </div>
      <div className="metric-deck__grid">
        {metricTiles(m, t).map(([key, text]) => (
          <div key={key} className="metric-deck__tile" data-metric={key}>
            <div className="metric-deck__label truncate">
              {t(key)} <InfoBadge term={t(key)} />
            </div>
            <div className="metric-deck__value truncate" title={text}>
              {text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
