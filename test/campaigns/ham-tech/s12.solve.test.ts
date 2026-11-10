import { afterEach, describe, expect, it } from 'vitest';
import { S12_FALLBACK_MHZ, S12_MESSAGE } from '../../../src/campaigns/ham-sdr/tech/s12-station';
import { hamTechS12Data } from '../../../src/campaigns/ham-sdr/tech/s12-your-station-your-call';
import { HamStationManager } from '../../../src/ham/ham-station-manager';
import { type Harness, harness } from '../../ham/manager/harness';
import { expectedQuizIds, failing, quizLocalIds } from './solve-utils-b';

const data = hamTechS12Data;
let h: Harness;
const cfg = () => data.settings.hamStation!;

const answer = (id: string): void => {
  const sheet = cfg().worksheets.find((w) => w.id === id)!;
  h.actOk({ type: 'worksheet.answer', id, values: Object.fromEntries(sheet.fields.map((f) => [f.id, f.answer])) as never });
};
const meter = (red: string, black: string): void => {
  h.actOk({ type: 'meter.mode', mode: 'DCV' });
  h.actOk({ type: 'meter.place', targetId: 'batt', red, black });
  h.actOk({ type: 'meter.read' });
};
const keyAndRead = (red: string, black: string): void => {
  h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'test' }, holdS: 3 });
  h.advance(0.5, 0.25);
  meter(red, black);
  h.advance(4, 0.5);
};
const connectFeedTo = (a: string, portId: string): void => {
  h.actOk({ type: 'connect', a: { deviceId: 'mobile', portId: 'ant' }, b: { deviceId: a, portId } } as never);
};

afterEach(() => {
  HamStationManager.destroy();
});

describe('S12 solve (KF0SRT)', () => {
  it('uses exactly the ten S12 quiz items once each', () => {
    expect([...quizLocalIds(data)].sort()).toEqual([...expectedQuizIds('12')].sort());
  });

  it('can be solved step by step with the manager', () => {
    h = harness(cfg());
    h.advance(5);

    expect(failing(data, 'plan-portable-station', h.m)).not.toEqual([]);
    answer('s12-site');
    answer('s12-energy');
    expect(failing(data, 'plan-portable-station', h.m)).toEqual([]);

    // assemble and test
    expect(failing(data, 'assemble-and-test', h.m).length).toBe(3);
    h.actOk({ type: 'inspect', targetId: 'feed' });
    connectFeedTo('dummy', 'in');
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'test' }, holdS: 3 });
    h.advance(5);
    h.actOk({ type: 'disconnect', connectionId: h.m.getState().connections.find((c) => c.a.deviceId === 'mobile')!.id });
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { vfoMHz: 146.58, offset: 'simplex', txToneHz: null } as never });
    connectFeedTo('feed', 'a');
    h.advance(6);
    expect(failing(data, 'assemble-and-test', h.m)).toEqual([]);

    // check into the net
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { vfoMHz: 146.94, offset: 'minus', offsetKHz: 600, txToneHz: 100 } as never });
    expect(failing(data, 'check-into-net', h.m)).not.toEqual([]);
    h.advance(40);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'net-checkin' } as never, holdS: 3 });
    h.advance(30);

    // diagnose
    expect(failing(data, 'diagnose-fault', h.m).length).toBe(3);
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { txPowerW: 50 } });
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'test' }, holdS: 3 });
    h.advance(6, 0.5);
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { txPowerW: 5 } });
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'test' }, holdS: 6 });
    h.advance(0.5, 0.25);
    meter('psu+', 'psu-');
    meter('radio+', 'radio-');
    h.advance(8, 0.5);
    expect(failing(data, 'diagnose-fault', h.m)).toEqual([]);

    // checkpoint round trip keeps the battery, net and fault state
    const before = h.m.dcSystem('batt')?.state.battery.energyWh;
    const r = HamStationManager.createForTest(cfg(), { nowS: 0 });
    expect(r.restoreState(JSON.parse(JSON.stringify(h.m.getState())))).toBe(true);
    expect(r.dcSystem('batt')?.state.battery.energyWh).toBe(before);
    expect(r.netState()?.checkedIn).toBe(true);
    expect(r.dcSystem('batt')?.state.faults).toContain('high-resistance-lead');

    // replace the lead
    expect(failing(data, 'replace-lead', h.m).length).toBe(3);
    h.actOk({ type: 'inspect', targetId: 'batt' });
    expect(h.actRefused({ type: 'repair', faultId: 'poor-dc-lead' }).refusal).toBe('energized');
    h.actOk({ type: 'power', deviceId: 'batt', on: false });
    h.actOk({ type: 'repair', faultId: 'poor-dc-lead' });
    h.actOk({ type: 'power', deviceId: 'batt', on: true });
    h.actOk({ type: 'power', deviceId: 'mobile', on: true });
    expect(failing(data, 'replace-lead', h.m)).toEqual([]);

    // verify under load at 50 W through the repeater
    expect(failing(data, 'verify-repair', h.m).length).toBe(4);
    h.advance(5);
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { txPowerW: 50 } });
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'test' }, holdS: 4 });
    h.advance(0.5, 0.25);
    meter('radio+', 'radio-');
    h.advance(8, 0.5);
    expect(failing(data, 'verify-repair', h.m)).toEqual([]);

    // outage and fallback
    expect(failing(data, 'move-to-fallback', h.m).length).toBe(3);
    h.advance(1800 - h.m.nowS + 5, 5);
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { vfoMHz: S12_FALLBACK_MHZ, offset: 'simplex', txToneHz: null, txPowerW: 5 } as never });
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'call', target: 'N0BEL' }, holdS: 4 });
    h.advance(15);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'reply', item: 'report' }, holdS: 3 } as never);
    h.advance(12);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'identify' }, holdS: 3 } as never);
    h.advance(12);

    // relay the exact message on the fallback
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'message', text: S12_MESSAGE }, holdS: 20 } as never);
    h.advance(40);
    expect(failing(data, 'relay-exact-message', h.m)).toEqual([]);

    // radiogram check
    expect(failing(data, 'check-radiogram', h.m).length).toBe(1);
    answer('s12-radiogram');
    expect(failing(data, 'check-radiogram', h.m)).toEqual([]);

    // close the net
    expect(failing(data, 'close-station', h.m)).not.toEqual([]);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'identify' }, holdS: 3 } as never);
    h.advance(12);

    // pack down
    expect(failing(data, 'pack-down', h.m).length).toBe(3);
    h.actOk({ type: 'power', deviceId: 'mobile', on: false });
    h.actOk({ type: 'battery.read', deviceId: 'batt' });
    answer('s12-defect');
  });
});

describe('S12 negatives', () => {
  const toNet = (): void => {
    h = harness(cfg());
    connectFeedTo('feed', 'a');
    h.advance(45);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'net-checkin' } as never, holdS: 3 });
    h.advance(30);
  };

  it('a message with one wrong word is not exact', () => {
    toNet();
    h.advance(1800 - h.m.nowS + 5, 5);
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { vfoMHz: S12_FALLBACK_MHZ, offset: 'simplex', txToneHz: null } as never });
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'message', text: S12_MESSAGE.replace('nine', 'ten') }, holdS: 20 } as never);
    h.advance(40);
    expect(failing(data, 'relay-exact-message', h.m)).not.toEqual([]);
  });

  it('an exact message on the repeater before the outage is not the fallback relay', () => {
    toNet();
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'message', text: S12_MESSAGE }, holdS: 20 } as never);
    h.advance(40);
    expect(failing(data, 'relay-exact-message', h.m)).not.toEqual([]);
  });

  it('a plain test key-up on the fallback is not a contact', () => {
    toNet();
    h.advance(1800 - h.m.nowS + 5, 5);
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { vfoMHz: S12_FALLBACK_MHZ, offset: 'simplex', txToneHz: null } as never });
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'test' }, holdS: 4 });
    h.advance(20);
    // No contact, and (with the lead never repaired) the progress-gated outage has not started either
    expect(failing(data, 'move-to-fallback', h.m)).toHaveLength(2);
  });

  it('a slow player who has not repaired the lead never meets the outage first', () => {
    toNet();
    h.advance(3600 - h.m.nowS, 5);
    expect(h.m.netState()?.outageAnnounced).toBe(true);
    expect(h.m.netState()?.outageArmedAtS).toBeUndefined();
    expect(failing(data, 'move-to-fallback', h.m).length).toBe(3);
  });

  it('50 W before the repair resets the radio and cannot verify a repair', () => {
    h = harness(cfg());
    connectFeedTo('feed', 'a');
    h.advance(5);
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { txPowerW: 50 } });
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'test' }, holdS: 3 });
    h.advance(6, 0.5);
    expect(h.m.events('brownout')).toHaveLength(1);
    expect(failing(data, 'verify-repair', h.m).length).toBe(3);
  });

  it('the battery gauge read before power-down does not pack the station', () => {
    h = harness(cfg());
    h.advance(5);
    answer('s12-defect');
    expect(failing(data, 'pack-down', h.m)).toEqual(['Radio powered down', 'Battery gauge read and the 30 Wh reserve is still there']);
  });
});
