// Owner: Abhinav
// Worst-case content fixture (FRONTEND_BUILD_GUIDE §5.1), loaded only with `?fixture=worst-case`.
// Phase 1: slots are placeholders, so this renders stand-in content with the worst-case strings at each slot's
// budget. As real components land, their slot entries here are removed and the same strings arrive through
// Nived's forced-state mock engine instead (fixture → engine → real component).
import type { ReactNode } from 'react';
import type { Fixture } from '../layout/fixture';
import { Badge } from '../../ui/Badge';
import { Chip } from '../../ui/Chip';
import { InfoBadge } from '../../ui/InfoBadge';
import { Segmented } from '../../ui/Segmented';
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

function Table({ cols, rows, scroll }: { cols: string[]; rows: string[][]; scroll?: boolean }) {
  return (
    <div className="fx-table" data-scroll={scroll ? 'allowed' : undefined}>
      <table>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="num">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="truncate">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const windowRows = Array.from({ length: 9 }, (_, i) => [
  ['Sun', 'Earth', 'Link', 'Ops'][i % 4],
  `2025-03-${String(6 + i * 3).padStart(2, '0')} 17:2${i} ± 5 h`,
  `2025-03-${String(8 + i * 3).padStart(2, '0')} 04:1${i} ± 6 h`,
  `[${30 + i}–${44 + i}] h`,
  `${(1.2 + i * 0.1).toFixed(2)}°`,
  i % 3 === 0 ? 'grazing · partial start' : i % 3 === 1 ? 'partial end' : '—',
]);

const scanRows = Array.from({ length: 30 }, (_, i) => [
  String(i + 1),
  i % 2 ? 'Shackleton–de Gerlache connecting ridge' : 'Peak near Shackleton (Artemis III candidate)',
  `2025-03-${String(1 + (i % 28)).padStart(2, '0')}`,
  ['GO', 'MARGINAL', 'NO-GO'][i % 3] + (i < 10 ? '' : ' (provisional)'),
  `${60 - i}% [${55 - i}–${66 - i}]`,
  `${80 - i}% [${74 - i}–${85 - i}]`,
  `${30 + i} h [${26 + i}–${41 + i}]`,
]);

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
  missionBar: { siteLabel: LONG_SITE, tierLabel: 'Tier B · snap 1.8 km', verdict: 'MARGINAL' },
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
    ribbon: (
      <div className="fx-pad fx-stack">
        <div className="fx-badges">
          <Badge tone="neutral">V ×9.4</Badge>
          <Badge tone="neutral">not to scale</Badge>
          <Badge tone="sun">Sunset ~12–30 h (grazing)</Badge>
          <Badge tone="earth">Earthset in 3 d 4 h ± 6 h</Badge>
          <Badge tone="blocked">near-zone occluder N⁺</Badge>
          <Badge tone="provisional">σ default 0.2°</Badge>
        </div>
        <div className="fx-faint">
          Educator: The grey band is the uncertainty in the horizon. The Sun is skimming the ridge, so the exact sunset
          is hard to pin down — think hours, not minutes.
        </div>
      </div>
    ),
    analysis: (
      <div className="fx-stack fx-stack--tight fx-fill">
        <div className="fx-pad-x">
          <Segmented
            size="sm"
            ariaLabel="Analysis"
            value="windows"
            onChange={() => {}}
            options={[
              { value: 'power', label: 'Power & Elevation' },
              { value: 'windows', label: 'Windows Table' },
              { value: 'pointing', label: 'Pointing & Link' },
            ]}
          />
        </div>
        <Table cols={['Type', 'Start UTC ±', 'End UTC ±', 'Duration', 'Peak el', 'Flags']} rows={windowRows} scroll />
      </div>
    ),
    barcode: (
      <div className="fx-barcode">
        {Array.from({ length: 60 }, (_, i) => (
          <span key={i} className={`fx-bar fx-bar--${['sun', 'both', 'earth', 'blocked'][Math.floor(i / 7) % 4]}`} />
        ))}
      </div>
    ),
    slip: (
      <div className="fx-line">
        <span className="num">◀ −1 d</span>
        <span className="fx-track" />
        <span className="num">+1 d ▶</span>
        <Badge tone="neutral">slipped +30 d</Badge>
        <span className="fx-faint">reset</span>
      </div>
    ),
    touchdown: (
      <div className="fx-pad fx-stack">
        <div className="fx-badges">
          <Badge tone="blocked">Near-zone occluder active</Badge>
          <Badge tone="neutral">slope at 30 m baseline</Badge>
          <Badge tone="nogo">pad risk: high</Badge>
          <Badge tone="tier" glyph={null}>
            slope under-resolved
          </Badge>
        </div>
        <div className="fx-faint num">
          Slope 12.4° ± 1.1° · downhill 214° · uphill 34° · tilt 30° @ 90° · yaw best of 15°
        </div>
        <Segmented
          size="sm"
          ariaLabel="Mast"
          value={10}
          onChange={() => {}}
          options={[1, 2, 5, 10].map((m) => ({ value: m, label: `${m} m` }))}
        />
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
    compareSlip: (
      <div className="fx-line">
        <span className="num">◀ −1 d</span>
        <span className="fx-track" />
        <span className="num">+1 d ▶</span>
        <Badge tone="neutral">all rows · slipped +30 d</Badge>
      </div>
    ),
    compareVisual: (
      <div className="fx-pad fx-stack">
        {rowsAD.map((r) => (
          <div key={r.id} className="fx-barcode fx-barcode--row">
            {Array.from({ length: 60 }, (_, i) => (
              <span
                key={i}
                className={`fx-bar fx-bar--${['sun', 'both', 'earth', 'blocked'][(Math.floor(i / 6) + r.id.charCodeAt(0)) % 4]}`}
              />
            ))}
          </div>
        ))}
        <div className="fx-badges">
          <Badge tone="sun">Sun only</Badge>
          <Badge tone="both">Sun + Earth</Badge>
          <Badge tone="earth">Earth only</Badge>
          <Badge tone="blocked">neither</Badge>
          <Badge tone="provisional">provisional</Badge>
        </div>
      </div>
    ),
    scan: <Table cols={['#', 'Site', 'Landing', 'Verdict', 'Sunlit', 'Link', 'Night']} rows={scanRows} />,
    compareWindows: (
      <Table
        cols={['Type', 'Start ±', 'End ±', 'Duration', 'Flags']}
        rows={windowRows.map((r) => [r[0], r[1], r[2], r[3], r[5]])}
        scroll
      />
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
