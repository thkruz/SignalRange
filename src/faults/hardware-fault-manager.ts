/**
 * @file HardwareFaultManager - Scheduled equipment faults from scenario data
 * @description Reads settings.hardwareFaultEvents and, at each event's
 * mission-clock time, trips the named piece of equipment on the named station.
 *
 * Targets:
 * - `tx-modem` (default, Campaign 4 origin): the transmit modem faults and
 *   stops radiating, so a jam drops and the operator fails over to a backup
 *   string. Faulting a modem is enough to remove it from the RF chain - the BUC
 *   only pulls modems that are transmitting AND not faulted.
 * - `buc-overtemp` (phase 16, E3; physical since 19.6): the BUC's cooling
 *   degrades. `params.coolingFactor` multiplies its thermal resistance (a slow
 *   fan: every watt it dissipates lifts it further, so less drive is the fix);
 *   `params.excessCurrentA` adds supply current from a failing stage (more
 *   amps and more heat); `params.deltaC` is a flat extra offset. With none of
 *   the three, the legacy 40 degC offset. `params.startTemperatureC` jumps the
 *   reading at once for a mid-window trip; `duration` ends the excursion.
 * - `gpsdo-gnss-loss` (E3): the GNSS signal drops with the switch still up - the
 *   receiver enters holdover on its oscillator. `duration` is when the signal
 *   returns and the reference re-locks.
 * - `crypto-key-mismatch` (E3): the crypto module's key goes to Mismatch
 *   (decrypt and auth-tag fail) until the operator re-keys. The crypto module is
 *   one per app, so `groundStationId` is informational for this target.
 *
 * Faults fire once. Started only when settings.hardwareFaultEvents is
 * non-empty, so legacy campaigns never instantiate it.
 */

import { CryptoModule } from '@app/equipment/crypto';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { ObjectiveAnchors } from '@app/objectives/objective-anchor';
import { OpsLogManager } from '@app/ops-log/ops-log-manager';
import { ScenarioManager } from '@app/scenario-manager';
import { missionNowMs } from '@app/simulation/mission-clock';
import { SimulationManager } from '@app/simulation/simulation-manager';

export type HardwareFaultTarget = 'tx-modem' | 'buc-overtemp' | 'gpsdo-gnss-loss' | 'crypto-key-mismatch';

export interface HardwareFaultEventConfig {
  id: string;
  groundStationId: string;
  /** What trips. Default: 'tx-modem' */
  target?: HardwareFaultTarget;
  /** Transmitter case index (default 0), tx-modem only */
  transmitterIndex?: number;
  /** Modem number (1-4) that faults, tx-modem only */
  modemNumber?: number;
  /** RF front-end index (default 0), buc-overtemp / gpsdo-gnss-loss */
  rfFrontEndIndex?: number;
  /** Seconds since mission start (or since startAfterObjectiveId is live) when the fault trips */
  startTime: number;
  /** Anchor the trip to an objective (see objective-anchor.ts) */
  startAfterObjectiveId?: string;
  /**
   * Clear a timed fault endOffsetS after this objective is live, instead of
   * after `duration` (see objective-anchor.ts). Until then it holds.
   */
  endAfterObjectiveId?: string;
  /** Seconds after endAfterObjectiveId is live that the fault clears (default 0) */
  endOffsetS?: number;
  /** Seconds the fault lasts before it clears itself; absent = until the operator acts */
  duration?: number;
  params?: {
    /** buc-overtemp: extra degC the BUC settles above its normal target (default 40 when no other param is set) */
    deltaC?: number;
    /** buc-overtemp: thermal resistance multiplier (degraded fan/heatsink), >= 1 */
    coolingFactor?: number;
    /** buc-overtemp: extra supply current from a failing stage, A */
    excessCurrentA?: number;
    /** buc-overtemp: set the temperature reading to this at trip time */
    startTemperatureC?: number;
  };
  /** Written to the ops log when the fault trips (omit to keep the fault silent) */
  label?: string;
}

const DEFAULT_OVERTEMP_DELTA_C = 40;

export class HardwareFaultManager {
  private static instance_: HardwareFaultManager | null = null;

  private readonly events_: HardwareFaultEventConfig[];
  private readonly missionStartTime_: number;
  private readonly anchors_: ObjectiveAnchors;
  /** Event ids whose fault has already been tripped (fire once) */
  private readonly trippedIds_ = new Set<string>();
  /** Event ids whose timed fault has already cleared */
  private readonly clearedIds_ = new Set<string>();
  private readonly boundUpdateHandler_: () => void;

  private constructor() {
    this.missionStartTime_ = missionNowMs();
    this.boundUpdateHandler_ = this.update_.bind(this);
    this.events_ = (ScenarioManager.getInstance().settings.hardwareFaultEvents as HardwareFaultEventConfig[] | undefined) ?? [];
    this.anchors_ = new ObjectiveAnchors(this.events_.flatMap((e) => [e.startAfterObjectiveId, e.endAfterObjectiveId]));
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
  }

  static getInstance(): HardwareFaultManager {
    this.instance_ ??= new HardwareFaultManager();

    return this.instance_;
  }

  static isInitialized(): boolean {
    return this.instance_ !== null;
  }

  static destroy(): void {
    if (this.instance_) {
      EventBus.getInstance().off(Events.UPDATE, this.instance_.boundUpdateHandler_);
      this.instance_ = null;
    }
  }

  /** Whether the given event's fault has tripped */
  isTripped(eventId: string): boolean {
    return this.trippedIds_.has(eventId);
  }

  /** Whether the given event tripped and has since cleared (timed faults only) */
  isCleared(eventId: string): boolean {
    return this.clearedIds_.has(eventId);
  }

  private update_(): void {
    if (this.events_.length === 0) {
      return;
    }
    const elapsed = (missionNowMs() - this.missionStartTime_) / 1000;
    this.anchors_.poll(elapsed);

    for (const event of this.events_) {
      const start = this.anchors_.atS(event.startTime, event.startAfterObjectiveId);
      if (!this.trippedIds_.has(event.id)) {
        if (elapsed >= start && this.trip_(event)) {
          this.trippedIds_.add(event.id);
          if (event.label && OpsLogManager.isInitialized()) {
            OpsLogManager.getInstance().log(event.label, 'alert', event.groundStationId);
          }
        }
        continue;
      }

      if (!this.clearedIds_.has(event.id) && elapsed >= this.endS_(event, start)) {
        this.clear_(event);
        this.clearedIds_.add(event.id);
      }
    }
  }

  /** Mission-elapsed second a timed fault clears (Infinity = holds until the operator acts, or while an anchor waits) */
  private endS_(event: HardwareFaultEventConfig, startS: number): number {
    if (event.endAfterObjectiveId !== undefined) {
      return this.anchors_.atS(event.endOffsetS ?? 0, event.endAfterObjectiveId);
    }
    return event.duration === undefined ? Number.POSITIVE_INFINITY : startS + event.duration;
  }

  /** Apply the fault. Returns false when the target equipment does not exist yet. */
  private trip_(event: HardwareFaultEventConfig): boolean {
    const sim = SimulationManager.getInstance();
    const gs = sim.groundStations.find((g) => g.state.id === event.groundStationId);

    switch (event.target ?? 'tx-modem') {
      case 'tx-modem': {
        const tx = gs?.transmitters[event.transmitterIndex ?? 0];
        const modem = tx?.state.modems.find((m) => m.modem_number === event.modemNumber);
        if (!modem) {
          return false;
        }
        // Trip the primary string: fault it and drop transmission so the jam stops
        modem.isFaulted = true;
        modem.isTransmitting = false;
        modem.isTransmittingSwitchUp = false;
        return true;
      }

      case 'buc-overtemp': {
        const buc = gs?.rfFrontEnds[event.rfFrontEndIndex ?? 0]?.bucModule;
        if (!buc) {
          return false;
        }
        const { deltaC, coolingFactor, excessCurrentA } = event.params ?? {};
        const physical = coolingFactor !== undefined || excessCurrentA !== undefined;
        buc.setThermalOffset(deltaC ?? (physical ? 0 : DEFAULT_OVERTEMP_DELTA_C));
        buc.setCoolingFactor(coolingFactor ?? 1);
        buc.setExcessCurrent(excessCurrentA ?? 0);
        if (event.params?.startTemperatureC !== undefined) {
          buc.setTemperature(event.params.startTemperatureC);
        }
        return true;
      }

      case 'gpsdo-gnss-loss': {
        const gpsdo = gs?.rfFrontEnds[event.rfFrontEndIndex ?? 0]?.gpsdoModule;
        if (!gpsdo) {
          return false;
        }
        gpsdo.setGnssSignalPresent(false);
        return true;
      }

      case 'crypto-key-mismatch': {
        CryptoModule.getInstance().injectKeyMismatch();
        return true;
      }

      default:
        return false;
    }
  }

  /** End a timed fault. tx-modem and crypto faults are cleared by the operator, not by time. */
  private clear_(event: HardwareFaultEventConfig): void {
    const gs = SimulationManager.getInstance().groundStations.find((g) => g.state.id === event.groundStationId);
    const rfFrontEnd = gs?.rfFrontEnds[event.rfFrontEndIndex ?? 0];

    switch (event.target ?? 'tx-modem') {
      case 'buc-overtemp':
        rfFrontEnd?.bucModule.setThermalOffset(0);
        rfFrontEnd?.bucModule.setCoolingFactor(1);
        rfFrontEnd?.bucModule.setExcessCurrent(0);
        break;
      case 'gpsdo-gnss-loss':
        rfFrontEnd?.gpsdoModule.setGnssSignalPresent(true);
        break;
      default:
        break;
    }
  }
}
