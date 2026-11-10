import { afterEach, describe, expect, it } from 'vitest';
import { hamTechS06Data } from '../../../src/campaigns/ham-sdr/tech/s06-where-did-the-watts-go';
import { HamStationManager } from '../../../src/ham/ham-station-manager';
import { type Harness, harness } from '../../ham/manager/harness';
import { expectedQuizIds, failing, quizLocalIds } from './solve-utils-b';

const data = hamTechS06Data;
let h: Harness;

const keyAndRead = (): void => {
  h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'test' } });
  h.actOk({ type: 'swr.read', deviceId: 'swr' });
  h.actOk({ type: 'pttRelease' });
};
const port = (deviceId: string, portId: string) => ({ deviceId, portId });
const connect = (a: [string, string], b: [string, string]): void => {
  h.actOk({ type: 'connect', a: port(...a), b: port(...b) } as never);
};

afterEach(() => {
  HamStationManager.destroy();
});

describe('S6 solve (KF0SRT)', () => {
  it('uses exactly the ten S06 quiz items once each', () => {
    expect([...quizLocalIds(data)].sort()).toEqual([...expectedQuizIds('06')].sort());
  });

  it('is built for the technician-level station', () => {
    expect(data.settings.hamStation?.operator.license).toBe('technician');
    expect(data.objectives?.[0].id).toBe('review-mission-brief');
  });

  it('can be solved step by step with the manager', () => {
    h = harness(data.settings.hamStation!);
    h.advance(12);

    // baseline
    expect(failing(data, 'fault-baseline', h.m)).not.toEqual([]);
    keyAndRead();
    expect(failing(data, 'fault-baseline', h.m)).toEqual([]);

    // local test: a load reading without the power cycle does not count
    h.actOk({ type: 'disconnect', connectionId: 'swr-long' });
    connect(['swr', 'ant'], ['dummy', 'in']);
    expect(failing(data, 'test-radio-locally', h.m)).not.toEqual([]);
    h.actOk({ type: 'power', deviceId: 'mobile', on: false });
    h.actOk({ type: 'power', deviceId: 'mobile', on: true });
    h.advance(3);
    keyAndRead();
    expect(failing(data, 'test-radio-locally', h.m)).toEqual([]);

    // far end of the suspect cable
    expect(failing(data, 'test-feed-line', h.m)).not.toEqual([]);
    h.actOk({ type: 'disconnect', connectionId: 'swr.ant~dummy.in' });
    connect(['swr', 'ant'], ['long-coax', 'a']);
    h.actOk({ type: 'disconnect', connectionId: 'long-ant' });
    connect(['long-coax', 'b'], ['barrel', 'a']);
    connect(['barrel', 'b'], ['dummy', 'in']);
    h.advance(3);
    keyAndRead();
    expect(failing(data, 'test-feed-line', h.m)).toEqual([]);

    // inspect and DC test (power off, both ends disconnected)
    expect(failing(data, 'inspect-route', h.m)).not.toEqual([]);
    h.actOk({ type: 'inspect', targetId: 'long-coax' });
    h.actOk({ type: 'power', deviceId: 'mobile', on: false });
    h.actOk({ type: 'disconnect', connectionId: 'swr.ant~long-coax.a' });
    h.actOk({ type: 'disconnect', connectionId: 'long-coax.b~barrel.a' });
    h.actOk({ type: 'disconnect', connectionId: 'barrel.b~dummy.in' });
    h.actOk({ type: 'coax.dcTest', deviceId: 'long-coax' });
    expect(failing(data, 'inspect-route', h.m)).toEqual([]);

    // replace
    expect(failing(data, 'replace-cable', h.m).length).toBe(3);
    h.actOk({ type: 'install', spareId: 'spare-coax', replaces: 'long-coax' });
    h.actOk({ type: 'worksheet.answer', id: 's06-weatherproof', values: { method: 'Seal the outdoor connector with self-amalgamating tape and leave a drip loop below it' } });
    expect(failing(data, 'replace-cable', h.m)).toEqual([]);

    // repeat tests: dummy load first
    h.actOk({ type: 'power', deviceId: 'mobile', on: true });
    h.advance(3);
    connect(['swr', 'ant'], ['dummy', 'in']);
    keyAndRead();
    expect(failing(data, 'repeat-tests', h.m)).toHaveLength(2);
    h.actOk({ type: 'disconnect', connectionId: 'swr.ant~dummy.in' });
    connect(['swr', 'ant'], ['spare-coax', 'a']);
    connect(['spare-coax', 'b'], ['outdoor-ant', 'in']);
    h.advance(3);
    keyAndRead();
    expect(failing(data, 'repeat-tests', h.m)).toHaveLength(1);

    // two-way contact with Riley
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'call', target: 'KD0RLY' }, holdS: 4 });
    h.advance(15);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'reply', item: 'report' }, holdS: 3 } as never);
    h.advance(12);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'identify' }, holdS: 3 } as never);
    h.advance(12);
    expect(failing(data, 'repeat-tests', h.m)).toEqual([]);
  });
});

describe('S6 negatives', () => {
  it('a high reading with the dummy load at the far end does not clear the radio check', () => {
    h = harness(data.settings.hamStation!);
    h.advance(12);
    keyAndRead();
    expect(failing(data, 'test-radio-locally', h.m)).not.toEqual([]);
  });

  it('the DC test is refused while the cable is still connected', () => {
    h = harness(data.settings.hamStation!);
    h.actRefused({ type: 'coax.dcTest', deviceId: 'long-coax' });
    expect(failing(data, 'inspect-route', h.m)).not.toEqual([]);
  });

  it('a wrong weatherproofing choice does not pass', () => {
    h = harness(data.settings.hamStation!);
    h.actOk({ type: 'worksheet.answer', id: 's06-weatherproof', values: { method: 'Leave the connector bare so it can dry out' } });
    expect(failing(data, 'replace-cable', h.m)).toContain('Weatherproofing chosen');
  });
});
