import type { HandoverFormConfig } from '@app/physical/field-records';
import type { PartModeConfig, PlantConfig } from '@app/physical/physical-plant-types';
import type { ServiceModelConfig } from '@app/physical/service-types';
import type { RequirementCard } from '@app/physical/workload-types';

/**
 * Camp (Kivilahti) field configuration shared by S1-S8: the two services on the sandbox kit,
 * the requirement cards and the plant opt-ins that the C6 mechanics read. Only frontline
 * scenario settings call this, so Campaigns 1-5 never see a service model.
 */

export const SKYLINK_SERVICE = 'skylink';
export const CAMP_VSAT_SERVICE = 'camp-vsat';
export const CAMP_SERVICES = [SKYLINK_SERVICE, CAMP_VSAT_SERVICE];

/** Terminal indicators stay readable long enough to fill a form after taking the reading */
const CAMP_MAX_AGE_S = { 'device-indicator': 120 } as const;

export function campServiceConfig(): ServiceModelConfig {
  return {
    paths: [
      {
        id: SKYLINK_SERVICE,
        label: 'Skylink',
        terminalPartId: 'spacey-dish',
        localPartIds: ['spacey-router', 'laptop'],
        accountId: 'camp-skylink',
        providerId: 'skylink-net',
        linkTargetIds: ['spacey-cable', 'spacey-cable:dish', 'spacey-cable:router'],
        profile: { downMbps: 120, upMbps: 15, rttMs: 45, lossPct: 0.5 },
      },
      {
        id: CAMP_VSAT_SERVICE,
        label: 'Camp reference VSAT',
        terminalPartId: 'vsat-modem',
        localPartIds: ['laptop'],
        accountId: 'camp-eurosat',
        providerId: 'eurosat-net',
        linkTargetIds: ['vsat-feed', 'vsat-ifl', 'vsat-ifl:lnb', 'vsat-ifl:modem'],
        profile: { downMbps: 20, upMbps: 4, rttMs: 620, lossPct: 0.5 },
      },
    ],
    accounts: [
      { id: 'camp-skylink', unitId: 'kivilahti-skylink', authorized: true, capacityFactor: 1 },
      { id: 'camp-eurosat', unitId: 'kivilahti-eurosat', authorized: true, capacityFactor: 1 },
    ],
    providers: [
      { id: 'skylink-net', status: 'normal', capacityFactor: 1, noticeIds: [] },
      { id: 'eurosat-net', status: 'normal', capacityFactor: 1, noticeIds: [] },
    ],
    maxAgeS: { ...CAMP_MAX_AGE_S },
  };
}

/** S1: Ola's application check (any camp service passes). */
export const OLA_CHECK_CARD: RequirementCard = {
  id: 'ola-check',
  version: 1,
  label: 'Ola application check',
  minDownMbps: 2,
  minUpMbps: 1,
  maxRttMs: 800,
  windowS: 30,
  priority: 'routine',
};

/** S2: the low-delay requirement card; the 120 s window is the recovery observation. */
export const OLA_VOICE_CARD: RequirementCard = {
  id: 'ola-voice',
  version: 1,
  label: 'Ola low-delay session',
  minDownMbps: 5,
  minUpMbps: 2,
  maxRttMs: 150,
  windowS: 120,
  priority: 'mission',
};

/** Adds the camp services, cards and handover forms to a plant config (mutates and returns it) */
export function applyCampField(plant: PlantConfig, cards: RequirementCard[], handovers: HandoverFormConfig[]): PlantConfig {
  plant.service = campServiceConfig();
  plant.workloads = { cards };
  plant.handovers = handovers;

  return plant;
}

const terminalModes = (activeW: number): PartModeConfig[] => [
  { id: 'standby', label: 'Standby', loadW: 0, servesTraffic: false },
  { id: 'run', label: 'Running', loadW: activeW, servesTraffic: true },
];

/**
 * S2 power plan (Ted, 2026-11-09): 450 Wh start, 200 Wh reserve, 5400 s planning horizon, battery-only.
 * Drawn loads: router 20, laptop 45, each running terminal 55 (the battery station's own 10 W is not drawn from
 * itself); the VSAT modem, antenna and LNB are one switchable unit (the dish and LNB entries carry no load of
 * their own). Both terminals start running: 175 W projects 187.5 Wh at the end of the 5400 s horizon and fails the
 * 200 Wh reserve; one terminal alone draws 120 W and projects 270 Wh.
 */
export function applyS2Power(plant: PlantConfig): PlantConfig {
  const part = (id: string) => plant.parts.find((p) => p.id === id);
  const skylink = part('spacey-dish');
  const modem = part('vsat-modem');
  if (!skylink || !modem) {
    throw new Error('S2 power plan needs the Skylink dish and the VSAT modem');
  }
  skylink.modes = terminalModes(55);
  skylink.mode = 'run';
  modem.modes = terminalModes(55);
  modem.mode = 'run';
  for (const id of ['vsat-dish', 'vsat-lnb']) {
    const p = part(id);
    if (p) {
      p.loadW = 0;
    }
  }
  const battery = part('power-station');
  if (battery) {
    battery.socWh = 450;
  }
  plant.power = { reserveWh: 200, planningHorizonS: 5400, basis: 'battery-only' };
  plant.meter = { jitterPct: 1.5, normalBandPct: 5 };

  return plant;
}
