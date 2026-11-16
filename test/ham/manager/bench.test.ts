import { afterEach, describe, expect, it } from 'vitest';
import * as C from '../../../src/ham/ham-conditions';
import { HamStationManager } from '../../../src/ham/ham-station-manager';
import { baseConfig, baseConnections, baseDevices, conn, harness } from './harness';

afterEach(() => HamStationManager.destroy());

const weakEmitter = (erpDbm: number) => baseConfig().emitters.map((e) => ({ ...e, erpDbm }));

describe('HamStationManager bench reception', () => {
  it('hears the authored emitter through the SDR chain', () => {
    const h = harness(baseConfig());
    h.advance(3);
    expect(h.m.bestIntelligibility('training', { deviceId: 'sdr' })).toBeGreaterThan(0.9);
    expect(h.m.getReception('training', { deviceId: 'sdr' }).length).toBeGreaterThan(0);
  });

  it('an SDR without USB hears nothing, and plugging it in fixes it', () => {
    const cfg = baseConfig({
      connections: baseConnections().filter((c) => c.id !== 'sdr-usb'),
      faults: [{ id: 'usb', target: 'sdr', kind: 'usb-unplugged', inspectClue: 'The USB cable hangs loose.', clearedBy: { action: 'auto' } }],
    });
    const h = harness(cfg);
    h.advance(3);
    expect(h.m.bestIntelligibility('training', { deviceId: 'sdr' })).toBe(0);
    expect(h.m.faultCleared('usb')).toBe(false);
    h.actOk({ type: 'connect', a: { deviceId: 'sdr', portId: 'usb' }, b: { deviceId: 'laptop', portId: 'usb1' } });
    expect(h.m.faultCleared('usb')).toBe(true);
    h.advance(2);
    expect(h.m.bestIntelligibility('training', { deviceId: 'sdr', afterEvent: 'connect:sdr.usb~laptop.usb1' })).toBeGreaterThan(0.9);
  });

  it('a loose connector costs signal until it is seated, and seating clears the fault', () => {
    const cfg = baseConfig({
      emitters: weakEmitter(-28),
      faults: [{ id: 'loose', target: 'sdr-feed', kind: 'loose-connector', inspectClue: 'Thread is showing at the antenna connector.', clearedBy: { action: 'seat' } }],
    });
    const h = harness(cfg);
    h.advance(3);
    const before = h.m.liveReception('sdr').find((r) => r.emissionId === 'training');
    expect(h.m.connection('sdr-feed')?.seated).toBe(false);
    const insp = h.actOk({ type: 'inspect', targetId: 'sdr-feed' });
    expect(insp.message).toContain('Thread');
    h.actOk({ type: 'seat', connectionId: 'sdr-feed' });
    expect(h.m.faultCleared('loose')).toBe(true);
    h.advance(2);
    const after = h.m.liveReception('sdr').find((r) => r.emissionId === 'training');
    expect(after?.snrDb ?? -99).toBeGreaterThan((before?.snrDb ?? -99) + 5);
  });

  it('refuses a connector mismatch without changing anything', () => {
    const h = harness(baseConfig({ connections: baseConnections().filter((c) => c.id !== 'sdr-sma') }));
    const rev = h.m.revision;
    const r = h.actRefused({ type: 'connect', a: { deviceId: 'sdr', portId: 'ant' }, b: { deviceId: 'sdr-coax', portId: 'a' } });
    expect(r.ok).toBe(false);
    expect(h.m.revision).toBe(rev);
  });
});

describe('HamStationManager instruments', () => {
  it('reads the DC system with the multimeter and records the placement', () => {
    const h = harness(baseConfig());
    h.actOk({ type: 'meter.mode', mode: 'DCV' });
    h.actOk({ type: 'meter.place', targetId: 'psu', red: 'radio+', black: 'radio-' });
    const r = h.actOk({ type: 'meter.read' });
    const m = h.m.lastMeasurement({ instrument: 'multimeter', quantity: 'voltage' });
    expect(r.ok).toBe(true);
    expect(m?.value).toBeGreaterThan(13);
    expect(m?.placement.red).toBe('radio+');
    expect(m?.underLoad).toBe(false);
  });

  it('reads a practice board', () => {
    const devices = [...baseDevices(), { id: 'board', kind: 'circuit-board' as const, label: 'Practice board', location: 'bench', board: true as const, powered: true }];
    const h = harness(baseConfig({ devices }));
    h.actOk({ type: 'meter.mode', mode: 'DCV' });
    h.actOk({ type: 'meter.place', targetId: 'board', red: 'tp-supply+', black: 'tp-gnd' });
    h.actOk({ type: 'meter.read' });
    expect(h.m.lastMeasurement({ instrument: 'multimeter' })?.value).toBeGreaterThan(5);
  });

  it('a measurement goes stale when the station changes', () => {
    const h = harness(baseConfig());
    h.actOk({ type: 'meter.mode', mode: 'DCV' });
    h.actOk({ type: 'meter.place', targetId: 'psu', red: 'psu+', black: 'psu-' });
    h.actOk({ type: 'meter.read' });
    const m = h.m.lastMeasurement({ instrument: 'multimeter' });
    expect(m && h.m.isCurrent(m)).toBe(true);
    h.actOk({ type: 'disconnect', connectionId: 'mob-feed' });
    expect(m && h.m.isCurrent(m)).toBe(false);
  });
});

/** Mobile through an SWR meter: mobile.ant - jumper - swr.tx, swr.ant - mob-coax - antenna */
function swrBench(feedFault: boolean) {
  const devices = baseDevices().map((d) => (d.id === 'mob-coax' && feedFault ? { ...d, coax: { ...d.coax!, fault: { kind: 'crushed-coax' as const, gammaMag: 0.5 } } } : d));
  devices.push(
    { id: 'jumper', kind: 'coax', label: 'Short jumper', location: 'bench', coax: { type: 'rg8x', length: 1, unit: 'm' } },
    { id: 'swr', kind: 'swr-meter', label: 'SWR meter', location: 'bench' },
    { id: 'analyzer', kind: 'analyzer', label: 'Antenna analyzer', location: 'bench' }
  );
  const connections = [
    ...baseConnections().filter((c) => !c.id.startsWith('mob-ant')),
    conn('m1', 'mobile', 'ant', 'jumper', 'a'),
    conn('m2', 'jumper', 'b', 'swr', 'tx'),
    conn('m3', 'swr', 'ant', 'mob-coax', 'a'),
  ];

  return baseConfig({ devices, connections });
}

describe('HamStationManager transmit path', () => {
  it('SWR is high with a crushed feed line and normal after swapping in the spare', () => {
    const h = harness(swrBench(true));
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'test' } });
    h.actOk({ type: 'swr.read', deviceId: 'swr' });
    h.actOk({ type: 'pttRelease' });
    const bad = h.m.lastMeasurement({ instrument: 'swr-meter' })?.value ?? 0;
    expect(bad).toBeGreaterThan(2);
    h.actOk({ type: 'install', spareId: 'spare-coax', replaces: 'mob-coax' });
    expect(h.m.connectionAt('spare-coax', 'b')).toBeTruthy();
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'test' } });
    h.actOk({ type: 'swr.read', deviceId: 'swr' });
    h.actOk({ type: 'pttRelease' });
    const good = h.m.lastMeasurement({ instrument: 'swr-meter' })?.value ?? 99;
    expect(good).toBeLessThan(2);
  });

  it('TX into the dummy load keys the radio but no remote hears it', () => {
    const cfg = swrBench(false);
    cfg.connections = cfg.connections.filter((c) => c.id !== 'm3');
    cfg.connections.push(conn('dl', 'swr', 'ant', 'dummy', 'in'));
    const h = harness(cfg);
    const r = h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'test' }, holdS: 4 });
    expect(r.ok).toBe(true);
    expect(h.m.keyed()?.deviceId).toBe('mobile');
    expect(h.m.rfPath('mobile', 146.55).termination).toBe('dummy-load');
    h.advance(5);
    expect(h.m.keyed()).toBeFalsy();
    expect(h.m.firstEvent('txOk:mobile')).toBeTruthy();
    expect(h.m.firstEvent('txOk:mobile')?.data?.termination).toBe('dummy-load');
  });

  it('refuses TX into a calibration load or an analyzer', () => {
    const cfg = swrBench(false);
    cfg.connections = cfg.connections.filter((c) => c.id !== 'm3' && c.id !== 'm2');
    cfg.connections.push(conn('cl', 'jumper', 'b', 'cal', 'in'));
    const h = harness(cfg);
    h.actRefused({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'test' } });
    expect(h.m.keyed()).toBeFalsy();
    expect(h.m.eventsWithPrefix('txRefused:').length).toBe(1);
  });

  it('analyzer sweep finds the dipole resonance move after an element adjust', () => {
    const devices = [
      ...baseDevices(),
      { id: 'analyzer', kind: 'analyzer' as const, label: 'Antenna analyzer', location: 'bench' },
      {
        id: 'dipole',
        kind: 'antenna' as const,
        label: 'Adjustable dipole',
        location: 'bench',
        antenna: { kind: 'adjustable-dipole' as const, overrides: { elementLengthsM: [0.55, 0.55] as [number, number] } },
      },
      { id: 'an-coax', kind: 'coax' as const, label: 'Analyzer jumper', location: 'bench', coax: { type: 'rg8x' as const, length: 1, unit: 'm' as const } },
    ];
    const connections = [...baseConnections(), conn('a1', 'analyzer', 'rf', 'an-coax', 'a'), conn('a2', 'an-coax', 'b', 'dipole', 'in')];
    const h = harness(baseConfig({ devices, connections }));
    h.actOk({ type: 'analyzer.calibrate', referenceDeviceId: 'an-coax' });
    h.actOk({ type: 'analyzer.sweep', start: 120, stop: 160, points: 201 });
    const low = h.m.lastMeasurement({ instrument: 'analyzer' })?.value ?? 0;
    expect(low).toBeLessThan(140);
    h.actOk({ type: 'antenna.adjust', deviceId: 'dipole', elementLengthsM: [0.488, 0.488] });
    h.actOk({ type: 'analyzer.sweep', start: 120, stop: 160, points: 201 });
    const tuned = h.m.lastMeasurement({ instrument: 'analyzer', afterEvent: 'adjust:dipole' });
    expect(tuned?.value).toBeGreaterThan(145);
    expect(tuned?.value).toBeLessThan(148);
  });
});

describe('HamStationManager conditions and worksheets', () => {
  it('measured() rejects a reading taken before the station changed', () => {
    const h = harness(baseConfig());
    const cond = C.measured({ instrument: 'multimeter', quantity: 'voltage', min: 13, max: 14.5 });
    h.actOk({ type: 'meter.mode', mode: 'DCV' });
    h.actOk({ type: 'meter.place', targetId: 'psu', red: 'radio+', black: 'radio-' });
    h.actOk({ type: 'meter.read' });
    expect(C.evaluateWith(cond, h.m)).toBe(true);
    h.actOk({ type: 'disconnect', connectionId: 'mob-feed' });
    expect(C.evaluateWith(cond, h.m)).toBe(false);
    h.actOk({ type: 'meter.read' });
    expect(C.evaluateWith(cond, h.m)).toBe(true);
  });

  it('a wrong worksheet answer gives feedback and the right one is recorded', () => {
    const worksheets = [
      {
        id: 'dipole',
        title: 'Dipole length',
        prompt: 'Total length for 146.550 MHz?',
        fields: [{ id: 'len', label: 'Length (m)', kind: 'number' as const, answer: 0.976, tolerance: 0.01 }],
        explanation: '143 / 146.55 = 0.976 m.',
        wrongFeedback: { len: 'Use 143 divided by the frequency in MHz.' },
      },
    ];
    const h = harness(baseConfig({ worksheets }));
    const wrong = h.actOk({ type: 'worksheet.answer', id: 'dipole', values: { len: 1.95 } });
    expect(wrong.data?.correct).toBe(false);
    expect(wrong.message).toContain('143');
    expect(C.evaluateWith(C.worksheetCorrect('dipole'), h.m)).toBe(false);
    h.actOk({ type: 'worksheet.answer', id: 'dipole', values: { len: 0.976 } });
    expect(C.evaluateWith(C.worksheetCorrect('dipole'), h.m)).toBe(true);
  });
});
