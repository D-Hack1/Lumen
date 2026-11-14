// Owner: Ebin
// SKYLINE Ribbon panel — Panorama/Lens toggle header + transport (PLAN_FINAL §8.3, guide §3.2).
// Phase 1: stub shell so the `ribbon` slot has a real export. Phase 2 fills in the physics-driven draw calls.
import { useState } from 'react';
import { useCopy } from '../../state/copy';
import { Segmented } from '../../ui/Segmented';
import { RibbonPanorama } from './RibbonPanorama';
import { RibbonLens } from './RibbonLens';

type RibbonView = 'panorama' | 'lens';

export function Ribbon() {
  const [view, setView] = useState<RibbonView>('panorama');
  const t = useCopy('ribbon.title');

  return (
    <div className="ribbon" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="ribbon__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="num" style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-text-muted)' }}>{t}</span>
        <Segmented<RibbonView>
          size="sm"
          ariaLabel={t}
          value={view}
          onChange={setView}
          options={[
            { value: 'panorama', label: 'Panorama' },
            { value: 'lens', label: 'Lens' },
          ]}
        />
      </div>
      <div className="ribbon__body" style={{ flex: 1, minHeight: 0 }}>
        {view === 'panorama' ? <RibbonPanorama /> : <RibbonLens body="sun" />}
      </div>
    </div>
  );
}
