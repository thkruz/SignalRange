/**
 * @file service-model - Layered service state, samples and freshness (Campaign 6, M04)
 * @description Truth about each service path is computed layer by layer from the plant
 * (power, local gear, terminal registration) and from authored account, provider and endpoint
 * state. The player never sees the truth directly: they take samples through a provenance,
 * and a sample goes stale or invalidated when time, config, events or a reload move on.
 * Core stays DOM-free. Layers are cached per plant second; `update` also records status
 * changes in `history()` (the moisture flaps on a registration layer are real history).
 */

import { AuthoredLinkSource } from './authored-link-source';
import {
  type AccountState,
  type EndpointState,
  type Freshness,
  type LayerReading,
  type LayerStatus,
  type LinkQualitySource,
  type LinkSample,
  type PlantReader,
  type ProviderState,
  type SampleMetric,
  type SampleProvenance,
  SERVICE_LAYERS,
  type ServiceHistoryEntry,
  type ServiceLayer,
  type ServiceModelConfig,
  type ServiceModelState,
  type ServicePathConfig,
  type ServiceSample,
} from './service-types';

const DEFAULT_MAX_AGE_S: Record<SampleProvenance, number> = {
  'device-indicator': 15,
  'local-probe': 60,
  'terminal-app': 60,
  'provider-portal': 300,
  'pilot-report': 600,
  'endpoint-report': 300,
  'workload-run': 120,
};

/** Which layers a provenance can observe. The application layer takes only end-to-end observations. */
export const READABLE: Record<SampleProvenance, readonly ServiceLayer[]> = {
  'device-indicator': ['power', 'local', 'registration'],
  'local-probe': ['local', 'registration'],
  'terminal-app': ['registration', 'account'],
  'provider-portal': ['account', 'provider'],
  'pilot-report': ['registration', 'provider'],
  'endpoint-report': ['application'],
  'workload-run': ['application'],
};

/** Provenances that can measure numbers from the link, and on which layer */
export const NUMERIC_READABLE: Partial<Record<SampleProvenance, ServiceLayer>> = {
  'local-probe': 'registration',
  'terminal-app': 'registration',
  'workload-run': 'application',
};

const METRIC_UNIT: Record<SampleMetric, ServiceSample['unit']> = {
  status: 'state',
  rttMs: 'ms',
  downMbps: 'Mbps',
  upMbps: 'Mbps',
  lossPct: '%',
};

/** Moisture on the terminal link drops registration for FLAP_DOWN_S of every FLAP_PERIOD_S (plant moisture is a steady loss, not an intermittent drop) */
export const FLAP_PERIOD_S = 90;
export const FLAP_DOWN_S = 30;

const HISTORY_CAP = 500;
const SAMPLE_CAP = 300;

export interface ServiceModelDeps {
  now(): number;
}

export class ServiceModel {
  private readonly paths_: ServicePathConfig[];
  private readonly accounts_ = new Map<string, AccountState>();
  private readonly providers_ = new Map<string, ProviderState>();
  private readonly endpoints_ = new Map<string, EndpointState>();
  private readonly plant_: PlantReader;
  private readonly link_: LinkQualitySource;
  private readonly deps_: ServiceModelDeps;
  private readonly maxAge_: Record<SampleProvenance, number>;
  private readonly unsubscribe_: (() => void) | null;
  private configEpoch_ = 0;
  private eventEpoch_ = 0;
  private sessionEpoch_ = 0;
  private sampleSeq_ = 0;
  private samples_: ServiceSample[] = [];
  private history_: ServiceHistoryEntry[] = [];
  private lastStatus_ = new Map<string, LayerStatus>();
  private lastUpdateS_: number | null = null;
  private cache_ = new Map<string, LayerReading[]>();
  private cacheTimeS_ = Number.NaN;
  private readonly sampleListeners_: Array<(sample: ServiceSample) => void> = [];
  private readonly eventListeners_: Array<(eventId: string) => void> = [];

  constructor(cfg: ServiceModelConfig, plant: PlantReader, link: LinkQualitySource | undefined, deps: ServiceModelDeps) {
    this.paths_ = cfg.paths;
    for (const a of cfg.accounts) this.accounts_.set(a.id, { ...a });
    for (const p of cfg.providers) this.providers_.set(p.id, { ...p, noticeIds: [...p.noticeIds] });
    for (const e of cfg.endpoints ?? []) this.endpoints_.set(e.id, { ...e });
    this.plant_ = plant;
    this.deps_ = deps;
    this.maxAge_ = { ...DEFAULT_MAX_AGE_S, ...cfg.maxAgeS };
    this.link_ =
      link ??
      new AuthoredLinkSource({
        path: (id) => this.paths_.find((p) => p.id === id),
        layers: (id) => this.layers(id),
        account: (id) => this.accounts_.get(id),
        provider: (id) => this.providers_.get(id),
      });
    // A fix that worked, a mode change or any downtime changes what an earlier reading meant
    this.unsubscribe_ =
      plant.onAction?.((entry) => {
        this.cacheTimeS_ = Number.NaN;
        if (entry.verb === 'setMode' || entry.effective === true || entry.downtimeSeconds > 0) {
          this.bumpConfig(`action:${entry.verb}`);
        }
      }) ?? null;
  }

  dispose(): void {
    this.unsubscribe_?.();
  }

  // ------------------------------------------------------------------ truth

  getServiceIds(): string[] {
    return this.paths_.map((p) => p.id);
  }

  getPath(serviceId: string): ServicePathConfig | undefined {
    return this.paths_.find((p) => p.id === serviceId);
  }

  getAccount(id: string): AccountState | undefined {
    return this.accounts_.get(id);
  }

  getProvider(id: string): ProviderState | undefined {
    return this.providers_.get(id);
  }

  getEndpoint(id: string): EndpointState | undefined {
    return this.endpoints_.get(id);
  }

  /** Service ids whose terminal part is in the list (maps a power forecast's `servicesAvailable` part ids) */
  servicesForParts(partIds: string[]): string[] {
    return this.paths_.filter((p) => partIds.includes(p.terminalPartId)).map((p) => p.id);
  }

  /** The truth for every layer in order. Never shown raw: the UI goes through `takeSample`. */
  layers(serviceId: string): LayerReading[] {
    const now = this.plant_.getTimeSeconds();
    if (now !== this.cacheTimeS_) {
      this.cache_.clear();
      this.cacheTimeS_ = now;
    }
    let readings = this.cache_.get(serviceId);
    if (!readings) {
      readings = this.compute_(serviceId);
      this.cache_.set(serviceId, readings);
    }

    return readings;
  }

  /** The first layer that is not up, or null when everything is up */
  firstFailure(serviceId: string): LayerReading | null {
    return this.layers(serviceId).find((l) => l.status !== 'up') ?? null;
  }

  /** Call once per plant step: records every layer status change in the history */
  update(): void {
    const tS = this.plant_.getTimeSeconds();
    const prevS = this.lastUpdateS_;
    this.lastUpdateS_ = tS;
    for (const path of this.paths_) {
      if (prevS !== null && tS - prevS > 0) {
        this.recordFlapEdges_(path, prevS, tS);
      }
      for (const reading of this.layers(path.id)) {
        const key = `${path.id}:${reading.layer}`;
        const previous = this.lastStatus_.get(key);
        this.lastStatus_.set(key, reading.status);
        if (previous !== undefined && previous !== reading.status) {
          this.history_.push({ tS, serviceId: path.id, layer: reading.layer, from: previous, to: reading.status });
        }
      }
    }
    if (this.history_.length > HISTORY_CAP) {
      this.history_ = this.history_.slice(-HISTORY_CAP);
    }
  }

  /**
   * A sync can cross whole moisture-flap periods (a verb skip, an operator jump). Record every
   * registration edge strictly inside (prevS, nowS) so the history does not depend on the skip length.
   */
  private recordFlapEdges_(path: ServicePathConfig, prevS: number, nowS: number): void {
    const flapping = (path.linkTargetIds ?? []).some((t) => this.plant_.isFaultActive(t, 'moisture'));
    const key = `${path.id}:registration`;
    if (!flapping || this.lastStatus_.get(key) === undefined) {
      return;
    }
    const edges: Array<{ tS: number; status: LayerStatus }> = [];
    for (let k = Math.floor(prevS / FLAP_PERIOD_S); k * FLAP_PERIOD_S < nowS; k++) {
      edges.push({ tS: k * FLAP_PERIOD_S, status: 'down' }, { tS: k * FLAP_PERIOD_S + FLAP_DOWN_S, status: 'up' });
    }
    for (const edge of edges) {
      if (edge.tS <= prevS || edge.tS >= nowS) {
        continue;
      }
      const previous = this.lastStatus_.get(key) as LayerStatus;
      if (previous !== edge.status) {
        this.history_.push({ tS: edge.tS, serviceId: path.id, layer: 'registration', from: previous, to: edge.status });
        this.lastStatus_.set(key, edge.status);
      }
    }
  }

  history(serviceId: string): ServiceHistoryEntry[] {
    return this.history_.filter((h) => h.serviceId === serviceId).map((h) => ({ ...h }));
  }

  // ---------------------------------------------------------------- samples

  /**
   * Observe a layer through a provenance. A provenance that cannot see the layer (a green light
   * cannot establish end-to-end service) yields an `unknown` sample, which is never current.
   */
  takeSample(serviceId: string, layer: ServiceLayer, via: SampleProvenance, endpointId?: string, metric: SampleMetric = 'status'): ServiceSample {
    const tS = this.deps_.now();
    let value: number | LayerStatus = 'unknown';
    let usedMetric: SampleMetric = 'status';

    if (this.getPath(serviceId) && READABLE[via].includes(layer)) {
      value = this.statusFor_(serviceId, layer, endpointId);
      if (metric !== 'status' && NUMERIC_READABLE[via] === layer) {
        const link = this.link_.sample(serviceId, tS);
        if (link) {
          value = link[metric];
          usedMetric = metric;
        } else {
          value = 'down';
        }
      }
    }

    this.sampleSeq_ += 1;
    const sample: ServiceSample = {
      id: `sample-${this.sampleSeq_}`,
      serviceId,
      endpointId,
      layer,
      metric: usedMetric,
      value,
      unit: METRIC_UNIT[usedMetric],
      tS,
      provenance: via,
      configEpoch: this.configEpoch_,
      eventEpoch: this.eventEpoch_,
      sessionEpoch: this.sessionEpoch_,
      maxAgeS: this.maxAge_[via],
    };
    this.samples_.push(sample);
    if (this.samples_.length > SAMPLE_CAP) {
      this.samples_ = this.samples_.slice(-SAMPLE_CAP);
    }
    for (const listener of [...this.sampleListeners_]) listener(sample);

    return sample;
  }

  freshness(sample: ServiceSample): Freshness {
    if (sample.value === 'unknown') {
      return 'unavailable';
    }
    if (sample.sessionEpoch !== this.sessionEpoch_) {
      return 'stale';
    }
    if (sample.configEpoch !== this.configEpoch_ || sample.eventEpoch !== this.eventEpoch_) {
      return 'invalidated';
    }

    return this.deps_.now() - sample.tS > sample.maxAgeS ? 'stale' : 'current';
  }

  /** Every kept sample of a service in the order they were taken (copies) */
  samplesFor(serviceId: string): ServiceSample[] {
    return this.samples_.filter((s) => s.serviceId === serviceId).map((s) => ({ ...s }));
  }

  latest(serviceId: string, layer: ServiceLayer, endpointId?: string): ServiceSample | null {
    for (let i = this.samples_.length - 1; i >= 0; i--) {
      const s = this.samples_[i];
      if (s.serviceId === serviceId && s.layer === layer && s.endpointId === endpointId) {
        return s;
      }
    }

    return null;
  }

  // ----------------------------------------------------------------- change

  bumpConfig(_reason: string): void {
    this.configEpoch_ += 1;
    this.cacheTimeS_ = Number.NaN;
  }

  bumpEvent(eventId: string): void {
    this.eventEpoch_ += 1;
    this.cacheTimeS_ = Number.NaN;
    for (const listener of [...this.eventListeners_]) listener(eventId);
  }

  /** M05: the evidence log stamps every sample the player takes */
  onSample(listener: (sample: ServiceSample) => void): () => void {
    this.sampleListeners_.push(listener);

    return () => {
      const i = this.sampleListeners_.indexOf(listener);
      if (i >= 0) this.sampleListeners_.splice(i, 1);
    };
  }

  /** M05: the evidence log stamps every anchored event that fires */
  onEvent(listener: (eventId: string) => void): () => void {
    this.eventListeners_.push(listener);

    return () => {
      const i = this.eventListeners_.indexOf(listener);
      if (i >= 0) this.eventListeners_.splice(i, 1);
    };
  }

  /** The link profile the source reports now (authored or SDK), or null when the terminal carries nothing */
  linkProfile(serviceId: string): LinkSample | null {
    return this.getPath(serviceId) ? this.link_.sample(serviceId, this.deps_.now()) : null;
  }

  getEpochs(): { config: number; event: number; session: number } {
    return { config: this.configEpoch_, event: this.eventEpoch_, session: this.sessionEpoch_ };
  }

  setAccount(patch: Partial<AccountState> & { id: string }): void {
    const current = this.accounts_.get(patch.id);
    if (current) {
      this.accounts_.set(patch.id, { ...current, ...patch });
      this.cacheTimeS_ = Number.NaN;
    }
  }

  setProvider(patch: Partial<ProviderState> & { id: string }): void {
    const current = this.providers_.get(patch.id);
    if (current) {
      this.providers_.set(patch.id, { ...current, ...patch });
      this.cacheTimeS_ = Number.NaN;
    }
  }

  setEndpoint(patch: Partial<EndpointState> & { id: string }): void {
    const current = this.endpoints_.get(patch.id);
    if (current) {
      this.endpoints_.set(patch.id, { ...current, ...patch });
      this.cacheTimeS_ = Number.NaN;
    }
  }

  getState(): ServiceModelState {
    return {
      accounts: [...this.accounts_.values()].map((a) => ({ ...a })),
      providers: [...this.providers_.values()].map((p) => ({ ...p, noticeIds: [...p.noticeIds] })),
      endpoints: [...this.endpoints_.values()].map((e) => ({ ...e })),
      configEpoch: this.configEpoch_,
      eventEpoch: this.eventEpoch_,
      sessionEpoch: this.sessionEpoch_,
      samples: this.samples_.map((s) => ({ ...s })),
      history: this.history_.map((h) => ({ ...h })),
      lastStatus: [...this.lastStatus_.entries()],
      lastUpdateS: this.lastUpdateS_,
      sampleSeq: this.sampleSeq_,
    };
  }

  /** A restore starts a new session: every earlier sample reads stale until it is retaken */
  restoreState(state: ServiceModelState | undefined): void {
    if (!state) {
      return;
    }
    this.accounts_.clear();
    for (const a of state.accounts) this.accounts_.set(a.id, { ...a });
    this.providers_.clear();
    for (const p of state.providers) this.providers_.set(p.id, { ...p, noticeIds: [...p.noticeIds] });
    this.endpoints_.clear();
    for (const e of state.endpoints) this.endpoints_.set(e.id, { ...e });
    this.configEpoch_ = state.configEpoch;
    this.eventEpoch_ = state.eventEpoch;
    this.sessionEpoch_ = state.sessionEpoch + 1;
    this.samples_ = state.samples.map((s) => ({ ...s }));
    this.history_ = state.history.map((h) => ({ ...h }));
    this.lastStatus_ = new Map(state.lastStatus);
    this.lastUpdateS_ = state.lastUpdateS ?? null;
    this.sampleSeq_ = state.sampleSeq;
    this.cacheTimeS_ = Number.NaN;
  }

  // ---------------------------------------------------------------- private

  private statusFor_(serviceId: string, layer: ServiceLayer, endpointId?: string): LayerStatus {
    if (layer === 'application' && endpointId) {
      const upstream = this.layers(serviceId).find((l) => l.layer !== 'application' && l.status === 'down');
      if (upstream) {
        return 'down';
      }

      return this.endpointStatus_(endpointId).status;
    }

    return this.layers(serviceId).find((l) => l.layer === layer)?.status ?? 'unknown';
  }

  private compute_(serviceId: string): LayerReading[] {
    const path = this.getPath(serviceId);
    if (!path) {
      return SERVICE_LAYERS.map((layer) => ({ layer, status: 'unknown' as const, reason: 'no-such-service' }));
    }
    const power = this.power_(path);
    const local = this.local_(path);
    const registration = this.registration_(path, power);
    const account = this.account_(path);
    const provider = this.provider_(path);
    const application = this.application_(path, [power, local, registration, account, provider]);

    return [power, local, registration, account, provider, application];
  }

  private power_(path: ServicePathConfig): LayerReading {
    const state = this.plant_.getPartState(path.terminalPartId);
    // A rebooting terminal is supplied (the boot shows up on the registration layer)
    if (state && !state.powered && !state.rebooting) {
      return { layer: 'power', status: 'down', reason: 'no-power', subjectId: path.terminalPartId };
    }

    return { layer: 'power', status: 'up', reason: 'ok' };
  }

  private local_(path: ServicePathConfig): LayerReading {
    for (const id of path.localPartIds) {
      const state = this.plant_.getPartState(id);
      if (state?.rebooting) {
        return { layer: 'local', status: 'down', reason: 'local-rebooting', subjectId: id };
      }
      if (state && !state.powered) {
        return { layer: 'local', status: 'down', reason: 'local-unpowered', subjectId: id };
      }
      if (this.plant_.isLinkDropped(id)) {
        return { layer: 'local', status: 'down', reason: 'local-link-dropped', subjectId: id };
      }
    }

    return { layer: 'local', status: 'up', reason: 'ok' };
  }

  private registration_(path: ServicePathConfig, power: LayerReading): LayerReading {
    const id = path.terminalPartId;
    const down = (reason: string): LayerReading => ({ layer: 'registration', status: 'down', reason, subjectId: id });
    if (power.status !== 'up') {
      return down('upstream-power');
    }
    if (this.plant_.getPartState(id)?.rebooting) {
      return down('terminal-booting');
    }
    if (this.plant_.isStarting(id)) {
      return down('terminal-starting');
    }
    if (!this.plant_.modeServesTraffic(id)) {
      return down('mode-standby');
    }
    if (this.plant_.isFaultActive(id, 'snow') || this.plant_.isFaultActive(id, 'net')) {
      return down('obstructed');
    }
    if (this.plant_.isLinkDropped(id)) {
      return down('link-dropped');
    }
    if ((path.linkTargetIds ?? []).some((t) => this.plant_.isFaultActive(t, 'moisture')) && this.plant_.getTimeSeconds() % FLAP_PERIOD_S < FLAP_DOWN_S) {
      return down('moisture-flap');
    }

    return { layer: 'registration', status: 'up', reason: 'ok' };
  }

  private account_(path: ServicePathConfig): LayerReading {
    const account = this.accounts_.get(path.accountId);
    const make = (status: LayerStatus, reason: string): LayerReading => ({ layer: 'account', status, reason, subjectId: path.accountId });
    if (!account) {
      return make('unknown', 'no-such-account');
    }
    if (!account.authorized) {
      return make('down', 'account-unauthorized');
    }
    if (account.restriction) {
      return make('degraded', `account-${account.restriction}`);
    }
    if (account.capacityFactor < 1) {
      return make('degraded', 'account-capacity');
    }

    return make('up', 'ok');
  }

  private provider_(path: ServicePathConfig): LayerReading {
    const provider = this.providers_.get(path.providerId);
    const make = (status: LayerStatus, reason: string): LayerReading => ({ layer: 'provider', status, reason, subjectId: path.providerId });
    if (!provider) {
      return make('unknown', 'no-such-provider');
    }
    if (provider.status === 'outage') {
      return make('down', 'provider-outage');
    }
    if (provider.status === 'restricted') {
      return make('degraded', 'provider-restricted');
    }
    if (provider.capacityFactor < 1) {
      return make('degraded', 'provider-capacity');
    }

    return make('up', 'ok');
  }

  /** End to end: down when any layer below is down, degraded when any is degraded, else the endpoints decide */
  private application_(path: ServicePathConfig, below: LayerReading[]): LayerReading {
    const down = below.find((l) => l.status === 'down');
    if (down) {
      return { layer: 'application', status: 'down', reason: `upstream-${down.layer}`, subjectId: down.subjectId };
    }
    for (const endpointId of path.endpointIds ?? []) {
      const endpoint = this.endpointStatus_(endpointId);
      if (endpoint.status !== 'up') {
        return { layer: 'application', status: endpoint.status, reason: endpoint.reason, subjectId: endpointId };
      }
    }
    const degraded = below.find((l) => l.status === 'degraded');
    if (degraded) {
      return { layer: 'application', status: 'degraded', reason: `upstream-${degraded.layer}`, subjectId: degraded.subjectId };
    }

    return { layer: 'application', status: 'up', reason: 'ok' };
  }

  private endpointStatus_(id: string): { status: LayerStatus; reason: string } {
    const endpoint = this.endpoints_.get(id);
    if (!endpoint) {
      return { status: 'unknown', reason: 'no-such-endpoint' };
    }
    if (!endpoint.reachable) {
      return { status: 'down', reason: 'endpoint-unreachable' };
    }
    if (endpoint.policy) {
      return { status: 'degraded', reason: `endpoint-${endpoint.policy}` };
    }

    return { status: 'up', reason: 'ok' };
  }
}
