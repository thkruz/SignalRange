/**
 * M05 evidence log. Turns plant actions, service samples and fired events into immutable entries
 * with a frozen copy of what the player saw. The log only records; `diagnostic-scorer.ts` judges.
 */

import type { PlantFault, PlantLogEntry } from '@app/physical/physical-plant-types';
import type { ServiceSample } from '@app/physical/service-types';

/** Typed copy of the service sample behind an observation (frozen with the entry, never re-read from the live model) */
export interface SampleSnapshot {
  serviceId: string;
  endpointId?: string;
  layer: string;
  metric: string;
  value: number | string;
  unit: string;
  provenance: string;
  /** Why the layer read this way ('link-lost'...); absent in older entries */
  cause?: string;
}

export type EvidenceKind = 'observation' | 'hypothesis' | 'action' | 'result';

export interface EvidenceEntry {
  id: string;
  kind: EvidenceKind;
  tS: number;
  /** Part, connector, cable, service, segment or event id */
  subject: string;
  source: { plantLogIndex?: number; sampleId?: string; workloadRunId?: string; eventId?: string };
  /** '<target>|<fact>' as the plant first revealed them by this entry */
  facts: string[];
  /** Frozen copy of what the player saw */
  text: string;
  /** Plant verb (plant entries only) */
  verb?: string;
  /** Fix verbs only */
  effective?: boolean;
  /** Test verbs: the test revealed a fault or a fact */
  positive?: boolean;
  /** Targets of the faults this entry revealed (including upstream power reveals) */
  revealedTargets?: string[];
  /** Targets of the faults this entry cleared */
  clearedTargets?: string[];
  /** Services showing down/degraded in the player's latest samples when this entry was written */
  symptoms?: string[];
  /** Typed sample snapshot (service sample observations only; older entries lack it and cannot satisfy sample predicates) */
  sample?: SampleSnapshot;
  /** Diagram selections (M17): the node ids the player marked on a path diagram */
  selection?: string[];
  /** Where the player saw or did this when it came through the terminal app (phase 40 D7) */
  provenance?: 'terminal-app';
  /** Terminal app screen id (app view and app action entries) */
  screen?: string;
  /** Kinds of the plant faults injected when an action or app entry was written (wrong-cause rules read this) */
  faultKinds?: string[];
}

/** Subject prefix of every terminal app entry: `skylink-app:<screen>` */
export const APP_SUBJECT_PREFIX = 'skylink-app:';
/** Subject prefix of the EuroSat modem app entries: `eurosat-app:<screen>` */
export const EUROSAT_APP_SUBJECT_PREFIX = 'eurosat-app:';
/** Verb of an app view entry */
export const APP_VIEW_VERB = 'app-view';
/** An unchanged view of one screen is recorded again only after this many sim seconds */
export const APP_VIEW_DEDUPE_S = 60;

export interface HypothesisEntry extends EvidenceEntry {
  kind: 'hypothesis';
  claim: { scope: 'part' | 'segment' | 'power' | 'provider' | 'endpoint'; targetId: string; cause?: string };
  confidence: 'low' | 'medium' | 'high';
  citedEntryIds: string[];
}

export type HypothesisInput = Omit<HypothesisEntry, 'id' | 'tS' | 'kind'>;

/** What the log needs from the plant (the manager satisfies this structurally) */
export interface EvidencePlant {
  getTimeSeconds(): number;
  getRevealedFacts(): string[];
  getFaults(): PlantFault[];
  getReport(): { firstCorrectActionS: number | null; trips: number; spotted: boolean };
  onAction(listener: (entry: PlantLogEntry, wasOutside: boolean, nowOutside: boolean) => void): () => void;
}

/** What the log needs from the service model */
export interface EvidenceServiceSource {
  onSample(listener: (sample: ServiceSample) => void): () => void;
  onEvent(listener: (eventId: string) => void): () => void;
}

export interface EvidenceLogState {
  seq: number;
  startS: number;
  entries: EvidenceEntry[];
  knownFacts: string[];
  sampleStatus: Array<[string, string]>;
  faultTargets: Array<[string, string]>;
}

export const TEST_VERBS: ReadonlySet<string> = new Set(['inspect', 'wiggle', 'feel', 'multimeter', 'cable-tester']);
const SKIPPED_VERBS: ReadonlySet<string> = new Set(['goOutside', 'returnInside', 'spotted']);

export class EvidenceLog {
  private readonly plant_: EvidencePlant;
  private readonly unsubs_: Array<() => void> = [];
  private entries_: EvidenceEntry[] = [];
  private seq_ = 0;
  private startS_: number;
  private knownFacts_: Set<string>;
  private sampleStatus_ = new Map<string, string>();
  private faultTargets_ = new Map<string, string>();

  constructor(plant: EvidencePlant, service: EvidenceServiceSource | null) {
    this.plant_ = plant;
    this.startS_ = plant.getTimeSeconds();
    this.knownFacts_ = new Set(plant.getRevealedFacts());
    this.refreshFaults_();
    this.unsubs_.push(plant.onAction((entry) => this.onPlantAction_(entry)));
    if (service) {
      this.unsubs_.push(service.onSample((sample) => this.onSample_(sample)));
      this.unsubs_.push(service.onEvent((eventId) => this.recordEvent(eventId)));
    }
  }

  dispose(): void {
    for (const unsub of this.unsubs_) unsub();
    this.unsubs_.length = 0;
  }

  getStartS(): number {
    return this.startS_;
  }

  entries(kind?: EvidenceKind, sinceS?: number): readonly EvidenceEntry[] {
    return this.entries_.filter((e) => (kind === undefined || e.kind === kind) && (sinceS === undefined || e.tS >= sinceS));
  }

  addHypothesis(h: HypothesisInput): HypothesisEntry {
    const entry: HypothesisEntry = {
      ...h,
      facts: [...h.facts],
      citedEntryIds: [...h.citedEntryIds],
      id: this.nextId_(),
      tS: this.plant_.getTimeSeconds(),
      kind: 'hypothesis',
    };
    this.push_(entry);

    return entry;
  }

  /** Record what the player marked on a path diagram (M17). Not a test: the scorer ignores it. */
  recordSelection(nodeIds: readonly string[], text: string, diagramId = 'service-path'): EvidenceEntry {
    this.refreshFaults_();
    const entry: EvidenceEntry = {
      id: this.nextId_(),
      kind: 'observation',
      tS: this.plant_.getTimeSeconds(),
      subject: diagramId,
      source: {},
      facts: [],
      text,
      verb: 'diagram-select',
      selection: [...nodeIds],
      symptoms: this.symptoms(),
    };
    this.push_(entry);

    return entry;
  }

  /** Diagram selection entries, oldest first */
  selections(diagramId?: string): readonly EvidenceEntry[] {
    return this.entries_.filter((e) => e.selection !== undefined && (diagramId === undefined || e.subject === diagramId));
  }

  /**
   * Phase 40 D7: the player opened a terminal app screen. One observation entry naming the screen
   * and what it showed. Dedupe: the same screen with the same `text` is recorded once per
   * `APP_VIEW_DEDUPE_S` sim seconds; a changed view is recorded at once. Returns null when deduped.
   */
  recordAppView(screen: string, text: string, facts: string[] = [], subjectPrefix: string = APP_SUBJECT_PREFIX): EvidenceEntry | null {
    const now = this.plant_.getTimeSeconds();
    for (let i = this.entries_.length - 1; i >= 0; i--) {
      const e = this.entries_[i];
      if (e.verb === APP_VIEW_VERB && e.screen === screen) {
        if (e.text === text && now - e.tS < APP_VIEW_DEDUPE_S) {
          return null;
        }
        break;
      }
    }
    this.refreshFaults_();
    const entry: EvidenceEntry = {
      id: this.nextId_(),
      kind: 'observation',
      tS: now,
      subject: `${subjectPrefix}${screen}`,
      source: {},
      facts,
      text,
      verb: APP_VIEW_VERB,
      provenance: 'terminal-app',
      screen,
      faultKinds: this.faultKinds_(),
      symptoms: this.symptoms(),
    };
    this.push_(entry);

    return entry;
  }

  /**
   * Phase 40 D7: an app action the plant does not already log (speed test, obstruction check, stop,
   * reset, Wi-Fi change). Reboot, snow melt and sleep are plant verbs and arrive through the plant
   * action log, so they are not recorded here. Never `effective`, so the fix scoring ignores it.
   */
  recordAppAction(screen: string, verb: string, text: string, subjectPrefix: string = APP_SUBJECT_PREFIX): EvidenceEntry {
    this.refreshFaults_();
    const entry: EvidenceEntry = {
      id: this.nextId_(),
      kind: 'action',
      tS: this.plant_.getTimeSeconds(),
      subject: `${subjectPrefix}${screen}`,
      source: {},
      facts: [],
      text,
      verb,
      provenance: 'terminal-app',
      screen,
      faultKinds: this.faultKinds_(),
      symptoms: this.symptoms(),
    };
    this.push_(entry);

    return entry;
  }

  /** Stamp an anchored event (called for every event the service model reports) */
  recordEvent(eventId: string, text = `Event ${eventId}`): EvidenceEntry {
    this.refreshFaults_();
    const entry: EvidenceEntry = {
      id: this.nextId_(),
      kind: 'result',
      tS: this.plant_.getTimeSeconds(),
      subject: eventId,
      source: { eventId },
      facts: [],
      text,
    };
    this.push_(entry);

    return entry;
  }

  /** The target a fault id resolved to (known even after the fault is cleared), or undefined */
  faultTarget(faultId: string): string | undefined {
    this.refreshFaults_();

    return this.faultTargets_.get(faultId);
  }

  /** Symptomatic services in the latest samples right now */
  symptoms(): string[] {
    const out = new Set<string>();
    for (const [key, status] of this.sampleStatus_) {
      if (status === 'down' || status === 'degraded') out.add(key.split('|')[0]);
    }

    return [...out];
  }

  /**
   * The player saw `<target>|<fact>` before the first effective action on `actionTarget`
   * (evidence-before-reseat). With no effective action yet, any earlier sighting counts.
   */
  observedBefore(target: string, fact: string, actionTarget: string): boolean {
    const key = `${target}|${fact}`;
    const ref = this.entries_.findIndex((e) => e.kind === 'action' && e.subject === actionTarget && e.effective === true);
    const limit = ref < 0 ? this.entries_.length : ref;

    return this.entries_.slice(0, limit).some((e) => e.facts.includes(key));
  }

  getState(): EvidenceLogState {
    return {
      seq: this.seq_,
      startS: this.startS_,
      entries: this.entries_.map((e) => JSON.parse(JSON.stringify(e)) as EvidenceEntry),
      knownFacts: [...this.knownFacts_],
      sampleStatus: [...this.sampleStatus_],
      faultTargets: [...this.faultTargets_],
    };
  }

  restoreState(state: EvidenceLogState | undefined): void {
    if (!state) {
      return;
    }
    this.seq_ = state.seq;
    this.startS_ = state.startS;
    this.entries_ = state.entries.map((e) => deepFreeze(JSON.parse(JSON.stringify(e)) as EvidenceEntry));
    this.knownFacts_ = new Set(state.knownFacts);
    this.sampleStatus_ = new Map(state.sampleStatus);
    this.faultTargets_ = new Map(state.faultTargets);
  }

  // ----------------------------------------------------------------- internals

  private nextId_(): string {
    this.seq_ += 1;

    return `ev-${this.seq_}`;
  }

  private push_(entry: EvidenceEntry): void {
    this.entries_.push(deepFreeze(entry));
  }

  private faultKinds_(): string[] {
    return [...new Set(this.plant_.getFaults().map((f) => f.kind))];
  }

  /** Remember fault id to target so revealed and cleared ids resolve after the fault is gone */
  private refreshFaults_(): void {
    for (const f of this.plant_.getFaults()) this.faultTargets_.set(f.id, f.target);
  }

  private targetsOf_(ids: readonly string[], fallback?: string): string[] {
    const out = new Set<string>();
    for (const id of ids) {
      const target = this.faultTargets_.get(id);
      if (target) out.add(target);
      else if (fallback) out.add(fallback);
    }

    return [...out];
  }

  private onPlantAction_(log: PlantLogEntry): void {
    // Faults an event injected since the last entry must resolve before this entry's targets do
    this.refreshFaults_();
    if (SKIPPED_VERBS.has(log.verb)) {
      return;
    }
    const isTest = TEST_VERBS.has(log.verb);
    const facts = this.plant_.getRevealedFacts().filter((f) => !this.knownFacts_.has(f));
    for (const f of facts) this.knownFacts_.add(f);
    const revealedTargets = this.targetsOf_(log.revealed);
    const clearedTargets = this.targetsOf_(log.cleared, log.target);

    const entry: EvidenceEntry = {
      id: this.nextId_(),
      kind: isTest ? 'observation' : 'action',
      tS: log.tSeconds,
      subject: log.target ?? log.verb,
      source: { plantLogIndex: this.entries_.filter((e) => e.source.plantLogIndex !== undefined).length },
      facts,
      text: log.observation,
      verb: log.verb,
      revealedTargets,
      clearedTargets,
      symptoms: this.symptoms(),
      faultKinds: this.faultKinds_(),
    };
    if (isTest) {
      entry.positive = log.revealed.length > 0 || facts.length > 0;
    }
    if (log.effective !== undefined) {
      entry.effective = log.effective;
    }
    this.push_(entry);
    this.refreshFaults_();
  }

  private onSample_(sample: ServiceSample): void {
    if (sample.value === 'unknown' || sample.metric !== 'status') {
      // Unreadable through this provenance, or a numeric reading: it must not replace the recorded layer status
    } else {
      this.sampleStatus_.set(`${sample.serviceId}|${sample.layer}|${sample.endpointId ?? ''}`, String(sample.value));
    }
    this.refreshFaults_();
    this.push_({
      id: this.nextId_(),
      kind: 'observation',
      tS: sample.tS,
      subject: sample.serviceId,
      source: { sampleId: sample.id },
      sample: {
        serviceId: sample.serviceId,
        ...(sample.endpointId === undefined ? {} : { endpointId: sample.endpointId }),
        layer: sample.layer,
        metric: sample.metric,
        value: sample.value,
        unit: sample.unit,
        provenance: sample.provenance,
        ...(sample.cause === undefined ? {} : { cause: sample.cause }),
      },
      facts: [],
      text: `${sample.layer} ${sample.metric}: ${sample.value}${sample.unit === 'state' ? '' : ` ${sample.unit}`} (${sample.provenance})`,
    });
  }
}

function deepFreeze<T extends object>(obj: T): T {
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value as object);
    }
  }

  return Object.freeze(obj);
}
