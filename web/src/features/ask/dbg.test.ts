import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { it } from 'vitest';
import { buildIndex, searchKnowledge } from './knowledge';
const idx = buildIndex(JSON.parse(readFileSync(resolve(__dirname, '../../../public/content/knowledge.json'), 'utf8')).entries);
const Q = [
 'how is the earth elevation calculated','how do i compare two sites','how do i zoom the moon','what does the array height do','how do i go back to on time',
 'how are the results calculated','how is sunlight calculated','why does the sun stay so low','why is the timing so uncertain','what does grazing mean',
 'how do i drop a pin','what does the verdict mean','how is power calculated','what is a tier c site','are these numbers real','what can i ask you',
 'why do you show plus minus on everything','how is the link to earth decided','what is libration','why did you choose to show elevation first',
 'how do i change to dark mode','what is the slip explorer','what does lumen not do','how accurate is this','how do you know the sun position',
 'is there an atmosphere','what is the earth twin','how long does the signal take','how is slope calculated','what do definitions change',
 'where do i pick a site','how do i play the timeline','what are the colours','why does earth wobble','how many days can i slip',
 'what is dte','what is a dsn station','why is mast height important','how is the longest night found','who is this tool for',
 'banana smoothie recipe','how are shadows computed','what is psr','how do i look up latitude and longitude','what does sets in mean'];
it('dbg', () => { const out = Q.map((q) => { const h = searchKnowledge(idx, q, 3); return q.padEnd(46) + (h.map((x) => `${x.entry.id.replace(/^help:/,'h:').slice(0,34)}(${x.score.toFixed(1)}${x.confidence[0]})`).join('  ') || '— none —'); }); writeFileSync(resolve(__dirname, '../../../dbg.out.txt'), out.join('\n')); });
