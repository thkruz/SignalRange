/**
 * @file ham-bench - A small Campaign 3 bench for the dev gallery
 * @description SDR on a vertical, a mobile transceiver on its own vertical and a supply, built into a
 * standalone HamStationManager (not the singleton). Copied from the unit-test harness so the shipped
 * gallery never imports from test/.
 */
import { HAM_STATION_SCHEMA, type HamDeviceConfig, type HamStationConfig } from '@app/ham/ham-station-config';
import { HamStationManager } from '@app/ham/ham-station-manager';
import type { HamConnection } from '@app/ham/ham-types';

const BENCH = { xKm: 0, yKm: 0, heightM: 10 };

const conn = (id: string, a: string, ap: string, b: string, bp: string): HamConnection => ({
  id,
  a: { deviceId: a, portId: ap },
  b: { deviceId: b, portId: bp },
  seated: true,
});

function devices(): HamDeviceConfig[] {
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
    { id: 'dmm1', kind: 'multimeter', label: 'Multimeter', location: 'bench' },
    { id: 'swr1', kind: 'swr-meter', label: 'SWR meter', location: 'bench' },
    { id: 'an1', kind: 'analyzer', label: 'Antenna analyzer', location: 'bench' },
    { id: 'dp1', kind: 'antenna', label: 'Adjustable dipole', location: 'bench', antenna: { kind: 'adjustable-dipole', overrides: { elementLengthsM: [0.55, 0.55] } } },
    { id: 'board', kind: 'circuit-board', label: 'Practice board', location: 'bench', board: true, powered: true },
    { id: 'dummy', kind: 'dummy-load', label: '100 W dummy load', location: 'bench', dummyLoad: { ratedW: 100, ratedSeconds: 300 } },
  ];
}

const PACKET_NODE = { id: 'riley-node', callsign: 'KD0RLY', freqMHz: 145.57, position: { xKm: 6, yKm: 2, heightM: 15 }, erpDbm: 40, replyDelayS: 1, banner: 'Riley node' };

/** `packet` adds an audio interface and a packet link from the mobile to a node, so the laptop's packet terminal exists */
export function createGalleryBench(opts: { packet?: boolean } = {}): HamStationManager {
  const config: HamStationConfig = {
    schema: HAM_STATION_SCHEMA,
    pauseOnQuiz: false,
    seed: 7,
    operator: { license: 'technician', callsign: 'KF0SRT', name: 'Trainee' },
    locations: [{ id: 'bench', label: 'Bench', description: 'Workbench', position: BENCH }],
    startLocation: 'bench',
    stationPosition: BENCH,
    devices: opts.packet ? [...devices(), { id: 'iface', kind: 'audio-interface', label: 'Audio interface', location: 'bench' }] : devices(),
    connections: [
      conn('sdr-usb', 'sdr', 'usb', 'laptop', 'usb1'),
      conn('sdr-sma', 'sdr', 'ant', 'sdr-adapter', 'a'),
      conn('sdr-adp-coax', 'sdr-adapter', 'b', 'sdr-coax', 'a'),
      conn('sdr-feed', 'sdr-coax', 'b', 'sdr-ant', 'in'),
      conn('mob-ant-jack', 'mobile', 'ant', 'mob-coax', 'a'),
      conn('mob-feed', 'mob-coax', 'b', 'mob-ant', 'in'),
    ],
    ...(opts.packet
      ? {
          packet: {
            radioId: 'mobile',
            node: PACKET_NODE,
            audio: { inputDevice: 'laptop-mic', outputDevice: 'interface', ptt: 'rts' },
            station: { mycall: 'KF0SRT', destination: 'KD0RLY', path: ['WIDE1-1'] },
          },
        }
      : {}),
    faults: [],
    emitters: [],
    worksheets: [],
    cards: [],
  };

  return HamStationManager.createForTest(config, { nowS: 0 });
}
