// Owner: Abhinav
// Mission Profile popover body, opened from the verdict chip. Phase 2 placeholder: shows the verdict, the engine's
// reasons and the current hard thresholds (read-only). The editable form is MissionProfileForm (Phase 4).
import type { Verdict } from '../../engine/types';
import { useCopyFn } from '../../state/copy';
import { useScenario, type ProfileThresholds } from '../../state/scenarioStore';
import { VERDICT_TONE } from '../../app/verdict';
import { Badge } from '../../ui/Badge';
import './scenarios.css';

const ROWS: { key: keyof ProfileThresholds; unit: string; op: '≥' | '≤' | '' }[] = [
  { key: 'surfaceDurationDays', unit: 'd', op: '' },
  { key: 'minSunlitPct', unit: '%', op: '≥' },
  { key: 'minLinkHours', unit: 'h', op: '≥' },
  { key: 'maxLongestNightH', unit: 'h', op: '≤' },
  { key: 'maxPadSlopeDeg', unit: '°', op: '≤' },
  { key: 'batteryWh', unit: 'Wh', op: '' },
  { key: 'loadW', unit: 'W', op: '' },
];

export interface MissionProfileSummaryProps {
  verdict: Verdict;
  provisional: boolean;
  reasons: string[];
  onEdit: () => void;
}

export function MissionProfileSummary({ verdict, provisional, reasons, onEdit }: MissionProfileSummaryProps) {
  const t = useCopyFn();
  const profile = useScenario((s) => s.profile);
  return (
    <div className="mp-summary">
      <div className="mp-summary__head">
        <span className="mp-summary__title">{t('profile.title')}</span>
        <Badge tone={provisional ? 'provisional' : VERDICT_TONE[verdict]} size="md">
          {t(`verdict.${verdict}`)}
          {provisional && ` · ${t('verdict.provisional')}`}
        </Badge>
      </div>
      <p className="mp-summary__lede">{t(provisional ? 'verdict.provisional.long' : `verdict.${verdict}.long`)}</p>

      <div className="mp-summary__section">{t('profile.reasons')}</div>
      {reasons.length ? (
        <ul className="mp-summary__reasons">
          {/* reasons are copy keys once the engine emits them (contract: "copy keys later"); raw text falls through */}
          {reasons.map((r) => (
            <li key={r}>{t(r)}</li>
          ))}
        </ul>
      ) : (
        <p className="mp-summary__muted">{t('profile.noReasons')}</p>
      )}

      <div className="mp-summary__section">{t('profile.thresholds')}</div>
      <dl className="mp-summary__grid">
        {ROWS.map((r) => (
          <div key={r.key} className="mp-summary__row">
            <dt>{t(`profile.${r.key}`)}</dt>
            <dd className="num">
              {r.op && `${r.op} `}
              {profile[r.key]} {r.unit}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mp-summary__foot">
        <span className="mp-summary__muted">{t('profile.placeholder')}</span>
        <button type="button" className="mb-btn" onClick={onEdit}>
          {t('profile.edit')}
        </button>
      </div>
    </div>
  );
}
