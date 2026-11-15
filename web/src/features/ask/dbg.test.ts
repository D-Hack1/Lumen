import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { it } from 'vitest';
import { buildIndex, searchKnowledge } from './knowledge';
const idx = buildIndex(JSON.parse(readFileSync(resolve(__dirname, '../../../public/content/knowledge.json'), 'utf8')).entries);
const Q = ['why is this ± so big?','how is the earth elevation calculated','how do i go back to on time','how are the results calculated','how long does the signal take','what is dte','what is a dsn station','what is psr','who is this tool for','how are shadows computed','move front 2 days','how is the sunset time uncertain','what does plus minus mean','why is the error so large','how much can i trust the times'];
it('dbg', () => { const out = Q.map((q) => { const h = searchKnowledge(idx, q, 3); return q.padEnd(46) + (h.map((x) => `${x.entry.id.replace(/^help:/,'h:').slice(0,34)}(${x.score.toFixed(1)}${x.confidence[0]})`).join('  ') || '— none —'); }); writeFileSync(resolve(__dirname, '../../../dbg.out.txt'), out.join('\n')); });
