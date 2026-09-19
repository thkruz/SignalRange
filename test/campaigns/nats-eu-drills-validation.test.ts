/**
 * nats-eu drills S25-S28 (phase 18 G) - wiring, the audit-log staging each
 * drill is built on, the decision grading, and the objective chains. The
 * density gate holds the drill floors; the Playwright specs prove the runs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { natsEuCampaignData } from '@app/campaigns/nats-eu/campaign-data';
import { natsEuScenario25Data } from '@app/campaigns/nats-eu/scenario25';
import { natsEuScenario26Data } from '@app/campaigns/nats-eu/scenario26';
import { natsEuScenario27Data } from '@app/campaigns/nats-eu/scenario27';
import { natsEuScenario28Data } from '@app/campaigns/nats-eu/scenario28';
import type { EvidenceFactId, Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { SCENARIOS } from '@app/scenario-manager';
import { describe, expect, it } from 'vitest';

const DRILLS: ScenarioData[] = [natsEuScenario25Data, natsEuScenario26Data, natsEuScenario27Data, natsEuScenario28Data];
const repoRoot = process.cwd();
const objectivesManagerSrc = readFileSync(join(repoRoot, 'src', 'objectives', 'objectives-manager.ts'), 'utf8');
const niceCatalog = new Set((JSON.parse(readFileSync(join(repoRoot, 'scripts', 'nice-catalog.json'), 'utf8')) as { codes: string[] }).codes);

type Security = { accounts: Array<{ id: string; status: string }>; events: Array<{ id: string; category: string; isAnomaly?: boolean }> };

const securityOf = (scenario: ScenarioData): Security => (scenario.settings as unknown as { security: Security }).security;

function objectiveOf(scenario: ScenarioData, id: string): Objective {
  const objective = scenario.objectives?.find((o) => o.id === id);

  expect(objective, `${scenario.id}: missing objective ${id}`).toBeDefined();

  return objective!;
}

/** Indices of the decision options whose correctWhen rule holds under `facts` */
function correctOptionsUnder(objective: Objective, facts: Partial<Record<EvidenceFactId, boolean>>): number[] {
  const decision = objective.conditions.find((c) => c.type === 'decision');

  expect(decision, `${objective.id}: decision`).toBeDefined();
  const holds = (rule: { fact?: EvidenceFactId; is?: boolean; all?: unknown[]; any?: unknown[] }): boolean => {
    if (rule.fact !== undefined) return (facts[rule.fact] ?? false) === rule.is;
    if (rule.all) return (rule.all as (typeof rule)[]).every(holds);
    return (rule.any as (typeof rule)[]).some(holds);
  };

  return decision!.params!.decisionOptions!.map((o, index) => (o.correctWhen && holds(o.correctWhen as never) ? index : -1)).filter((index) => index >= 0);
}

describe('nats-eu drills: wiring', () => {
  it('registers S25-S28 after the capstone, chained from S16, as 15-minute intermediate drills', () => {
    const ids = natsEuCampaignData.scenarios.map((s) => s.id);

    expect(ids.slice(-5)).toEqual(['nats-eu-scenario24', 'nats-eu-scenario25', 'nats-eu-scenario26', 'nats-eu-scenario27', 'nats-eu-scenario28']);
    const expectedPrereq = ['nats-eu-scenario16', 'nats-eu-scenario25', 'nats-eu-scenario26', 'nats-eu-scenario27'];

    DRILLS.forEach((scenario, i) => {
      expect(SCENARIOS.filter((s) => s.id === scenario.id)).toHaveLength(1);
      expect(scenario.number).toBe(25 + i);
      expect(scenario.prerequisiteScenarioIds).toEqual([expectedPrereq[i]]);
      expect(scenario.url).toBe(`nats-eu/scenarios/${scenario.id}`);
      expect(scenario.difficulty).toBe('intermediate');
      expect(scenario.duration).toBe('15 min');
      expect(scenario.missionType).toBe('Security Drill');
      expect(scenario.subtitle).toBe(`Security Drill ${i + 1}/4`);
      expect(scenario.settings.missionBriefUrl).toBe(`https://docs.signalrange.space/campaign-2/scenario-${25 + i}?content-only=true&dark=true`);
      expect(scenario.dialogClips).toBeUndefined();
      expect(scenario.settings.groundStations[0].id).toBe('GW-01');
      expect(scenario.settings.satellites).toHaveLength(2);
    });
  });

  it('every drill totals 100 points on GW-01 with catalogued NICE codes, evaluated condition types, and collision-free titles', () => {
    for (const scenario of DRILLS) {
      const objectives = scenario.objectives ?? [];

      expect(
        objectives.reduce((sum, o) => sum + o.points, 0),
        scenario.id
      ).toBe(100);
      for (const objective of objectives) {
        expect(objective.groundStation, objective.id).toBe('GW-01');
        expect(objective.timeLimitSeconds, objective.id).toBeUndefined();
        for (const code of objective.nice ?? []) expect(niceCatalog.has(code), `${objective.id}: ${code}`).toBe(true);
        for (const condition of objective.conditions) {
          expect(objectivesManagerSrc.includes(`case '${condition.type}':`), `${objective.id}: ${condition.type}`).toBe(true);
          if (condition.type === 'status-check' && condition.params?.documentLine) {
            expect(scenario.settings.workingDocument, `${objective.id} writes a documentLine`).toBeDefined();
          }
          if (condition.type === 'security-event-acknowledged') {
            expect(
              securityOf(scenario).events.some((e) => e.id === condition.params!.eventId),
              `${objective.id}: ${condition.params!.eventId}`
            ).toBe(true);
          }
          if (condition.type === 'access-control-set') {
            expect(
              securityOf(scenario).accounts.some((a) => a.id === condition.params!.accountId),
              `${objective.id}: ${condition.params!.accountId}`
            ).toBe(true);
          }
        }
        for (const other of objectives) {
          if (other === objective) continue;
          expect(`${other.title} ${other.description}`.toLowerCase().includes(objective.title.toLowerCase()), `"${objective.title}" appears in ${other.id}`).toBe(false);
        }
      }
    }
  });
});

describe('S25 Site Orientation', () => {
  it('is a ten-stop knowledge walk anchored to the consoles it is about', () => {
    const objectives = natsEuScenario25Data.objectives!;

    expect(objectives.filter((o) => o.conditions.some((c) => c.type === 'status-check'))).toHaveLength(10);
    expect(objectiveOf(natsEuScenario25Data, 'the-m-and-c-path').conditions.map((c) => c.type)).toEqual(['tab-active', 'audit-log-reviewed', 'status-check']);
    expect(objectiveOf(natsEuScenario25Data, 'the-pattern').conditions[0]).toMatchObject({ type: 'tab-active', params: { tab: 'rx-analysis' } });
    expect(objectiveOf(natsEuScenario25Data, 'not-ordinary-it').conditions.filter((c) => c.type === 'status-check')).toHaveLength(2);
  });
});

describe('S26 Baseline Check', () => {
  const scenario = natsEuScenario26Data;

  it('stages RX modem 1 four megahertz off the baseline with the change in the log as a config anomaly', () => {
    const modem = scenario.settings.groundStations[0].receivers![0].modems![0];

    expect(modem.frequency).toBe(1410);
    const security = securityOf(scenario);
    const change = security.events.find((e) => e.id === 'evt-cfg-freq')!;

    expect(change.category).toBe('config');
    expect(change.isAnomaly).toBe(true);
    expect(security.events.filter((e) => e.isAnomaly).map((e) => e.id)).toEqual(['evt-vendor-login', 'evt-cfg-freq']);
    expect(security.accounts.find((a) => a.id === 'svc-vendor')!.status).toBe('active');
  });

  it('reads the modem, calls the drift on config-drifted before flagging, restores 1414, then flags and holds', () => {
    const order = ['the-baseline', 'check-against-baseline', 'call-the-drift', 'restore-the-baseline', 'flag-the-change', 'hold-the-account', 'confirm-access', 'log-the-sweep'];

    for (let i = 1; i < order.length; i++) expect(objectiveOf(scenario, order[i]).prerequisiteObjectiveIds, order[i]).toEqual([order[i - 1]]);
    const check = objectiveOf(scenario, 'check-against-baseline');

    expect(check.conditions[0]).toMatchObject({ type: 'rx-modem-frequency-set', params: { frequency: 1410e6, requiresObservation: true, observationTab: 'rx-analysis' } });
    const call = objectiveOf(scenario, 'call-the-drift');

    expect(call.conditions.find((c) => c.type === 'decision')!.params!.evidence).toEqual(['modem-read']);
    expect(correctOptionsUnder(call, { 'config-drifted': true })).toEqual([0]);
    expect(correctOptionsUnder(call, { 'config-drifted': false })).toEqual([1]);
    expect(objectiveOf(scenario, 'restore-the-baseline').conditions[0].params!.frequency).toBe(1414e6);
    expect(objectiveOf(scenario, 'flag-the-change').conditions.map((c) => c.params!.eventId)).toEqual(['evt-vendor-login', 'evt-cfg-freq']);
    expect(objectiveOf(scenario, 'hold-the-account').conditions[0].params).toMatchObject({ accountId: 'svc-vendor', accountStatus: 'disabled' });
  });
});

describe('S27 Removable Media', () => {
  const scenario = natsEuScenario27Data;

  it('stages a media mount (access) and an unsigned firmware stage (config) as the two anomalies', () => {
    const anomalies = securityOf(scenario).events.filter((e) => e.isAnomaly);

    expect(anomalies.map((e) => [e.id, e.category])).toEqual([
      ['evt-usb', 'access'],
      ['evt-fw-stage', 'config'],
    ]);
  });

  it('grades the call on config-drifted with the media entry as evidence, and the wrong branch reboots the ACU', () => {
    const call = objectiveOf(scenario, 'call-the-media');
    const decision = call.conditions.find((c) => c.type === 'decision')!;

    expect(call.conditions[0]).toMatchObject({ id: 'usb-flagged', type: 'security-event-acknowledged', params: { eventId: 'evt-usb' }, mustMaintain: true });
    expect(decision.params!.evidence).toEqual(['usb-flagged']);
    expect(correctOptionsUnder(call, { 'config-drifted': true })).toEqual([0]);
    expect(correctOptionsUnder(call, { 'config-drifted': false })).toEqual([1]);
    expect(decision.params!.decisionOptions![2].consequence?.auditEvent).toMatchObject({ id: 'evt-acu-reboot', category: 'config', isAnomaly: true });
    expect(objectiveOf(scenario, 'flag-the-firmware').prerequisiteObjectiveIds).toEqual(['verify-the-image']);
    expect(objectiveOf(scenario, 'hold-the-technician').conditions[0].params).toMatchObject({ accountId: 'vend-tech', accountStatus: 'disabled' });
  });
});

describe('S28 Vendor Session', () => {
  const scenario = natsEuScenario28Data;

  it('stages the session, the off-baseline flow and the read burst as three anomalies among baseline polls', () => {
    const security = securityOf(scenario);

    expect(security.events.filter((e) => e.isAnomaly).map((e) => e.id)).toEqual(['evt-vpn', 'evt-flow', 'evt-acu-burst']);
    expect(security.events.filter((e) => !e.isAnomaly).length).toBeGreaterThanOrEqual(3);
  });

  it('grades the call on audit-anomaly-present with the session flagged as evidence, cuts the account, then flags the flows', () => {
    const call = objectiveOf(scenario, 'call-the-session');

    expect(call.conditions[0]).toMatchObject({ id: 'session-flagged', type: 'security-event-acknowledged', params: { eventId: 'evt-vpn' } });
    expect(correctOptionsUnder(call, { 'audit-anomaly-present': true })).toEqual([0]);
    expect(correctOptionsUnder(call, { 'audit-anomaly-present': false })).toEqual([1]);
    expect(objectiveOf(scenario, 'cut-the-session').conditions[0].params).toMatchObject({ accountId: 'svc-vendor', accountStatus: 'disabled' });
    expect(objectiveOf(scenario, 'flag-the-flows').conditions.map((c) => c.params!.eventId)).toEqual(['evt-flow', 'evt-acu-burst']);
    expect(objectiveOf(scenario, 'flag-the-flows').prerequisiteObjectiveIds).toEqual(['cut-the-session']);
  });
});
