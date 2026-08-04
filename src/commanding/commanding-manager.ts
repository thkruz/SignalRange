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

import { ScenarioManager } from '@app/scenario-manager';
import { missionNowMs } from '@app/simulation/mission-clock';

export type CommandKeyStatus = 'Valid' | 'Pending Rotation' | 'Zeroized';
export type CommandStatus = 'pending' | 'acked' | 'rejected';
export type CommandRejectReason = 'no-doppler-comp' | 'key-invalid' | 'out-of-window';

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
}

interface CommandRecord {
  id: string;
  status: CommandStatus;
  reason?: CommandRejectReason;
}

interface CommandingState {
  dopplerCompEnabled: boolean;
  keyStatus: CommandKeyStatus;
  keyRotationCompleted: boolean;
  zeroized: boolean;
  commands: CommandRecord[];
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
    const record: CommandRecord = { id, status: 'pending' };
    const elapsed = atElapsedS ?? (missionNowMs() - this.missionStartTime_) / 1000;

    if ((this.config_.requireDopplerComp ?? true) && !this.state_.dopplerCompEnabled) {
      record.status = 'rejected';
      record.reason = 'no-doppler-comp';
    } else if ((this.config_.requireValidKey ?? true) && this.state_.keyStatus !== 'Valid') {
      record.status = 'rejected';
      record.reason = 'key-invalid';
    } else if (!this.isWithinWindow_(elapsed)) {
      record.status = 'rejected';
      record.reason = 'out-of-window';
    } else {
      record.status = 'acked';
    }

    this.state_.commands.push(record);

    return record;
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
