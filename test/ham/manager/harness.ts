import { HAM_STATION_SCHEMA, type HamDeviceConfig, type HamStationConfig } from '../../../src/ham/ham-station-config';
import { type HamAction, type HamManagerOptions, HamStationManager } from '../../../src/ham/ham-station-manager';
import type { HamConnection } from '../../../src/ham/ham-types';

export const CALL = 'KF0SRT';
export const BENCH = { xKm: 0, yKm: 0, heightM: 10 };

export const conn = (id: string, a: string, ap: string, b: string, bp: string, seated = true): HamConnection => ({
  id,
  a: { deviceId: a, portId: ap },
  b: { deviceId: b, portId: bp },
  seated,
});

/** Base bench: SDR on a vertical (via SMA adapter and coax), mobile radio on its own vertical, PSU */
export function baseDevices(): HamDeviceConfig[] {
  return [
    { id: 'laptop', kind: 'laptop', label: 'Laptop', location: 'bench', powered: true },
    { id: 'sdr', kind: 'sdr', label: 'USB SDR', location: 'bench', profileId: 'usb-sdr', powered: true, radio: { vfoMHz: 146.55, mode: 'FM', filterHz: 15000 } },
    { id: 'sdr-adapter', kind: 'adapter', label: 'SMA adapter', location: 'bench' },
    { id: 'sdr-coax', kind: 'coax', label: 'RG-58 jumper', location: 'bench', coax: { type: 'rg58', length: 3, unit: 'm' } },
    { id: 'sdr-ant', kind: 'antenna', label: 'Bench vertical', location: 'bench', antenna: { kind: 'quarter-wave-vertical' } },
    { id: 'mobile', kind: 'mobile', label: 'Mobile radio', location: 'bench', profileId: 'dual-band-mobile', powered: true, radio: { vfoMHz: 146.55, txPowerW: 5 } },
    { id: 'psu', kind: 'power-supply', label: '13.8 V supply', location: 'bench', powered: true, dcSystem: { radioId: 'mobile', source: 'supply' } },
    { id: 'mob-coax', kind: 'coax', label: 'RG-8X', location: 'bench', coax: { type: 'rg8x', length: 5, unit: 'm' } },
    { id: 'mob-ant', kind: 'antenna', label: 'Roof vertical', location: 'bench', antenna: { kind: 'quarter-wave-vertical' } },
    { id: 'dummy', kind: 'dummy-load', label: '100 W dummy load', location: 'bench', dummyLoad: { ratedW: 100, ratedSeconds: 300 } },
    { id: 'cal', kind: 'cal-load', label: 'Calibration load', location: 'bench', calLoad: { ratedW: 0.5 } },
    { id: 'spare-coax', kind: 'coax', label: 'Spare RG-8X', location: 'bench', coax: { type: 'rg8x', length: 5, unit: 'm' }, spare: true },
  ];
}

export function baseConnections(): HamConnection[] {
  return [
    conn('sdr-usb', 'sdr', 'usb', 'laptop', 'usb1'),
    conn('sdr-sma', 'sdr', 'ant', 'sdr-adapter', 'a'),
    conn('sdr-adp-coax', 'sdr-adapter', 'b', 'sdr-coax', 'a'),
    conn('sdr-feed', 'sdr-coax', 'b', 'sdr-ant', 'in'),
    conn('mob-ant-jack', 'mobile', 'ant', 'mob-coax', 'a'),
    conn('mob-feed', 'mob-coax', 'b', 'mob-ant', 'in'),
  ];
}

export function baseConfig(patch: Partial<HamStationConfig> = {}): HamStationConfig {
  return {
    schema: HAM_STATION_SCHEMA,
    pauseOnQuiz: false,
    seed: 7,
    operator: { license: 'technician', callsign: CALL, name: 'Trainee' },
    locations: [
      { id: 'bench', label: 'Bench', description: 'Workbench', position: BENCH },
      { id: 'yard', label: 'Yard', description: 'Back yard', position: { xKm: 0.02, yKm: 0, heightM: 2 } },
      { id: 'club', label: 'Club', description: 'Club station', position: { xKm: 3, yKm: 0, heightM: 10 } },
    ],
    startLocation: 'bench',
    stationPosition: BENCH,
    devices: baseDevices(),
    connections: baseConnections(),
    faults: [],
    emitters: [
      {
        id: 'training',
        label: 'Training transmission',
        freqMHz: 146.55,
        mode: 'FM',
        erpDbm: 20,
        position: { xKm: 8, yKm: 0, heightM: 20 },
        polarization: 'V',
        payload: { kind: 'voice', text: 'This is the club training transmission on one four six five five', callsign: 'W0SRC' },
      },
    ],
    worksheets: [],
    cards: [],
    ...patch,
  };
}

export interface Harness {
  m: HamStationManager;
  advance(seconds: number, stepS?: number): void;
  actOk(a: HamAction): ReturnType<HamStationManager['act']>;
  actRefused(a: HamAction): ReturnType<HamStationManager['act']>;
}

export function harness(config: HamStationConfig, opts: HamManagerOptions = {}): Harness {
  const m = HamStationManager.createForTest(config, { nowS: 0, ...opts });

  return {
    m,
    advance(seconds: number, stepS = 1): void {
      const end = m.nowS + seconds;
      while (m.nowS < end - 1e-9) m.tick(Math.min(end, m.nowS + stepS));
    },
    actOk(a: HamAction) {
      const r = m.act(a);
      if (!r.ok) throw new Error(`${a.type} refused: ${r.message} (${r.refusal})`);
      return r;
    },
    actRefused(a: HamAction) {
      const r = m.act(a);
      if (r.ok) throw new Error(`${a.type} unexpectedly succeeded: ${r.message}`);
      return r;
    },
  };
}

const NODE = { id: 'riley-node', callsign: 'KD0RLY', freqMHz: 145.57, position: { xKm: 6, yKm: 2, heightM: 15 }, erpDbm: 40, replyDelayS: 1, banner: 'Riley node' };

/** Mobile on 145.570 packet to Riley's node; input device starts wrong (laptop mic) */
export function packetConfig(): HamStationConfig {
  const devices = [...baseDevices(), { id: 'iface', kind: 'audio-interface' as const, label: 'Audio interface', location: 'bench' }];
  const connections = [...baseConnections()];
  return baseConfig({
    devices: devices.map((d) => (d.id === 'mobile' ? { ...d, radio: { ...d.radio, vfoMHz: 145.57 } } : d)),
    connections,
    packet: {
      radioId: 'mobile',
      node: NODE,
      audio: { inputDevice: 'laptop-mic', outputDevice: 'interface', ptt: 'rts' },
      station: { mycall: CALL, destination: 'KD0RLY', path: ['WIDE1-1'] },
    },
  });
}
