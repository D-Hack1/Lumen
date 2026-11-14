// Owner: Abhinav
// Worst-case content fixture (FRONTEND_BUILD_GUIDE §5.1), loaded only with `?fixture=worst-case`.
// Stand-in content only for MY slots that are not built yet (Slot applies it to status 'later' only).
// Teammate slots render their real components; their worst-case strings (No sunrise before window end (+60 d),
// grazing ranges, 9-row Windows Table, 30 Scan rows…) must arrive through Nived's forced-state mock engine.
// The fixture scenario (Educator, 60 d, 4 Compare rows, ISRO preset, slip +30 d) still applies to every slot.
import type { ReactNode } from 'react';
import type { Fixture } from '../layout/fixture';
import { Badge } from '../../ui/Badge';
import { Chip } from '../../ui/Chip';
import { InfoBadge } from '../../ui/InfoBadge';
import { DEFAULT_LANDING_UTC, type CompareRow } from '../../state/scenarioStore';
import './worstCase.css';

export const LONG_SITE =
  'Shackleton–de Gerlache connecting ridge · Artemis III candidate region “Nobile Rim 2” (as published 2024-10-28)';
const DAY = 86_400_000;

function Cell({ label, value, badge }: { label: string; value: ReactNode; badge?: ReactNode }) {
  return (
    <div className="fx-cell">
      <div className="fx-cell__label truncate">
        {label} <InfoBadge term={label} />
      </div>
      <div className="fx-cell__value truncate">
        {value} {badge}
      </div>
    </div>
  );
}

const rowsAD: CompareRow[] = (['A', 'B', 'C', 'D'] as const).map((id, i) => ({
  id,
  site: { kind: 'site', id: ['shackleton_ridge', 'im2_athena', 'cy3_shiv_shakti', 'blue_ghost_m1'][i] },
  landingUtc: DEFAULT_LANDING_UTC + i * 9 * DAY,
  panelPreset: 'fourSide',
  yawDeg: null,
  tilt: { magnitudeDeg: i * 10, directionDeg: 90 },
  heightM: 2,
  baseline: i === 0,
}));

export const worstCaseFixture: Fixture = {
  name: 'worst-case',
  scenario: {
    persona: 'educator',
    durationDays: 60,
    definitionsPreset: 'isroVikramOps',
    definitions: {
      sunDiskThresholdPct: 50,
      earthMarginDeg: 1,
      dteDiskThresholdPct: 50,
      dsnMode: 'dsnAware',
      dsnMaskDeg: 10,
      minSunElevationOps: 6,
    },
    compareRows: rowsAD,
    slipDays: 30,
  },
  missionBar: { siteLabel: LONG_SITE, tierLabel: 'Tier B · snap 1.8 km', verdict: 'MARGINAL', provisional: true },
  slots: {
    search: (
      <div className="fx-search-block">
        <div className="fx-search truncate">Search sites or “-84.79, 29.20” — Analyse custom point · Quick Answer</div>
        <div className="fx-chips">
          {['All', 'Artemis III', 'Historical Landings', 'Published Targets', 'Contrast Sites', 'Custom'].map(
            (c, i) => (
              <Chip key={c} selected={i === 2} count={[42, 9, 6, 5, 3, 1][i]}>
                {c}
              </Chip>
            ),
          )}
        </div>
      </div>
    ),
    siteList: (
      <div className="fx-pad fx-stack">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="fx-card">
            <div className="truncate fx-strong">{i === 0 ? LONG_SITE : `Chandrayaan-3 Statio Shiv Shakti ${i}`}</div>
            <div className="fx-badges">
              <Badge tone="neutral">historical landing</Badge>
              <Badge tone="tier" glyph={null}>
                Tier A
              </Badge>
              <Badge tone="marginal">MARGINAL</Badge>
              <Badge tone="provisional">as published</Badge>
            </div>
            <div className="num fx-faint truncate">Landing 69.373°S 32.319°E · Target 69.3676°S 32.3481°E · ±1 min</div>
          </div>
        ))}
      </div>
    ),
    definitions: (
      <div className="fx-line truncate">
        <span className="fx-strong">Rules ✎</span> The Sun counts as “up” when at least half of its disk clears the
        terrain at 2 m and it is at least 6° high (ISRO Vikram ops) · Link needs Earth at least 1° above the terrain and
        a DSN dish seeing the Moon above 10°
      </div>
    ),
    profileBattery: (
      <div className="fx-line fx-strong">Profile &amp; Battery ▸ 2000 Wh · 60 W · endurance 25 h vs night 96 h</div>
    ),
    scenarioRows: (
      <div className="fx-pad fx-stack fx-stack--tight">
        {rowsAD.map((r) => (
          <div key={r.id} className="fx-row">
            <span className={`fx-swatch fx-swatch--${r.id}`}>{r.id}</span>
            <span className="truncate">
              {r.baseline ? '★ ' : ''}
              {LONG_SITE}
            </span>
            <span className="num fx-faint">+{(r.landingUtc - DEFAULT_LANDING_UTC) / DAY} d</span>
          </div>
        ))}
      </div>
    ),
    missionProfile: (
      <div className="fx-pad fx-grid fx-grid--2">
        {[
          ['Surface duration', '60 d'],
          ['Min sunlit', '50%'],
          ['Min link', '100 h'],
          ['Max longest night', '72 h'],
          ['Max pad slope', '10°'],
          ['Battery · load', '2000 Wh · 60 W'],
        ].map(([l, v]) => (
          <Cell key={l} label={l} value={v} />
        ))}
      </div>
    ),
    methodology: (
      <div className="fx-pad fx-stack">
        {Array.from({ length: 40 }, (_, i) => (
          <p key={i} className="fx-faint">
            §{i + 1} Lorem-free placeholder paragraph for the reading view — this container is whitelisted to scroll
            internally, so long content here must never scroll the page.
          </p>
        ))}
      </div>
    ),
  },
};
