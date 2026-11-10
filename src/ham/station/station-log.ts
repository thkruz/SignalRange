/**
 * @file station-log - Bounded evidence logs for the C3 station (events, measurements, receptions)
 * @description Every entry carries scenario time and the station revision, so conditions can
 * insist on evidence gathered after a repair or after a named event.
 */

import type { HamMeasurement, ReceptionImpairment } from '../ham-types';

export const MAX_EVENTS = 400;
export const MAX_MEASUREMENTS = 300;
export const MAX_RECEPTIONS = 300;

export interface StationEvent {
  name: string;
  tS: number;
  revision: number;
  seq: number;
  data?: Record<string, string | number | boolean | null>;
}

export interface ReceptionLogEntry {
  tS: number;
  revision: number;
  seq: number;
  deviceId: string;
  emitterId: string;
  emissionId: string;
  intelligibility: number;
  snrDb: number;
  audible: boolean;
  impairments: ReceptionImpairment[];
}

export interface BestReception {
  deviceId: string;
  intelligibility: number;
  snrDb: number;
  tS: number;
  revision: number;
  seq: number;
}

export interface StationLogState {
  seq: number;
  events: StationEvent[];
  measurements: HamMeasurement[];
  receptions: ReceptionLogEntry[];
  /** emitterId -> best audible reception per revision (latest revision kept per device) */
  best: Record<string, BestReception[]>;
  notes: { tS: number; text: string }[];
}

export const emptyLog = (): StationLogState => ({ seq: 0, events: [], measurements: [], receptions: [], best: {}, notes: [] });

const push = <T>(arr: T[], v: T, max: number): void => {
  arr.push(v);
  if (arr.length > max) arr.splice(0, arr.length - max);
};

export class StationLog {
  constructor(public state: StationLogState) {}

  nextSeq(): number {
    this.state.seq += 1;

    return this.state.seq;
  }

  event(name: string, tS: number, revision: number, data?: StationEvent['data']): StationEvent {
    const e: StationEvent = { name, tS, revision, seq: this.nextSeq(), data };
    push(this.state.events, e, MAX_EVENTS);

    return e;
  }

  measurement(m: Omit<HamMeasurement, 'id'>): HamMeasurement {
    const full: HamMeasurement = { ...m, id: `m-${this.nextSeq()}` };
    push(this.state.measurements, full, MAX_MEASUREMENTS);

    return full;
  }

  reception(r: Omit<ReceptionLogEntry, 'seq'>): void {
    const seq = this.nextSeq();
    push(this.state.receptions, { ...r, seq }, MAX_RECEPTIONS);
    if (!r.audible) return;
    const list = this.state.best[r.emitterId] ?? [];
    const prev = list.find((b) => b.deviceId === r.deviceId && b.revision === r.revision);
    if (prev) {
      if (r.intelligibility > prev.intelligibility) Object.assign(prev, { intelligibility: r.intelligibility, snrDb: r.snrDb, tS: r.tS, seq });
    } else {
      list.push({ deviceId: r.deviceId, intelligibility: r.intelligibility, snrDb: r.snrDb, tS: r.tS, revision: r.revision, seq });
      if (list.length > 40) list.splice(0, list.length - 40);
    }
    this.state.best[r.emitterId] = list;
  }

  events(name: string): StationEvent[] {
    return this.state.events.filter((e) => e.name === name);
  }

  eventsWithPrefix(prefix: string): StationEvent[] {
    return this.state.events.filter((e) => e.name.startsWith(prefix));
  }

  firstEvent(name: string): StationEvent | undefined {
    return this.state.events.find((e) => e.name === name);
  }

  /** Sequence number after which evidence counts (first occurrence of afterEvent); null when it never happened */
  afterSeq(afterEvent?: string): number | null {
    if (!afterEvent) return 0;
    const e = this.firstEvent(afterEvent);

    return e ? e.seq : null;
  }
}
