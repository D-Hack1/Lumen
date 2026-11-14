// Owner: Abhinav
// Scenario Compare & Slip — zero-scroll bento (PLAN_FINAL §8.6; columns per WORK_DISTRIBUTION §5.1).
//
// Teammate imports — all Phase 1 stubs merged:
//   Nived: ScanPanel, DeltaTable · Ebin: SlipBar (global), AlignedBarcodes, SeasonStrip, FeasibilityCalendar,
//   WindowsTable
import { DeltaTable } from '../../features/compareResults/DeltaTable';
import { ScanPanel } from '../../features/compareResults/ScanPanel';
import { SlipBar } from '../../features/barcode/SlipBar';
import { AlignedBarcodes } from '../../features/compareVisuals/AlignedBarcodes';
import { SeasonStrip } from '../../features/compareVisuals/SeasonStrip';
import { FeasibilityCalendar } from '../../features/compareVisuals/FeasibilityCalendar';
import { WindowsTable } from '../../features/analysis/WindowsTable';
import { useCopyFn } from '../../state/copy';
import { useScenario, type CompareCentreTab } from '../../state/scenarioStore';
import { Segmented } from '../../ui/Segmented';
import { BentoColumn, BentoGrid } from '../layout/BentoGrid';
import { Slot } from '../layout/Slot';

export function CompareView() {
  const tab = useScenario((s) => s.compareTab);
  const setTab = useScenario((s) => s.setCompareTab);
  const t = useCopyFn();

  return (
    <BentoGrid view="compare">
      <BentoColumn side="left">
        <Slot id="scenarioRows" />
        <Slot id="missionProfile" />
      </BentoColumn>

      <BentoColumn side="centre">
        <Slot id="compareSlip">
          <SlipBar />
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
      </BentoColumn>

      <BentoColumn side="right">
        <Slot id="scan">
          <ScanPanel />
        </Slot>
        <Slot id="deltaTable">
          <DeltaTable />
        </Slot>
        <Slot id="compareWindows">
          <WindowsTable />
        </Slot>
      </BentoColumn>
    </BentoGrid>
  );
}
