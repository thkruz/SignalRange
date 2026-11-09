/**
 * @file terminal-runtime - Joins the terminal app model to the physical plant (phase 40, WP3)
 * @description One runtime per plant: it owns the `TerminalAppModel` (so history survives tab
 * rebuilds, D15), records dish-side data about once a second, and implements the app actions
 * through the plant verbs.
 */
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import type { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import type { SleepSchedule, SnowMeltMode, TerminalSettings, VerbResult } from '@app/physical/physical-plant-types';
import { PhasedArrayCore } from '../phased-array/phased-array-core';
import { ObstructionAccumulator, plantObstructionReader } from './obstruction-map';
import type { TerminalActions } from './screens/terminal-screen';
import { plantTerminalReader, TerminalAppModel, type TerminalPhasedArraySlice } from './terminal-app-model';
import { APP_ACTION_VERBS, TerminalEvidence } from './terminal-evidence';
import { plantLinkReader, TerminalLink } from './terminal-link';
import { SKYLINK_SKIN, type TerminalSkin } from './terminal-skin';

const RECORD_INTERVAL_MS = 1000;

/** The slice of the plant the actions use */
export type TerminalRuntimePlant = Pick<PhysicalPlantManager, 'reboot' | 'setSnowMelt' | 'setSleep' | 'setRouterWifi' | 'getTerminalSettings' | 'getTimeSeconds'>;

export class TerminalRuntime implements TerminalActions {
  private static readonly byPlant_ = new WeakMap<PhysicalPlantManager, TerminalRuntime>();

  readonly skin: TerminalSkin;
  readonly model: TerminalAppModel;
  /** Records the player's views and app-only actions as evidence (D7) */
  readonly evidence: TerminalEvidence;
  private readonly plant_: TerminalRuntimePlant;
  private readonly boundUpdate_: () => void;
  private lastRecordMs_ = 0;
  private disposed_ = false;
  private ownerPlant_: PhysicalPlantManager | null = null;

  constructor(plant: TerminalRuntimePlant, model: TerminalAppModel, skin: TerminalSkin = SKYLINK_SKIN) {
    this.plant_ = plant;
    this.model = model;
    this.evidence = new TerminalEvidence(model);
    this.skin = skin;
    this.boundUpdate_ = this.record_.bind(this);
  }

  /** The runtime for the live plant, built on first use; null when there is no plant */
  static forStation(phasedArray?: () => TerminalPhasedArraySlice | null): TerminalRuntime | null {
    const plant = PhysicalPlantService.plantOrNull();
    if (!plant) {
      return null;
    }
    const existing = TerminalRuntime.byPlant_.get(plant);
    if (existing && !existing.disposed_) {
      return existing;
    }
    const services = PhysicalPlantService.servicesOrNull();
    const serviceId = plant.getConfig().service?.paths.find((p) => p.terminalPartId === 'skylink-dish')?.id;
    const obstruction = phasedArray ? new ObstructionAccumulator(plantObstructionReader(plant, phasedArray)) : null;
    const model = new TerminalAppModel({
      skin: SKYLINK_SKIN,
      plant: plantTerminalReader(plant),
      link: new TerminalLink(plantLinkReader(plant)),
      services,
      serviceId,
      phasedArray,
      obstruction,
      obstructionFraction: obstruction ? () => (obstruction.summary().coverage > 0 ? obstruction.obstructionFraction() : null) : undefined,
    });
    const runtime = new TerminalRuntime(plant, model);
    runtime.ownerPlant_ = plant;
    TerminalRuntime.byPlant_.set(plant, runtime);
    runtime.start();

    return runtime;
  }

  /** Finds the phased array read model on a ground station's antennas */
  static arraySlice(antennas: readonly unknown[]): () => TerminalPhasedArraySlice | null {
    return () => {
      const core = antennas.find((a): a is PhasedArrayCore => a instanceof PhasedArrayCore);

      return core ? core.getReadModel() : null;
    };
  }

  start(): void {
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdate_);
  }

  dispose(): void {
    this.disposed_ = true;
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdate_);
  }

  /** Dish-side recording, about once a second; stops when the plant it belongs to is gone */
  private record_(): void {
    if (this.ownerPlant_ && PhysicalPlantService.plantOrNull() !== this.ownerPlant_) {
      this.dispose();

      return;
    }
    const now = Date.now();
    if (now - this.lastRecordMs_ < RECORD_INTERVAL_MS) {
      return;
    }
    this.lastRecordMs_ = now;
    this.model.update();
  }

  reboot(): VerbResult {
    const countBefore = this.model.view().data?.bootCount ?? 0;
    const startS = this.plant_.getTimeSeconds();
    const result = this.plant_.reboot();
    this.model.update();
    const countAfter = this.model.view().data?.bootCount ?? 0;
    // The press time is spent in a clock skip, so the model may not have seen the boot start
    if (countAfter === countBefore && (result.downtimeSeconds ?? 0) > 0) {
      this.model.noteReboot(startS, result.downtimeSeconds as number);
    }

    return result;
  }

  setSnowMelt(mode: SnowMeltMode): VerbResult {
    const result = this.plant_.setSnowMelt(mode);
    this.model.update();

    return result;
  }

  setSleep(schedule: SleepSchedule | null): VerbResult {
    const result = this.plant_.setSleep(schedule);
    this.model.update();

    return result;
  }

  setRouterWifi(ssid: string, password: string): VerbResult {
    const result = this.plant_.setRouterWifi({ ssid, password });
    this.evidence.action('settings', APP_ACTION_VERBS.wifi, 'Changed the router Wi-Fi name and password in the SkyLink app.');

    return result;
  }

  settings(): TerminalSettings {
    return this.plant_.getTerminalSettings();
  }
}
