import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { fillDialogTokens, formatDuration, stripDialogTokens } from '@app/modal/dialog-tokens';
import { EventTimeLedger } from '@app/scenarios/event-time-ledger';
import { SimClock } from '@app/simulation/sim-clock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const EPOCH = Date.UTC(2027, 3, 12, 2, 0, 0);

describe('EventTimeLedger', () => {
  beforeEach(() => {
    SimClock.reset(EPOCH);
    EventTimeLedger.begin();
  });
  afterEach(() => EventTimeLedger.end());

  it('records objective start, completion and condition keys from the bus', () => {
    const bus = EventBus.getInstance();
    bus.emit(Events.OBJECTIVE_ACTIVATED, { objectiveId: 'o1', objective: {} as never, activatedAt: 0 });
    SimClock.skip(59_000);
    bus.emit(Events.OBJECTIVE_CONDITION_CHANGED, { objectiveId: 'o1', conditionIndex: 2, isSatisfied: true, conditionState: {} as never });
    SimClock.skip(60_000);
    bus.emit(Events.OBJECTIVE_COMPLETED, { objectiveId: 'o1', objective: {} as never, completedAt: 0 });

    expect(EventTimeLedger.getTime('obj:o1:start')).toBe(EPOCH);
    expect(EventTimeLedger.getTime('cond:o1.2')).toBe(EPOCH + 59_000);
    expect(EventTimeLedger.getTime('obj:o1')).toBe(EPOCH + 119_000);
    expect(EventTimeLedger.getTime('obj:nope')).toBeUndefined();
  });

  it('keeps the first value observed while the condition was satisfied', () => {
    const bus = EventBus.getInstance();
    bus.emit(Events.OBJECTIVE_CONDITION_EVALUATED, { objectiveId: 'o1', conditionIndex: 0, type: 'x' as never, isSatisfied: false, observed: 3 });
    bus.emit(Events.OBJECTIVE_CONDITION_EVALUATED, { objectiveId: 'o1', conditionIndex: 0, type: 'x' as never, isSatisfied: true, observed: 12.04 });
    bus.emit(Events.OBJECTIVE_CONDITION_EVALUATED, { objectiveId: 'o1', conditionIndex: 0, type: 'x' as never, isSatisfied: true, observed: 9 });

    expect(EventTimeLedger.getValue('o1.0')).toBe(12.04);
    expect(EventTimeLedger.getValue('val:o1.0')).toBe(12.04);
  });

  it('records faults and manual keys, first time only', () => {
    EventBus.getInstance().emit(Events.FAULT_CHANGED, { id: 'f1', action: 'injected' });
    SimClock.skip(1000);
    EventBus.getInstance().emit(Events.FAULT_CHANGED, { id: 'f1', action: 'cleared' });
    EventTimeLedger.record('account:a:locked');
    SimClock.skip(1000);
    EventTimeLedger.record('account:a:locked');

    expect(EventTimeLedger.getTime('event:f1:start')).toBe(EPOCH);
    expect(EventTimeLedger.getTime('event:f1:end')).toBe(EPOCH + 1000);
    expect(EventTimeLedger.getTime('account:a:locked')).toBe(EPOCH + 1000);
  });

  it('begin() clears the previous run', () => {
    EventTimeLedger.record('x');
    EventTimeLedger.begin();
    expect(EventTimeLedger.getTime('x')).toBeUndefined();
  });
});

describe('ledger tokens', () => {
  beforeEach(() => {
    SimClock.reset(EPOCH);
    EventTimeLedger.begin();
    EventTimeLedger.record('cmd:HK:ack', EPOCH + 9 * 60_000 + 25_000);
    EventTimeLedger.record('obj:a:start', EPOCH);
    EventTimeLedger.recordValue('o1.0', 12.04);
  });
  afterEach(() => EventTimeLedger.end());

  it('fills at, seconds, offset, dur and val', () => {
    expect(fillDialogTokens('{{at:cmd:HK:ack|--}}')).toBe('02:09');
    expect(fillDialogTokens('{{at:cmd:HK:ack:s|--}}')).toBe('02:09:25');
    expect(fillDialogTokens('{{at:cmd:HK:ack+120s|--}}')).toBe('02:11');
    expect(fillDialogTokens('{{at:cmd:HK:ack-5m|--}}')).toBe('02:04');
    expect(fillDialogTokens('{{dur:obj:a:start..cmd:HK:ack|x}}')).toBe('9 min');
    expect(fillDialogTokens('{{val:o1.0:1|x}}')).toBe('12.0');
    expect(fillDialogTokens('{{val:o1.0:2|x}}')).toBe('12.04');
  });

  it('prints the fallback for unresolved keys and keeps stationTime working', () => {
    expect(fillDialogTokens('at {{at:cmd:ZZ:ack|09:25}}, dur {{dur:a..b|3 min}}, val {{val:q.0|8.3}}')).toBe('at 09:25, dur 3 min, val 8.3');
    expect(fillDialogTokens('{{stationTime}} {{at:nope}}', EPOCH)).toBe('02:00 --:--');
  });

  it('stripDialogTokens files the record with fallbacks', () => {
    expect(stripDialogTokens('Acked {{at:cmd:HK:ack|09:25}}, {{val:o1.0:1|12.0}} dB')).toBe('Acked 09:25, 12.0 dB');
  });

  it('formats durations', () => {
    expect(formatDuration(45_000)).toBe('45 s');
    expect(formatDuration(180_000)).toBe('3 min');
    expect(formatDuration(3_900_000)).toBe('1 h 05 min');
  });
});
