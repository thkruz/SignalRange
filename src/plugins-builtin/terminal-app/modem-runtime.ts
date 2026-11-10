/**
 * @file modem-runtime - Joins the EuroSat modem app model to the physical plant (Campaign 6, package G)
 * @description One runtime per (plant, `eurosat`). Independent of the SkyLink runtime: its own model, history,
 * evidence and actions, and its own checkpoint slot. The only action is the modem restart, which is the plant
 * `powerCycle` verb on the modem part, so it can never reboot the SkyLink terminal.
 */
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { EUROSAT_APP_SUBJECT_PREFIX, type EvidenceLog } from '@app/physical/evidence-log';
import { getActiveField } from '@app/physical/field-hooks';
import type { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import type { VerbResult } from '@app/physical/physical-plant-types';
import { MODEM_PART_ID, ModemAppModel, type ModemAppState, type ModemView, plantModemReader } from './modem-app-model';
import { TerminalRuntimeCache } from './terminal-runtime-cache';

export const EUROSAT_TERMINAL_ID = 'eurosat';
/** Evidence screen ids carry the app name so they never share a dedupe slot with a SkyLink screen */
export type ModemScreenId = 'status' | 'speed-test' | 'history' | 'restart';
export const MODEM_SCREENS: readonly ModemScreenId[] = ['status', 'speed-test', 'history', 'restart'];
export const MODEM_APP_VERBS = { speedTest: 'app-eurosat-speed-test' } as const;

const RECORD_INTERVAL_MS = 1000;
const screenKey = (screen: ModemScreenId): string => `eurosat-${screen}`;

/** The slice of the plant the actions use */
export type ModemRuntimePlant = Pick<PhysicalPlantManager, 'powerCycle' | 'getTimeSeconds'>;

const pct = (v: number | null): string => (v === null ? 'unavailable' : `${v.toFixed(1)} %`);

/** Records what the operator opened and did in the modem interface as `terminal-app` evidence */
export class ModemEvidence {
  constructor(
    private readonly model_: ModemAppModel,
    private readonly log_: () => EvidenceLog | null = () => getActiveField()?.evidence ?? null
  ) {}

  viewScreen(screen: ModemScreenId, view: ModemView = this.model_.view()): void {
    this.log_()?.recordAppView(screenKey(screen), this.describe_(screen, view), [], EUROSAT_APP_SUBJECT_PREFIX);
  }

  action(screen: ModemScreenId, verb: string, text: string): void {
    this.log_()?.recordAppAction(screenKey(screen), verb, text, EUROSAT_APP_SUBJECT_PREFIX);
  }

  private describe_(screen: ModemScreenId, view: ModemView): string {
    if (view.link === 'no-laptop') {
      return `EuroSat modem interface, ${screen}: could not connect (laptop off).`;
    }
    const prefix = view.link === 'modem-unreachable' ? `Can't reach the modem${view.ageS === null ? '' : `, data ${Math.round(view.ageS / 60)} min old`}. ` : '';
    const d = view.data;
    if (!d) {
      return `${prefix}EuroSat modem interface, ${screen}: no data.`;
    }
    const lost = d.history.filter((h) => h.kind === 'lost');
    switch (screen) {
      case 'status':
        return `${prefix}EuroSat modem interface, status: ${d.hero === 'registered' ? 'registered' : d.hero === 'account-refused' ? 'registered, account refused' : 'not registered'}; ${d.restartCount} restart(s).`;
      case 'speed-test': {
        const last = this.model_.speedTests().at(-1);

        return `${prefix}EuroSat modem interface, speed test: ${last ? `last result ${Math.round(last.downMbps)} down, ${Math.round(last.upMbps)} up Mbps` : 'no test run yet'}.`;
      }
      case 'history': {
        const signal = lost.filter((h) => h.reason === 'signal-lost').length;

        return `${prefix}EuroSat modem interface, history: ${lost.length} registration loss(es) listed, ${signal} of them receive signal lost${lost.length > 0 ? `, latest at ${Math.round(lost[lost.length - 1].tS)} s` : ''}; loss ${pct(d.lossPct)}.`;
      }
      default:
        return `${prefix}EuroSat modem interface, ${screen}.`;
    }
  }
}

export class ModemRuntime {
  private static readonly cache_ = new TerminalRuntimeCache<ModemRuntime>();

  readonly evidence: ModemEvidence;
  private readonly boundUpdate_: () => void;
  private lastRecordMs_ = 0;
  private disposed_ = false;
  private ownerPlant_: PhysicalPlantManager | null = null;
  private persistence_: { getState(): unknown; restoreState(s: unknown): void } | null = null;

  constructor(
    private readonly plant_: ModemRuntimePlant,
    readonly model: ModemAppModel
  ) {
    this.evidence = new ModemEvidence(model);
    this.boundUpdate_ = this.record_.bind(this);
  }

  /** The runtime for the live plant EuroSat modem, built on first use; null when there is no plant or no EuroSat path */
  static forStation(): ModemRuntime | null {
    const plant = PhysicalPlantService.plantOrNull();
    if (!plant) {
      return null;
    }
    const existing = ModemRuntime.cache_.get(plant, EUROSAT_TERMINAL_ID);
    if (existing) {
      return existing;
    }
    const serviceId = plant.getConfig().service?.paths.find((p) => p.terminalPartId === MODEM_PART_ID)?.id;
    if (!serviceId) {
      return null;
    }
    const model = new ModemAppModel({ plant: plantModemReader(plant), services: PhysicalPlantService.servicesOrNull(), serviceId });
    const runtime = new ModemRuntime(plant, model);
    runtime.ownerPlant_ = plant;
    ModemRuntime.cache_.set(plant, EUROSAT_TERMINAL_ID, runtime);
    runtime.persistence_ = { getState: () => model.getState(), restoreState: (s) => model.restoreState(s as ModemAppState) };
    PhysicalPlantService.registerTerminalApp(EUROSAT_TERMINAL_ID, runtime.persistence_);
    runtime.start();

    return runtime;
  }

  get isDisposed(): boolean {
    return this.disposed_;
  }

  start(): void {
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdate_);
  }

  dispose(): void {
    this.disposed_ = true;
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdate_);
    if (this.persistence_) {
      PhysicalPlantService.unregisterTerminalApp(EUROSAT_TERMINAL_ID, this.persistence_);
      this.persistence_ = null;
    }
  }

  /** Power-cycle the modem (plant verb on the modem part only) */
  restartModem(): VerbResult {
    const result = this.plant_.powerCycle(MODEM_PART_ID);
    this.model.update();

    return result;
  }

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
}
