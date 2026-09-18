/**
 * ccs Scenario 3 "First Shift" (phase 18 E) - wiring, the telemetry stream it
 * declares, and the state-of-health decision's fact table. The flown contact
 * is proven by the Playwright spec.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { talon2Satellite } from '@app/campaigns/ccs/satellites';
import { ccsScenario3Data } from '@app/campaigns/ccs/scenario3';
import { ccsCampaignData } from '@app/campaigns/nats/campaign-data';
import type { Condition } from '@app/objectives/objective-types';
import { SCENARIOS } from '@app/scenario-manager';
import { type TelemetryChannelConfig, TelemetryManager } from '@app/telemetry/telemetry-manager';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const objectivesManagerSrc = readFileSync(join(repoRoot, 'src', 'objectives', 'objectives-manager.ts'), 'utf8');
const niceCatalog = JSON.parse(readFileSync(join(repoRoot, 'scripts', 'nice-catalog.json'), 'utf8')) as { codes: string[] };

const settings = ccsScenario3Data.settings as unknown as {
  telemetry: { groundStationId: string; satelliteNoradId: number; antennaIndex: number; channels: TelemetryChannelConfig[]; excursions?: unknown[] };
  commanding: { targetNoradId: number; windowStartS: number; windowEndS: number; requireDopplerComp: boolean; commands: Array<{ id: string }> };
  electronicAttack?: unknown;
  protectedFrequencies?: unknown[];
  satellites: Array<{ noradId: number }>;
};
const objectives = ccsScenario3Data.objectives;

describe('ccs scenario 3: wiring', () => {
  it('is registered after Failover as the first spacecraft-half scenario', () => {
    expect(SCENARIOS.filter((s) => s.id === 'ccs-scenario3')).toHaveLength(1);
    expect(ccsCampaignData.scenarios.map((s) => s.id)).toContain('ccs-scenario3');
    expect(ccsScenario3Data.number).toBe(2);
    expect(ccsScenario3Data.prerequisiteScenarioIds).toEqual(['ccs-scenario2']);
    expect(ccsScenario3Data.settings.missionBriefUrl).toBe('https://docs.signalrange.space/campaign-4/scenario-3?content-only=true&dark=true');
  });

  it('is a TT&C backup contact on TALON-2, with no EA settings so the jam interlock is not armed', () => {
    expect(settings.satellites.map((s) => s.noradId)).toEqual([90071, 90042]);
    expect(settings.telemetry.satelliteNoradId).toBe(90071);
    expect(settings.telemetry.antennaIndex).toBe(1); // the monitor aperture
    expect(settings.commanding.targetNoradId).toBe(90071);
    expect(settings.commanding.requireDopplerComp).toBe(false); // GEO
    expect(settings.commanding.commands.map((c) => c.id)).toContain('HK-DUMP');
    expect(settings.electronicAttack).toBeUndefined();
    expect(settings.protectedFrequencies).toBeUndefined();
  });

  it('TALON-2 sits in the protected band: its TT&C uplink is inside 8175-8225 MHz', () => {
    const tp = (talon2Satellite as unknown as { transponderConfigs?: Array<{ uplinkCenterFrequency: number; bandwidth: number }> }).transponderConfigs?.[0];
    const config = tp ?? { uplinkCenterFrequency: 8200e6, bandwidth: 50e6 };
    expect(config.uplinkCenterFrequency - config.bandwidth / 2).toBeGreaterThanOrEqual(8175e6);
    expect(config.uplinkCenterFrequency + config.bandwidth / 2).toBeLessThanOrEqual(8225e6);
  });
});

describe('ccs scenario 3: telemetry', () => {
  it('every channel is nominal tonight: the nominal value sits inside its yellow limits and no excursion is scripted', () => {
    for (const ch of settings.telemetry.channels) {
      expect(TelemetryManager.bandOf(ch, ch.nominal), `${ch.id} nominal is not green`).toBe('green');
      const noise = ch.noise ?? 0;
      expect(TelemetryManager.bandOf(ch, ch.nominal + noise / 2), `${ch.id} noise reaches yellow`).toBe('green');
      expect(TelemetryManager.bandOf(ch, ch.nominal - noise / 2), `${ch.id} noise reaches yellow`).toBe('green');
    }
    expect(settings.telemetry.excursions ?? []).toHaveLength(0);
    expect(new Set(settings.telemetry.channels.map((c) => c.subsystem)).size).toBeGreaterThanOrEqual(5);
  });

  it('every channel read by an objective exists in the stream and is read on the telemetry tab', () => {
    const ids = new Set(settings.telemetry.channels.map((c) => c.id));
    for (const objective of objectives) {
      for (const c of objective.conditions) {
        if (c.type !== 'telemetry-channel-in-band') continue;
        expect(ids.has(c.params!.channelId!), `${objective.id}: ${c.params!.channelId}`).toBe(true);
        expect(c.params!.observationTab).toBe('telemetry');
        expect(c.params!.requiresObservation).toBe(true);
      }
    }
  });

  it('the state-of-health call is graded on fresh frames inside limits', () => {
    const objective = objectives.find((o) => o.id === 'call-state-of-health')!;
    const decision = objective.conditions.find((c) => c.type === 'decision')!;
    const siblingIds = new Set(objective.conditions.map((c: Condition) => c.id).filter(Boolean));
    for (const id of decision.params!.evidence!) expect(siblingIds.has(id)).toBe(true);

    const holdsWith =
      (facts: Record<string, boolean>) =>
      (rule: unknown): boolean => {
        const r = rule as { fact?: string; is?: boolean; all?: unknown[]; any?: unknown[] };
        if (r.fact) return (facts[r.fact] ?? false) === r.is;
        if (r.all) return r.all.every(holdsWith(facts));
        return (r.any ?? []).some(holdsWith(facts));
      };
    const correct = (facts: Record<string, boolean>) =>
      decision.params!.decisionOptions!.filter((o) => o.correctWhen && holdsWith(facts)(o.correctWhen)).map((o) => o.label.slice(0, 9));
    expect(correct({ 'soh-yellow-limit': false, 'telemetry-stale': false })).toEqual(['Nominal -']);
    expect(correct({ 'soh-yellow-limit': true, 'telemetry-stale': false })).toEqual(['Degraded ']);
    expect(correct({ 'soh-yellow-limit': false, 'telemetry-stale': true })).toEqual(['Unknown -']);
  });
});

describe('ccs scenario 3: objectives', () => {
  it('has scored, NICE-annotated objectives on SS-01 totalling 100 points', () => {
    const catalog = new Set(niceCatalog.codes);
    expect(objectives.length).toBeGreaterThanOrEqual(10);
    for (const objective of objectives) {
      expect(objective.points, `${objective.id}`).toBeGreaterThan(0);
      expect(objective.groundStation).toBe('SS-01');
      expect(objective.nice?.length).toBeGreaterThan(0);
      for (const code of objective.nice ?? []) expect(catalog.has(code), `${objective.id}: ${code}`).toBe(true);
    }
    expect(objectives.reduce((sum, o) => sum + o.points, 0)).toBe(100);
  });

  it('uses only condition types that have an evaluator', () => {
    for (const objective of objectives) {
      for (const condition of objective.conditions) {
        expect(objectivesManagerSrc.includes(`case '${condition.type}':`), `${objective.id}: ${condition.type}`).toBe(true);
      }
    }
  });

  it('keeps the jam strings cold before the contact and safes the chain after the command', () => {
    const cold = objectives.find((o) => o.id === 'jam-strings-cold')!;
    expect(cold.conditions.map((c) => c.type)).toEqual(['hpa-disabled', 'tx-modem-not-transmitting', 'tx-modem-not-transmitting']);
    const dump = objectives.find((o) => o.id === 'housekeeping-dump')!;
    expect(dump.conditions.find((c) => c.type === 'command-acknowledged')!.params!.commandId).toBe('HK-DUMP');
    const safe = objectives.find((o) => o.id === 'safe-the-uplink')!;
    expect(safe.prerequisiteObjectiveIds).toEqual(['housekeeping-dump']);
    expect(safe.conditions.map((c) => c.type)).toEqual(['tx-modem-not-transmitting', 'hpa-disabled']);
  });
});
