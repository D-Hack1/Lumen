// Owner: Ebin
// Touchdown Pad widget: slope/aspect compass, panel preset + mast height, yaw, off-nominal tilt, power bars.
// Tilt/yaw drag writes padDragBus live (Fast Lane); release commits via useScenario (PLAN_FINAL §5.6, §8.3).
import { useResult } from '../../engine/hooks';
import { useScenario, type MastHeightM, type PanelPreset } from '../../state/scenarioStore';
import { padDragBus } from '../../state/buses';
import { useCopyFn } from '../../state/copy';
import { Segmented } from '../../ui/Segmented';
import { SlopeCompass } from './SlopeCompass';
import { PanelPowerBars } from './PanelPowerBars';

const HEIGHTS: MastHeightM[] = [1, 2, 5, 10];
const PRESETS: PanelPreset[] = ['fourSide', 'singleHeading', 'horizontalDeck', 'trackingMast'];

export function TouchdownPad() {
  const result = useResult();
  const height = useScenario((s) => s.heightM);
  const setHeight = useScenario((s) => s.setHeight);
  const preset = useScenario((s) => s.panelPreset);
  const setPreset = useScenario((s) => s.setPanelPreset);
  const tilt = useScenario((s) => s.tilt);
  const setTilt = useScenario((s) => s.setTilt);
  const t = useCopyFn();

  const padSlope = result.metrics?.padSlopeDeg?.value ?? null;
  const sunAz = result.answer?.sun.elevDeg != null ? result.series?.sunAzDeg[0] ?? null : null;
  const earthAz = result.series?.earthAzDeg[0] ?? null;

  // Flat power baseline vs current preset — placeholder split until Nived's power.ts lands (Phase 2).
  const totalW = result.metrics?.energyPerDayWh?.value ?? 0;
  const panels = [
    { label: '+X side', watts: totalW * 0.28, baselineWatts: totalW * 0.25 },
    { label: '+Y side', watts: totalW * 0.22, baselineWatts: totalW * 0.25 },
    { label: '−X side', watts: totalW * 0.24, baselineWatts: totalW * 0.25 },
    { label: '−Y side', watts: totalW * 0.26, baselineWatts: totalW * 0.25 },
  ];

  return (
    <div className="touchdown-pad" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', height: '100%', minHeight: 0 }}>
      <div style={{ height: 120 }}>
        <SlopeCompass slopeDeg={padSlope} downhillAzimuthDeg={null} sunAzDeg={sunAz} earthAzDeg={earthAz} />
      </div>

      <Segmented<PanelPreset>
        size="sm"
        ariaLabel={t('touchdown.preset')}
        value={preset}
        onChange={setPreset}
        options={PRESETS.map((p) => ({ value: p, label: t(`touchdown.preset.${p}`) }))}
      />

      <Segmented<MastHeightM>
        size="sm"
        ariaLabel={t('touchdown.height')}
        value={height}
        onChange={setHeight}
        options={HEIGHTS.map((h) => ({ value: h, label: `${h} m` }))}
      />

      <div>
        <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)' }}>
          Off-nominal tilt {tilt.magnitudeDeg.toFixed(0)}°
        </label>
        <input
          type="range"
          min={0}
          max={30}
          value={tilt.magnitudeDeg}
          onChange={(e) => {
            const magnitudeDeg = Number(e.target.value);
            padDragBus.set({ tiltMagDeg: magnitudeDeg, dragging: true });
          }}
          onPointerUp={(e) => setTilt({ ...tilt, magnitudeDeg: Number((e.target as HTMLInputElement).value) })}
        />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <PanelPowerBars panels={panels} />
      </div>
    </div>
  );
}
