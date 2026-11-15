// Owner: Abhinav
// Standalone dev entry for the Lumen pages (orbit-preview.html). Not imported by the app.
import { createRoot } from 'react-dom/client';
import { PagesApp } from '../pages/PagesApp';

document.body.style.margin = '0';
document.body.style.background = '#0E0D0B';
const root = document.getElementById('root');
if (root) createRoot(root).render(<PagesApp />);
