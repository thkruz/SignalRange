/**
 * @file service-types - Service state model types (Campaign 6, M04)
 * @description Layers a link service passes through, authored paths, account /
 * provider / endpoint state, samples with provenance and freshness. Pure types:
 * nothing here imports the plant, so `PlantConfig.service` can reference them.
 */

export type ServiceLayer = 'power' | 'local' | 'registration' | 'account' | 'provider' | 'application';

/** Evaluation order; the first failing layer explains an outage */
export const SERVICE_LAYERS: readonly ServiceLayer[] = ['power', 'local', 'registration', 'account', 'provider', 'application'];

export type LayerStatus = 'up' | 'degraded' | 'down' | 'unknown';

export interface LayerReading {
  layer: ServiceLayer;
  status: LayerStatus;
  /** Reason code, e.g. 'mode-standby', 'link-dropped', 'ok' */
  reason: string;
  /** The part, account, provider or endpoint behind the reason, when one applies */
  subjectId?: string;
}

export interface LinkProfile {
  downMbps: number;
  upMbps: number;
  rttMs: number;
  lossPct: number;
  /**
   * Half-range (ms) of the per-second RTT variation around `rttMs` (package E). Absent = the path has no delay
   * variation data, so a jitter reading is unavailable (not zero). See rtt-jitter.ts for the statistic.
   */
  rttSpreadMs?: number;
  /** Seed of the per-second RTT series (default: derived from the service id) */
  rttSeed?: number;
}

/**
 * External link impairment contract (Campaign 6 package D). An impairment is a loss of the radio
 * path that the terminal cannot clear: power, boot state, account and provider policy are unchanged.
 * It is read upstream of policy scaling, so the registration layer can ask for it without touching
 * `LinkQualitySource` (which itself reads the layers). Package H may back it with live physics by
 * implementing `LinkImpairmentSource`; the authored one is `AuthoredLinkImpairment`.
 */
export interface LinkImpairment {
  /** True while the path carries nothing (registration reads down, reason 'link-lost') */
  unavailable: boolean;
}

/** An authored, seeded and scenario-time-driven pattern of loss windows on one service */
export interface LinkImpairmentConfig {
  id: string;
  serviceId: string;
  /** Seed for window start jitter and length; the same seed and start give the same windows */
  seed: number;
  /** Seconds from one window nominal start to the next */
  periodS: number;
  downMinS: number;
  downMaxS: number;
  /** Largest random delay of a window start inside its period (the first window starts at once) */
  jitterS: number;
}

/** Scenario-time span in which an impairment's windows recur */
export interface LinkImpairmentEpisode {
  id: string;
  startS: number;
  endS: number;
}

export interface LinkImpairmentState {
  episodes: LinkImpairmentEpisode[];
}

export interface LinkImpairmentSource {
  /** The impairment at scenario second `tS`, or null when the path is clear */
  at(serviceId: string, tS: number): LinkImpairment | null;
  /** Start and stop transitions strictly inside (fromS, toS), in time order, for the history */
  edges(serviceId: string, fromS: number, toS: number): Array<{ tS: number; impaired: boolean }>;
  /** Arm an impairment from `atS` for `durationS`; re-arming while active extends it without moving the windows */
  start(id: string, atS: number, durationS: number): void;
  stop(id: string, atS: number): void;
  getState(): LinkImpairmentState;
  restoreState(state: LinkImpairmentState | undefined): void;
}

export type LinkSample = LinkProfile & {
  provenance: 'authored' | 'sdk';
  /** Jitter (mean absolute change between consecutive 1 s RTT samples) over `jitterWindowS`, when the path has delay variation data */
  jitterMs?: number;
  jitterWindowS?: number;
};

/**
 * The only seam to the KeepTrack SDK work. Until it exists, AuthoredLinkSource returns the
 * scenario's authored profile (times account and provider capacity factors) or null when the
 * terminal cannot carry traffic.
 */
export interface LinkQualitySource {
  sample(serviceId: string, tS: number): LinkSample | null;
}

export interface ServicePathConfig {
  id: string;
  /** 'skylink', 'eurosat', 'camp-vsat' */
  label: string;
  /** Registration layer */
  terminalPartId: string;
  /** Router, laptop: local layer */
  localPartIds: string[];
  accountId: string;
  providerId: string;
  /** S12/S13 remote ends */
  endpointIds?: string[];
  /** S6 matrix */
  remoteLeg?: { kind: 'fiber' | 'radio'; rttMs: number; downMbps: number /** Independent jitter of the leg, combined in quadrature; absent = fixed delay */; jitterMs?: number };
  /** Connector or cable ids on the terminal's link; active moisture on one makes registration flap */
  linkTargetIds?: string[];
  /** Authored stand-in for LinkQualitySource */
  profile: LinkProfile;
}

export interface AccountState {
  id: string;
  unitId: string;
  authorized: boolean;
  restriction?: 'ground-capacity';
  capacityFactor: number;
}

export interface ProviderState {
  id: string;
  status: 'normal' | 'restricted' | 'outage';
  capacityFactor: number;
  noticeIds: string[];
}

export interface EndpointState {
  id: string;
  reachable: boolean;
  policy?: 'mobility-restricted';
  reportedAtS?: number;
}

export type SampleProvenance = 'device-indicator' | 'local-probe' | 'terminal-app' | 'provider-portal' | 'pilot-report' | 'endpoint-report' | 'workload-run';

/** Explicit per-scenario link source selection (package H); absent means authored */
export type LinkMode = 'authored' | 'live';

export interface LiveLinkMapping {
  /** C/N (dB) at which the authored profile is the truth (clear sky) */
  nominalCnDb: number;
  /** C/N (dB) at and below which nothing is carried */
  thresholdCnDb: number;
  /** Margin over threshold (dB) under which loss starts to rise (default 3) */
  lowMarginDb?: number;
  /** Loss added per dB under that margin, percent (default 1.5) */
  lossPctPerDb?: number;
}

export interface LiveLinkConfig {
  mapping: Record<string, LiveLinkMapping>;
}

export interface ServiceModelConfig {
  paths: ServicePathConfig[];
  accounts: AccountState[];
  providers: ProviderState[];
  endpoints?: EndpointState[];
  /** Override the default seconds a sample stays current, per provenance */
  maxAgeS?: Partial<Record<SampleProvenance, number>>;
  /** Authored external impairments (opt-in; absent for every other scenario) */
  impairments?: LinkImpairmentConfig[];
  /** Link mode: 'authored' (default, deterministic profiles) or 'live' (physics-backed; needs `live` and a reader) */
  linkMode?: LinkMode;
  /** Mapping from physical C/N to the profile, per service (package H); required when linkMode is 'live' */
  live?: LiveLinkConfig;
  /** Measured recovery intervals (package E; opt-in, absent for every other scenario) */
  intervals?: RecoveryIntervalConfig[];
}

/**
 * A measured recovery interval on one service. It opens when `startEventId` fires (scenario time) and records,
 * from the service model's own timeline: the operator's activation of `activationPartId` (plant log), the first
 * moment the terminal registers up, and the first moment the application layer is usable (up or degraded).
 */
export interface RecoveryIntervalConfig {
  id: string;
  serviceId: string;
  startEventId: string;
  /** The terminal the operator activates (its first setMode after the start is the activation) */
  activationPartId?: string;
}

export interface RecoveryInterval {
  id: string;
  serviceId: string;
  /** Incident start: the scenario second the start event fired */
  startS: number;
  activationS: number | null;
  registeredS: number | null;
  /** First moment the application layer carried traffic again; closes the interval */
  usableS: number | null;
}

export type SampleMetric = 'status' | 'rttMs' | 'downMbps' | 'upMbps' | 'lossPct' | 'jitterMs';

export interface ServiceSample {
  id: string;
  serviceId: string;
  endpointId?: string;
  layer: ServiceLayer;
  metric: SampleMetric;
  value: number | LayerStatus;
  unit: 'ms' | 'Mbps' | '%' | 'state';
  /** Seconds of scenario time a statistic (jitter) was computed over */
  windowS?: number;
  tS: number;
  /** Why the layer read this way when sampled ('link-lost', 'terminal-booting'...). Status samples only; absent in older saves. */
  cause?: string;
  provenance: SampleProvenance;
  configEpoch: number;
  eventEpoch: number;
  sessionEpoch: number;
  maxAgeS: number;
}

export type Freshness = 'current' | 'stale' | 'invalidated' | 'unavailable';

export interface ServiceHistoryEntry {
  tS: number;
  serviceId: string;
  layer: ServiceLayer;
  from: LayerStatus;
  to: LayerStatus;
  /** Why the layer read this way after the change ('link-lost', 'terminal-booting', 'ok'...). Absent in older saves. */
  reason?: string;
}

/** What the service model needs from the plant (the manager satisfies this structurally) */
export interface PlantReader {
  getTimeSeconds(): number;
  /** Supplied and not rebooting */
  isPartPowered(partId: string): boolean;
  isLinkDropped(partId: string): boolean;
  getPartMode(partId: string): string | undefined;
  /** True when the part has no modes, or its current mode serves traffic */
  modeServesTraffic(partId: string): boolean;
  isStarting(partId: string): boolean;
  /** True while a terminal searches for a satellite after its boot (optional for fakes) */
  isSearching?(partId: string): boolean;
  getPartState(partId: string): { powered: boolean; rebooting: boolean } | null;
  isFaultActive(target: string, kind: 'snow' | 'net' | 'moisture' | 'gnss-denied'): boolean;
  /** Optional: the plant action log, for the operator-activation boundary of a recovery interval */
  getLog?(): Array<{ tSeconds: number; verb: string; target?: string }>;
  /** Optional: logged plant actions, so effective fixes and mode changes bump the config epoch */
  onAction?(listener: (entry: { verb: string; effective?: boolean; downtimeSeconds: number }) => void): () => void;
}

export interface ServiceModelState {
  accounts: AccountState[];
  providers: ProviderState[];
  endpoints: EndpointState[];
  configEpoch: number;
  eventEpoch: number;
  sessionEpoch: number;
  samples: ServiceSample[];
  history: ServiceHistoryEntry[];
  lastStatus: Array<[string, LayerStatus]>;
  /** Plant second of the last history sync (optional in older checkpoints) */
  lastUpdateS?: number | null;
  sampleSeq: number;
  /** Armed impairment episodes (absent in older checkpoints and in scenarios without impairments) */
  impairments?: LinkImpairmentState;
  /** Recovery intervals (absent in older checkpoints and in scenarios without them) */
  intervals?: RecoveryInterval[];
}
