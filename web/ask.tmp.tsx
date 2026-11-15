import '@fontsource/inter/400.css';
import { createRoot } from 'react-dom/client';
import { LumenContext, useLumenState } from './src/features/orbit/lumenState';
import { AskLumen } from './src/features/ask';
import './src/features/orbit/orbit.css';
function H() {
  const lumen = useLumenState();
  return (
    <LumenContext.Provider value={lumen}>
      <div className={lumen.light ? 'lm-theme-light' : 'lm-theme-dark'} style={{ padding: 24, color: 'var(--fg)', minHeight: 600 }}>
        <div id="dbg">site={lumen.site.id} hash={window.location.hash || '(none)'}</div>
        <input id="plain" placeholder="a normal input" style={{ marginTop: 12 }} />
      </div>
      <AskLumen />
    </LumenContext.Provider>
  );
}
window.addEventListener('hashchange', () => document.getElementById('dbg')!.setAttribute('data-hash', location.hash));
createRoot(document.getElementById('root')!).render(<H />);
