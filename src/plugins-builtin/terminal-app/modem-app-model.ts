/**
 * @file modem-app-model - Operator view of the EuroSat modem (Campaign 6, package G)
 * @description DOM-free. What the modem web interface can tell the operator, from the same service-model reads
 * the SkyLink app uses (`peekSample` with the `terminal-app` provenance: nothing is recorded as evidence by the
 * background feed) and from the plant action log. It exposes only what has a model behind it: registration,
 * account check, delay, rate, loss and jitter of the link, uptime and restart count, speed tests, and the modem
 * history of registration losses and recoveries (including the `link-lost` edges of an external link impairment,
 * worded without a cause). It never names a source and never invents pointing or commissioning data.
 *
 * `view()` follows the SkyLink rule: live data while the modem is reachable, the last snapshot (with its sample time)
 * while it is not, nothing before the first connection. The state (uptime marker, handled restarts, speed tests, the
 * last snapshot) is checkpointed through `PhysicalPlantService.registerTerminalApp`; the registration history itself
 * lives in the service model and is checkpointed there.
 */
import type { ServiceHistoryEntry, ServiceLayer, ServiceSample } from '@app/physical/service-types';
import type { SpeedTestRecord } from './terminal-app-model';

export type ModemLinkState = 'connected' | 'modem-unreachable' | 'no-laptop';

export type ModemHero = 'registered' | 'not-registered' | 'account-refused';

/** Narrow plant surface. `restarts` are the player modem power cycles from the plant action log. */
export interface ModemPlantReader {
  nowS(): number;
  laptopOn(): boolean;
  /** Powered, finished starting, and in run mode: the app can talk to it */
  modemReachable(): boolean;
  restarts(): Array<{ tS: number; downtimeS: number }>;
  powerDrawW(): number;
}

export interface ModemServiceReader {
  peekSample(
    serviceId: string,
    layer: ServiceLayer,
    via: 'terminal-app',
    endpointId?: string,
    metric?: ServiceSample['metric']
  ): Pick<ServiceSample, 'value' | 'tS'> & { windowS?: number };
  history(serviceId: string): ServiceHistoryEntry[];
}

export type ModemReason = 'signal-lost' | 'restart' | 'unreported' | 'registered';

export interface ModemHistoryEvent {
  tS: number;
  kind: 'lost' | 'restored';
  /** What the modem reports for the change; never a cause outside the modem */
  reason: ModemReason;
}

export interface ModemSnapshot {
  sampleTimeS: number;
  hero: ModemHero;
  uptimeS: number;
  restartCount: number;
  downMbps: number;
  upMbps: number;
  latencyMs: number | null;
  lossPct: number | null;
  /** Mean change between 1 s delay readings (rtt-jitter.ts); null = unavailable */
  jitterMs: number | null;
  powerW: number;
  /** Registration losses and recoveries, oldest first */
  history: ModemHistoryEvent[];
}

export interface ModemView {
  link: ModemLinkState;
  stale: boolean;
  ageS: number | null;
  data: ModemSnapshot | null;
}

export interface ModemAppState {
  runSinceS: number | null;
  handledRestarts: number;
  speedTests: SpeedTestRecord[];
  cached: ModemSnapshot | null;
}

export interface ModemAppModelDeps {
  plant: ModemPlantReader;
  services?: ModemServiceReader | null;
  serviceId?: string;
}

const HISTORY_SHOWN = 40;

function reasonOf(entry: ServiceHistoryEntry): ModemReason {
  if (entry.to === 'up') {
    return 'registered';
  }
  switch (entry.reason) {
    case 'link-lost':
      return 'signal-lost';
    case 'terminal-booting':
    case 'no-power':
    case 'standby':
      return 'restart';
    default:
      return 'unreported';
  }
}

function copySnapshot(s: ModemSnapshot): ModemSnapshot {
  return { ...s, history: s.history.map((h) => ({ ...h })) };
}

export class ModemAppModel {
  private runSinceS_: number | null = null;
  private handledRestarts_ = 0;
  private speedTests_: SpeedTestRecord[] = [];
  private cached_: ModemSnapshot | null = null;
  private wasReachable_ = false;

  constructor(private readonly deps_: ModemAppModelDeps) {}

  /** Advance the modem-side bookkeeping to the plant sim time. Call about once per second. */
  update(): void {
    const { plant } = this.deps_;
    const now = plant.nowS();
    const reachable = plant.modemReachable();
    if (reachable && !this.wasReachable_) {
      this.runSinceS_ = now;
    }
    if (!reachable) {
      this.runSinceS_ = null;
    }
    this.wasReachable_ = reachable;
    // A restart whose time was spent in a clock skip never showed as unreachable: take it from the action log
    const restarts = plant.restarts();
    if (restarts.length > this.handledRestarts_) {
      const last = restarts[restarts.length - 1];
      this.handledRestarts_ = restarts.length;
      if (reachable) {
        this.runSinceS_ = Math.max(this.runSinceS_ ?? 0, last.tS + last.downtimeS);
      }
    }
  }

  view(): ModemView {
    const now = this.deps_.plant.nowS();
    const link = this.link_();
    if (link === 'connected') {
      this.cached_ = this.snapshot_(now);

      return { link, stale: false, ageS: 0, data: this.cached_ };
    }
    if (link === 'no-laptop' || !this.cached_) {
      return { link, stale: false, ageS: null, data: null };
    }

    return { link, stale: true, ageS: Math.max(0, now - this.cached_.sampleTimeS), data: this.cached_ };
  }

  recordSpeedTest(record: SpeedTestRecord): void {
    this.speedTests_.push({ ...record });
    if (this.speedTests_.length > 10) {
      this.speedTests_ = this.speedTests_.slice(-10);
    }
  }

  speedTests(): readonly SpeedTestRecord[] {
    return this.speedTests_;
  }

  serviceId(): string | null {
    return this.deps_.serviceId ?? null;
  }

  nowS(): number {
    return this.deps_.plant.nowS();
  }

  getState(): ModemAppState {
    return {
      runSinceS: this.runSinceS_,
      handledRestarts: this.handledRestarts_,
      speedTests: this.speedTests_.map((r) => ({ ...r })),
      cached: this.cached_ ? copySnapshot(this.cached_) : null,
    };
  }

  restoreState(state: ModemAppState): void {
    this.runSinceS_ = state.runSinceS;
    this.handledRestarts_ = state.handledRestarts;
    this.speedTests_ = state.speedTests.map((r) => ({ ...r }));
    this.cached_ = state.cached ? copySnapshot(state.cached) : null;
    this.wasReachable_ = this.deps_.plant.modemReachable();
  }

  private link_(): ModemLinkState {
    if (!this.deps_.plant.laptopOn()) {
      return 'no-laptop';
    }

    return this.deps_.plant.modemReachable() ? 'connected' : 'modem-unreachable';
  }

  private snapshot_(now: number): ModemSnapshot {
    const { plant, services, serviceId } = this.deps_;
    let registered = false;
    let accountOk = true;
    let down = 0;
    let up = 0;
    let latency: number | null = null;
    let loss: number | null = null;
    let jitter: number | null = null;
    const events: ModemHistoryEvent[] = [];
    if (services && serviceId) {
      const num = (metric: ServiceSample['metric']): number | null => {
        const v = services.peekSample(serviceId, 'registration', 'terminal-app', undefined, metric).value;

        return typeof v === 'number' ? v : null;
      };
      registered = services.peekSample(serviceId, 'registration', 'terminal-app').value === 'up';
      accountOk = services.peekSample(serviceId, 'account', 'terminal-app').value !== 'down';
      if (registered) {
        down = num('downMbps') ?? 0;
        up = num('upMbps') ?? 0;
        latency = num('rttMs');
        loss = num('lossPct');
        jitter = num('jitterMs');
      }
      for (const h of services.history(serviceId)) {
        if (h.layer === 'registration' && (h.to === 'down' || h.to === 'up')) {
          events.push({ tS: h.tS, kind: h.to === 'down' ? 'lost' : 'restored', reason: reasonOf(h) });
        }
      }
    }

    return {
      sampleTimeS: now,
      hero: !registered ? 'not-registered' : accountOk ? 'registered' : 'account-refused',
      uptimeS: this.runSinceS_ === null ? 0 : Math.max(0, now - this.runSinceS_),
      restartCount: plant.restarts().length,
      downMbps: down,
      upMbps: up,
      latencyMs: latency,
      lossPct: loss,
      jitterMs: jitter,
      powerW: plant.powerDrawW(),
      history: events.slice(-HISTORY_SHOWN),
    };
  }
}

/** The slice of the plant manager the reader needs (structural, so tests need no plant) */
export interface ModemPlantSurface {
  getTimeSeconds(): number;
  isPartPowered(id: string): boolean;
  getPartState(id: string): { powered: boolean; rebooting: boolean; mode?: string; starting?: boolean } | null;
  getLoadW(id: string): number;
  getLog(): Array<{ tSeconds: number; verb: string; target?: string; downtimeSeconds: number }>;
}

export const MODEM_PART_ID = 'vsat-modem';

export function plantModemReader(plant: ModemPlantSurface, modemId = MODEM_PART_ID, laptopId = 'laptop'): ModemPlantReader {
  return {
    nowS: () => plant.getTimeSeconds(),
    laptopOn: () => plant.isPartPowered(laptopId),
    modemReachable: () => {
      const s = plant.getPartState(modemId);

      return !!s && s.powered && !s.rebooting && !s.starting && (s.mode === undefined || s.mode === 'run');
    },
    restarts: () =>
      plant
        .getLog()
        .filter((e) => e.verb === 'powerCycle' && e.target === modemId)
        .map((e) => ({ tS: e.tSeconds, downtimeS: e.downtimeSeconds })),
    powerDrawW: () => plant.getLoadW(modemId),
  };
}
