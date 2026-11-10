import type { HandoverFormConfig } from '@app/physical/field-records';
import type { PlantConfig } from '@app/physical/physical-plant-types';
import type { ServiceModelConfig, ServicePathConfig } from '@app/physical/service-types';
import type { RequirementCard } from '@app/physical/workload-types';
import { SKYLINK_SERVICE } from './camp-field-config';

/**
 * Forward (Rautala) field configuration shared by S9 onward (M24). S9-S10 carry SkyLink only; S11
 * adds the EuroSat path on top of this config. The terminal and router run on the battery station:
 * the generator in the truck is off by default and no trips outside are counted (site mode 'forward').
 * Only frontline scenario settings call this, so Campaigns 1-5 never see a service model.
 */

export const FORWARD_SKYLINK_ACCOUNT = 'forward-skylink';
export const FORWARD_PROVIDER = 'skylink-net';
export const FORWARD_ENDPOINT = 'pilot-app';
export const FORWARD_SKYLINK_UNIT = 'rautala-skylink';
export const FORWARD_RESERVE_WH = 150;
export const FORWARD_START_WH = 400;

export interface ForwardFieldOptions {
  /** Path diagram highlights shared dependencies (default true; S9 passes false so the player finds them) */
  highlightShared?: boolean;
}

/** SkyLink on the forward kit, with one pilot-application endpoint as the remote leg */
export function forwardServiceConfig(): ServiceModelConfig {
  return {
    paths: [
      {
        id: SKYLINK_SERVICE,
        label: 'SkyLink',
        terminalPartId: 'skylink-dish',
        localPartIds: ['skylink-router', 'laptop'],
        accountId: FORWARD_SKYLINK_ACCOUNT,
        providerId: FORWARD_PROVIDER,
        linkTargetIds: ['skylink-cable', 'skylink-cable:dish', 'skylink-cable:router'],
        endpointIds: [FORWARD_ENDPOINT],
        profile: { downMbps: 80, upMbps: 12, rttMs: 55, lossPct: 0.5, rttSpreadMs: 6 },
      },
    ],
    accounts: [{ id: FORWARD_SKYLINK_ACCOUNT, unitId: FORWARD_SKYLINK_UNIT, authorized: true, capacityFactor: 1 }],
    providers: [{ id: FORWARD_PROVIDER, status: 'normal', capacityFactor: 1, noticeIds: [] }],
    endpoints: [{ id: FORWARD_ENDPOINT, reachable: true }],
    // Readings stay readable long enough to fill a form after taking them
    maxAgeS: { 'device-indicator': 120, 'endpoint-report': 180 },
  };
}

/** S9: the first simulated task (all three limits met by the healthy service) */
export const FORWARD_FIRST_CARD: RequirementCard = {
  id: 'fwd-first',
  version: 1,
  label: 'First forward task',
  minDownMbps: 10,
  minUpMbps: 2,
  maxRttMs: 150,
  windowS: 60,
  priority: 'mission',
};

/**
 * Adds the forward service, cards, handover forms and the battery-only power plan to a plant config
 * (mutates and returns it). Throws when the forward kit lacks the SkyLink parts.
 */
export function applyForwardField(plant: PlantConfig, cards: RequirementCard[], handovers: HandoverFormConfig[], opts: ForwardFieldOptions = {}): PlantConfig {
  const part = (id: string) => plant.parts.find((p) => p.id === id);
  const generator = part('generator');
  const battery = part('power-station');
  if (!generator || !battery || !part('skylink-dish')) {
    throw new Error('Forward field needs the generator, the power station and the SkyLink dish');
  }
  plant.service = forwardServiceConfig();
  plant.workloads = { cards };
  plant.handovers = handovers;
  // The truck generator is off until the player starts it; the laptop and SkyLink run on batteries
  generator.running = false;
  battery.socWh = FORWARD_START_WH;
  plant.power = { reserveWh: FORWARD_RESERVE_WH, planningHorizonS: 3600, basis: 'battery-only' };
  plant.spares = { 'cable:power-data': 1, 'cable:coax': 0, 'power-brick': 1, 'connector-kit': 1, 'fuel-can': 1 };
  plant.diagram = { highlightShared: opts.highlightShared ?? true };

  return plant;
}

// ---------------------------------------------------------------- EuroSat layer (M25, S11 onward)

export const FORWARD_EUROSAT_SERVICE = 'forward-eurosat';
export const FORWARD_EUROSAT_ACCOUNT = 'forward-eurosat';
export const FORWARD_EUROSAT_PROVIDER = 'eurosat-net';
export const FORWARD_EUROSAT_ENDPOINT = 'pilot-app-eurosat';
export const FORWARD_EUROSAT_UNIT = 'rautala-eurosat';
/** Seconds the delivered modem needs to register after it is switched to run */
export const FORWARD_EUROSAT_STARTUP_S = 20;
/** Share of the SkyLink allowance left by the S10 restriction, still in force from S11 */
export const FORWARD_SKYLINK_RESTRICTED_FACTOR = 0.25;

export interface ForwardEurosatOptions {
  /** The modem starts in run mode (default false: the player commissions it) */
  modemRunning?: boolean;
}

/** The EuroSat GEO path: modem and dish on the laptop and the shared power chain, its own account, provider and pilot endpoint */
export function forwardEurosatPath(): ServicePathConfig {
  return {
    id: FORWARD_EUROSAT_SERVICE,
    label: 'EuroSat',
    terminalPartId: 'vsat-modem',
    localPartIds: ['laptop'],
    accountId: FORWARD_EUROSAT_ACCOUNT,
    providerId: FORWARD_EUROSAT_PROVIDER,
    linkTargetIds: ['vsat-feed', 'vsat-ifl', 'vsat-ifl:lnb', 'vsat-ifl:modem'],
    endpointIds: [FORWARD_EUROSAT_ENDPOINT],
    profile: { downMbps: 20, upMbps: 4, rttMs: 620, lossPct: 0.5, rttSpreadMs: 60 },
  };
}

/**
 * Adds the EuroSat path on top of `applyForwardField` (mutates and returns the plant). The SkyLink account stays
 * under the S10 ground-capacity restriction. The modem is one switchable unit (55 W running; dish and LNB carry no
 * load of their own) that needs `FORWARD_EUROSAT_STARTUP_S` to register. S9/S10 never call this.
 */
export function applyForwardEurosat(plant: PlantConfig, opts: ForwardEurosatOptions = {}): PlantConfig {
  const service = plant.service;
  const modem = plant.parts.find((p) => p.id === 'vsat-modem');
  if (!service || !modem) {
    throw new Error('EuroSat layer needs the forward SkyLink field and the VSAT modem');
  }
  service.paths.push(forwardEurosatPath());
  service.accounts.push({ id: FORWARD_EUROSAT_ACCOUNT, unitId: FORWARD_EUROSAT_UNIT, authorized: true, capacityFactor: 1 });
  service.providers.push({ id: FORWARD_EUROSAT_PROVIDER, status: 'normal', capacityFactor: 1, noticeIds: [] });
  service.endpoints = [...(service.endpoints ?? []), { id: FORWARD_EUROSAT_ENDPOINT, reachable: true }];
  const skylink = service.accounts.find((a) => a.id === FORWARD_SKYLINK_ACCOUNT);
  if (skylink) {
    skylink.restriction = 'ground-capacity';
    skylink.capacityFactor = FORWARD_SKYLINK_RESTRICTED_FACTOR;
  }
  modem.modes = [
    { id: 'standby', label: 'Standby', loadW: 0, servesTraffic: false },
    { id: 'run', label: 'Running', loadW: 55, startupS: FORWARD_EUROSAT_STARTUP_S, servesTraffic: true },
  ];
  modem.mode = opts.modemRunning ? 'run' : 'standby';
  for (const id of ['vsat-dish', 'vsat-lnb']) {
    const p = plant.parts.find((x) => x.id === id);
    if (p) {
      p.loadW = 0;
    }
  }

  return plant;
}

// ---------------------------------------------------------------- Remote terminal and dual readiness (M26, S13-S14)

/** The SkyLink task run across the provider network to the simulated onboard terminal at the remote end */
export const FORWARD_REMOTE_SERVICE = 'forward-skylink-remote';
export const FORWARD_REMOTE_ENDPOINT = 'remote-terminal';
/** S14 plan: the dish needs this long to register after it leaves standby (the modem needs FORWARD_EUROSAT_STARTUP_S) */
export const FORWARD_SKYLINK_STARTUP_S = 30;
export const DUAL_START_WH = 360;
export const DUAL_RESERVE_WH = 200;

/** Battery draw (W) with the dish running and the modem in standby: the correct dual-terminal arrangement (S14 to S16) */
export const DUAL_CORRECT_DRAIN_W = 115;
/** Battery draw (W) with both terminals running: the wrong arrangement the forecast must keep rejecting */
export const DUAL_WRONG_DRAIN_W = 170;

/**
 * Smallest whole-Wh start charge that lets a student spend `allowanceS` of scenario time on the correct arrangement and
 * still have the planning forecast clear the reserve. The battery drains while the student works and the forecast is
 * recomputed from what is left, so the start must cover the reserve, the drain over the planning horizon, the drain over
 * the allowance and a small rounding margin: start >= reserve + drainW * (horizon + allowance) / 3600 + margin.
 *
 * The wrong arrangement must still fail at t = 0, which needs start - wrongDrainW * horizon / 3600 < reserve. Both limits
 * can only hold together when horizon > allowance * correctDrain / (wrongDrain - correctDrain); at 115 W vs 170 W and a
 * 2700 s allowance that is about 5640 s, so the dual-terminal scenarios plan over 7200 s rather than an hour.
 */
export function reserveStartWh(reserveWh: number, drainW: number, horizonS: number, allowanceS: number, marginWh = 5): number {
  return Math.ceil(reserveWh + (drainW * (horizonS + allowanceS)) / 3600 + marginWh);
}

export interface ForwardRemoteOptions {
  /** The remote mobility policy is already in force (S14 starts after S13 left it in place) */
  policyInForce?: boolean;
}

/**
 * Adds the remote SkyLink task path (S13, S14) on top of `applyForwardField`: the same ground terminal, account and
 * provider as SkyLink, but its own remote endpoint. A remote mobility policy touches only this endpoint; the account's
 * ground-capacity restriction touches the account. The two states never share a field.
 */
export function applyForwardRemote(plant: PlantConfig, opts: ForwardRemoteOptions = {}): PlantConfig {
  const service = plant.service;
  const skylink = service?.paths.find((p) => p.id === SKYLINK_SERVICE);
  if (!service || !skylink) {
    throw new Error('Remote terminal layer needs the forward SkyLink field');
  }
  service.paths.push({ ...skylink, id: FORWARD_REMOTE_SERVICE, label: 'SkyLink to remote terminal', endpointIds: [FORWARD_REMOTE_ENDPOINT] });
  service.endpoints = [
    ...(service.endpoints ?? []),
    opts.policyInForce ? { id: FORWARD_REMOTE_ENDPOINT, reachable: false, policy: 'mobility-restricted' } : { id: FORWARD_REMOTE_ENDPOINT, reachable: true },
  ];

  return plant;
}

/**
 * S14 readiness plan on top of `applyForwardEurosat`: both terminals become switchable units (dish 50 W, modem 55 W,
 * each with its own startup), the battery starts at DUAL_START_WH against DUAL_RESERVE_WH. With both running the
 * hour projection misses the reserve; one terminal running and the other in standby keeps it.
 */
export function applyForwardDualReadiness(plant: PlantConfig): PlantConfig {
  const dish = plant.parts.find((p) => p.id === 'skylink-dish');
  const battery = plant.parts.find((p) => p.id === 'power-station');
  if (!dish || !battery || !plant.power) {
    throw new Error('Dual readiness needs the forward field, the dish and the power station');
  }
  dish.modes = [
    { id: 'standby', label: 'Standby', loadW: 0, servesTraffic: false },
    { id: 'run', label: 'Running', loadW: 50, startupS: FORWARD_SKYLINK_STARTUP_S, servesTraffic: true },
  ];
  dish.mode = 'run';
  battery.socWh = DUAL_START_WH;
  plant.power = { ...plant.power, reserveWh: DUAL_RESERVE_WH };

  return plant;
}
