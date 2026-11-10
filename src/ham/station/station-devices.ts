/**
 * @file station-devices - Device runtime records, port tables and RF path helpers
 * @description Turns the station's device records into the `RfDevice` table that `resolveRfPath`
 * walks, and answers the wiring questions the manager asks (what is plugged into this port, is the
 * SDR on a powered laptop, where is a device).
 */

import { HAM_PROFILES } from '../ham-profiles';
import type { HamDeviceConfig } from '../ham-station-config';
import type { HamCapabilityProfile, HamConnection, HamDeviceKind, HamLocationId, LocalPosition, PortDef, RadioSettings } from '../ham-types';
import { defaultRadioSettings } from '../radio/radio-settings';
import { type AntennaState, antennaPolarization, createAntenna } from '../rf/antenna-model';
import { type CoaxState, createCoax } from '../rf/feedline';
import { createDummyLoad, type DummyLoadState } from '../rf/instruments';
import { type RfDevice, type RfDeviceKind, type RfPath, resolveRfPath } from '../rf/rf-path';

export interface DeviceRuntime {
  id: string;
  kind: HamDeviceKind;
  label: string;
  location: HamLocationId;
  profileId?: string;
  powered: boolean;
  radio?: RadioSettings;
  antenna?: AntennaState;
  coax?: CoaxState;
  position?: LocalPosition;
  spare: boolean;
  removed: boolean;
  dummyLoad?: DummyLoadState;
  fuseRatingA?: number;
}

const RADIO_KINDS: readonly HamDeviceKind[] = ['handheld', 'mobile', 'dmr-handheld', 'hf-rig'];
export const isRadioKind = (k: HamDeviceKind): boolean => RADIO_KINDS.includes(k);
export const isReceiverKind = (k: HamDeviceKind): boolean => k === 'sdr' || isRadioKind(k);
/** Feedlines, adapters and leads span locations, so the player can handle them anywhere */
export const isPortable = (k: HamDeviceKind): boolean => k === 'coax' || k === 'adapter' || k === 'dc-lead';

const port = (id: string, label: string, family: PortDef['family'], gender: PortDef['gender'], role: PortDef['role']): PortDef => ({
  id,
  label,
  family,
  gender,
  role,
});

export function createDeviceRuntime(cfg: HamDeviceConfig): DeviceRuntime {
  const profile = cfg.profileId ? HAM_PROFILES[cfg.profileId] : undefined;
  const d: DeviceRuntime = {
    id: cfg.id,
    kind: cfg.kind,
    label: cfg.label,
    location: cfg.location,
    profileId: cfg.profileId,
    powered: cfg.powered ?? false,
    position: cfg.position,
    spare: cfg.spare ?? false,
    removed: false,
    fuseRatingA: cfg.fuseRatingA,
  };
  if (profile) d.radio = { ...defaultRadioSettings(profile), ...(cfg.radio ?? {}) };
  if (cfg.antenna) d.antenna = createAntenna(cfg.antenna.kind, cfg.antenna.overrides ?? {});
  if (cfg.coax) d.coax = createCoax(cfg.coax.type, cfg.coax.length, cfg.coax.unit ?? 'ft', cfg.coax.fault ?? null);
  if (cfg.kind === 'dummy-load') d.dummyLoad = createDummyLoad(cfg.dummyLoad?.ratedW ?? 100, cfg.dummyLoad?.ratedSeconds ?? 300);

  return d;
}

export function profileOf(d: DeviceRuntime | undefined): HamCapabilityProfile | undefined {
  return d?.profileId ? HAM_PROFILES[d.profileId] : undefined;
}

/** Port table for any device kind */
export function portsFor(cfg: HamDeviceConfig): PortDef[] {
  const profile = cfg.profileId ? HAM_PROFILES[cfg.profileId] : undefined;
  if (profile) return [...profile.ports];
  const c = cfg.connector;
  switch (cfg.kind) {
    case 'laptop':
      return [
        port('usb1', 'USB port 1', 'USB-A', 'jack', 'usb-host'),
        port('usb2', 'USB port 2', 'USB-A', 'jack', 'usb-host'),
        port('audio', 'Headset jack', 'TRS-3.5', 'jack', 'audio'),
      ];
    case 'antenna': {
      const def = cfg.antenna?.kind === 'rubber-duck' ? { family: 'SMA' as const, gender: 'plug' as const } : { family: 'UHF' as const, gender: 'jack' as const };
      const e = c ?? def;
      return [port('in', 'Feed point', e.family, e.gender, 'rf')];
    }
    case 'coax': {
      const a = cfg.coax?.endA ?? { family: 'UHF', gender: 'plug' };
      const b = cfg.coax?.endB ?? a;
      return [port('a', 'End A', a.family, a.gender, 'rf'), port('b', 'End B', b.family, b.gender, 'rf')];
    }
    case 'adapter': {
      const a = cfg.adapter?.a ?? { family: 'SMA', gender: 'plug' };
      const b = cfg.adapter?.b ?? { family: 'UHF', gender: 'jack' };
      return [port('a', 'Side A', a.family, a.gender, 'rf'), port('b', 'Side B', b.family, b.gender, 'rf')];
    }
    case 'swr-meter':
      return [port('tx', 'TX', 'UHF', 'jack', 'rf'), port('ant', 'ANT', 'UHF', 'jack', 'rf')];
    case 'dummy-load':
    case 'cal-load': {
      const e = c ?? { family: 'UHF', gender: 'plug' };
      return [port('in', 'RF', e.family, e.gender, 'rf')];
    }
    case 'analyzer': {
      const e = c ?? { family: 'UHF', gender: 'jack' };
      return [port('rf', 'RF', e.family, e.gender, 'rf')];
    }
    case 'duplexer':
      return [port('common', 'Antenna', 'UHF', 'jack', 'rf'), port('vhf', 'VHF', 'UHF', 'jack', 'rf'), port('uhf', 'UHF', 'UHF', 'jack', 'rf')];
    case 'audio-interface':
      return [port('radio', 'Radio data', 'MINI-DIN-6', 'plug', 'data'), port('usb', 'USB', 'USB-A', 'plug', 'usb-device')];
    case 'power-supply':
    case 'battery':
      return [port('dc-out', 'DC out', 'POWERPOLE', 'genderless', 'dc-out')];
    case 'dc-lead':
      return [port('a', 'End A', 'POWERPOLE', 'genderless', 'dc-in'), port('b', 'End B', 'POWERPOLE', 'genderless', 'dc-out')];
    case 'headphones':
      return [port('plug', 'Plug', 'TRS-3.5', 'plug', 'audio')];
    default:
      return [];
  }
}

const RF_KIND: Partial<Record<HamDeviceKind, RfDeviceKind>> = {
  sdr: 'sdr',
  handheld: 'radio',
  mobile: 'radio',
  'dmr-handheld': 'radio',
  'hf-rig': 'radio',
  coax: 'coax',
  adapter: 'adapter',
  'swr-meter': 'swr-meter',
  'dummy-load': 'dummy-load',
  'cal-load': 'cal-load',
  analyzer: 'analyzer',
  antenna: 'antenna',
  duplexer: 'duplexer',
};

/** Devices in service (not spare, not removed) as an RfDevice table */
export function rfDeviceTable(devices: Readonly<Record<string, DeviceRuntime>>, ports: Readonly<Record<string, PortDef[]>>): Record<string, RfDevice> {
  const out: Record<string, RfDevice> = {};
  for (const d of Object.values(devices)) {
    const kind = RF_KIND[d.kind];
    if (!kind || d.spare || d.removed) continue;
    out[d.id] = { id: d.id, kind, label: d.label, ports: ports[d.id] ?? [], coax: d.coax, antenna: d.antenna };
  }

  return out;
}

export function liveConnections(connections: readonly HamConnection[], devices: Readonly<Record<string, DeviceRuntime>>): HamConnection[] {
  return connections.filter((c) => {
    const a = devices[c.a.deviceId];
    const b = devices[c.b.deviceId];
    return a && b && !a.spare && !a.removed && !b.spare && !b.removed;
  });
}

export function pathFrom(
  devices: Readonly<Record<string, DeviceRuntime>>,
  ports: Readonly<Record<string, PortDef[]>>,
  connections: readonly HamConnection[],
  deviceId: string,
  freqMHz: number,
  portId = 'ant'
): RfPath {
  return resolveRfPath(rfDeviceTable(devices, ports), liveConnections(connections, devices), { startDeviceId: deviceId, startPortId: portId, freqMHz });
}

export function connectionAt(connections: readonly HamConnection[], deviceId: string, portId: string): HamConnection | undefined {
  return connections.find((c) => (c.a.deviceId === deviceId && c.a.portId === portId) || (c.b.deviceId === deviceId && c.b.portId === portId));
}

export function otherEnd(c: HamConnection, deviceId: string): { deviceId: string; portId: string } {
  return c.a.deviceId === deviceId ? c.b : c.a;
}

/** SDR is usable only when its USB plug sits fully in a powered laptop */
export function sdrUsbConnected(devices: Readonly<Record<string, DeviceRuntime>>, connections: readonly HamConnection[], sdrId: string): boolean {
  const c = connectionAt(connections, sdrId, 'usb');
  if (!c?.seated) return false;
  const host = devices[otherEnd(c, sdrId).deviceId];
  if (!host || host.removed || host.spare) return false;
  if (host.kind === 'laptop') return host.powered;
  return false;
}

export function polarizationLabel(a: AntennaState | undefined): 'V' | 'H' | 'RHCP' | 'LHCP' {
  if (!a) return 'V';
  const p = antennaPolarization(a);
  if (p.kind === 'rhcp') return 'RHCP';
  if (p.kind === 'lhcp') return 'LHCP';
  const ang = ((p.angleDeg % 180) + 180) % 180;
  return ang <= 45 || ang >= 135 ? 'V' : 'H';
}
