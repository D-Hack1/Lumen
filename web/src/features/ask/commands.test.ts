import { describe, expect, it, vi } from 'vitest';
import { matchSites, normalise, parseCommand, runCommand, withinOneEdit, type AskContext } from './commands';

const ctx: AskContext = {
  canSlip: true,
  sites: [
    { id: 'im2', name: 'Mons Mouton, IM-2 site', short: 'IM-2 Athena site', aliases: ['athena'] },
    { id: 'malapert', name: 'Malapert Massif', short: 'Malapert' },
    { id: 'haworth', name: 'Haworth', short: 'Haworth' },
    { id: 'nobile1', name: 'Nobile Rim 1', short: 'Nobile 1' },
    { id: 'degerlache', name: 'de Gerlache Rim 2', short: 'de Gerlache 2' },
  ],
};
const cmd = (s: string, c = ctx) => {
  const r = parseCommand(s, c);
  return r.kind === 'command' ? r.command : r;
};

describe('normalise / withinOneEdit', () => {
  it('folds IM-2 and Chang’e-6', () => {
    expect(normalise('Show IM-2!')).toBe('show im2');
    expect(normalise('Chang’e-6')).toBe('change6');
  });
  it('allows exactly one edit', () => {
    expect(withinOneEdit('malapart', 'malapert')).toBe(true);
    expect(withinOneEdit('malaper', 'malapert')).toBe(true);
    expect(withinOneEdit('malapar', 'malapert')).toBe(false);
    expect(withinOneEdit('malxpart', 'malapert')).toBe(false);
  });
});

describe('navigation', () => {
  it.each([
    ['go to compare', 'compare'],
    ['Open the orbit', 'orbit'],
    ['take me to the moon', 'orbit'],
    ['stand here', 'stand-here'],
    ['show horizon', 'stand-here'],
    ['go to slip explorer', 'slip'],
    ['slip explorer', 'slip'],
  ])('%s → %s', (text, route) => expect(cmd(text)).toEqual({ kind: 'go', route }));
});

describe('sites', () => {
  it('finds a site by name, short name, alias and one typo', () => {
    expect(cmd('show IM-2')).toMatchObject({ kind: 'site', id: 'im2' });
    expect(cmd('athena')).toMatchObject({ kind: 'site', id: 'im2' });
    expect(cmd('select malapert')).toMatchObject({ kind: 'site', id: 'malapert' });
    expect(cmd('malapart')).toMatchObject({ kind: 'site', id: 'malapert' });
    expect(cmd('take me to de gerlache')).toMatchObject({ kind: 'site', id: 'degerlache' });
  });
  it('asks when a word matches several sites, and says nothing when it matches none', () => {
    expect(cmd('rim')).toMatchObject({ kind: 'ambiguous' });
    expect(parseCommand('banana', ctx).kind).toBe('none');
  });
  it('matchSites ignores verbs and stop words', () => {
    expect(matchSites('please show the haworth site', ctx.sites).map((s) => s.id)).toEqual(['haworth']);
  });
});

describe('slip', () => {
  it.each([
    ['slip 9 days', 9],
    ['slip +9', 9],
    ['delay 3 d', 3],
    ['slip back 2 days', -2],
    ['slip -4', -4],
    ['postpone by 12 days', 12],
  ])('%s → %i', (text, days) => expect(cmd(text)).toMatchObject({ kind: 'slip', days }));
  it('clamps to ±30 and says so', () => {
    const r = parseCommand('slip 45 days', ctx);
    expect(r).toMatchObject({ kind: 'command', command: { kind: 'slip', days: 30, clamped: true } });
    expect(r.kind === 'command' && r.label).toContain('limit');
  });
  it('reset', () => expect(cmd('reset slip')).toMatchObject({ kind: 'slip', days: 0 }));
  it('is honest when the live pages cannot slip yet', () => {
    expect(parseCommand('slip 9 days', { ...ctx, canSlip: false }).kind).toBe('unavailable');
  });
});

describe('help and non-commands', () => {
  it('help', () => expect(cmd('help')).toEqual({ kind: 'help' }));
  it('questions are not commands', () => {
    expect(parseCommand('why is this ± so big?', ctx).kind).toBe('none');
    expect(parseCommand('', ctx).kind).toBe('none');
  });
});

describe('runCommand', () => {
  it('calls only the ports it is given', () => {
    const ports = { go: vi.fn(), selectSite: vi.fn(), setSlip: vi.fn() };
    expect(runCommand({ kind: 'go', route: 'compare' }, ports).ok).toBe(true);
    expect(ports.go).toHaveBeenCalledWith('compare');
    runCommand({ kind: 'site', id: 'im2', name: 'IM-2' }, ports);
    expect(ports.selectSite).toHaveBeenCalledWith('im2');
    runCommand({ kind: 'slip', days: 9, clamped: false }, ports);
    expect(ports.setSlip).toHaveBeenCalledWith(9);
  });
  it('refuses slip when there is no setSlip port', () => {
    expect(runCommand({ kind: 'slip', days: 9, clamped: false }, { go: vi.fn(), selectSite: vi.fn() }).ok).toBe(false);
  });
});
