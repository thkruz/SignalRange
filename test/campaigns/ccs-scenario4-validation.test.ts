/**
 * ccs Scenario 4 "State of Health" (phase 18 E) - wiring, the two excursions
 * (a transient that self-clears and a trend that ends only on the heater
 * command), and the decision's fact table. The flown contact is proven by
 * the Playwright spec.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ccsScenario4Data } from '@app/campaigns/ccs/scenario4';
import { ccsCampaignData } from '@app/campaigns/nats/campaign-data';
import type { Condition } from '@app/objectives/objective-types';
import { SCENARIOS } from '@app/scenario-manager';
import { type TelemetryChannelConfig, type TelemetryExcursionConfig, TelemetryManager } from '@app/telemetry/telemetry-manager';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const objectivesManagerSrc = readFileSync(join(repoRoot, 'src', 'objectives', 'objectives-manager.ts'), 'utf8');
const niceCatalog = JSON.parse(readFileSync(join(repoRoot, 'scripts', 'nice-catalog.json'), 'utf8')) as { codes: string[] };

const settings = ccsScenario4Data.settings as unknown as {
  telemetry: { channels: TelemetryChannelConfig[]; excursions: TelemetryExcursionConfig[] };
  commanding: { windowStartS: number; windowEndS: number; commands: Array<{ id: string }> };
};
const objectives = ccsScenario4Data.objectives;
const channel = (id: string) => settings.telemetry.channels.find((c) => c.id === id)!;
const excursion = (id: string) => settings.telemetry.excursions.find((e) => e.id === id)!;

describe('ccs scenario 4: wiring', () => {
  it('follows First Shift', () => {
    expect(SCENARIOS.filter((s) => s.id === 'ccs-scenario4')).toHaveLength(1);
    expect(ccsCampaignData.scenarios.map((s) => s.id)).toContain('ccs-scenario4');
    expect(ccsScenario4Data.number).toBe(3);
    expect(ccsScenario4Data.prerequisiteScenarioIds).toEqual(['ccs-scenario3']);
    expect(ccsScenario4Data.settings.missionBriefUrl).toBe('https://docs.signalrange.space/campaign-4/scenario-4?content-only=true&dark=true');
  });
});

describe('ccs scenario 4: the two excursions', () => {
  it('the wheel transient departs into yellow and self-clears before the window opens', () => {
    const ex = excursion('wheel-transient');
    const ch = channel('wheel-rpm');
    expect(TelemetryManager.bandOf(ch, ex.rampToValue)).toBe('yellow');
    expect(ex.duration).toBeDefined();
    expect(ex.endsOnCommandId).toBeUndefined();
    expect(ex.startTime + ex.duration!).toBeLessThanOrEqual(settings.commanding.windowStartS);
  });

  it('the heater trend reaches yellow inside the window, would reach red, and ends only on TCS-HTR-OFF', () => {
    const ex = excursion('htr-stuck');
    const ch = channel('batt-t');
    expect(ex.duration).toBeUndefined(); // no scheduled end
    expect(ex.endsOnCommandId).toBe('TCS-HTR-OFF');
    expect(settings.commanding.commands.map((c) => c.id)).toContain('TCS-HTR-OFF');
    // Yellow is crossed well inside the window; the full ramp is inside red's reach but not there.
    const yellowAtS = ex.startTime + ((ch.yellowHigh! - ch.nominal) / (ex.rampToValue - ch.nominal)) * ex.rampSeconds!;
    expect(yellowAtS).toBeGreaterThan(settings.commanding.windowStartS);
    expect(yellowAtS).toBeLessThan(settings.commanding.windowEndS - 600);
    expect(TelemetryManager.bandOf(ch, ex.rampToValue)).toBe('yellow');
    expect(ex.rampToValue).toBeLessThan(ch.redHigh!);
    // The heater state channel flags the cause beside it and ends on the same command.
    const state = excursion('htr-stuck-state');
    expect(state.endsOnCommandId).toBe('TCS-HTR-OFF');
    expect(TelemetryManager.bandOf(channel('htr-state'), state.rampToValue)).toBe('yellow');
  });

  it('the verification objective reads the same channels back in band after the ACK', () => {
    const verify = objectives.find((o) => o.id === 'verify-the-command')!;
    expect(verify.prerequisiteObjectiveIds).toEqual(['heater-off']);
    const reads = verify.conditions.filter((c) => c.type === 'telemetry-channel-in-band').map((c) => [c.params!.channelId, c.params!.telemetryBand]);
    expect(reads).toEqual([
      ['htr-state', 'green'],
      ['batt-t', 'green'],
    ]);
    const heaterOff = objectives.find((o) => o.id === 'heater-off')!;
    expect(heaterOff.conditions.find((c) => c.type === 'command-acknowledged')!.params!.commandId).toBe('TCS-HTR-OFF');
  });

  it('the state-of-health call is DEGRADED on a yellow channel with fresh frames, and never the safe-mode option', () => {
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
      decision.params!.decisionOptions!.filter((o) => o.correctWhen && holdsWith(facts)(o.correctWhen)).map((o) => o.label.slice(0, 8));
    expect(correct({ 'soh-yellow-limit': true, 'telemetry-stale': false })).toEqual(['Degraded']);
    expect(correct({ 'soh-yellow-limit': false, 'telemetry-stale': false })).toEqual(['Nominal ']);
    expect(decision.params!.decisionOptions!.find((o) => o.label.startsWith('Critical'))!.correctWhen).toBeUndefined();
  });
});

describe('ccs scenario 4: objectives', () => {
  it('has scored, NICE-annotated objectives on SS-01 totalling 100 points, all with evaluators', () => {
    const catalog = new Set(niceCatalog.codes);
    for (const objective of objectives) {
      expect(objective.points, objective.id).toBeGreaterThan(0);
      expect(objective.groundStation).toBe('SS-01');
      for (const code of objective.nice ?? []) expect(catalog.has(code), `${objective.id}: ${code}`).toBe(true);
      for (const condition of objective.conditions) {
        expect(objectivesManagerSrc.includes(`case '${condition.type}':`), `${objective.id}: ${condition.type}`).toBe(true);
      }
    }
    expect(objectives.reduce((sum, o) => sum + o.points, 0)).toBe(100);
  });
});
