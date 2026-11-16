import { afterEach, describe, expect, it } from 'vitest';
import * as C from '../../../src/ham/ham-conditions';
import { HamStationManager } from '../../../src/ham/ham-station-manager';
import { makeClubRepeaterConfig, RADIO_BOOT_TONE_HZ } from '../../../src/ham/ops/repeater';
import { baseConfig, baseConnections, baseDevices, CALL, conn, harness } from './harness';

afterEach(() => HamStationManager.destroy());

function repeaterBlock() {
  const { hears: _h, playerCallsign: _p, ...rest } = makeClubRepeaterConfig(() => ({ snrDb: 0, decoded: false }), CALL);

  return rest;
}

describe('HamStationManager repeater', () => {
  it('wrong tone is refused by the repeater, the right tone relays and the player hears it', () => {
    const h = harness(baseConfig({ repeater: repeaterBlock() }));
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { vfoMHz: 146.94, offset: 'minus', offsetKHz: 600, txToneHz: RADIO_BOOT_TONE_HZ } });
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'cq' }, holdS: 3 });
    h.advance(6);
    expect(h.m.events('repeater:wrong-tone').length).toBe(1);
    expect(C.evaluateWith(C.repeaterAccess('relayed'), h.m)).toBe(false);
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { txToneHz: 100 } });
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'cq' }, holdS: 3 });
    h.advance(10);
    expect(C.evaluateWith(C.repeaterAccess('relayed'), h.m)).toBe(true);
    expect(C.evaluateWith(C.relayHeard(0.5), h.m)).toBe(true);
  });
});

describe('HamStationManager DMR', () => {
  const dmr = {
    id: 'dmr1',
    callsign: 'W0DMR',
    outputMHz: 442.1,
    inputMHz: 447.1,
    colorCode: 1,
    slots: { 1: [8, 3100], 2: [9, 31337] } as Record<1 | 2, number[]>,
    position: { xKm: 4, yKm: 4, heightM: 80 },
    erpDbm: 47,
    remote: { id: 'dmr-u', callsign: 'KD0RLY', name: 'Riley', talkgroup: 31337, timeSlot: 2 as const, replyDelayS: 2, lines: ['Copy you on the talkgroup.'] },
  };
  const ch = (name: string, colorCode: number, timeSlot: 1 | 2, talkgroup: number) => ({ name, rxMHz: 442.1, txMHz: 447.1, colorCode, timeSlot, talkgroup });

  it('shows distinct failures for wrong colour code and slot, then gets an answer', () => {
    const devices = [
      ...baseDevices(),
      {
        id: 'dmr-ht',
        kind: 'dmr-handheld' as const,
        label: 'Loaner DMR',
        location: 'bench',
        profileId: 'loaner-dmr-ht',
        powered: true,
        radio: { mode: 'DMR' as const, codeplug: [ch('Bad CC', 2, 2, 31337), ch('Bad TS', 1, 1, 31337), ch('Good', 1, 2, 31337)] },
      },
      { id: 'dmr-duck', kind: 'antenna' as const, label: 'Rubber duck', location: 'bench', antenna: { kind: 'rubber-duck' as const } },
    ];
    const h = harness(baseConfig({ devices, connections: [...baseConnections(), conn('d1', 'dmr-ht', 'ant', 'dmr-duck', 'in')], dmr }));
    const key = (index: number) => {
      h.actOk({ type: 'radio.dmrChannel', deviceId: 'dmr-ht', index });
      h.actOk({ type: 'ptt', deviceId: 'dmr-ht', intent: { kind: 'call', target: 'KD0RLY' }, holdS: 2 });
      h.advance(4);
    };
    key(0);
    key(1);
    expect(C.evaluateWith(C.dmrFailureSeen('no-talk-permit'), h.m)).toBe(true);
    expect(C.evaluateWith(C.dmrFailureSeen('tg-not-on-slot'), h.m)).toBe(true);
    expect(C.evaluateWith(C.dmrResponse(), h.m)).toBe(false);
    key(2);
    h.advance(10);
    expect(C.evaluateWith(C.dmrResponse(), h.m)).toBe(true);
  });
});

describe('HamStationManager simplex QSO', () => {
  const riley = {
    id: 'riley',
    callsign: 'KD0RLY',
    name: 'Riley',
    location: 'across town',
    grid: 'EN34',
    position: { xKm: 6, yKm: 2, heightM: 15 },
    freqMHz: 146.55,
    mode: 'FM' as const,
    erpDbm: 37,
    replyDelayS: 3,
    personality: 'friendly' as const,
  };

  it('a call over the air reaches the remote and its reply is heard', () => {
    const cfg = baseConfig({ remoteStations: { stations: [riley] } });
    const h = harness(cfg);
    h.advance(12);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'call', target: 'KD0RLY' }, holdS: 4 });
    h.advance(15);
    const c = h.m.contact('riley');
    expect(c).toBeTruthy();
    expect(c?.path).toBe('simplex');
    expect(h.m.getReception('riley', { deviceId: 'mobile' }).length).toBeGreaterThan(0);
  });

  it('into the dummy load the remote never answers', () => {
    const cfg = baseConfig({ remoteStations: { stations: [riley] } });
    cfg.connections = cfg.connections.filter((x) => x.id !== 'mob-ant-jack');
    cfg.devices.push({ id: 'jumper', kind: 'coax', label: 'Jumper', location: 'bench', coax: { type: 'rg8x', length: 1, unit: 'm', endB: { family: 'UHF', gender: 'jack' } } });
    cfg.connections.push(conn('j1', 'mobile', 'ant', 'jumper', 'a'), conn('j2', 'jumper', 'b', 'dummy', 'in'));
    const h = harness(cfg);
    h.advance(12);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'call', target: 'KD0RLY' }, holdS: 4 });
    h.advance(15);
    expect(h.m.contact('riley')).toBeFalsy();
    expect(C.evaluateWith(C.dummyLoadUsed({ radioId: 'mobile' }), h.m)).toBe(true);
  });
});
