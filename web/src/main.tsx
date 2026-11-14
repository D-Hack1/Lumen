// Owner: Abhinav
// Entry: fonts → tokens → density attributes → glossary binding → scenario from URL (+ optional e2e fixture) →
// render → URL sync.
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './ui/global.css';
import './ui/kit.css';
import './app/layout/layout.css';
import './app/missionBar.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { FixtureContext, type Fixture } from './app/layout/fixture';
import { installViewportWatcher } from './app/layout/viewport';
import { createMonitors } from './engine/perfMonitors';
import { installPerf, perf } from './engine/perf';
import { PerfHud } from './perf/PerfHud';
import { PerfProfiler } from './perf/PerfProfiler';
import { installGlossaryBinding } from './features/guidance/InfoBadgeBinding';
import { useScenario } from './state/scenarioStore';
import { readScenarioFromUrl, startUrlSync } from './state/urlSync';
import { installTokens } from './ui/tokens';

async function boot() {
  installTokens();
  installViewportWatcher();
  void installGlossaryBinding(); // every <InfoBadge term> resolves from glossary.json (interim spec text until it lands)

  const params = new URLSearchParams(window.location.search);
  let fixture: Fixture | null = null;
  if (params.get('fixture') === 'worst-case') {
    fixture = (await import('./app/dev/worstCase')).worstCaseFixture;
  }

  useScenario.getState().hydrate({ ...readScenarioFromUrl(), ...fixture?.scenario });
  installPerf(window, perf, createMonitors()); // window.__lumenPerf for automated G8 checks (cheap: nothing runs until start())

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <FixtureContext.Provider value={fixture}>
        <PerfProfiler>
          <App />
        </PerfProfiler>
        {(import.meta.env.DEV || params.has('perf')) && <PerfHud />}
      </FixtureContext.Provider>
    </StrictMode>,
  );

  startUrlSync();
  await document.fonts.ready;
  document.documentElement.dataset.ready = 'true';
}

void boot();
