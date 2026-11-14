// Owner: Abhinav
// Mission Cockpit — 3-column zero-scroll bento (PLAN_FINAL §8.3, guide §4).
//
// Teammate imports (agreed paths, WORK_DISTRIBUTION §5) — all Phase 1 stubs merged:
//   Nived: AnswerStrip, MetricDeck, Basemap · Ebin: Ribbon, AnalysisPanel, Barcode, SlipBar, TouchdownPad
import { useState } from 'react';
import { AnswerStrip } from '../../features/answer/AnswerStrip';
import { Basemap } from '../../features/map/Basemap';
import { MetricDeck } from '../../features/metrics/MetricDeck';
import { Ribbon } from '../../features/ribbon/Ribbon';
import { AnalysisPanel } from '../../features/analysis/AnalysisPanel';
import { Barcode } from '../../features/barcode/Barcode';
import { SlipBar } from '../../features/barcode/SlipBar';
import { TouchdownPad } from '../../features/touchdown/TouchdownPad';
import { useCopyFn } from '../../state/copy';
import { Segmented } from '../../ui/Segmented';
import { BentoColumn, BentoGrid } from '../layout/BentoGrid';
import { Slot } from '../layout/Slot';
import { useViewport } from '../layout/viewport';

type RightTab = 'metrics' | 'touchdown';

export function CockpitView() {
  const { rightTabs } = useViewport();
  const [rightTab, setRightTab] = useState<RightTab>('metrics');
  const t = useCopyFn();

  return (
    <BentoGrid view="cockpit">
      <BentoColumn side="left">
        <Slot id="search" />
        <Slot id="map">
          <div className="map-square">
            <Basemap />
          </div>
        </Slot>
        <Slot id="siteList" />
      </BentoColumn>

      <BentoColumn side="centre">
        <Slot id="answer">
          <AnswerStrip />
        </Slot>
        <Slot id="definitions" />
        <Slot id="ribbon">
          <Ribbon />
        </Slot>
        <Slot id="analysis">
          <AnalysisPanel />
        </Slot>
        <Slot id="barcode">
          <Barcode />
        </Slot>
        <Slot id="slip">
          <SlipBar />
        </Slot>
      </BentoColumn>

      <BentoColumn side="right" className={rightTabs ? 'is-tabs' : undefined}>
        {rightTabs && (
          <div className="right-tabs">
            <Segmented<RightTab>
              as="tabs"
              size="sm"
              ariaLabel="Right column"
              value={rightTab}
              onChange={setRightTab}
              options={[
                { value: 'metrics', label: t('right.metrics') },
                { value: 'touchdown', label: t('right.touchdown') },
              ]}
            />
          </div>
        )}
        {(!rightTabs || rightTab === 'metrics') && (
          <Slot id="metricDeck">
            <MetricDeck />
          </Slot>
        )}
        {(!rightTabs || rightTab === 'touchdown') && (
          <Slot id="touchdown">
            <TouchdownPad />
          </Slot>
        )}
        <Slot id="profileBattery" />
      </BentoColumn>
    </BentoGrid>
  );
}
