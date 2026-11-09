/**
 * @file Manager state snapshot types and the collector hook (Phase 35 rt-s24-F4)
 * @description Dependency-free on purpose: sync-manager.ts must not statically
 * import the scenario managers (it lazy-requires SimulationManager to avoid an
 * import cycle), so the managers' snapshot is gathered through a collector that
 * base-page registers once the managers are built. Every field is plain JSON
 * (Maps and Sets are stored as entries arrays) so it rides in the opaque
 * checkpoint state unchanged. Older checkpoints simply lack the field.
 */

import type { AggregatedAlarm } from '@app/events/events';
import type { PlantEnvironment, PlantState } from '@app/physical/physical-plant-types';

export type SpaceEventsSnapshot = { phases: Array<[string, string]> };

export type CommandingSnapshot = {
  dopplerCompEnabled: boolean;
  keyStatus: string;
  keyRotationCompleted: boolean;
  zeroized: boolean;
  commands: Array<{ id: string; status: string; reason?: string; rangeKm?: number; elapsedS?: number }>;
  rangingMeasurements: Array<{ elapsedS: number; rangeKm: number }>;
};

export type WorkingDocumentSnapshot = {
  entries: Array<{ section: string; line: string }>;
  authoredKeys: string[];
};

export type CampaignRunSnapshot = { destroyed: string[]; reviewed: boolean };

export type EventLedgerSnapshot = {
  times: Array<[string, number]>;
  values: Array<[string, number]>;
  seenAccounts: string[];
};

export type SecuritySnapshot = {
  events?: import('@app/security-console/security-console-core').AuditEventConfig[];
  missionStartTimeMs?: number;
  acknowledged: string[];
  accountStatus: Array<[string, string]>;
  reviewed: boolean;
  anchors?: AnchorsSnapshot;
};

export type TransecSnapshot = { mode: string; keyed: boolean };

export type ContactScheduleSnapshot = { assignments: Array<[string, string]> };

export type GnssThreatSnapshot = {
  spoofActive: boolean;
  timeOffsetUs: number;
  referenceMode: string;
  lastElapsedS: number;
  lastOffsetChangeElapsedS: number;
  anchors?: AnchorsSnapshot;
};

/** [objectiveId, mission-elapsed second the anchor went live] */
export type AnchorsSnapshot = Array<[string, number]>;

export type HardwareFaultSnapshot = {
  tripped: string[];
  cleared: string[];
  anchors: AnchorsSnapshot;
  /** Effective state of operator-repairable faults, not merely event history. */
  active?: string[];
};

export type WeatherSnapshot = {
  missionStartTimeMs: number;
  anchors: AnchorsSnapshot;
  events: Array<{ id: string; startTime: number; isActive: boolean; isAwaitingAnchor: boolean }>;
  iceAccumulation: Array<[string, number]>;
};

export type TelemetrySnapshot = {
  missionStartTimeMs: number;
  elapsedS: number;
  frameAccumulatorS: number;
  frameCount: number;
  lastFrameElapsedS: number | null;
  values: Array<[string, number]>;
  anchors: AnchorsSnapshot;
};

export type InterferenceSnapshot = { forced: Array<[string, boolean]>; anchors: AnchorsSnapshot };

/** Only the operator-committed margin: the computed C/N values are re-derived every tick */
export type LinkBudgetSnapshot = { appliedMarginDb: number | null };

export type InjectedFaultSnapshot = {
  id: string;
  target: string;
  groundStationId: string;
  state: Record<string, unknown>;
  priority: number;
};

export type FaultInjectorSnapshot = { faults: InjectedFaultSnapshot[]; counter: number };

export type DecisionRecordSnapshot = {
  objectiveId: string;
  conditionIndex: number;
  prompt: string;
  attempts: number;
  pointsDeducted: number;
  resolution: { optionIndex: number; label: string; correct: boolean; evidenced: boolean; missingEvidence: string[] };
};

export type DecisionsSnapshot = { records: DecisionRecordSnapshot[] };

/** Operator-facing manager state that a checkpoint must carry (v1). */
export interface ManagerStates {
  v: 1;
  spaceEvents?: SpaceEventsSnapshot;
  commanding?: CommandingSnapshot;
  /** CryptoState, raw (keyLoadedAt is scenario-elapsed mission time) */
  crypto?: Record<string, unknown>;
  workingDocument?: WorkingDocumentSnapshot;
  campaignRun?: CampaignRunSnapshot;
  eventLedger?: EventLedgerSnapshot;
  security?: SecuritySnapshot;
  transec?: TransecSnapshot;
  contactSchedule?: ContactScheduleSnapshot;
  gnssThreat?: GnssThreatSnapshot;
  hardwareFaults?: HardwareFaultSnapshot;
  /** Phase 38.1 physical plant (PlantState plus the trainer weather override) */
  physicalPlant?: PlantState & { weather?: Partial<PlantEnvironment> };
  weather?: WeatherSnapshot;
  telemetry?: TelemetrySnapshot;
  alarms?: Array<AggregatedAlarm & { detail?: string }>;
  interference?: InterferenceSnapshot;
  linkBudget?: LinkBudgetSnapshot;
  faultInjector?: FaultInjectorSnapshot;
  decisions?: DecisionsSnapshot;
}

let collector_: (() => ManagerStates | undefined) | null = null;

/** Register (or clear with null) the function that gathers the manager snapshot. */
export function setManagerStateCollector(fn: (() => ManagerStates | undefined) | null): void {
  collector_ = fn;
}

/** Gather the snapshot through the registered collector; undefined when none is registered or it throws. */
export function collectManagerStatesViaHook(): ManagerStates | undefined {
  if (!collector_) {
    return undefined;
  }
  try {
    return collector_();
  } catch {
    return undefined;
  }
}
