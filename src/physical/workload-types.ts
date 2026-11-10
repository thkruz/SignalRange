/**
 * @file workload-types - Workload runner types (Campaign 6, M10)
 * @description Requirement cards, runs, assessments. Pure types so `PlantConfig.workloads`
 * can reference them without importing the runner.
 */

export type WorkloadPriority = 'mission' | 'routine' | 'background';

export type WorkloadStatus = 'running' | 'supported' | 'degraded' | 'unsupported' | 'aborted';

/** What a task needs from a service. A bound left undefined is not required. */
export interface RequirementCard {
  id: string;
  /** Bumped when the requirement changes; runs of an older version are invalidated */
  version: number;
  label: string;
  minDownMbps?: number;
  minUpMbps?: number;
  maxRttMs?: number;
  maxLossPct?: number;
  /** Delay variation limit (ms, see rtt-jitter.ts). A path with no jitter data cannot meet it. */
  maxJitterMs?: number;
  /** Seconds of scenario time a run observes the service */
  windowS: number;
  priority: WorkloadPriority;
  /** Share weight the card starts with, instead of the weight its priority implies (S5: a transfer started at high priority) */
  startWeight?: number;
  /** A transfer already under way: config and event changes do not stop it, the player cannot abort it, and it survives a reload */
  standing?: boolean;
}

export interface WorkloadConfig {
  cards: RequirementCard[];
  /** Fraction a metric may miss its bound by and still read 'degraded' (default 0.2) */
  degradedTolerance?: number;
  /** Runs started when the plant is built (standing transfers) */
  autoStart?: Array<{ cardId: string; serviceId: string }>;
}

export interface WorkloadRun {
  id: string;
  cardId: string;
  cardVersion: number;
  serviceId: string;
  startS: number;
  /** Planned end while running, actual end once aborted */
  endS: number;
  status: WorkloadStatus;
  sampleIds: string[];
  /** Why a run no longer counts: 'config', 'event', 'card-version', 'reload' */
  invalidatedBy?: string;
  /** Worst suitability seen while the window ran */
  worst: Exclude<WorkloadStatus, 'running' | 'aborted'>;
  /** Metrics that missed their bound at the worst moment */
  unmet: string[];
  configEpoch: number;
  eventEpoch: number;
}

export interface EffectiveProfile {
  downMbps: number;
  upMbps: number;
  rttMs: number;
  lossPct: number;
  /** Absent when the path has no delay variation data */
  jitterMs?: number;
}

/** Suitability of a service for a card, with no run involved */
export interface WorkloadAssessment {
  cardId: string;
  cardVersion: number;
  serviceId: string;
  status: 'supported' | 'degraded' | 'unsupported';
  /** Metric names that missed their bound ('downMbps', 'upMbps', 'rttMs', 'lossPct', 'jitterMs') */
  unmet: string[];
  /** 'ok', or 'layer:<reason>' when a layer is down, or 'no-link' */
  reason: string;
  /** Profile after the remote leg and any capacity share; null when nothing is carried */
  effective: EffectiveProfile | null;
}

export type StartResult = { ok: true; run: WorkloadRun } | { ok: false; reason: 'unknown-card' | 'unknown-service' | 'already-running' };

export interface WorkloadRunnerState {
  runs: WorkloadRun[];
  weights: Array<[string, number]>;
  cards: RequirementCard[];
  seq: number;
}
