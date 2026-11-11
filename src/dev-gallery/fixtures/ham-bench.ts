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
    { id: 'dummy', kind: 'dummy-load', label: '100 W dummy load', location: 'bench', dummyLoad: { ratedW: 100, ratedSeconds: 300 } },
  ];
}

export function createGalleryBench(): HamStationManager {
  const config: HamStationConfig = {
    schema: HAM_STATION_SCHEMA,
    pauseOnQuiz: false,
    seed: 7,
    operator: { license: 'technician', callsign: 'KF0SRT', name: 'Trainee' },
    locations: [{ id: 'bench', label: 'Bench', description: 'Workbench', position: BENCH }],
    startLocation: 'bench',
    stationPosition: BENCH,
    devices: devices(),
    connections: [
      conn('sdr-usb', 'sdr', 'usb', 'laptop', 'usb1'),
      conn('sdr-sma', 'sdr', 'ant', 'sdr-adapter', 'a'),
      conn('sdr-adp-coax', 'sdr-adapter', 'b', 'sdr-coax', 'a'),
      conn('sdr-feed', 'sdr-coax', 'b', 'sdr-ant', 'in'),
      conn('mob-ant-jack', 'mobile', 'ant', 'mob-coax', 'a'),
      conn('mob-feed', 'mob-coax', 'b', 'mob-ant', 'in'),
    ],
    faults: [],
    emitters: [],
    worksheets: [],
    cards: [],
  };

  return HamStationManager.createForTest(config, { nowS: 0 });
}
