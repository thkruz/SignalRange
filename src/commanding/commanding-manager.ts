/**
 * @file CommandingManager - LEO uplink ops + command-link key ops (nats-eu M2/M5)
 * @description Models the TT&C command link to a LEO bird during a pass: uplink
 * Doppler compensation, a small command queue whose entries ACK only inside a
 * valid command window with compensation engaged and a valid key, plus the
 * COMSEC key lifecycle (scheduled rotation, emergency zeroize). A command that
 * is sent without Doppler comp, out of window, or on an invalid/zeroized key is
 * rejected - which is exactly the failure the S3/S4/S21 scenarios teach.
 *
 * Started only when settings.commanding is present. Time-of-send is taken from
 * the mission clock in-app; tests pass an explicit elapsed value for
 * determinism. No other simulation coupling, so it is unit-testable in isolation.
 */

import { OrbitalSatellite, observerFromLocation } from '@app/equipment/satellite/orbital-satellite';
import { InterferenceManager } from '@app/interference/interference-manager';
import { ScenarioManager } from '@app/scenario-manager';
import { missionNowMs } from '@app/simulation/mission-clock';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { TransecManager } from '@app/transec/transec-manager';

export type CommandKeyStatus = 'Valid' | 'Pending Rotation' | 'Zeroized';
export type CommandStatus = 'pending' | 'acked' | 'rejected';
export type CommandRejectReason = 'no-doppler-comp' | 'key-invalid' | 'out-of-window' | 'uplink-jammed';

/** Guard either side of the command carrier that an interferer must reach to deny it (Hz) */
export const UPLINK_JAM_GUARD_HZ = 500e3;

/** settings.commanding */
export interface CommandingConfig {
  /** Ground station mounting the command uplink (for display) */
  groundStationId?: string;
  /** Target satellite being commanded (for display) */
  targetNoradId?: number;
  /** Command window opens at this elapsed second (omit = open from t0) */
  windowStartS?: number;
  /** Command window closes at this elapsed second (omit = never closes) */
  windowEndS?: number;
  /** Require a Valid key for a command to ACK (default true) */
  requireValidKey?: boolean;
  /** Require uplink Doppler compensation for a command to ACK (default true) */
  requireDopplerComp?: boolean;
  /** Canned TT&C commands the console offers as one-click sends */
  commands?: Array<{ id: string; label?: string }>;
  /**
   * Command carrier RF (Hz). With it set, a scripted transponder-path
   * interference event on the target bird that overlaps this frequency denies
   * the fixed-mode carrier: commands are rejected 'uplink-jammed' until the
   * TRANSEC waveform is hopping with sync locked (nats-eu M7). Omit it and
   * jamming never touches commanding.
   */
  uplinkFrequencyHz?: number;
  /**
   * Phase 18 E: ranging. A RANGE tone through the command path records the
   * true slant range to the target; requiredMeasurements make an OD solution.
   */
  ranging?: { requiredMeasurements: number; toneId?: string };
}

/** One ranging measurement (phase 18 E) */
export interface RangingMeasurement {
  /** Mission elapsed second the tone returned */
  elapsedS: number;
  rangeKm: number;
}

interface CommandRecord {
  id: string;
  status: CommandStatus;
  reason?: CommandRejectReason;
  /** Ranging tone only: the slant range the tone measured, km */
  rangeKm?: number;
  /** Mission elapsed second the record was resolved at */
  elapsedS?: number;
}

interface CommandingState {
  dopplerCompEnabled: boolean;
  keyStatus: CommandKeyStatus;
  keyRotationCompleted: boolean;
  zeroized: boolean;
  commands: CommandRecord[];
  rangingMeasurements: RangingMeasurement[];
}

export class CommandingManager {
  private static instance_: CommandingManager | null = null;

  private readonly config_: CommandingConfig;
  private readonly missionStartTime_ = missionNowMs();
  private readonly state_: CommandingState = {
    dopplerCompEnabled: false,
    keyStatus: 'Valid',
    keyRotationCompleted: false,
    zeroized: false,
    commands: [],
    rangingMeasurements: [],
  };

  private constructor() {
    this.config_ = (ScenarioManager.getInstance().settings.commanding as CommandingConfig | undefined) ?? {};
  }

  static getInstance(): CommandingManager {
    this.instance_ ??= new CommandingManager();

    return this.instance_;
  }

  static isInitialized(): boolean {
    return this.instance_ !== null;
  }

  static destroy(): void {
    this.instance_ = null;
  }

  get state(): Readonly<CommandingState> {
    return this.state_;
  }

  getConfig(): CommandingConfig {
    return this.config_;
  }

  /**
   * Whether the command window is open. `atElapsedS` overrides the mission
   * clock (used by tests); omit in-app to use the real elapsed time.
   */
  isWindowOpen(atElapsedS?: number): boolean {
    const elapsed = atElapsedS ?? (missionNowMs() - this.missionStartTime_) / 1000;

    return this.isWithinWindow_(elapsed);
  }

  /** Engage / disengage uplink Doppler compensation on the command carrier. */
  setDopplerComp(enabled: boolean): void {
    this.state_.dopplerCompEnabled = enabled;
  }

  /** Begin a scheduled key rotation (key becomes Pending Rotation until completed). */
  beginKeyRotation(): void {
    if (this.state_.zeroized) {
      return;
    }
    this.state_.keyStatus = 'Pending Rotation';
  }

  /** Complete the scheduled key rotation (key returns to Valid). */
  completeKeyRotation(): void {
    if (this.state_.zeroized) {
      return;
    }
    this.state_.keyStatus = 'Valid';
    this.state_.keyRotationCompleted = true;
  }

  /** Emergency key destruction - all subsequent commands are rejected until re-keyed. */
  zeroizeKey(): void {
    this.state_.zeroized = true;
    this.state_.keyStatus = 'Zeroized';
  }

  /**
   * Send a TT&C command. Returns the resolved record. `atElapsedS` overrides the
   * mission clock for the window check (used by tests); omit in-app to use the
   * real elapsed time.
   */
  sendCommand(id: string, atElapsedS?: number): CommandRecord {
    const elapsed = atElapsedS ?? (missionNowMs() - this.missionStartTime_) / 1000;
    const record: CommandRecord = { id, status: 'pending', elapsedS: elapsed };

    if ((this.config_.requireDopplerComp ?? true) && !this.state_.dopplerCompEnabled) {
      record.status = 'rejected';
      record.reason = 'no-doppler-comp';
    } else if ((this.config_.requireValidKey ?? true) && this.state_.keyStatus !== 'Valid') {
      record.status = 'rejected';
      record.reason = 'key-invalid';
    } else if (!this.isWithinWindow_(elapsed)) {
      record.status = 'rejected';
      record.reason = 'out-of-window';
    } else if (this.isUplinkJammed()) {
      record.status = 'rejected';
      record.reason = 'uplink-jammed';
    } else {
      record.status = 'acked';
    }

    this.state_.commands.push(record);

    return record;
  }

  /**
   * Whether the command carrier is currently denied by interference: a
   * transponder-path event on the target bird, in its envelope, overlapping
   * `uplinkFrequencyHz` - and no TRANSEC hop-sync to ride over it. A jammer
   * cannot follow a keyed hop set, so a synced hopping waveform is never
   * jammed here.
   */
  isUplinkJammed(): boolean {
    const uplinkHz = this.config_.uplinkFrequencyHz;
    const target = this.config_.targetNoradId;
    if (uplinkHz === undefined || target === undefined || !InterferenceManager.isInitialized()) return false;
    if (TransecManager.isInitialized() && TransecManager.getInstance().isSyncLocked()) return false;

    const interference = InterferenceManager.getInstance();

    return interference.getEvents().some((event) => {
      if ((event.path ?? 'transponder') !== 'transponder' || event.satelliteNoradId !== target) return false;
      if (Math.abs(event.frequency - uplinkHz) > event.bandwidth / 2 + UPLINK_JAM_GUARD_HZ) return false;

      return interference.isEventInEnvelope(event.id);
    });
  }

  /**
   * Send a ranging tone through the command path (phase 18 E). Subject to the
   * same gates as a command (Doppler, key, window, jamming); when it ACKs the
   * true slant range from the station to the target is recorded.
   */
  sendRangingTone(atElapsedS?: number): CommandRecord {
    const toneId = this.config_.ranging?.toneId ?? 'RANGE';
    const record = this.sendCommand(toneId, atElapsedS);
    if (record.status !== 'acked') return record;

    const rangeKm = this.measureRangeKm_();
    if (rangeKm !== null) {
      const elapsed = atElapsedS ?? (missionNowMs() - this.missionStartTime_) / 1000;
      this.state_.rangingMeasurements.push({ elapsedS: elapsed, rangeKm });
      record.rangeKm = rangeKm;
    }

    return record;
  }

  /** Enough ranging measurements for an orbit-determination solution. */
  isRangingSolutionReady(): boolean {
    const required = this.config_.ranging?.requiredMeasurements ?? 1;

    return this.state_.rangingMeasurements.length >= required;
  }

  /** Slant range from the command station to the target right now, km (null when unknown). */
  private measureRangeKm_(): number | null {
    if (this.config_.targetNoradId === undefined || !SimulationManager.hasInstance()) return null;
    const sim = SimulationManager.getInstance();
    const sat = sim.getSatByNoradId(this.config_.targetNoradId);
    if (!sat) return null;
    const gs = sim.groundStations.find((g) => g.state.id === this.config_.groundStationId) ?? sim.groundStations[0];
    if (sat instanceof OrbitalSatellite && gs) {
      return sat.geometryFor(observerFromLocation(gs.state.location)).rangeKm;
    }
    const rangeKm = (sat as { rangeKm?: number }).rangeKm;

    return typeof rangeKm === 'number' ? rangeKm : null;
  }

  /** Mission second a command was first acknowledged at (undefined = never). */
  acknowledgedAt(commandId: string): number | undefined {
    return this.state_.commands.find((c) => c.id === commandId && c.status === 'acked')?.elapsedS;
  }

  /** Whether a command (or a specific one) has been acknowledged. */
  isCommandAcknowledged(commandId?: string): boolean {
    if (commandId) {
      return this.state_.commands.some((c) => c.id === commandId && c.status === 'acked');
    }

    return this.state_.commands.some((c) => c.status === 'acked');
  }

  private isWithinWindow_(elapsedS: number): boolean {
    if (this.config_.windowStartS !== undefined && elapsedS < this.config_.windowStartS) {
      return false;
    }
    if (this.config_.windowEndS !== undefined && elapsedS > this.config_.windowEndS) {
      return false;
    }

    return true;
  }
}
