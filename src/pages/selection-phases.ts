import type { ScenarioData } from '@app/ScenarioData';

export interface SelectionPhase {
  title: string;
  scenarios: ScenarioData[];
}

/** Group authored mission numbers, never array positions (which include sandbox). */
export function selectionPhases(campaignId: string | null, scenarios: ScenarioData[]): SelectionPhase[] {
  const groups = new Map<string, ScenarioData[]>();
  for (const scenario of scenarios) {
    let title = 'Phase 1';
    if (scenario.missionType === 'Sandbox' || scenario.number === 0) title = 'Free play';
    else if (campaignId === 'nats' || campaignId === 'nats-eu') {
      if (scenario.number <= 8) title = 'Phase 1 · Missions 01–08';
      else if (scenario.number <= 16) title = 'Phase 2 · Missions 09–16';
      else if (campaignId === 'nats' && scenario.number <= 24) title = 'Phase 3 · Missions 17–24';
      else title = 'Additional missions';
    }
    const group = groups.get(title) ?? [];
    group.push(scenario);
    groups.set(title, group);
  }
  return Array.from(groups, ([title, entries]) => ({ title, scenarios: entries }));
}
