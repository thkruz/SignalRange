/**
 * Campaign document store (phase 18 D): the Working Document filed per
 * scenario and read back by later scenarios, plus the evidence chain - a
 * destroyEvidence consequence in one scenario drops the carried-forward
 * audit entry in the next and flips the evidence-chain-intact fact.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { natsEuScenario19Data } from '../../src/campaigns/nats-eu/scenario19';
import { natsEuScenario20Data } from '../../src/campaigns/nats-eu/scenario20';
import { EVIDENCE_FACTS } from '../../src/objectives/evidence-facts';
import { ScenarioManager } from '../../src/scenario-manager';
import { CampaignDocumentStore, campaignIdOf, canonicalEntriesOf } from '../../src/scenarios/campaign-document-store';
import { CampaignRecordPanel } from '../../src/scenarios/campaign-record-panel';
import { SecurityConsoleCore } from '../../src/security-console/security-console-core';

const CAMPAIGN = 'nats-eu';

const record = (scenarioId: string, number: number, extra: Partial<Parameters<typeof CampaignDocumentStore.upsertRecord>[1]> = {}) => ({
  scenarioId,
  number,
  title: `S${number}`,
  documentTitle: 'Record',
  completedAt: '2026-09-18T10:00:00.000Z',
  entries: [{ section: 'Window', line: `line for ${scenarioId}` }],
  destroyedEvidence: [],
  ...extra,
});

beforeEach(() => {
  CampaignDocumentStore.clear(CAMPAIGN);
  CampaignDocumentStore.beginRun();
});

afterEach(() => {
  SecurityConsoleCore.destroy();
  CampaignDocumentStore.clear(CAMPAIGN);
});

describe('CampaignDocumentStore', () => {
  it('derives the campaign id from the scenario route', () => {
    expect(campaignIdOf(natsEuScenario20Data)).toBe('nats-eu');
    expect(campaignIdOf(undefined)).toBe('nats');
  });

  it('round-trips records, sorted by scenario number, and a replay replaces the earlier run', () => {
    CampaignDocumentStore.upsertRecord(CAMPAIGN, record('nats-eu-scenario18', 18));
    CampaignDocumentStore.upsertRecord(CAMPAIGN, record('nats-eu-scenario17', 17));
    expect(CampaignDocumentStore.load(CAMPAIGN).scenarios.map((s) => s.number)).toEqual([17, 18]);

    CampaignDocumentStore.upsertRecord(CAMPAIGN, record('nats-eu-scenario17', 17, { entries: [{ section: 'Window', line: 'second run' }] }));
    const doc = CampaignDocumentStore.load(CAMPAIGN);
    expect(doc.scenarios).toHaveLength(2);
    expect(CampaignDocumentStore.getRecord(CAMPAIGN, 'nats-eu-scenario17')!.entries[0].line).toBe('second run');
  });

  it('canonical entries are every documentLine in objective order', () => {
    const entries = canonicalEntriesOf(natsEuScenario19Data);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.section === 'Window')).toBe(true);
    expect(entries.every((e) => e.line.length > 0)).toBe(true);
  });

  it('tracks evidence destroyed in the current run and answers wasEvidenceDestroyed from the stored record', () => {
    expect(CampaignDocumentStore.destroyedThisRun).toEqual([]);
    CampaignDocumentStore.noteDestroyedEvidence('evt-kg-replay-log');
    expect(CampaignDocumentStore.destroyedThisRun).toEqual(['evt-kg-replay-log']);

    CampaignDocumentStore.upsertRecord(CAMPAIGN, record('nats-eu-scenario21', 21, { destroyedEvidence: [...CampaignDocumentStore.destroyedThisRun] }));
    expect(CampaignDocumentStore.wasEvidenceDestroyed(CAMPAIGN, 'nats-eu-scenario21', 'evt-kg-replay-log')).toBe(true);
    expect(CampaignDocumentStore.wasEvidenceDestroyed(CAMPAIGN, 'nats-eu-scenario21', 'evt-other')).toBe(false);
    expect(CampaignDocumentStore.wasEvidenceDestroyed(CAMPAIGN, 'nats-eu-scenario20', 'evt-kg-replay-log')).toBe(false);

    // A new run starts clean
    CampaignDocumentStore.beginRun();
    expect(CampaignDocumentStore.destroyedThisRun).toEqual([]);
    expect(CampaignDocumentStore.isReviewed).toBe(false);
    CampaignDocumentStore.markReviewed();
    expect(CampaignDocumentStore.isReviewed).toBe(true);
  });
});

describe('CampaignRecordPanel.getRecords', () => {
  it('lists the earlier scenarios of the campaign with stored entries first and canonical lines as the fallback', () => {
    ScenarioManager.getInstance().data = natsEuScenario20Data;
    CampaignDocumentStore.upsertRecord(CAMPAIGN, record('nats-eu-scenario19', 19, { entries: [{ section: 'Window', line: 'what this operator wrote' }] }));

    const records = CampaignRecordPanel.getRecords();
    expect(records.every((r) => r.scenario.number < 20)).toBe(true);
    expect(records.map((r) => r.scenario.number)).toEqual([...records.map((r) => r.scenario.number)].sort((a, b) => a - b));

    const s19 = records.find((r) => r.scenario.id === 'nats-eu-scenario19')!;
    expect(s19.completedAt).toBeDefined();
    expect(s19.entries).toEqual([{ section: 'Window', line: 'what this operator wrote' }]);

    const s18 = records.find((r) => r.scenario.id === 'nats-eu-scenario18')!;
    expect(s18.completedAt).toBeUndefined();
    expect(s18.entries.length).toBeGreaterThan(0); // as filed
    expect(CampaignRecordPanel.hasContent()).toBe(true);
  });
});

describe('SecurityConsoleCore evidence chain', () => {
  const settingsWith = (extra: object) => ({
    ...natsEuScenario20Data.settings,
    security: {
      accounts: [],
      events: [
        { id: 'evt-login', actor: 'op', action: 'login', category: 'auth', severity: 'info' },
        {
          id: 'evt-s21-replay-log',
          actor: 'kg',
          action: 'replay log carried forward',
          category: 'command',
          severity: 'warning',
          requiresCampaignEvidence: { scenarioId: 'nats-eu-scenario21', eventId: 'evt-kg-replay-log' },
        },
      ],
      ...extra,
    },
  });

  it('keeps a carried-forward entry when the earlier run preserved it, and evidence-chain-intact is true', () => {
    ScenarioManager.getInstance().data = natsEuScenario20Data;
    ScenarioManager.getInstance().settings = settingsWith({}) as never;
    CampaignDocumentStore.upsertRecord(CAMPAIGN, record('nats-eu-scenario21', 21));

    const core = SecurityConsoleCore.getInstance();
    expect(core.getVisibleLog(0).map((e) => e.id)).toEqual(['evt-login', 'evt-s21-replay-log']);
    expect(core.droppedEvidence).toHaveLength(0);
    expect(EVIDENCE_FACTS['evidence-chain-intact']({} as never)).toBe(true);
  });

  it('drops the entry when the earlier run destroyed that evidence, and evidence-chain-intact is false', () => {
    ScenarioManager.getInstance().data = natsEuScenario20Data;
    ScenarioManager.getInstance().settings = settingsWith({}) as never;
    CampaignDocumentStore.upsertRecord(CAMPAIGN, record('nats-eu-scenario21', 21, { destroyedEvidence: ['evt-kg-replay-log'] }));

    const core = SecurityConsoleCore.getInstance();
    expect(core.getVisibleLog(0).map((e) => e.id)).toEqual(['evt-login']);
    expect(core.droppedEvidence.map((e) => e.id)).toEqual(['evt-s21-replay-log']);
    expect(EVIDENCE_FACTS['evidence-chain-intact']({} as never)).toBe(false);
  });

  it('does not mutate the scenario settings when the log is edited', () => {
    ScenarioManager.getInstance().data = natsEuScenario20Data;
    const settings = settingsWith({});
    ScenarioManager.getInstance().settings = settings as never;
    const core = SecurityConsoleCore.getInstance();
    core.removeEvent('evt-login');
    expect(core.getVisibleLog(0)).toHaveLength(1);
    expect(settings.security.events).toHaveLength(2);
  });
});
