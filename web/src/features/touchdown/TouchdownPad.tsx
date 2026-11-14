// Owner: Ebin
// Touchdown Pad widget: slope/aspect compass, panel preset + mast height, yaw, off-nominal tilt, power bars.
// Tilt/yaw drag writes padDragBus live (Fast Lane); release commits via useScenario (PLAN_FINAL §5.6, §8.3).
//
// Teammate review fix: the tilt slider used to be a controlled <input value={tilt.magnitudeDeg}> whose value
// never changed during drag (only padDragBus did) — React kept re-rendering it back to the stale committed
// value every tick, so the thumb would snap back instead of following the pointer. Switched to Abhinav's
// `Slider` (uncontrolled; onLive is bus-only, onCommit fires once on release) and the live label now paints
// from padDragBus via a ref instead of reading committed state.
import { useEffect, useRef } from 'react';
import { useResult } from '../../engine/hooks';
import { useScenario, type MastHeightM, type PanelPreset } from '../../state/scenarioStore';
import { padDragBus } from '../../state/buses';
import { useCopyFn } from '../../state/copy';
import { Segmented } from '../../ui/Segmented';
import { Slider } from '../../ui/Slider';
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
  const tiltLabelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const paint = (deg: number) => {
      if (tiltLabelRef.current) tiltLabelRef.current.textContent = `${deg.toFixed(0)}°`;
    };
    paint(padDragBus.get().tiltMagDeg);
    return padDragBus.subscribe((v) => paint(v.tiltMagDeg));
  }, []);

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
          Off-nominal tilt <span ref={tiltLabelRef} className="num" />
        </label>
        <Slider
          value={tilt.magnitudeDeg}
          min={0}
          max={30}
          ariaLabel="Off-nominal tilt magnitude"
          hotpath
          onLive={(v) => padDragBus.set({ tiltMagDeg: v, dragging: true })}
          onCommit={(v) => setTilt({ ...tilt, magnitudeDeg: v })}
        />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <PanelPowerBars panels={panels} />
      </div>
    </div>
  );
}
