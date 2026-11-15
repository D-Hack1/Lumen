// Owner: Ebin
// The one component to mount: `<AskLumen />` inside <LumenContext.Provider> in features/pages/PagesApp.tsx (next to
// <Shell>). It wires AskBox to the live pages' own actions and to the engine result — and nothing else:
//   • go(route)             features/pages/nav.ts
//   • selectSite(id)        LumenContext (live ids: im2, shack, malapert, …)
//   • setSlip(days)         only if LumenContext exposes it (Abhinav is lifting slip into LumenState); until then
//                           "slip 9 days" answers honestly that it can't act yet.
// The result is read only while the box is open (the engine is not started just for this).
import { useContext, useEffect, useMemo, useState } from 'react';
import { useResult } from '../../engine/hooks';
import type { ScenarioResult } from '../../engine/types';
import { LumenContext, SLIP_MAX } from '../orbit/lumenState';
import { go } from '../pages/nav';
import { AskBox } from './AskBox';
import type { AskPorts, AskSite } from './commands';

/**
 * Flip to true when the live pages draw their numbers from `useResult()`. Until then the explanations describe the
 * ENGINE's scenario, which is not what the page on screen shows (it still uses sample values) — and the box says so.
 */
const PAGES_USE_ENGINE_RESULT = false;
/** The live slip state only accepts 0 … SLIP_MAX days (no earlier-than-on-time landing in the Slip explorer). */
const SLIP_RANGE = { min: 0, max: SLIP_MAX } as const;
const NOTE = 'These numbers are from the engine’s own scenario, not from the sample values on the page you are looking at — the pages are not connected to the engine yet.';

/** Mounted only while the box is open: subscribing starts the engine, so we do it on demand. */
function ResultBridge({ onResult }: { onResult: (r: ScenarioResult) => void }) {
  const r = useResult();
  useEffect(() => onResult(r), [r, onResult]);
  return null;
}

export function AskLumen() {
  const lumen = useContext(LumenContext);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ScenarioResult | null>(null);

  const sites = useMemo<AskSite[]>(() => (lumen?.allSites ?? []).map((s) => ({ id: s.id, name: s.name, short: s.short })), [lumen?.allSites]);
  const setSlip = (lumen as unknown as { setSlip?: (days: number) => void } | null)?.setSlip;
  const ports = useMemo<AskPorts>(() => ({ go, selectSite: (id) => lumen?.selectSite(id), ...(setSlip ? { setSlip } : {}) }), [lumen, setSlip]);

  if (!lumen) return null;
  return (
    <>
      {open && <ResultBridge onResult={setResult} />}
      <AskBox ports={ports} sites={sites} canSlip={Boolean(setSlip)} slipRange={SLIP_RANGE} result={result} resultNote={PAGES_USE_ENGINE_RESULT ? undefined : NOTE} light={lumen.light} onOpenChange={setOpen} />
    </>
  );
}
