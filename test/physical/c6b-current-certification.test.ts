/**
 * Campaign 6 gap package B: historical filings stay, final certification must be current.
 * Covers record selection (first vs latest), staleness by mode / event / run / config, old saves,
 * checkpoint round-trip, and the real ObjectivesManager refusing a stale final claim.
 */

import { handoverCurrent, handoverValid } from '@app/campaigns/frontline/frontline-conditions';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import type { Objective } from '@app/objectives/objective-types';
import { ObjectivesManager } from '@app/objectives/objectives-manager';
import { type FieldHooks, setActiveField } from '@app/physical/field-hooks';
import { FieldRecords, type FieldRecordsDeps, type FieldRecordsState, type HandoverFormConfig } from '@app/physical/field-records';
import type { WorkloadRun } from '@app/physical/workload-types';
import { resetMissionClock } from '@app/simulation/mission-clock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({
      groundStations: [{ state: { id: 'gs-1' }, antennas: [], rfFrontEnds: [], spectrumAnalyzers: [], receivers: [], transmitters: [] }],
      satellites: [],
      getSatByNoradId: () => null,
    }),
  },
}));

const EVENT = 'incident';

const FORM: HandoverFormConfig = {
  id: 'final',
  title: 'Final',
  documentSection: 'Final',
  certification: { events: [EVENT] },
  fields: [
    { key: 'mode', label: 'Modem mode', required: true, rule: { modeIs: { partId: 'modem' } } },
    { key: 'run', label: 'Run', required: true, rule: { workload: { cardId: 'card', is: ['supported'] } } },
  ],
};
const HISTORY: HandoverFormConfig = {
  id: 'history',
  title: 'History',
  documentSection: 'History',
  fields: [{ key: 'note', label: 'Note', required: true, rule: { choice: ['a', 'b'] } }],
};

interface World {
  mode: string;
  fired: Set<string>;
  runs: WorkloadRun[];
  epoch: number;
  t: number;
}

function rig(forms: HandoverFormConfig[] = [FORM, HISTORY]) {
  const world: World = { mode: 'run', fired: new Set(), runs: [], epoch: 0, t: 100 };
  const run = (id: string): WorkloadRun => ({ id, cardId: 'card', cardVersion: 1, serviceId: 'svc', status: 'supported', startS: 0 }) as unknown as WorkloadRun;
  const plant = {
    getPartMode: (id: string) => (id === 'modem' ? world.mode : undefined),
    getTimeSeconds: () => world.t,
    getLabel: (id: string) => id,
    getPowerReadings: () => ({ socWh: {}, fuelL: {} }),
  };
  const deps: FieldRecordsDeps = {
    plant: plant as never,
    service: null,
    evidence: null,
    runs: () => world.runs,
    getCardVersion: () => 1,
    eventFiredAtS: (id) => (world.fired.has(id) ? 50 : null),
    configEpoch: () => world.epoch,
  };
  const records = new FieldRecords(forms, deps);
  const file = (runId: string) => {
    world.runs.push(run(runId));

    return records.submit('final', { mode: { value: world.mode }, run: { value: runId } });
  };

  return { world, records, deps, file, run };
}

describe('C6 gap B: record selection', () => {
  it('latest and first are explicit, and a later filing does not erase the first', () => {
    const r = rig();
    expect(r.file('r1').ok).toBe(true);
    r.world.t = 200;
    expect(r.file('r2').ok).toBe(true);
    expect(r.records.recordsFor('final')).toHaveLength(2);
    expect(r.records.firstRecord('final')?.values.run).toBe('r1');
    expect(r.records.latestRecord('final')?.values.run).toBe('r2');
    expect(r.records.handoverFiledAtS('final')).toBe(200);
    expect(r.records.isHandoverValid('final')).toBe(true);
  });
});

describe('C6 gap B: current certification', () => {
  it('is current after filing and unaffected by unrelated activity (viewing a history report)', () => {
    const r = rig();
    r.file('r1');
    expect(r.records.isHandoverCurrent('final')).toBe(true);
    expect(r.records.submit('history', { note: { value: 'a' } }).ok).toBe(true);
    expect(r.records.isHandoverCurrent('final')).toBe(true);
  });

  it('a mode change after filing makes it stale, history intact; reverting the mode does not need a refile', () => {
    const r = rig();
    r.file('r1');
    r.world.mode = 'standby';
    expect(r.records.isHandoverCurrent('final')).toBe(false);
    expect(r.records.isHandoverValid('final')).toBe(true);
    expect(r.records.recordsFor('final')).toHaveLength(1);
    r.world.mode = 'run';
    expect(r.records.isHandoverCurrent('final')).toBe(true);
    // A fresh filing in the new mode becomes the latest and is current there
    r.world.mode = 'standby';
    r.file('r2');
    expect(r.records.isHandoverCurrent('final')).toBe(true);
    expect(r.records.recordsFor('final')).toHaveLength(2);
  });

  it('an incident event firing after filing makes it stale; one already fired at filing does not', () => {
    const early = rig();
    early.world.fired.add(EVENT);
    early.file('r1');
    expect(early.records.isHandoverCurrent('final')).toBe(true);

    const r = rig();
    r.file('r1');
    expect(r.records.isHandoverCurrent('final')).toBe(true);
    r.world.fired.add(EVENT);
    expect(r.records.isHandoverCurrent('final')).toBe(false);
    r.file('r2');
    expect(r.records.isHandoverCurrent('final')).toBe(true);
  });

  it('an invalidated or lost run makes it stale', () => {
    const r = rig();
    r.file('r1');
    r.world.runs[0].invalidatedBy = 'config';
    expect(r.records.isHandoverCurrent('final')).toBe(false);
    r.world.runs[0].invalidatedBy = undefined;
    r.world.runs = [];
    expect(r.records.isHandoverCurrent('final')).toBe(false);
  });

  it('a form with the config flag goes stale on any configuration change', () => {
    const r = rig([{ ...FORM, certification: { config: true } }]);
    r.file('r1');
    expect(r.records.isHandoverCurrent('final')).toBe(true);
    r.world.epoch += 1;
    expect(r.records.isHandoverCurrent('final')).toBe(false);
  });

  it('forms without certification, unknown forms and unfiled forms are never current', () => {
    const r = rig();
    r.records.submit('history', { note: { value: 'a' } });
    expect(r.records.isHandoverCurrent('history')).toBe(false);
    expect(r.records.isHandoverCurrent('nope')).toBe(false);
    expect(r.records.isHandoverCurrent('final')).toBe(false);
  });

  it('survives a checkpoint, and an old save without metadata is readable history but not current', () => {
    const r = rig();
    r.file('r1');
    const saved = JSON.parse(JSON.stringify(r.records.getState())) as FieldRecordsState;
    expect(saved.records[0].certification).toMatchObject({ modes: { modem: 'run' }, runIds: ['r1'] });
    const again = new FieldRecords([FORM, HISTORY], r.deps);
    again.restoreState(saved);
    expect(again.isHandoverCurrent('final')).toBe(true);
    // The restore does not re-stamp: a change before the restore is still stale after it
    r.world.mode = 'standby';
    const stale = new FieldRecords([FORM, HISTORY], r.deps);
    stale.restoreState(saved);
    expect(stale.isHandoverCurrent('final')).toBe(false);
    r.world.mode = 'run';
    // An old save with no certification metadata
    const legacy = JSON.parse(JSON.stringify(saved)) as FieldRecordsState;
    delete legacy.records[0].certification;
    const old = new FieldRecords([FORM, HISTORY], r.deps);
    old.restoreState(legacy);
    expect(old.isHandoverValid('final')).toBe(true);
    expect(old.isHandoverCurrent('final')).toBe(false);
    // A checkpoint taken after a change cannot turn old verification into current: the filing still names the old mode
    r.world.mode = 'standby';
    expect(old.latestRecord('final')?.certification).toBeUndefined();
  });
});

describe('C6 gap B: the real ObjectivesManager', () => {
  let flag = false;

  const objective = (conditions: Objective['conditions']): Objective[] => [{ id: 'final-claim', title: 'final', description: 'final', groundStation: 'gs-1', conditions }];
  const tick = () => EventBus.getInstance().emit(Events.UPDATE, 16);
  const stateOf = () => ObjectivesManager.getInstance().getObjectiveState('final-claim');

  beforeEach(() => {
    EventBus.destroy();
    ObjectivesManager.destroy();
    resetMissionClock();
    flag = false;
  });
  afterEach(() => {
    setActiveField(null);
    ObjectivesManager.destroy();
    EventBus.destroy();
    resetMissionClock();
  });

  const gate = { id: 'gate', type: 'custom', description: 'Remaining row', params: { evaluator: () => flag }, mustMaintain: false } as unknown as Objective['conditions'][number];

  function activate(r: ReturnType<typeof rig>, conditions: Objective['conditions']): void {
    setActiveField({ plant: null, service: null, evidence: null, events: null, workloads: null, records: r.records } as unknown as FieldHooks);
    ObjectivesManager.initialize(objective(conditions));
    tick();
  }

  it('refuses a stale final claim until a fresh filing, without erasing the first', () => {
    const r = rig();
    activate(r, [handoverCurrent('final'), gate]);
    r.file('r1');
    tick();
    expect(stateOf()?.isCompleted).toBe(false);
    r.world.fired.add(EVENT); // the incident fires before the remaining row completes
    flag = true;
    tick();
    tick();
    expect(stateOf()?.isCompleted).toBe(false);
    expect(r.records.recordsFor('final')).toHaveLength(1);
    r.file('r2');
    tick();
    tick();
    expect(stateOf()?.isCompleted).toBe(true);
    expect(r.records.recordsFor('final')).toHaveLength(2);
  });

  it('a latched historical row stays done while the current row is re-evaluated', () => {
    const r = rig();
    activate(r, [handoverValid('final'), handoverCurrent('final'), gate]);
    r.file('r1');
    tick();
    tick();
    r.world.mode = 'standby';
    tick();
    flag = true;
    tick();
    tick();
    const cs = stateOf()?.conditionStates ?? [];
    expect(cs[0].isSatisfied).toBe(true); // handoverValid latched: history is not reopened
    expect(cs[1].isSatisfied).toBe(false);
    expect(stateOf()?.isCompleted).toBe(false);
    r.file('r2');
    tick();
    tick();
    expect(stateOf()?.isCompleted).toBe(true);
  });

  it('without maintenance a plain historical row would have completed on the stale claim', () => {
    const r = rig();
    activate(r, [handoverValid('final'), gate]);
    r.file('r1');
    tick();
    tick();
    r.world.fired.add(EVENT);
    flag = true;
    tick();
    tick();
    expect(stateOf()?.isCompleted).toBe(true);
  });
});

describe('C6 gap C: the out-of-date note', () => {
  it('names the kind of change, leaks no answer, and is gone once the filing is current', () => {
    const r = rig();
    expect(r.records.staleNote('final')).toBeNull();
    r.file('r1');
    expect(r.records.staleNote('final')).toBeNull();

    r.world.mode = 'standby';
    expect(r.records.staleCause('final')).toEqual({ kind: 'mode', partId: 'modem' });
    expect(r.records.staleNote('final')).toMatch(/modem changed state.*File it again/u);
    expect(r.records.staleNote('final')).not.toMatch(/standby|run\b/u);
    r.world.mode = 'run';
    expect(r.records.staleNote('final')).toBeNull();

    r.world.fired.add(EVENT);
    expect(r.records.staleCause('final')?.kind).toBe('event');
    expect(r.records.staleNote('final')).toMatch(/changed on site/u);
    r.file('r2');
    expect(r.records.staleNote('final')).toBeNull();

    r.world.runs[1].invalidatedBy = 'config';
    expect(r.records.staleCause('final')?.kind).toBe('run');
    expect(r.records.staleNote('final')).toMatch(/task window/u);
  });

  it('says a service setting changed for a config-certified form; unfiled and uncertified forms have no note', () => {
    const r = rig([{ ...FORM, certification: { config: true } }, HISTORY]);
    r.file('r1');
    r.world.epoch += 1;
    expect(r.records.staleNote('final')).toMatch(/service setting changed/u);
    r.records.submit('history', { note: { value: 'a' } });
    expect(r.records.staleNote('history')).toBeNull();
    expect(r.records.staleNote('nope')).toBeNull();
  });
});
