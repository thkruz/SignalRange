import { afterEach, describe, expect, it } from 'vitest';
import * as C from '../../../src/ham/ham-conditions';
import { HamStationManager } from '../../../src/ham/ham-station-manager';
import type { SatGeometry } from '../../../src/ham/ops/satellite-link';
import { baseConfig, baseConnections, baseDevices, conn, harness, packetConfig } from './harness';

afterEach(() => HamStationManager.destroy());

describe('HamStationManager packet', () => {
  it('a wrong input device fails to connect; fixing it connects and a sent frame is acked', () => {
    const h = harness(packetConfig());
    h.m.act({ type: 'packet.connect' });
    h.advance(20);
    expect(h.m.packetState()?.link).not.toBe('connected');
    h.actOk({ type: 'packet.config', patch: { audio: { inputDevice: 'interface' } } });
    h.actOk({ type: 'packet.connect' });
    h.advance(5);
    expect(h.m.packetState()?.link).toBe('connected');
    h.actOk({ type: 'packet.injectCorruption' });
    h.actOk({ type: 'packet.send', text: 'Bench test message' });
    h.advance(30);
    expect(C.evaluateWith(C.packetAcked({ retried: true }), h.m)).toBe(true);
  });
});

describe('HamStationManager satellite', () => {
  const geometry: SatGeometry = { az: 90, el: 40, rangeKm: 900, dopplerFactor: 1.000023, isAboveHorizon: true };
  const satellite = {
    satelliteNoradId: 99001,
    id: 'cubehop',
    name: 'CUBEHOP',
    uplinkMHz: 435.9,
    downlinkMHz: 145.9,
    accessToneHz: 67.0,
    uplinkWindowHz: 7000,
    downlinkErpDbm: 30,
    groundStation: { id: 'gs', callsign: 'W0SRC', name: 'Sam', grid: 'EN34', position: { xKm: 200, yKm: 0, heightM: 20 }, replyDelayS: 2 },
  };

  it('an uncorrected uplink misses the window; a Doppler-corrected one is relayed', () => {
    const h = harness(baseConfig({ satellite }), { geometry: () => geometry });
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { vfoMHz: 435.9, txToneHz: 67 } });
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'cq' }, holdS: 2 });
    h.advance(3);
    expect(h.m.events('sat:out-of-window').length).toBe(1);
    const corrected = Math.round((435.9 / geometry.dopplerFactor) * 1e5) / 1e5;
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { vfoMHz: corrected } });
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'cq' }, holdS: 2 });
    h.advance(3);
    expect(h.m.events('sat:relayed').length).toBe(1);
  });

  it('nothing reaches the satellite below the horizon', () => {
    const h = harness(baseConfig({ satellite }), { geometry: () => ({ ...geometry, el: -5, isAboveHorizon: false }) });
    h.actOk({ type: 'radio.set', deviceId: 'mobile', patch: { vfoMHz: 435.9, txToneHz: 67 } });
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'cq' }, holdS: 2 });
    h.advance(3);
    expect(h.m.eventsWithPrefix('sat:relayed').length).toBe(0);
  });
});

describe('HamStationManager HF', () => {
  function hfConfig(defaultCondition: 'open' | 'closed') {
    const devices = [
      ...baseDevices(),
      {
        id: 'hf',
        kind: 'hf-rig' as const,
        label: 'Loaner HF rig',
        location: 'bench',
        profileId: 'loaner-hf',
        powered: true,
        radio: { vfoMHz: 28.4, mode: 'USB' as const, txPowerW: 50 },
      },
      {
        id: 'hf-coax',
        kind: 'coax' as const,
        label: 'HF feed',
        location: 'bench',
        coax: {
          type: 'rg8x' as const,
          length: 10,
          unit: 'm' as const,
          endA: { family: 'BNC' as const, gender: 'plug' as const },
          endB: { family: 'UHF' as const, gender: 'plug' as const },
        },
      },
      { id: 'hf-dipole', kind: 'antenna' as const, label: '10 m dipole', location: 'bench', antenna: { kind: 'ten-meter-dipole' as const } },
    ];
    return baseConfig({
      devices,
      connections: [...baseConnections(), conn('h1', 'hf', 'ant', 'hf-coax', 'a'), conn('h2', 'hf-coax', 'b', 'hf-dipole', 'in')],
      hf: {
        schedule: [],
        defaultCondition,
        stations: [{ id: 'dx', callsign: 'W0DXQ', name: 'Ann', grid: 'EM38', position: { xKm: 2000, yKm: 0, heightM: 12 }, freqMHz: 28.4, erpDbm: 50, replyDelayS: 2 }],
      },
    });
  }

  it('an open band answers a USB call; a closed band does not', () => {
    const open = harness(hfConfig('open'));
    open.actOk({ type: 'ptt', deviceId: 'hf', intent: { kind: 'cq' }, holdS: 3 });
    open.advance(10);
    expect(open.m.getReception('dx').length).toBeGreaterThan(0);
    HamStationManager.destroy();
    const closed = harness(hfConfig('closed'));
    closed.actOk({ type: 'ptt', deviceId: 'hf', intent: { kind: 'cq' }, holdS: 3 });
    closed.advance(10);
    expect(closed.m.getReception('dx').length).toBe(0);
  });
});

describe('HamStationManager net', () => {
  const MSG = 'Quincy Xavier requests two hundred zinc bolts delivered Thursday';
  const net = {
    freqMHz: 146.55,
    ncs: { id: 'ncs', callsign: 'W0SRC', name: 'Sam', position: { xKm: 2, yKm: 2, heightM: 10 }, erpDbm: 40 },
    receiver: { id: 'rcv', callsign: 'KD0RLY', name: 'Riley', position: { xKm: 3, yKm: 1, heightM: 10 }, erpDbm: 40 },
    openingS: 10,
    outage: { startsAtS: 600, fallbackMHz: 146.52 },
    message: MSG,
  };

  it('checks in, hears the assignment, and the readback catches a wrong word', () => {
    const h = harness(baseConfig({ net }));
    h.advance(30);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'net-checkin' }, holdS: 3 });
    h.advance(60);
    expect(C.evaluateWith(C.netCheckedIn(), h.m)).toBe(true);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'message', text: MSG.replace('Thursday', 'Friday') }, holdS: 5 });
    h.advance(30);
    expect(C.evaluateWith(C.netReadback(), h.m)).toBe(true);
    expect(C.evaluateWith(C.netMessageExact(), h.m)).toBe(false);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'message', text: MSG }, holdS: 5 });
    h.advance(30);
    expect(C.evaluateWith(C.netMessageExact(), h.m)).toBe(true);
  });
});
