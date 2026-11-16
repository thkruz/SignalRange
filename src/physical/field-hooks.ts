/**
 * M06 field hooks: the read-only bundle that Campaign 6 scenario conditions and evidence facts use
 * to reach the plant, the service model, the evidence log and the event controller. A neutral
 * registry (like plant-bridge) keeps the objectives engine free of an import cycle through
 * PhysicalPlantService. Every lookup returns null when the scenario has no plant.
 */

import type { EvidenceLog } from './evidence-log';
import type { PhysicalPlantManager } from './physical-plant-manager';
import type { PlantEventController } from './plant-event-controller';
import type { ServiceModel } from './service-model';

/** One workload run as the condition factory reads it (the runner arrives with a later package) */
export interface WorkloadRunReading {
  id?: string;
  cardId: string;
  serviceId: string;
  status: 'running' | 'supported' | 'degraded' | 'unsupported' | 'aborted';
  startS: number;
  endS?: number;
  invalidatedBy?: string;
  /** Energy accounting over the run's own window (see RunPowerRecord) */
  power?: import('./workload-types').RunPowerRecord;
}

export interface WorkloadReader {
  runs(): readonly WorkloadRunReading[];
  /** Suitability of a service for a card with no run involved (the runner provides it) */
  /** Current share weight of a card (shared capacity) */
  priorityOf?(cardId: string): number;
  assess?(cardId: string, serviceId: string): { status: 'supported' | 'degraded' | 'unsupported' } | null;
}

/** Equipment records and handover forms (later package) */
export interface RecordReader {
  isAccepted(unitId: string): boolean;
  isHandoverValid(formId: string): boolean;
  /** The latest filing of the form certifies the state as it is now (see FieldRecords.isHandoverCurrent) */
  isHandoverCurrent?(formId: string): boolean;
  /** Status and answer time of a correction request the player filed (null before it is filed) */
  /** Scenario time of the latest accepted filing of a handover form (null before one is accepted) */
  handoverFiledAtS?(formId: string): number | null;
  requestDecision?(requestId: string): { status: 'pending' | 'approved' | 'rejected'; decidedAtS?: number } | null;
}

export interface FieldHooks {
  plant: PhysicalPlantManager;
  service: ServiceModel | null;
  evidence: EvidenceLog | null;
  events: PlantEventController | null;
  workloads: WorkloadReader | null;
  records: RecordReader | null;
}

let active_: FieldHooks | null = null;

export function setActiveField(hooks: FieldHooks | null): void {
  active_ = hooks;
}

export function getActiveField(): FieldHooks | null {
  return active_;
}
