/**
 * @file physical-plant-service - Scenario-lifetime owner of the physical plant
 * @description Same lifecycle shape as HardwareFaultManager: base-page creates it
 * when `settings.physicalPlant` is set, the page teardown destroys it, and UI
 * reads the manager through `getInstance().plant`. It wires the Core manager to
 * the app: scenario time (SimClock) for `now`/`skip`, seeded `Rng` streams,
 * wind and rain from the WeatherManager events (plus a trainer weather
 * override), and the engine bridge. Time is driven from the scenario clock, so
 * a verb's skip and an operator time skip both advance the plant exactly once.
 */

import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { ScenarioManager } from '@app/scenario-manager';
import { CampaignDocumentStore } from '@app/scenarios/campaign-document-store';
import { WorkingDocumentManager } from '@app/scenarios/working-document-manager';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { WeatherManager } from '@app/weather/weather-manager';
import { EquipmentLedger } from './equipment-records';
import { EvidenceLog, type EvidenceLogState } from './evidence-log';
import { type FieldHooks, setActiveField } from './field-hooks';
import { FieldRecords, type FieldRecordsState } from './field-records';
import { PhysicalPlantManager } from './physical-plant-manager';
import type { PlantEnvironment, PlantState } from './physical-plant-types';
import { setActivePlant } from './plant-bridge';
import { PlantEventController, type PlantEventState } from './plant-event-controller';
import { PlantSoundController } from './plant-sound-controller';
import { ServiceModel } from './service-model';
import type { ServiceModelState } from './service-types';
import { WorkloadRunner } from './workload-runner';
import type { WorkloadRunnerState } from './workload-types';

const DEFAULT_AMBIENT_C = 15;

export class PhysicalPlantService {
  private static instance_: PhysicalPlantService | null = null;

  readonly plant: PhysicalPlantManager;
  private weatherOverride_: Partial<PlantEnvironment> = {};
  private lastSyncS_: number;
  private readonly boundUpdateHandler_: () => void;
  private readonly sounds_: PlantSoundController;
  /** Present only when the plant config authors events */
  readonly events: PlantEventController | null;
  /** Present only when the plant config authors services (Campaign 6) */
  readonly services: ServiceModel | null;
  /** Present when the plant config authors services or events (Campaign 6) */
  readonly evidence: EvidenceLog | null;
  /** Present when the plant config authors workloads and services (Campaign 6, M10) */
  readonly workloads: WorkloadRunner | null;
  /** Present when the plant config authors handover forms (Campaign 6, M13) */
  readonly records: FieldRecords | null;

  private constructor() {
    const config = ScenarioManager.getInstance().settings.physicalPlant;
    if (!config) {
      throw new Error('PhysicalPlantService needs settings.physicalPlant');
    }
    this.lastSyncS_ = SimClock.scenarioElapsedMs() / 1000;
    this.plant = new PhysicalPlantManager(config, {
      now: () => SimClock.scenarioElapsedMs() / 1000,
      skip: (seconds) => {
        SimClock.skip(seconds * 1000);
        this.sync_();
      },
      env: () => this.environment_(config.stationId),
      timeOfDayS: () => (SimClock.nowMs() / 1000) % 86400,
      rng: (name) => Rng.stream(name),
      setWeather: (weather) => {
        this.weatherOverride_ = { ...this.weatherOverride_, ...weather };
      },
    });
    this.services = config.service ? new ServiceModel(config.service, this.plant, undefined, { now: () => SimClock.scenarioElapsedMs() / 1000 }) : null;
    this.evidence = config.service || config.events?.length ? new EvidenceLog(this.plant, this.services) : null;
    this.workloads =
      config.workloads && this.services
        ? new WorkloadRunner(config.workloads, this.services, {
            now: () => SimClock.scenarioElapsedMs() / 1000,
            skip: (seconds) => {
              SimClock.skip(seconds * 1000);
              this.sync_();
            },
          })
        : null;
    const ledger = config.equipment ? new EquipmentLedger(config.equipment, () => SimClock.scenarioElapsedMs() / 1000) : null;
    this.records =
      config.handovers?.length || ledger
        ? new FieldRecords(config.handovers ?? [], {
            equipment: ledger,
            plant: this.plant,
            service: this.services,
            evidence: this.evidence,
            runs: () => this.workloads?.getRuns() ?? [],
            getCardVersion: (cardId) => this.workloads?.getCard(cardId)?.version,
            eventFiredAtS: (eventId) => this.events?.firedAtS(eventId) ?? null,
            configEpoch: () => this.services?.getEpochs().config ?? null,
            writeLine: (section, line) => WorkingDocumentManager.getInstance().addLine(section, line),
            storeRecord: (record) => CampaignDocumentStore.recordHandover(record),
            catchUp: () => this.catchUp(),
          })
        : null;
    this.events = config.events?.length
      ? new PlantEventController(config.events, {
          setAccount: (patch) => this.services?.setAccount(patch),
          setProvider: (patch) => this.services?.setProvider(patch),
          setEndpoint: (patch) => this.services?.setEndpoint(patch),
          deliverNotice: (noticeId, version) => {
            const notice = ledger?.deliverNotice(noticeId, version);
            const provider = notice ? this.services?.getProvider(notice.providerId) : undefined;
            if (notice && provider && !provider.noticeIds.includes(noticeId)) {
              this.services?.setProvider({ id: provider.id, noticeIds: [...provider.noticeIds, noticeId] });
            }
          },
          respondRequest: (requestId, status) => ledger?.respond(requestId, status),
          injectFault: (fault) => this.plant.injectFault(fault),
          rebootPart: (partId) => this.plant.startBoot(partId),
          clearFault: (faultId) => this.plant.clearFault(faultId),
          setWeather: (weather) => this.plant.setWeather(weather),
          onFire: (eventId) => {
            if (this.services) {
              this.services.bumpEvent(eventId);
            } else {
              this.evidence?.recordEvent(eventId);
            }
          },
        })
      : null;
    setActivePlant(this.plant);
    setActiveField(this.fieldHooks_());
    this.installFieldStatus_();
    this.sounds_ = new PlantSoundController(this.plant);
    this.boundUpdateHandler_ = this.sync_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
  }

  static getInstance(): PhysicalPlantService {
    this.instance_ ??= new PhysicalPlantService();

    return this.instance_;
  }

  /** The Site tab tells the sandbox whether it is on screen (the tent bed plays only then) */
  static setSiteTabShown(shown: boolean): void {
    this.instance_?.sounds_.setSiteTabShown(shown);
  }

  static isInitialized(): boolean {
    return this.instance_ !== null;
  }

  /** The manager, or null when this scenario has no plant (never creates one) */
  static plantOrNull(): PhysicalPlantManager | null {
    return this.instance_?.plant ?? null;
  }

  static destroy(): void {
    if (this.instance_) {
      EventBus.getInstance().off(Events.UPDATE, this.instance_.boundUpdateHandler_);
      this.instance_.sounds_.dispose();
      this.instance_.services?.dispose();
      this.instance_.evidence?.dispose();
      setActiveField(null);
      PhysicalPlantService.removeFieldStatus_();
      setActivePlant(null);
      this.instance_ = null;
    }
  }

  /** The event controller, or null when no plant or no authored events (never creates one) */
  static eventsOrNull(): PlantEventController | null {
    return this.instance_?.events ?? null;
  }

  getState(): PlantState & {
    weather: Partial<PlantEnvironment>;
    events?: PlantEventState;
    service?: ServiceModelState;
    evidence?: EvidenceLogState;
    workloads?: WorkloadRunnerState;
    records?: FieldRecordsState;
  } {
    const state: PlantState & {
      weather: Partial<PlantEnvironment>;
      events?: PlantEventState;
      service?: ServiceModelState;
      evidence?: EvidenceLogState;
      workloads?: WorkloadRunnerState;
      records?: FieldRecordsState;
    } = {
      ...this.plant.getState(),
      weather: { ...this.weatherOverride_ },
    };
    if (this.events) {
      state.events = this.events.getState();
    }

    if (this.services) {
      state.service = this.services.getState();
    }

    if (this.evidence) {
      state.evidence = this.evidence.getState();
    }

    if (this.workloads) {
      state.workloads = this.workloads.getState();
    }

    if (this.records) {
      state.records = this.records.getState();
    }

    return state;
  }

  /** Read-only bundle for Campaign 6 conditions, or null when this scenario has no plant */
  static fieldOrNull(): FieldHooks | null {
    return this.instance_ ? this.instance_.fieldHooks_() : null;
  }

  private fieldHooks_(): FieldHooks {
    return { plant: this.plant, service: this.services, evidence: this.evidence, events: this.events, workloads: this.workloads, records: this.records };
  }

  /** window.__fieldStatus for e2e: layers, sample freshness, fired events, flags and the power forecast */
  private installFieldStatus_(): void {
    if (typeof window === 'undefined') {
      return;
    }
    (window as unknown as { __fieldStatus?: () => unknown }).__fieldStatus = () => {
      const services: Record<string, unknown> = {};
      for (const id of this.services?.getServiceIds() ?? []) {
        const layers = this.services?.layers(id) ?? [];
        services[id] = layers.map((l) => {
          const sample = this.services?.latest(id, l.layer) ?? null;

          return { layer: l.layer, status: l.status, reason: l.reason, freshness: sample && this.services ? this.services.freshness(sample) : null };
        });
      }
      const events = this.events?.getState();

      return {
        services,
        firedEvents: events?.fired.map(([id]) => id) ?? [],
        flags: events?.flags ?? {},
        epochs: this.services?.getEpochs() ?? null,
        forecast: this.plant.getPowerReadings().reserveWh === null ? null : this.plant.forecast(),
        workloads: this.workloads?.getRuns().map((r) => ({ id: r.id, card: r.cardId, service: r.serviceId, status: r.status, invalidatedBy: r.invalidatedBy ?? null })) ?? [],
        evidenceCount: this.evidence?.entries().length ?? 0,
      };
    };
  }

  private static removeFieldStatus_(): void {
    if (typeof window !== 'undefined') {
      delete (window as unknown as { __fieldStatus?: unknown }).__fieldStatus;
    }
  }

  /** The workload runner, or null when no plant, services or cards (never creates one) */
  static evidenceOrNull(): EvidenceLog | null {
    return this.instance_?.evidence ?? null;
  }

  /** The handover records, or null when no plant or no authored forms (never creates one) */
  static recordsOrNull(): FieldRecords | null {
    return this.instance_?.records ?? null;
  }

  static workloadsOrNull(): WorkloadRunner | null {
    return this.instance_?.workloads ?? null;
  }

  /** The service model, or null when no plant or no authored services (never creates one) */
  static servicesOrNull(): ServiceModel | null {
    return this.instance_?.services ?? null;
  }

  restoreState(
    state:
      | (PlantState & {
          weather?: Partial<PlantEnvironment>;
          events?: PlantEventState;
          service?: ServiceModelState;
          evidence?: EvidenceLogState;
          workloads?: WorkloadRunnerState;
          records?: FieldRecordsState;
        })
      | undefined
  ): void {
    if (!state) {
      return;
    }
    this.weatherOverride_ = { ...state.weather };
    this.plant.restoreState(state);
    this.events?.restoreState(state.events);
    this.services?.restoreState(state.service);
    this.evidence?.restoreState(state.evidence);
    this.workloads?.restoreState(state.workloads);
    this.records?.restoreState(state.records);
    this.lastSyncS_ = SimClock.scenarioElapsedMs() / 1000;
  }

  /**
   * Step the plant, events, services and runs up to the scenario clock now. A player action that reads this state
   * (a handover check, a panel redraw) calls it so it never sees the state of the last UPDATE tick: an event that
   * has fired is stamped and a run that has finished is finished.
   */
  catchUp(): void {
    this.sync_();
  }

  /** Catch the singleton up when one exists */
  static catchUp(): void {
    this.instance_?.catchUp();
  }

  private syncing_ = false;

  private sync_(): void {
    if (this.syncing_) {
      return;
    }
    this.syncing_ = true;
    try {
      this.stepToNow_();
    } finally {
      this.syncing_ = false;
    }
  }

  /** Feed the plant the scenario seconds that passed since the last sync (ticks, verb skips and operator skips alike) */
  private stepToNow_(): void {
    const nowS = SimClock.scenarioElapsedMs() / 1000;
    const dt = nowS - this.lastSyncS_;
    this.lastSyncS_ = nowS;
    if (dt > 0) {
      this.plant.update(dt);
    }
    this.events?.update(nowS);
    this.services?.update();
    this.workloads?.update();
    this.sounds_.refresh();
  }

  private environment_(stationId: string | undefined): PlantEnvironment {
    let windMps = 0;
    let rainMmH = 0;
    if (stationId && WeatherManager.hasInstance()) {
      const weather = WeatherManager.getInstance();
      const elapsedS = weather.getElapsedMissionTime();
      for (const event of weather.getActiveWeatherEvents(stationId)) {
        windMps = Math.max(windMps, WeatherManager.windSpeedAt(event, elapsedS));
        rainMmH = Math.max(rainMmH, WeatherManager.rainRateAt(event, elapsedS));
      }
    }

    return {
      windMps: this.weatherOverride_.windMps ?? windMps,
      rainMmH: this.weatherOverride_.rainMmH ?? rainMmH,
      ambientC: this.weatherOverride_.ambientC ?? DEFAULT_AMBIENT_C,
      snow: this.weatherOverride_.snow ?? false,
    };
  }
}
