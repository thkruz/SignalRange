/**
 * @file job-tags - Job tags the learner puts on bench parts
 * @description The match worksheets ("match each part to its job") are answered on the bench: click a
 * part, pick its job in the Close-up. This store holds the picks per station manager and per worksheet
 * field; the Notebook worksheet reads them on submit, grading stays in the manager. Parts that do not
 * correspond to a bench device (symbols, sites, services) stay as dropdowns in the worksheet.
 * Test id for a tag button: ham-tag-<worksheetId>-<fieldId>-<part slug>-<option index>.
 */

import type { Worksheet, WorksheetField } from '../../ham-station-config';
import { tid } from '../ui-kit';

export interface TagDevice {
  id: string;
  kind: string;
  label: string;
  removed?: boolean;
}

/** The slice of the station manager the tag logic needs (the real manager satisfies it) */
export interface TagHost {
  config: { worksheets: Worksheet[] };
  devices(): readonly TagDevice[];
  worksheet(id: string): { correct?: boolean } | undefined;
}

export interface TagTarget {
  worksheetId: string;
  fieldId: string;
  fieldLabel: string;
  part: string;
  deviceId: string;
  options: string[];
}

const KIND_FOR_PART: Record<string, string> = {
  antenna: 'antenna',
  laptop: 'laptop',
  'usb sdr': 'sdr',
  'sma adapter': 'adapter',
  'coax jumper': 'coax',
};

/** Which bench device a worksheet part name stands for: exact label, then label contains the part, then device kind */
export function mapPartToDevice(part: string, devices: readonly TagDevice[], taken: ReadonlySet<string> = new Set()): string | null {
  const p = part.trim().toLowerCase();
  const free = devices.filter((d) => !d.removed && !taken.has(d.id));
  const exact = free.find((d) => d.label.trim().toLowerCase() === p);
  if (exact) return exact.id;
  const contains = free.find((d) => p.length > 0 && d.label.toLowerCase().includes(p));
  if (contains) return contains.id;
  const kind = KIND_FOR_PART[p];

  return (kind ? free.find((d) => d.kind === kind)?.id : undefined) ?? null;
}

/** Part name -> device id for the parts of one match field that live on the bench (each device claimed once) */
export function mapFieldParts(field: WorksheetField, devices: readonly TagDevice[]): Map<string, string> {
  const out = new Map<string, string>();
  if (field.kind !== 'match' || typeof field.answer !== 'object') return out;
  const taken = new Set<string>();
  for (const part of Object.keys(field.answer)) {
    const id = mapPartToDevice(part, devices, taken);
    if (id) {
      out.set(part, id);
      taken.add(id);
    }
  }

  return out;
}

export const tagSlug = (part: string): string => tid(part.toLowerCase()).replace(/^-+|-+$/gu, '');
export const tagTestId = (worksheetId: string, fieldId: string, part: string, index: number): string => tid('ham-tag', worksheetId, fieldId, tagSlug(part), index);

/** Every bench-taggable part of every match field */
export function tagTargets(host: TagHost, openOnly = false): TagTarget[] {
  const out: TagTarget[] = [];
  const devices = host.devices();
  for (const ws of host.config.worksheets) {
    if (openOnly && host.worksheet(ws.id)?.correct) continue;
    for (const f of ws.fields) {
      for (const [part, deviceId] of mapFieldParts(f, devices)) {
        out.push({ worksheetId: ws.id, fieldId: f.id, fieldLabel: f.label, part, deviceId, options: f.options ?? [] });
      }
    }
  }

  return out;
}

type Listener = () => void;

export class JobTagStore {
  private readonly tags_ = new WeakMap<object, Map<string, string>>();
  private readonly versions_ = new WeakMap<object, number>();
  private readonly listeners_ = new Set<Listener>();

  private static key_(ws: string, field: string, part: string): string {
    return JSON.stringify([ws, field, part]);
  }

  get(host: object, ws: string, field: string, part: string): string | undefined {
    return this.tags_.get(host)?.get(JobTagStore.key_(ws, field, part));
  }

  /** Tag a part; picking the job it already has clears it */
  set(host: object, ws: string, field: string, part: string, job: string | null): void {
    let m = this.tags_.get(host);
    if (!m) {
      m = new Map();
      this.tags_.set(host, m);
    }
    const k = JobTagStore.key_(ws, field, part);
    if (job === null || m.get(k) === job) m.delete(k);
    else m.set(k, job);
    this.versions_.set(host, this.version(host) + 1);
    for (const l of [...this.listeners_]) l();
  }

  reset(host: object): void {
    this.tags_.delete(host);
    this.versions_.set(host, this.version(host) + 1);
    for (const l of [...this.listeners_]) l();
  }

  /** Changes whenever a tag does; fold it into render signatures */
  version(host: object): number {
    return this.versions_.get(host) ?? 0;
  }

  subscribe(fn: Listener): () => void {
    this.listeners_.add(fn);

    return () => this.listeners_.delete(fn);
  }

  /** Short text under a bench device: the jobs tagged on it, joined */
  deviceTagText(host: TagHost, deviceId: string, max = 30): string | null {
    const jobs: string[] = [];
    for (const t of tagTargets(host)) {
      if (t.deviceId !== deviceId) continue;
      const job = this.get(host, t.worksheetId, t.fieldId, t.part);
      if (job) jobs.push(job);
    }
    if (jobs.length === 0) return null;
    const text = jobs.join(' / ');

    return text.length > max ? `${text.slice(0, max - 1)}\u2026` : text;
  }
}

export const jobTags = new JobTagStore();
