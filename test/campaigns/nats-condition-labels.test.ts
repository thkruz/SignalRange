/**
 * nats-r3-s20-F1 lint: every nats checklist row has a label.
 *
 * A visible condition renders conditionLabel() (its description, or a
 * type-derived fallback); a hidden tab-active condition renders nothing until
 * its B5 hint, which must name a tab. Neither may come out blank.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({ satellites: [], getSatByNoradId: () => null, isDeveloperMode: false, groundStations: [] }),
    destroy: () => undefined,
  },
}));

import { scenario1Data } from '@app/campaigns/nats/scenario1';
import { scenario2Data } from '@app/campaigns/nats/scenario2';
import { scenario3Data } from '@app/campaigns/nats/scenario3';
import { scenario4Data } from '@app/campaigns/nats/scenario4';
import { scenario5Data } from '@app/campaigns/nats/scenario5';
import { scenario6Data } from '@app/campaigns/nats/scenario6';
import { scenario7Data } from '@app/campaigns/nats/scenario7';
import { scenario8Data } from '@app/campaigns/nats/scenario8';
import { scenario9Data } from '@app/campaigns/nats/scenario9';
import { scenario10Data } from '@app/campaigns/nats/scenario10';
import { scenario11Data } from '@app/campaigns/nats/scenario11';
import { scenario12Data } from '@app/campaigns/nats/scenario12';
import { scenario13Data } from '@app/campaigns/nats/scenario13';
import { scenario14Data } from '@app/campaigns/nats/scenario14';
import { scenario15Data } from '@app/campaigns/nats/scenario15';
import { scenario16Data } from '@app/campaigns/nats/scenario16';
import { scenario17Data } from '@app/campaigns/nats/scenario17';
import { scenario18Data } from '@app/campaigns/nats/scenario18';
import { scenario19Data } from '@app/campaigns/nats/scenario19';
import { scenario20Data } from '@app/campaigns/nats/scenario20';
import { scenario21Data } from '@app/campaigns/nats/scenario21';
import { scenario22Data } from '@app/campaigns/nats/scenario22';
import { scenario23Data } from '@app/campaigns/nats/scenario23';
import { scenario24Data } from '@app/campaigns/nats/scenario24';
import { conditionLabel, tabHintLabel } from '@app/objectives/condition-label';
import type { ScenarioData } from '@app/ScenarioData';

const SCENARIOS: ScenarioData[] = [
  scenario1Data,
  scenario2Data,
  scenario3Data,
  scenario4Data,
  scenario5Data,
  scenario6Data,
  scenario7Data,
  scenario8Data,
  scenario9Data,
  scenario10Data,
  scenario11Data,
  scenario12Data,
  scenario13Data,
  scenario14Data,
  scenario15Data,
  scenario16Data,
  scenario17Data,
  scenario18Data,
  scenario19Data,
  scenario20Data,
  scenario21Data,
  scenario22Data,
  scenario23Data,
  scenario24Data,
];

describe('nats checklist rows all have a label (nats-r3-s20-F1)', () => {
  it('every visible condition renders a non-empty label', () => {
    const blank: string[] = [];
    for (const scenario of SCENARIOS) {
      for (const objective of scenario.objectives ?? []) {
        objective.conditions.forEach((condition, i) => {
          if (!condition.hidden && conditionLabel(condition).trim() === '') {
            blank.push(`${scenario.id} ${objective.id}[${i}] ${condition.type}`);
          }
        });
      }
    }
    expect(blank).toEqual([]);
  });

  it('every hidden condition is a tab-active row with a tab, so its hint row names it', () => {
    const unnamed: string[] = [];
    for (const scenario of SCENARIOS) {
      for (const objective of scenario.objectives ?? []) {
        objective.conditions.forEach((condition, i) => {
          if (!condition.hidden) {
            return;
          }
          const tab = condition.params?.tab;
          if (condition.type !== 'tab-active' || !tab || !tabHintLabel(tab).endsWith('tab to continue)')) {
            unnamed.push(`${scenario.id} ${objective.id}[${i}] ${condition.type}`);
          }
        });
      }
    }
    expect(unnamed).toEqual([]);
  });
});
