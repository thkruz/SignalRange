/**
 * @file terminal-app-model - Vendor-neutral consumer-app view of a terminal (phase 40, WP2)
 * @description Turns plant, service-model and phased-array facts into what a consumer app would
 * report: hero status, alerts, uptime, boot count, current speeds, outage history with vague
 * cause labels (terminal-labels.ts) and rolling statistics. It never exposes the injected truth:
 * numbers come from `peekSample(..., 'terminal-app')` (no evidence recorded; WP7 records player views), labels from what the dish could observe.
 *
 * The dish records history itself, so `update()` records whether or not the laptop can reach the
 * dish. `view()` is what the app shows: live data when the link is connected, the last snapshot
 * (keeping its sample sim time) when the dish is unreachable, nothing when there is no router.
 * History survives reboots (D15). Core stays DOM-free.
 */

import type { SkylinkStatus } from '@app/physical/physical-plant-types';
import type { ServiceLayer, ServiceSample } from '@app/physical/service-types';
import type { PhasedArrayReadModel } from '../phased-array/phased-array-core';
import type { ObstructionAccumulator, ObstructionState } from './obstruction-map';
import { alertText, type CauseLabelKey, causeLabelFor, heroText, networkMessage, type OutageObservation, type TerminalAlertId, type TerminalHero } from './terminal-labels';
import type { TerminalLink, TerminalLinkState } from './terminal-link';
import type { TerminalSkin } from './terminal-skin';

/** Narrow plant surface. `dishStatus` is `PhysicalPlantManager.skylinkStatus`. */
export interface TerminalPlantReader {
  nowS(): number;
  dishStatus(): SkylinkStatus;
  powerDrawW(): number;
  /** GNSS state of the terminal (E5). Absent: the model reports a valid location. */
  gnss?(): TerminalGnss;
}

/** What the terminal knows about its position fix */
export interface TerminalGnss {
  locationValid: boolean;
  satellites: number;
}

/** The part of `ServiceModel` the app uses. Never `layers()`, which is truth. */
export interface TerminalServiceReader {
  peekSample(serviceId: string, layer: ServiceLayer, via: 'terminal-app', endpointId?: string, metric?: ServiceSample['metric']): Pick<ServiceSample, 'value' | 'tS'>;
}

export type TerminalPhasedArraySlice = Pick<PhasedArrayReadModel, 'inOutage' | 'lastLinkDrop'> & Partial<Pick<PhasedArrayReadModel, 'panel' | 'beam'>>;

export interface TerminalAppModelDeps {
  skin: TerminalSkin;
  plant: TerminalPlantReader;
  link: TerminalLink;
  /** Absent: no numbers (speeds read 0 / null) and no account check */
  services?: TerminalServiceReader | null;
  serviceId?: string;
  /** Absent for non-array terminals */
  phasedArray?: () => TerminalPhasedArraySlice | null;
  /**
   * Fraction of the sky the dish has found blocked, 0..1 (WP5 accumulator). Absent, or null
   * while there is no data: the Advanced screen shows 'Not available'.
   */
  obstructionFraction?: () => number | null;
  /** E4 sky map (WP5). Updated with the model; its state rides in `getState` (D15) */
  obstruction?: ObstructionAccumulator | null;
  /** Uptime already accumulated at model creation, seconds */
  initialUptimeS?: number;
}

export interface OutageEntry {
  startS: number;
  durationS: number;
  causeLabel: string;
  labelKey: CauseLabelKey;
  /** True while the outage is still going; durationS is the time so far */
  ongoing?: boolean;
}

export type StatsWindowId = '15m' | '6h' | '12h';

export const STATS_WINDOWS: Record<StatsWindowId, { windowS: number; buckets: number }> = {
  '15m': { windowS: 15 * 60, buckets: 30 },
  '6h': { windowS: 6 * 3600, buckets: 72 },
  '12h': { windowS: 12 * 3600, buckets: 72 },
};

export interface StatsPoint {
  /** Bucket start, sim seconds */
  tS: number;
  /** Null: no samples in this bucket */
  downMbps: number | null;
  upMbps: number | null;
  latencyMs: number | null;
  pingDropPct: number | null;
}

export interface StatsSeries {
  windowS: number;
  bucketS: number;
  points: StatsPoint[];
  outages: OutageEntry[];
}

export interface TerminalSnapshot {
  /** Sim time this snapshot was taken (what "Last updated" counts from) */
  sampleTimeS: number;
  hero: TerminalHero;
  heroText: string;
  /** Extra generic line, e.g. the network message on a refused terminal */
  message: string | null;
  alerts: Array<{ id: TerminalAlertId; text: string }>;
  uptimeS: number;
  bootCount: number;
  downMbps: number;
  upMbps: number;
  latencyMs: number | null;
  powerW: number;
  outages: OutageEntry[];
  stats: Record<StatsWindowId, StatsSeries>;
  /** Support fields for the Advanced screen. Never names a cause (D5). */
  debug: TerminalDebugData;
}

export interface TerminalDebugData {
  softwareVersion: string;
  locationValid: boolean;
  gnssSatellites: number;
  /** Fixed panel tilt from vertical-up, degrees; null for terminals without an array */
  tiltDeg: number | null;
  /** Fixed panel boresight azimuth, degrees; null for terminals without an array */
  boresightDeg: number | null;
  /** 0..1, or null when the app cannot tell */
  obstructionFraction: number | null;
}

export interface TerminalView {
  link: TerminalLinkState;
  /** True when `data` is an older snapshot because the dish cannot be reached */
  stale: boolean;
  /** Sim seconds since the snapshot was taken; null with no data */
  ageS: number | null;
  /** Null: no router, or never connected */
  data: TerminalSnapshot | null;
}

interface StatSample {
  tS: number;
  downMbps: number;
  upMbps: number;
  latencyMs: number | null;
  pingDropPct: number;
}

interface OpenOutage {
  startS: number;
  key: CauseLabelKey;
}

interface Observation {
  hero: TerminalHero;
  alerts: TerminalAlertId[];
  /** Null: service is up (possibly degraded) */
  outage: OutageObservation | null;
}

/** One speed test the player ran, as the app shows it (WP4) */
export interface SpeedTestRecord {
  /** Sim time the test finished */
  tS: number;
  downMbps: number;
  upMbps: number;
  latencyMs: number;
  /** What a consumer app can tell: the test never names the true cause */
  limit: 'skylink' | 'local-network';
}

export interface TerminalAppState {
  speedTests?: SpeedTestRecord[];
  bootCount: number;
  uptimeStartS: number | null;
  outages: OutageEntry[];
  open: OpenOutage | null;
  samples: StatSample[];
  lastDropAtMs: number | null;
  obstruction?: ObstructionState;
}

const DEFAULT_GNSS_SATELLITES = 12;
const RETENTION_S = 12 * 3600;
const OUTAGE_CAP = 500;
const MAX_FILL_STEPS = 1500;

const DARK_STATUSES: readonly SkylinkStatus[] = ['no-power', 'thermal-shutdown', 'booting'];

export class TerminalAppModel {
  private readonly deps_: TerminalAppModelDeps;
  private bootCount_ = 1;
  private uptimeStartS_: number | null = null;
  private outages_: OutageEntry[] = [];
  private open_: OpenOutage | null = null;
  private samples_: StatSample[] = [];
  private manualOutages_: Array<{ startS: number; endS: number }> = [];
  private lastTickS_: number | null = null;
  private lastSampleS_ = 0;
  private outageSinceSampleS_ = 0;
  private prevStatus_: SkylinkStatus | null = null;
  private lastDropAtMs_: number | null = null;
  private accountDown_ = false;
  private registrationDown_ = false;
  private current_ = { downMbps: 0, upMbps: 0, latencyMs: null as number | null };
  private lastObs_: Observation = { hero: 'online', alerts: [], outage: null };
  private cached_: TerminalSnapshot | null = null;
  private speedTests_: SpeedTestRecord[] = [];

  constructor(deps: TerminalAppModelDeps) {
    this.deps_ = deps;
  }

  /** Advance the dish-side recording to the plant's current sim time. Call about once per second. */
  update(): void {
    const { plant, skin } = this.deps_;
    const now = plant.nowS();
    this.deps_.obstruction?.update();
    if (this.lastTickS_ === null) {
      this.lastTickS_ = now;
      this.lastSampleS_ = now;
      this.uptimeStartS_ = now - (this.deps_.initialUptimeS ?? 0);
    }
    const dt = Math.max(0, now - this.lastTickS_);
    const status = plant.dishStatus();

    this.countBoots_(status, now);
    const obs = this.observe_(status);
    if (obs.outage !== null) {
      this.outageSinceSampleS_ += dt;
    }
    this.trackOutage_(obs, now);
    this.recordHandoverDrop_(obs, now);
    this.lastObs_ = obs;
    this.sampleLoop_(now, skin.sampleIntervalS);
    this.lastTickS_ = now;
    this.prevStatus_ = status;
  }

  /**
   * A reboot the player ordered whose time was spent in a clock skip, so `update()` never saw the
   * dish booting. Records the outage (labelled Booting), bumps the boot count and resets uptime.
   */
  noteReboot(startS: number, durationS: number): void {
    this.bootCount_ += 1;
    this.uptimeStartS_ = startS + durationS;
    this.manualOutages_.push({ startS, endS: startS + durationS });
    this.pushOutage_({ startS, durationS, ...this.entryLabel_('booting') });
  }

  /** What the app shows right now */
  view(): TerminalView {
    const link = this.deps_.link.state();
    const now = this.deps_.plant.nowS();
    if (link === 'connected') {
      this.cached_ = this.buildSnapshot_(now);

      return { link, stale: false, ageS: 0, data: this.cached_ };
    }
    if (link === 'no-router' || !this.cached_) {
      return { link, stale: false, ageS: null, data: null };
    }

    return { link, stale: true, ageS: Math.max(0, now - this.cached_.sampleTimeS), data: this.cached_ };
  }

  /** Statistics for one window, from the dish-side record (ignores link state; use view() for the app) */
  stats(window: StatsWindowId): StatsSeries {
    return this.buildStats_(window, this.deps_.plant.nowS());
  }

  /** Keep a finished speed test (newest last, at most 10). Survives reboots like the other history (D15). */
  recordSpeedTest(record: SpeedTestRecord): void {
    this.speedTests_.push({ ...record });
    if (this.speedTests_.length > 10) {
      this.speedTests_ = this.speedTests_.slice(-10);
    }
  }

  speedTests(): readonly SpeedTestRecord[] {
    return this.speedTests_;
  }

  /** The service path this terminal belongs to, for jobs run through the workload runner */
  serviceId(): string | null {
    return this.deps_.serviceId ?? null;
  }

  getState(): TerminalAppState {
    return {
      speedTests: this.speedTests_.map((r) => ({ ...r })),
      bootCount: this.bootCount_,
      uptimeStartS: this.uptimeStartS_,
      outages: this.outages_.map((o) => ({ ...o })),
      open: this.open_ ? { ...this.open_ } : null,
      samples: this.samples_.map((s) => ({ ...s })),
      lastDropAtMs: this.lastDropAtMs_,
      ...(this.deps_.obstruction ? { obstruction: this.deps_.obstruction.getState() } : {}),
    };
  }

  /** The sky map accumulator, or null when this terminal has none */
  obstructions(): ObstructionAccumulator | null {
    return this.deps_.obstruction ?? null;
  }

  restoreState(state: TerminalAppState): void {
    this.speedTests_ = (state.speedTests ?? []).map((r) => ({ ...r }));
    this.bootCount_ = state.bootCount;
    this.uptimeStartS_ = state.uptimeStartS;
    this.outages_ = state.outages.map((o) => ({ ...o }));
    this.open_ = state.open ? { ...state.open } : null;
    this.samples_ = state.samples.map((s) => ({ ...s }));
    this.lastDropAtMs_ = state.lastDropAtMs;
    if (state.obstruction) {
      this.deps_.obstruction?.restoreState(state.obstruction);
    }
    this.lastTickS_ = null;
  }

  // ---------------------------------------------------------------- observe

  private observe_(status: SkylinkStatus): Observation {
    switch (status) {
      case 'no-power':
        return { hero: 'offline', alerts: [], outage: 'power-loss' };
      case 'booting':
        return { hero: 'booting', alerts: [], outage: 'booting' };
      case 'thermal-shutdown':
        return { hero: 'offline', alerts: ['thermal-shutdown'], outage: 'thermal-shutdown' };
      case 'obstructed':
        return { hero: 'searching', alerts: ['obstructed'], outage: 'obstructed' };
      case 'searching':
        return { hero: 'searching', alerts: [], outage: 'searching' };
      case 'no-location':
        return { hero: 'searching', alerts: [], outage: 'no-location' };
      case 'sleeping':
        return { hero: 'sleeping', alerts: [], outage: null };
      case 'thermal-throttle':
        return this.whileUp_('thermal-throttle');
      case 'heating':
        return this.whileUp_('heating');
      default:
        return this.whileUp_(null);
    }
  }

  /** Dish says it is fine: the phased array and the network can still say otherwise */
  private whileUp_(alert: TerminalAlertId | null): Observation {
    const alerts: TerminalAlertId[] = alert ? [alert] : [];
    if (this.deps_.phasedArray?.()?.inOutage) {
      return { hero: 'searching', alerts, outage: 'handover' };
    }
    if (this.accountDown_) {
      return { hero: 'offline', alerts, outage: 'network' };
    }
    if (this.registrationDown_) {
      return { hero: 'searching', alerts, outage: 'registration' };
    }

    return { hero: 'online', alerts, outage: null };
  }

  // ------------------------------------------------------------ boot/uptime

  private countBoots_(status: SkylinkStatus, now: number): void {
    const prev = this.prevStatus_;
    if (prev === null) {
      if (DARK_STATUSES.includes(status)) {
        this.uptimeStartS_ = null;
      }

      return;
    }
    const wasDark = DARK_STATUSES.includes(prev);
    const isDark = DARK_STATUSES.includes(status);
    // A boot starts when the dish enters 'booting', or comes back from dark without a visible boot phase
    if ((status === 'booting' && prev !== 'booting') || (wasDark && prev !== 'booting' && !isDark)) {
      this.bootCount_ += 1;
    }
    if (isDark) {
      this.uptimeStartS_ = null;
    } else if (wasDark || this.uptimeStartS_ === null) {
      this.uptimeStartS_ = now;
    }
  }

  // ---------------------------------------------------------------- outages

  private entryLabel_(obs: OutageObservation): { causeLabel: string; labelKey: CauseLabelKey } {
    const label = causeLabelFor(obs);

    return { causeLabel: label.text, labelKey: label.key };
  }

  private trackOutage_(obs: Observation, now: number): void {
    const key = obs.outage ? causeLabelFor(obs.outage).key : null;
    if (this.open_ && key !== this.open_.key) {
      const label = this.open_.key;
      this.pushOutage_({
        startS: this.open_.startS,
        durationS: Math.max(0, now - this.open_.startS),
        causeLabel: causeLabelFor(this.observationOfKey_(label)).text,
        labelKey: label,
      });
      this.open_ = null;
    }
    if (key && !this.open_) {
      this.open_ = { startS: now, key };
    }
  }

  /** Any observation that maps to this label key (used to rebuild text from a stored key) */
  private observationOfKey_(key: CauseLabelKey): OutageObservation {
    const byKey: Record<CauseLabelKey, OutageObservation> = {
      obstructed: 'obstructed',
      searching: 'searching',
      booting: 'booting',
      'thermal-shutdown': 'thermal-shutdown',
      offline: 'network',
    };

    return byKey[key];
  }

  private pushOutage_(entry: OutageEntry): void {
    this.outages_.push(entry);
    if (this.outages_.length > OUTAGE_CAP) {
      this.outages_ = this.outages_.slice(-OUTAGE_CAP);
    }
  }

  /** Short beam handovers fall between 1 Hz polls, so also log each new link drop the scheduler reports */
  private recordHandoverDrop_(obs: Observation, now: number): void {
    const drop = this.deps_.phasedArray?.()?.lastLinkDrop;
    if (!drop || drop.atMs === this.lastDropAtMs_) {
      return;
    }
    const first = this.lastDropAtMs_ === null;
    this.lastDropAtMs_ = drop.atMs;
    // The first read only establishes the baseline; a drop already inside an outage adds nothing
    if (first || obs.outage !== null) {
      return;
    }
    this.pushOutage_({ startS: now, durationS: this.deps_.skin.handoverDropS, ...this.entryLabel_('handover') });
    this.outageSinceSampleS_ += this.deps_.skin.handoverDropS;
  }

  // ---------------------------------------------------------------- samples

  private sampleLoop_(now: number, interval: number): void {
    if (now - this.lastSampleS_ < interval) {
      return;
    }
    this.refreshService_();
    const obs = this.lastObs_;
    const live = obs.outage === null ? this.takeNumbers_() : { downMbps: 0, upMbps: 0, latencyMs: null as number | null };
    this.current_ = live;
    let steps = 0;
    let t = this.lastSampleS_ + interval;
    // After a clock skip, fill each missed interval with the current state
    if (now - t > interval * MAX_FILL_STEPS) {
      t = now - interval * MAX_FILL_STEPS;
    }
    for (; t <= now && steps < MAX_FILL_STEPS; t += interval, steps++) {
      const manual = this.manualOutages_.some((m) => t > m.startS && t <= m.endS);
      const lastStep = t + interval > now;
      const down = manual || (lastStep && obs.outage !== null);
      const dropFraction = lastStep ? Math.min(1, this.outageSinceSampleS_ / Math.max(interval, now - this.lastSampleS_)) : 0;
      const dropPct = down ? 100 : Math.max(dropFraction * 100, lastStep ? (this.lossPct_ ?? 0) : 0);
      this.samples_.push({
        tS: t,
        downMbps: down ? 0 : live.downMbps,
        upMbps: down ? 0 : live.upMbps,
        latencyMs: down ? null : live.latencyMs,
        pingDropPct: Math.min(100, Math.round(dropPct * 10) / 10),
      });
      this.lastSampleS_ = t;
    }
    this.outageSinceSampleS_ = 0;
    this.manualOutages_ = this.manualOutages_.filter((m) => m.endS > now - RETENTION_S);
    const cutoff = now - RETENTION_S;
    if (this.samples_.length > 0 && this.samples_[0].tS < cutoff) {
      this.samples_ = this.samples_.filter((s) => s.tS >= cutoff);
    }
  }

  private lossPct_: number | null = null;

  /** Account / registration checks, only at sample cadence (peekSample records nothing) */
  private refreshService_(): void {
    const { services, serviceId } = this.deps_;
    if (!services || !serviceId) {
      return;
    }
    this.accountDown_ = services.peekSample(serviceId, 'account', 'terminal-app').value === 'down';
    this.registrationDown_ = services.peekSample(serviceId, 'registration', 'terminal-app').value === 'down';
  }

  private takeNumbers_(): { downMbps: number; upMbps: number; latencyMs: number | null } {
    const { services, serviceId } = this.deps_;
    this.lossPct_ = null;
    if (!services || !serviceId) {
      return { downMbps: 0, upMbps: 0, latencyMs: null };
    }
    const num = (metric: ServiceSample['metric']): number | null => {
      const v = services.peekSample(serviceId, 'registration', 'terminal-app', undefined, metric).value;

      return typeof v === 'number' ? v : null;
    };
    const down = num('downMbps');
    const up = num('upMbps');
    const rtt = num('rttMs');
    this.lossPct_ = num('lossPct');

    return { downMbps: down ?? 0, upMbps: up ?? 0, latencyMs: down === null ? null : rtt };
  }

  // -------------------------------------------------------------- snapshots

  private currentOutages_(now: number): OutageEntry[] {
    const list = this.outages_.map((o) => ({ ...o }));
    if (this.open_) {
      list.push({
        startS: this.open_.startS,
        durationS: Math.max(0, now - this.open_.startS),
        causeLabel: causeLabelFor(this.observationOfKey_(this.open_.key)).text,
        labelKey: this.open_.key,
        ongoing: true,
      });
    }

    return list;
  }

  private buildStats_(window: StatsWindowId, now: number): StatsSeries {
    const { windowS, buckets } = STATS_WINDOWS[window];
    const bucketS = windowS / buckets;
    const start = now - windowS;
    const sums = Array.from({ length: buckets }, () => ({ n: 0, down: 0, up: 0, lat: 0, latN: 0, drop: 0 }));
    for (const s of this.samples_) {
      if (s.tS < start || s.tS > now) {
        continue;
      }
      const b = sums[Math.min(buckets - 1, Math.floor((s.tS - start) / bucketS))];
      b.n += 1;
      b.down += s.downMbps;
      b.up += s.upMbps;
      b.drop += s.pingDropPct;
      if (s.latencyMs !== null) {
        b.lat += s.latencyMs;
        b.latN += 1;
      }
    }
    const points: StatsPoint[] = sums.map((b, i) => ({
      tS: start + i * bucketS,
      downMbps: b.n ? b.down / b.n : null,
      upMbps: b.n ? b.up / b.n : null,
      latencyMs: b.latN ? b.lat / b.latN : null,
      pingDropPct: b.n ? b.drop / b.n : null,
    }));
    const outages = this.currentOutages_(now).filter((o) => o.startS + o.durationS >= start);

    return { windowS, bucketS, points, outages };
  }

  private buildSnapshot_(now: number): TerminalSnapshot {
    const obs = this.lastObs_;
    const uptime = this.uptimeStartS_ === null ? 0 : Math.max(0, now - this.uptimeStartS_);

    return {
      sampleTimeS: now,
      hero: obs.hero,
      heroText: heroText(obs.hero),
      message: obs.outage === 'network' ? networkMessage() : null,
      alerts: obs.alerts.map((id) => ({ id, text: alertText(id) })),
      uptimeS: uptime,
      bootCount: this.bootCount_,
      downMbps: obs.outage === null ? this.current_.downMbps : 0,
      upMbps: obs.outage === null ? this.current_.upMbps : 0,
      latencyMs: obs.outage === null ? this.current_.latencyMs : null,
      powerW: this.deps_.plant.powerDrawW(),
      outages: this.currentOutages_(now),
      stats: { '15m': this.buildStats_('15m', now), '6h': this.buildStats_('6h', now), '12h': this.buildStats_('12h', now) },
      debug: this.buildDebug_(),
    };
  }

  private buildDebug_(): TerminalDebugData {
    const gnss = this.deps_.plant.gnss?.() ?? { locationValid: true, satellites: DEFAULT_GNSS_SATELLITES };
    const panel = this.deps_.phasedArray?.()?.panel ?? null;
    const fraction = this.deps_.obstructionFraction?.() ?? null;

    return {
      softwareVersion: this.deps_.skin.softwareVersion,
      locationValid: gnss.locationValid,
      gnssSatellites: gnss.locationValid ? gnss.satellites : 0,
      tiltDeg: panel ? panel.tiltDeg : null,
      boresightDeg: panel ? panel.azDeg : null,
      obstructionFraction: fraction === null ? null : Math.min(1, Math.max(0, fraction)),
    };
  }
}

/** Adapt the plant manager to the model's reader (structural; `getLoadW` is the dish draw) */
export function plantTerminalReader(
  plant: { getTimeSeconds(): number; skylinkStatus(): SkylinkStatus; getLoadW(partId: string): number; getGnssState?(): TerminalGnss },
  dishId = 'skylink-dish'
): TerminalPlantReader {
  return {
    nowS: () => plant.getTimeSeconds(),
    dishStatus: () => plant.skylinkStatus(),
    powerDrawW: () => plant.getLoadW(dishId),
    gnss: plant.getGnssState ? () => plant.getGnssState?.() as TerminalGnss : undefined,
  };
}
