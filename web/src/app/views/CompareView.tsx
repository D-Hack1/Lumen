// Owner: Abhinav
// Scenario Compare & Slip — zero-scroll 3-column bento (PLAN_FINAL §8.6, guide §4).
//   Left   : ScenarioRows (A–D) · MissionProfileForm                                      — mine
//   Centre : CompareSlip (all rows | selected row) · [Aligned Barcodes | Season Strip | 12-Month Calendar] (Ebin)
//            · DeltaTable (Nived) under the visual
//   Right  : ScanPanel (Nived, scrolls) · WindowsTable for the selected row (Ebin, scrolls)
// Teammate imports — all present:
//   Nived: ScanPanel, DeltaTable, useCompareResults · Ebin: AlignedBarcodes, SeasonStrip, FeasibilityCalendar, WindowsTable
// Gaps reported (not worked around in their files): WindowsTable has no per-row input (shows the Cockpit result);
// ScanPanel does not report its stage (bridged below from its data-stage attribute → state/scanStatus).
import { useEffect } from 'react';
import { DeltaTable } from '../../features/compareResults/DeltaTable';
import { ScanPanel } from '../../features/compareResults/ScanPanel';
import { AlignedBarcodes } from '../../features/compareVisuals/AlignedBarcodes';
import { SeasonStrip } from '../../features/compareVisuals/SeasonStrip';
import { FeasibilityCalendar } from '../../features/compareVisuals/FeasibilityCalendar';
import { WindowsTable } from '../../features/analysis/WindowsTable';
import { CompareSlip } from '../../features/scenarios/CompareSlip';
import { MissionProfileForm } from '../../features/scenarios/MissionProfileForm';
import { ScenarioRows } from '../../features/scenarios/ScenarioRows';
import { fill } from '../../engine/format';
import { useCompareResults } from '../../engine/hooks';
import { useCopyFn } from '../../state/copy';
import { reportScanStage, type ScanStage } from '../../state/scanStatus';
import { useScenario, type CompareCentreTab } from '../../state/scenarioStore';
import { Segmented } from '../../ui/Segmented';
import { BentoColumn, BentoGrid } from '../layout/BentoGrid';
import { Slot } from '../layout/Slot';

/** Bridge: ScanPanel's `data-stage` (1 | 2) → scanStatus, at stage-boundary rate. Removed once Nived reports it. */
function useScanStageBridge() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-slot="scan"]');
    if (!root) return;
    const read = () => {
      const el = root.querySelector<HTMLElement>('[data-stage], .scan');
      const st = Number(el?.dataset.stage ?? 0);
      const stage = (st === 1 || st === 2 ? st : 0) as ScanStage;
      reportScanStage(stage, el?.getAttribute('aria-busy') === 'false');
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-stage', 'aria-busy'] });
    return () => {
      mo.disconnect();
      reportScanStage(0);
    };
  }, []);
}

export function CompareView() {
  const tab = useScenario((s) => s.compareTab);
  const setTab = useScenario((s) => s.setCompareTab);
  const selected = useScenario((s) => s.compareSelected);
  const compare = useCompareResults();
  const t = useCopyFn();
  useScanStageBridge();

  const selResult = compare.rows.find((r) => r.scenarioId === selected)?.result ?? null;
  const night = selResult?.metrics?.longestNightH ?? null;

  return (
    <BentoGrid view="compare">
      <BentoColumn side="left">
        <Slot id="scenarioRows">
          <ScenarioRows />
        </Slot>
        <Slot id="missionProfile">
          <MissionProfileForm
            variant="full"
            longestNightH={night}
            result={selResult}
            nightSource={selected ? fill(t('battery.source.row'), { id: selected }) : undefined}
          />
        </Slot>
      </BentoColumn>

      <BentoColumn side="centre">
        <Slot id="compareSlip">
          <CompareSlip />
        </Slot>
        <div className="compare-tabs" data-slot="compareTabs" data-budget="compareTabs">
          <Segmented<CompareCentreTab>
            size="sm"
            ariaLabel={t('slot.compareTabs')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'aligned', label: t('compare.aligned') },
              { value: 'season', label: t('compare.season') },
              { value: 'calendar', label: t('compare.calendar') },
            ]}
          />
        </div>
        <Slot id="compareVisual">
          {tab === 'aligned' ? <AlignedBarcodes /> : tab === 'season' ? <SeasonStrip /> : <FeasibilityCalendar />}
        </Slot>
        <Slot id="deltaTable">
          <DeltaTable />
        </Slot>
      </BentoColumn>

      <BentoColumn side="right">
        <Slot id="scan">
          <ScanPanel />
        </Slot>
        <Slot id="compareWindows">
          <div className="cmp-win__cap" data-testid="compare-windows-caption">
            {/* WindowsTable reads the Cockpit result (no per-row input yet) — say so rather than mislabel it. */}
            <span className="cmp-win__title">{t('compare.windows.cockpit')}</span>
            {selected && (
              <span className="cmp-win__note truncate" title={t('compare.windows.pending.long')}>
                {fill(t('compare.windows.pending'), { id: selected })}
              </span>
            )}
          </div>
          <WindowsTable />
        </Slot>
      </BentoColumn>
    </BentoGrid>
  );
}
