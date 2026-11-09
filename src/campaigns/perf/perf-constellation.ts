import type { CampaignManager } from '@app/campaigns/campaign-manager';
import type { CampaignData } from '@app/campaigns/campaign-types';
import { sandstormGroundStation } from '@app/campaigns/ccs/ground-stations';
import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { type OrbitalObserver, OrbitalSatellite, observerFromLocation } from '@app/equipment/satellite/orbital-satellite';
import type { ScenarioData } from '@app/ScenarioData';
import { SCENARIOS, type SimulationSettings } from '@app/scenario-manager';
import { provideTleSet } from '@app/simulation/satellite-registry';
import { SimClock } from '@app/simulation/sim-clock';
import { getSimulatedNowMs } from '@app/simulation/sim-time';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { TimeSkipController } from '@app/simulation/time-skip-controller';
import type { TleSet } from '@app/tle-sets/tle-set-types';
import type { Degrees, Kilometers, TleLine1, TleLine2 } from 'ootk';
import { generateSyntheticTles } from '../../../scripts/tle-sets/synth';

/**
 * Dev-only perf scenario (Phase 3, P3-WP0). Loads N synthetic Walker/GEO
 * members as plain OrbitalSatellites on today's code so the baseline cost of a
 * constellation can be measured. N comes from `?perfN=` (default 1000).
 *
 * Registered through CampaignManager.registerDevCampaign only when
 * `process.env.NODE_ENV === 'development'` (see router.ts), so it is absent
 * from production builds and from every campaign menu. It has no
 * prerequisites, so it loads for a fresh profile.
 */

export const PERF_CAMPAIGN_ID = 'perf';
export const PERF_SCENARIO_ID = 'perf-constellation';
export const PERF_DEFAULT_N = 1000;
const PERF_EPOCH = '2026-11-09';

export function readPerfN(search: string = globalThis.location?.search ?? ''): number {
  const raw = new URLSearchParams(search).get('perfN');
  const n = raw ? Number.parseInt(raw, 10) : PERF_DEFAULT_N;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 29000) : PERF_DEFAULT_N;
}

/**
 * `?perfMode=legacy` builds every member as a plain OrbitalSatellite (the WP0
 * baseline). Anything else (default) loads the set through SatelliteRegistry as
 * non-hydrated members.
 */
export function readPerfMode(search: string = globalThis.location?.search ?? ''): 'legacy' | 'registry' {
  return new URLSearchParams(search).get('perfMode') === 'legacy' ? 'legacy' : 'registry';
}

export function buildPerfTleSet(n: number): TleSet {
  const tles = generateSyntheticTles({ count: n, seed: 1, epoch: PERF_EPOCH });
  const counts = new Map<string, number>();
  for (const t of tles) {
    counts.set(t.shell, (counts.get(t.shell) ?? 0) + 1);
  }
  return {
    format: 'sr-tle-set/1',
    id: `perf-synthetic-${n}`,
    epoch: PERF_EPOCH,
    source: 'synthetic',
    groups: [...counts].map(([id, count]) => ({ id, label: id, count })),
    members: tles.map((t) => ({ noradId: t.noradId, name: t.name, tle1: t.tle1, tle2: t.tle2, group: t.shell })),
  };
}

/**
 * `?perfAnt=KU_BAND_2M` swaps the SS-01 antennas for one powered antenna of that
 * config (any key of ANTENNA_CONFIG_KEYS) and `?perfPoint=az,el` aims it
 * (default 180,40, a busy part of the Starlink shell from 34 N). Used by the
 * WP5 candidate-narrowing measurements; absent, the station is unchanged.
 */
export function readPerfAntenna(search: string = globalThis.location?.search ?? ''): { key: string; az: number; el: number } | null {
  const q = new URLSearchParams(search);
  const key = q.get('perfAnt');
  if (!key || !(key in ANTENNA_CONFIG_KEYS)) return null;
  const [azRaw, elRaw] = (q.get('perfPoint') ?? '180,40').split(',').map(Number);
  const az = Number.isFinite(azRaw) ? azRaw : 180;
  const el = Number.isFinite(elRaw) ? elRaw : 40;

  return { key, az, el };
}

function perfStation(): typeof sandstormGroundStation {
  const ant = readPerfAntenna();
  if (!ant) return sandstormGroundStation;
  const state = {
    isPowered: true,
    azimuth: ant.az as Degrees,
    elevation: ant.el as Degrees,
    polarization: 0 as Degrees,
    trackingMode: 'manual',
    targetAzimuth: ant.az as Degrees,
    targetElevation: ant.el as Degrees,
    targetPolarization: 0 as Degrees,
    slewing: false,
    isLocked: false,
  } as Partial<AntennaState>;

  return { ...sandstormGroundStation, antennas: [ant.key as never], antennasState: [state] } as typeof sandstormGroundStation;
}

function buildSettings(n: number, mode: 'legacy' | 'registry' = readPerfMode()): SimulationSettings {
  if (mode === 'registry' && new URLSearchParams(globalThis.location?.search ?? '').get('perfSets') === 'real') {
    // The real sets are fetched by the router (ensureTleSets) before the scenario starts.
    return {
      isSync: true,
      groundStations: [perfStation()],
      satellites: [],
      constellations: [{ tleSet: 'starlink-2026-11' }, { tleSet: 'geo-belt-2026-11' }],
      isExtraSatellitesVisible: true,
      scenarioStartDate: PERF_EPOCH,
      scenarioStartWallTime: '02:00:00',
    } as SimulationSettings;
  }
  if (mode === 'registry') {
    const set = buildPerfTleSet(n);
    provideTleSet(set);
    return {
      isSync: true,
      groundStations: [perfStation()],
      satellites: [],
      constellations: [{ tleSet: set.id }],
      isExtraSatellitesVisible: true,
      scenarioStartDate: PERF_EPOCH,
      scenarioStartWallTime: '02:00:00',
    } as SimulationSettings;
  }
  return buildLegacySettings(n);
}

function buildLegacySettings(n: number): SimulationSettings {
  // The SS-01 station (two antennas) is the observer the az/el telemetry is computed against.
  const observer: OrbitalObserver = {
    name: sandstormGroundStation.name,
    lat: sandstormGroundStation.location.latitude as Degrees,
    lon: sandstormGroundStation.location.longitude as Degrees,
    alt: (sandstormGroundStation.location.elevation / 1000) as Kilometers,
  };
  const satellites = generateSyntheticTles({ count: n, seed: 1, epoch: PERF_EPOCH }).map(
    (t) => new OrbitalSatellite(t.name, t.noradId, [], [], { tle1: t.tle1 as TleLine1, tle2: t.tle2 as TleLine2, observer })
  );
  return {
    isSync: true,
    groundStations: [sandstormGroundStation],
    satellites,
    isExtraSatellitesVisible: true,
    scenarioStartDate: PERF_EPOCH,
    scenarioStartWallTime: '02:00:00',
  } as SimulationSettings;
}

let cachedSettings_: SimulationSettings | null = null;

export const perfConstellationScenarioData: ScenarioData = {
  id: PERF_SCENARIO_ID,
  url: `${PERF_CAMPAIGN_ID}/scenarios/${PERF_SCENARIO_ID}`,
  imageUrl: 'ccs/1/card.png',
  number: 0,
  isDisabled: false,
  difficulty: 'advanced',
  title: 'Perf: constellation',
  subtitle: 'Dev-only synthetic constellation',
  duration: 'Unlimited',
  missionType: 'Sandbox',
  description: 'Dev-only perf harness scenario. N synthetic satellites from ?perfN=.',
  equipment: [],
  // Lazy: building 10k OrbitalSatellites at module load would tax every dev page view.
  get settings(): SimulationSettings {
    cachedSettings_ ??= buildSettings(readPerfN());
    return cachedSettings_;
  },
  objectives: [],
};

export const perfCampaignData: CampaignData = {
  id: PERF_CAMPAIGN_ID,
  title: 'Perf (dev only)',
  subtitle: 'Not shown in menus',
  description: 'Dev-only perf harness.',
  imageUrl: 'ccs/1/card.png',
  scenarios: [perfConstellationScenarioData],
  difficulty: 'advanced',
  totalDuration: 'n/a',
  campaignType: 'dev',
};

/** Shape of the probe the perf harness (e2e/perf/constellation.perf.ts) reads. */
export interface SrPerfProbe {
  /** Per-advance samples since the last reset: [ms, steps] pairs */
  samples: number[];
  longTasks: number[];
  reset(): void;
  SimClock: typeof SimClock;
  TimeSkipController: typeof TimeSkipController;
  /** Propagation service and scheduler stats (registry mode: the real sim's service) */
  prop?: PerfPropStats;
  /** SimulationManager.advance, timed directly on the current instance */
  timeFindTarget(): { ms: number; found: boolean };
  /** Pin up to `n` members (cursor-spaced); returns the pinned NORAD ids */
  pinMembers(n: number): number[];
  /** Unpin pinned members currently above any station horizon; returns how many were dropped */
  unpinInView(): number;
  /** Pin up to `n` members whose next AOS at the first station is at least `minAosS` away (or beyond the search horizon) */
  pinQuiet(n: number, minAosS: number): Promise<number>;
  unpinAll(): void;
  pinnedCount(): number;
  /**
   * Mount a TimelineDeck over the pinned set and time it: constructor cost on this
   * thread, then how long until the worker has filled the summary lanes.
   */
  /** Diagnostics for the real-skip phase: clock advance, station mapping and a direct worker search */
  debugSkip(): Promise<Record<string, unknown>>;
  mountTimeline(): Promise<{ ctorMs: number; lanes: number; groupLanes: number; fillMs: number | null; cells: number; selectionMs: number }>;
}

/** Counters read from the real sim's propagation service and tier scheduler. */
export interface PerfPropStats {
  /** Main-thread ms per advance spent in service.update + warm sampleAt, one entry per advance */
  serviceMs: number[];
  fallbacks(): number;
  fallbackReasons(): Record<string, number>;
  staleDropped(): number;
  holds(): { holds: number; episodes: number; maxMs: number; leadS: number };
  workerBusyMs(): number;
  resultsReceived(): number;
  warmCount(): number;
  hydratedCount(): number;
  hasWorker(): boolean;
  memberCount(): number;
  sinceMs(): number;
}

declare global {
  interface Window {
    __srPerf?: SrPerfProbe;
  }
}

/**
 * Dev-only: time every SimulationManager.advance (the sim work of a frame,
 * with `steps` fixed ticks inside it) and collect long tasks. Wrapped with
 * performance.measure so DevTools traces show it too. Called by the router
 * only under NODE_ENV === 'development' with `?perfN=` present.
 */
let pinCursor = 0;

export function installPerfProbe(): void {
  if (window.__srPerf) {
    return;
  }
  const samples: number[] = [];
  const longTasks: number[] = [];
  const proto = SimulationManager.prototype;
  const original = proto.advance;
  const svc = () => (SimulationManager.hasInstance() ? SimulationManager.getInstance().scheduler.service : null);
  const prop: PerfPropStats = {
    serviceMs: [],
    fallbacks: () => svc()?.fallbacks ?? -1,
    fallbackReasons: () => ({ ...(svc()?.fallbackReasons ?? {}) }),
    staleDropped: () => svc()?.staleDropped ?? 0,
    holds: () => {
      const sch = SimulationManager.hasInstance() ? SimulationManager.getInstance().scheduler : null;
      return { holds: sch?.holds ?? 0, episodes: sch?.holdEpisodes ?? 0, maxMs: sch?.maxHoldMs ?? 0, leadS: svc()?.warmLeadS ?? 0 };
    },
    workerBusyMs: () => svc()?.workerBusyMs ?? 0,
    resultsReceived: () => svc()?.resultsReceived ?? 0,
    warmCount: () => (SimulationManager.hasInstance() ? SimulationManager.getInstance().scheduler.warmCount : 0),
    hydratedCount: () => (SimulationManager.hasInstance() ? SimulationManager.getInstance().scheduler.registry.hydratedMemberCount : 0),
    hasWorker: () => svc()?.hasBackend ?? false,
    memberCount: () => svc()?.memberCount ?? 0,
    sinceMs: () => performance.now(),
  };
  proto.advance = function advanceTimed(this: SimulationManager, frameMs: number): void {
    const before = SimClock.runSteps();
    const t0 = performance.now();
    original.call(this, frameMs);
    const t1 = performance.now();
    const steps = SimClock.runSteps() - before;
    if (steps > 0) {
      samples.push(t1 - t0, steps);
      performance.measure('sr-sim-advance', { start: t0, end: t1 });
    }
  };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longTasks.push(e.duration);
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    // longtask unsupported; harness records n/a
  }
  window.__srPerf = {
    samples,
    longTasks,
    reset: () => {
      samples.length = 0;
      longTasks.length = 0;
      prop.serviceMs.length = 0;
    },
    prop,
    SimClock,
    TimeSkipController,
    pinMembers: (n) => {
      const reg = SimulationManager.getInstance().registry;
      const ids = reg.memberNoradIds();
      const out: number[] = [];
      const stride = Math.max(1, Math.floor(ids.length / (n * 3)));
      for (let k = 0; out.length < n && k < ids.length; k++) {
        const norad = ids[(pinCursor += stride) % ids.length];
        if (reg.pin(norad)) {
          out.push(norad);
        }
      }
      return out;
    },
    unpinInView: () => {
      const sim = SimulationManager.getInstance();
      const reg = sim.registry;
      const observers = (sim.groundStations ?? []).map((gs) => observerFromLocation(gs.state.location, gs.state.id));
      let dropped = 0;
      for (const sat of reg.tracked().slice(reg.authoredCount)) {
        if (sat instanceof OrbitalSatellite && (observers.length === 0 ? sat.isAboveHorizon : observers.some((o) => sat.isAboveHorizonFor(o)))) {
          reg.pin(sat.noradId, false);
          dropped++;
        }
      }
      return dropped;
    },
    pinQuiet: async (n, minAosS) => {
      const sim = SimulationManager.getInstance();
      const reg = sim.registry;
      const svc = sim.scheduler.service;
      const gs = sim.groundStations?.[0];
      const station = gs ? sim.scheduler.stationIndexOf(gs.state.location.latitude, gs.state.location.longitude) : -1;
      if (!svc || station < 0) {
        return 0;
      }
      const ids = reg.memberNoradIds();
      const now = getSimulatedNowMs();
      let pinnedNow = 0;
      for (let attempt = 0; attempt < 20 && pinnedNow < n; attempt++) {
        const batch: number[] = [];
        for (let k = 0; k < 300; k++) {
          batch.push(ids[(pinCursor += 7) % ids.length]);
        }
        const found = await svc.searchPasses({
          noradIds: batch,
          minEl: 0,
          startMs: now - 20 * 60e3,
          horizonMs: (minAosS + 20 * 60 + 30 * 60) * 1000,
          maxPasses: 1,
          stations: [station],
        });
        const bad = new Set(found.filter((f) => f.aosMs < now + minAosS * 1000).map((f) => f.noradId));
        for (const norad of batch) {
          if (pinnedNow < n && !bad.has(norad) && reg.pin(norad)) {
            pinnedNow++;
          }
        }
      }
      return pinnedNow;
    },
    unpinAll: () => {
      const reg = SimulationManager.getInstance().registry;
      for (const sat of reg.tracked().slice(reg.authoredCount)) {
        reg.pin(sat.noradId, false);
      }
    },
    pinnedCount: () => {
      const reg = SimulationManager.getInstance().registry;
      return reg.tracked().length - reg.authoredCount;
    },
    debugSkip: async () => {
      const sim = SimulationManager.getInstance();
      const reg = sim.registry;
      const norads = reg
        .tracked()
        .slice(reg.authoredCount)
        .map((sat) => sat.noradId);
      const stations = (sim.groundStations ?? []).map((gs) => sim.scheduler.stationIndexOf(gs.state.location.latitude, gs.state.location.longitude));
      const steps0 = SimClock.runSteps();
      await new Promise((r) => setTimeout(r, 2000));
      const out: Record<string, unknown> = {
        norads: norads.length,
        stations,
        stepsIn2s: SimClock.runSteps() - steps0,
        blocked: TimeSkipController.getInstance().getBlockedReason(),
        hidden: document.hidden,
        paused: ('hidden loading menu scenario'.split(' ') as Array<'hidden' | 'loading' | 'menu' | 'scenario'>).filter((r) => SimClock.isPaused(r)),
        speed: SimClock.speed,
      };
      const svc = sim.scheduler.service;
      if (svc && stations[0] >= 0) {
        const t0 = performance.now();
        const found = await svc.searchPasses({ noradIds: norads, minEl: 0, startMs: getSimulatedNowMs(), horizonMs: 4 * 3600e3, maxPasses: 1, stations: [stations[0]] });
        out.searchMs = performance.now() - t0;
        out.passes = found.length;
        out.firstAosInS = found.length ? (Math.min(...found.map((f) => f.aosMs)) - getSimulatedNowMs()) / 1000 : null;
      }
      return out;
    },
    mountTimeline: async () => {
      const { TimelineDeck } = await import('@app/pages/mission-control/timeline-deck');
      const host = document.createElement('div');
      host.id = 'perf-timeline-host';
      document.body.appendChild(host);
      const t0 = performance.now();
      const deck = new TimelineDeck(host.id, { horizonHours: 12, showLighting: true });
      const ctorMs = performance.now() - t0;
      const q = (sel: string) => host.querySelectorAll(sel).length;
      let fillMs: number | null = null;
      for (let waited = 0; waited < 60000; waited += 250) {
        await new Promise((r) => setTimeout(r, 250));
        if (q('.timeline-agg-cell') > 0) {
          fillMs = performance.now() - t0;
          break;
        }
      }
      const reg = SimulationManager.getInstance().registry;
      const s0 = performance.now();
      // Call the deck handler directly: a synthetic SELECTION_CHANGED would reach every other listener
      reg.pin(reg.memberNoradIds()[1], false);
      (deck as unknown as { handleSelectionChanged_(): void }).handleSelectionChanged_();
      const selectionMs = performance.now() - s0;
      const out = { ctorMs, lanes: q('.timeline-track:not(.timeline-track-group)'), groupLanes: q('.timeline-track-group'), fillMs, cells: q('.timeline-agg-cell'), selectionMs };
      deck.dispose();
      host.remove();
      return out;
    },
    timeFindTarget: () => {
      const t0 = performance.now();
      const target = TimeSkipController.getInstance().findTarget();
      return { ms: performance.now() - t0, found: target !== null };
    },
  };
}

/**
 * Dev-only entry point called by the router when NODE_ENV === 'development'.
 * Makes the scenario routable (dev campaign + SCENARIOS lookup) without listing
 * it in any menu, and installs the timing probe when `?perfN=` is present.
 */
export function registerPerfHarness(campaigns: CampaignManager): void {
  campaigns.registerDevCampaign(perfCampaignData);
  if (!SCENARIOS.includes(perfConstellationScenarioData)) {
    SCENARIOS.push(perfConstellationScenarioData);
  }
  if (new URLSearchParams(globalThis.location.search).has('perfN')) {
    installPerfProbe();
  }
}
