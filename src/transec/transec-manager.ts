/**
 * @file TransecManager - Anti-jam frequency-hopping waveform (nats-eu M7)
 * @description The defender-side counterpart of the ccs jamming mechanic. The
 * command/downlink carrier can run in a fixed mode (a single center frequency,
 * jammable) or a TRANSEC hopping mode that slow-hops over a keyed hop set.
 * Hop-sync only locks when the waveform is in hopping mode AND the hop-set key
 * is loaded (both ends keyed) - at which point scripted interference on the old
 * fixed carrier no longer denies the link. The transec-mode-set and
 * transec-sync-locked conditions read this state.
 *
 * Started only when settings.transec is present. Self-contained state machine,
 * unit-testable without the RF chain.
 */

import { ScenarioManager } from '@app/scenario-manager';

export type TransecMode = 'fixed' | 'hopping';

/** settings.transec */
export interface TransecConfig {
  /** Ground station whose modem carries the TRANSEC waveform (for display) */
  groundStationId?: string;
  /** Hop-set channel center frequencies, Hz (display / spectrum rendering) */
  hopChannelsHz?: number[];
  /** Whether a hop-set key must be loaded for sync to lock (default true) */
  requireKey?: boolean;
}

interface TransecState {
  mode: TransecMode;
  keyed: boolean;
  syncLocked: boolean;
}

export class TransecManager {
  private static instance_: TransecManager | null = null;

  private readonly config_: TransecConfig;
  private readonly state_: TransecState = { mode: 'fixed', keyed: false, syncLocked: false };

  private constructor() {
    this.config_ = (ScenarioManager.getInstance().settings.transec as TransecConfig | undefined) ?? {};
  }

  static getInstance(): TransecManager {
    this.instance_ ??= new TransecManager();

    return this.instance_;
  }

  static isInitialized(): boolean {
    return this.instance_ !== null;
  }

  static destroy(): void {
    this.instance_ = null;
  }

  get state(): Readonly<TransecState> {
    return this.state_;
  }

  getConfig(): TransecConfig {
    return this.config_;
  }

  /** Load the hop-set key (both-ends keying, coordinated with the spacecraft). */
  loadKey(): void {
    this.state_.keyed = true;
    this.recomputeSync_();
  }

  /** Zeroize / drop the hop-set key. */
  clearKey(): void {
    this.state_.keyed = false;
    this.recomputeSync_();
  }

  /** Set the waveform mode (fixed = jammable single carrier, hopping = TRANSEC). */
  setMode(mode: TransecMode): void {
    this.state_.mode = mode;
    this.recomputeSync_();
  }

  isModeSet(mode: TransecMode): boolean {
    return this.state_.mode === mode;
  }

  isSyncLocked(): boolean {
    return this.state_.syncLocked;
  }

  private recomputeSync_(): void {
    const keyReady = this.config_.requireKey === false || this.state_.keyed;
    this.state_.syncLocked = this.state_.mode === 'hopping' && keyReady;
  }
}
