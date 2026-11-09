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
}

export type LinkSample = LinkProfile & { provenance: 'authored' | 'sdk' };

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
  remoteLeg?: { kind: 'fiber' | 'radio'; rttMs: number; downMbps: number };
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

export interface ServiceModelConfig {
  paths: ServicePathConfig[];
  accounts: AccountState[];
  providers: ProviderState[];
  endpoints?: EndpointState[];
  /** Override the default seconds a sample stays current, per provenance */
  maxAgeS?: Partial<Record<SampleProvenance, number>>;
}

export type SampleMetric = 'status' | 'rttMs' | 'downMbps' | 'upMbps' | 'lossPct';

export interface ServiceSample {
  id: string;
  serviceId: string;
  endpointId?: string;
  layer: ServiceLayer;
  metric: SampleMetric;
  value: number | LayerStatus;
  unit: 'ms' | 'Mbps' | '%' | 'state';
  tS: number;
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
}
