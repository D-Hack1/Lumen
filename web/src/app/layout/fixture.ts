// Owner: Abhinav
// Fixture context: lets the e2e worst-case fixture (`?fixture=worst-case`) fill slots with worst-case content
// so the zero-scroll check (§5.1) measures real text at real budgets. No effect when no fixture is loaded.
import { createContext, useContext, type ReactNode } from 'react';
import type { Scenario } from '../../state/scenarioStore';
import type { Verdict } from '../../engine/types';
import type { SlotId } from './slots';

export interface Fixture {
  name: string;
  scenario?: Partial<Scenario>;
  slots: Partial<Record<SlotId, ReactNode>>;
  missionBar?: { siteLabel?: string; tierLabel?: string; verdict?: Verdict; provisional?: boolean };
}

export const FixtureContext = createContext<Fixture | null>(null);
export const useFixture = () => useContext(FixtureContext);
