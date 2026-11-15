// Owner: Abhinav
// The four Lumen pages behind one shell, routed by URL hash (#orbit, #stand-here, #compare, #slip). Theme, selected site,
// array height, clock and compare list are shared, so a choice made on one page carries to the others.
import { useEffect, useState } from 'react';
import { OrbitPage } from '../orbit/OrbitPage';
import { LumenContext, useLumenState } from '../orbit/lumenState';
import { ComparePage } from './ComparePage';
import { go } from './nav';
import { Shell, type Route } from './Shell';
import { SlipPage } from './SlipPage';
import { SurfacePage } from './SurfacePage';
import './pages.css';

const ROUTES: readonly Route[] = ['orbit', 'stand-here', 'compare', 'slip'];
const read = (): Route => {
  const h = window.location.hash.replace('#', '');
  return (ROUTES as readonly string[]).includes(h) ? (h as Route) : 'orbit';
};

export function PagesApp() {
  const lumen = useLumenState();
  const [route, setRoute] = useState<Route>(read);

  useEffect(() => {
    const on = () => {
      setRoute(read());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    const names: Record<Route, string> = {
      orbit: 'Orbit',
      'stand-here': 'Stand here',
      compare: 'Compare',
      slip: 'Slip explorer',
    };
    document.title = `${names[route]} · Lumen`;
  }, [route]);

  return (
    <LumenContext.Provider value={lumen}>
      <Shell route={route} lumen={lumen}>
        {route === 'orbit' && (
          <OrbitPage
            onStandHere={() => go('stand-here')}
            onAddToCompare={(s) => {
              lumen.addPick(s.id);
              go('compare');
            }}
          />
        )}
        {route === 'stand-here' && <SurfacePage />}
        {route === 'compare' && <ComparePage />}
        {route === 'slip' && <SlipPage />}
      </Shell>
    </LumenContext.Provider>
  );
}
