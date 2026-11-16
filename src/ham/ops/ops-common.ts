/**
 * @file ops-common - Shared helpers for the pure ham operating models
 * @description The operating models never compute RF link budgets. The manager
 * supplies a `hears` callback and the models answer with the emissions they
 * radiate. Everything here is JSON-serializable and deterministic.
 */
import type { EmissionPayload, HamMode, LocalPosition, OnAirEmission } from '../ham-types';

/** Manager-supplied reception oracle: could `listenerId` decode this emission? */
export type HearsFn = (emission: OnAirEmission, listenerId: string) => { snrDb: number; decoded: boolean };

/** A transmission a remote agent has scheduled but not yet radiated */
export interface Outgoing {
  dueS: number;
  durS: number;
  sourceId: string;
  callsign?: string;
  text: string;
  freqHz: number;
  mode: HamMode;
  erpDbm: number;
  position?: LocalPosition;
  ctcssHz?: number | null;
  dmr?: { colorCode: number; timeSlot: 1 | 2; talkgroup: number };
  viaSatellite?: string;
  payload?: EmissionPayload;
  bandwidthHz?: number;
  /** Free tag so the owning module can map the emission back to a contact */
  tag?: string;
}

export interface OutboxState {
  seq: number;
  items: Outgoing[];
}

/** Queue of future transmissions; `popDue` turns the due ones into emissions. */
export class Outbox {
  private seq_ = 0;
  private items_: Outgoing[] = [];

  constructor(private readonly prefix_: string) {}

  push(o: Outgoing): void {
    this.items_.push(o);
    this.items_.sort((a, b) => a.dueS - b.dueS);
  }

  popDue(nowS: number): { emission: OnAirEmission; out: Outgoing }[] {
    const res: { emission: OnAirEmission; out: Outgoing }[] = [];
    while (this.items_.length > 0 && this.items_[0].dueS <= nowS) {
      const out = this.items_.shift() as Outgoing;
      this.seq_++;
      res.push({ emission: toEmission(`${this.prefix_}-${this.seq_}`, out), out });
    }
    return res;
  }

  /** Build an emission immediately (no queueing) */
  emitNow(out: Outgoing): { emission: OnAirEmission; out: Outgoing } {
    this.seq_++;
    return { emission: toEmission(`${this.prefix_}-${this.seq_}`, out), out };
  }

  get pending(): number {
    return this.items_.length;
  }

  getState(): OutboxState {
    return clone({ seq: this.seq_, items: this.items_ });
  }

  restoreState(s: OutboxState): void {
    const c = clone(s);
    this.seq_ = c.seq;
    this.items_ = c.items;
  }
}

export function toEmission(id: string, o: Outgoing): OnAirEmission {
  const e: OnAirEmission = {
    id,
    sourceId: o.sourceId,
    isPlayer: false,
    freqHz: o.freqHz,
    mode: o.mode,
    bandwidthHz: o.bandwidthHz ?? (o.mode === 'FM' ? 15000 : o.mode === 'DMR' ? 12500 : 2400),
    erpDbm: o.erpDbm,
    polarization: 'V',
    ctcssHz: o.ctcssHz ?? null,
    payload: o.payload ?? { kind: o.mode === 'DMR' ? 'dmr-voice' : 'voice', text: o.text, callsign: o.callsign },
    startS: o.dueS,
    endS: o.dueS + o.durS,
  };
  if (o.position) e.position = o.position;
  if (o.dmr) e.dmr = o.dmr;
  if (o.viaSatellite) e.viaSatellite = o.viaSatellite;
  return e;
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function sameFreq(aHz: number, bHz: number, tolHz = 3000): boolean {
  return Math.abs(aHz - bHz) <= tolHz;
}

export function distanceKm(a: LocalPosition, b: LocalPosition): number {
  return Math.hypot(a.xKm - b.xKm, a.yKm - b.yKm);
}

/** Lowercase, collapse whitespace, trim */
export function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/gu, ' ').trim();
}

export function sameCall(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.trim().toUpperCase() === b.trim().toUpperCase();
}
