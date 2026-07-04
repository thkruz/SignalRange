/**
 * @file HardwareFaultManager - Scheduled RF transmit-string faults (Campaign 4)
 * @description The redundancy-training counterpart of InterferenceManager.
 * Reads settings.hardwareFaultEvents and, at each event's scheduled time, trips
 * the targeted transmitter modem (the "primary" transmit string): it faults and
 * stops radiating, so the jam drops and the operator must fail over to a backup
 * transmit string to restore the denial effect.
 *
 * Faulting a modem is enough to remove it from the RF chain - the BUC only pulls
 * modems that are transmitting AND not faulted - so no other engine change is
 * needed. Started only when settings.hardwareFaultEvents is non-empty, so legacy
 * campaigns never instantiate it.
 */

import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { ScenarioManager } from '@app/scenario-manager';
import { SimulationManager } from '@app/simulation/simulation-manager';

export interface HardwareFaultEventConfig {
  id: string;
  groundStationId: string;
  transmitterIndex?: number;
  modemNumber: number;
  /** Seconds since mission start when the fault trips */
  startTime: number;
  label?: string;
}

export class HardwareFaultManager {
  private static instance_: HardwareFaultManager | null = null;

  private events_: HardwareFaultEventConfig[] = [];
  private missionStartTime_ = 0;
  /** Event ids whose fault has already been tripped (fire once) */
  private readonly trippedIds_ = new Set<string>();
  private readonly boundUpdateHandler_: () => void;

  private constructor() {
    this.missionStartTime_ = Date.now();
    this.boundUpdateHandler_ = this.update_.bind(this);
    this.events_ = (ScenarioManager.getInstance().settings.hardwareFaultEvents as HardwareFaultEventConfig[] | undefined) ?? [];
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

  private update_(): void {
    if (this.events_.length === 0) {
      return;
    }
    const elapsed = (Date.now() - this.missionStartTime_) / 1000;
    const sim = SimulationManager.getInstance();

    for (const event of this.events_) {
      if (this.trippedIds_.has(event.id) || elapsed < event.startTime) {
        continue;
      }

      const gs = sim.groundStations.find((g) => g.state.id === event.groundStationId);
      const tx = gs?.transmitters[event.transmitterIndex ?? 0];
      const modem = tx?.state.modems.find((m) => m.modem_number === event.modemNumber);
      if (!modem) {
        continue;
      }

      // Trip the primary string: fault it and drop transmission so the jam stops
      modem.isFaulted = true;
      modem.isTransmitting = false;
      modem.isTransmittingSwitchUp = false;
      this.trippedIds_.add(event.id);
    }
  }
}
