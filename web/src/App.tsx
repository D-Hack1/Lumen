// Owner: Abhinav
// Root app: viewport-locked shell = Mission Bar + active view (≤ 150 ms opacity crossfade, no slide) + toasts.
import { MissionBar } from './app/MissionBar';
import { CockpitView } from './app/views/CockpitView';
import { CompareView } from './app/views/CompareView';
import { MethodologyView } from './app/views/MethodologyView';
import { useScenario } from './state/scenarioStore';
import { ToastViewport } from './ui/Toast';

export function App() {
  const view = useScenario((s) => s.view);
  return (
    <div className="app-root" data-view={view}>
      <MissionBar />
      <main className="app-view" key={view} aria-label={view}>
        {view === 'cockpit' && <CockpitView />}
        {view === 'compare' && <CompareView />}
        {view === 'methodology' && <MethodologyView />}
      </main>
      <ToastViewport />
    </div>
  );
}
