import { describe, expect, it } from 'vitest';
import type { Worksheet } from '../../../src/ham/ham-station-config';
import type { HamStationManager } from '../../../src/ham/ham-station-manager';
import { buildJobTagSection } from '../../../src/ham/ui/bench/job-tag-section';
import { JobTagStore, mapFieldParts, mapPartToDevice, type TagDevice, type TagHost, tagSlug, tagTargets, tagTestId } from '../../../src/ham/ui/bench/job-tags';
import { buildMatchField, NOT_TAGGED } from '../../../src/ham/ui/panels/worksheet-match';

const devices: TagDevice[] = [
  { id: 'laptop', kind: 'laptop', label: 'Laptop' },
  { id: 'sdr', kind: 'sdr', label: 'USB SDR receiver' },
  { id: 'sdr-adapter', kind: 'adapter', label: 'SMA adapter' },
  { id: 'sdr-coax', kind: 'coax', label: 'Short coax jumper' },
  { id: 'sdr-ant', kind: 'antenna', label: 'Simple vertical antenna' },
];

const JOBS = ['Captures the radio wave', 'Carries the signal to the receiver'];
const sheet: Worksheet = {
  id: 'ws1',
  title: 'T',
  prompt: 'p',
  explanation: 'e',
  fields: [
    {
      id: 'order',
      label: 'Receive path',
      kind: 'match',
      options: JOBS,
      answer: { Antenna: JOBS[0], 'Coax jumper': JOBS[1], 'Under the power line': 'x' },
    },
    { id: 'n', label: 'N', kind: 'number', answer: 1 },
  ],
};

function host(correct = false): TagHost & HamStationManager {
  return { config: { worksheets: [sheet] }, devices: () => devices, worksheet: () => ({ correct }), device: () => undefined } as unknown as TagHost & HamStationManager;
}

describe('mapPartToDevice', () => {
  it('prefers exact label, then label contains, then kind', () => {
    expect(mapPartToDevice('Laptop', devices)).toBe('laptop');
    expect(mapPartToDevice('simple vertical antenna', devices)).toBe('sdr-ant');
    expect(mapPartToDevice('USB SDR', devices)).toBe('sdr');
    expect(mapPartToDevice('Coax jumper', devices)).toBe('sdr-coax');
    expect(mapPartToDevice('Antenna', devices)).toBe('sdr-ant');
    expect(mapPartToDevice('SMA adapter', devices)).toBe('sdr-adapter');
  });
  it('kind fallback works when the label does not contain the part', () => {
    const d: TagDevice[] = [{ id: 'a', kind: 'antenna', label: 'Dipole' }];
    expect(mapPartToDevice('Antenna', d)).toBe('a');
  });
  it('returns null for parts with no device and skips removed or taken devices', () => {
    expect(mapPartToDevice('Under the power line', devices)).toBeNull();
    expect(mapPartToDevice('', devices)).toBeNull();
    expect(mapPartToDevice('Laptop', [{ ...devices[0], removed: true }])).toBeNull();
    expect(mapPartToDevice('Laptop', devices, new Set(['laptop']))).toBeNull();
  });
  it('claims each device once per field', () => {
    const m = mapFieldParts(sheet.fields[0], devices);
    expect([...m.entries()]).toEqual([
      ['Antenna', 'sdr-ant'],
      ['Coax jumper', 'sdr-coax'],
    ]);
  });
});

describe('JobTagStore', () => {
  it('stores, toggles, versions and notifies per host', () => {
    const s = new JobTagStore();
    const h1 = {};
    const h2 = {};
    let n = 0;
    const off = s.subscribe(() => n++);
    s.set(h1, 'w', 'f', 'Antenna', 'A');
    expect(s.get(h1, 'w', 'f', 'Antenna')).toBe('A');
    expect(s.get(h2, 'w', 'f', 'Antenna')).toBeUndefined();
    s.set(h1, 'w', 'f', 'Antenna', 'A');
    expect(s.get(h1, 'w', 'f', 'Antenna')).toBeUndefined();
    expect(s.version(h1)).toBe(2);
    s.set(h1, 'w', 'f', 'Antenna', 'B');
    s.reset(h1);
    expect(s.get(h1, 'w', 'f', 'Antenna')).toBeUndefined();
    off();
    s.set(h1, 'w', 'f', 'x', 'y');
    expect(n).toBe(4);
  });
  it('builds the bench label text', () => {
    const s = new JobTagStore();
    const hs = host();
    expect(s.deviceTagText(hs, 'sdr-ant')).toBeNull();
    s.set(hs, 'ws1', 'order', 'Antenna', JOBS[0]);
    expect(s.deviceTagText(hs, 'sdr-ant')).toBe(JOBS[0]);
    expect(s.deviceTagText(hs, 'sdr-ant', 10)?.length).toBe(10);
    expect(s.deviceTagText(hs, 'laptop')).toBeNull();
  });
});

describe('tag targets and test ids', () => {
  it('lists bench parts of open match fields only', () => {
    expect(tagTargets(host()).map((t) => t.part)).toEqual(['Antenna', 'Coax jumper']);
    expect(tagTargets(host(true), true)).toEqual([]);
    expect(tagSlug('Coax jumper')).toBe('coax-jumper');
    expect(tagTestId('ws1', 'order', 'Coax jumper', 1)).toBe('ham-tag-ws1-order-coax-jumper-1');
  });
});

describe('close-up section and worksheet field', () => {
  it('shows buttons for the selected device and the worksheet reads the pick', () => {
    const m = host();
    expect(buildJobTagSection(m, 'laptop', () => undefined)).toBeNull();
    let changed = 0;
    const sec = buildJobTagSection(m, 'sdr-ant', () => changed++);
    const btn = sec?.querySelector<HTMLButtonElement>('[data-testid="ham-tag-ws1-order-antenna-0"]');
    expect(btn?.getAttribute('aria-label')).toBe(`Antenna: ${JOBS[0]}`);
    btn?.click();
    expect(changed).toBe(1);

    const reads = new Map<string, () => string | number | Record<string, string>>();
    const field = buildMatchField(m, sheet, sheet.fields[0], reads);
    document.body.append(field);
    expect(field.querySelector('[data-testid="ham-ws-ws1-order-Antenna"]')?.textContent).toBe(JOBS[0]);
    expect(field.querySelector('[data-testid="ham-ws-ws1-order-Coax-jumper"]')?.textContent).toBe(NOT_TAGGED);
    expect(field.querySelector('select[data-testid="ham-ws-ws1-order-Under-the-power-line"]')).not.toBeNull();
    expect(reads.get('order')?.()).toEqual({ Antenna: JOBS[0], 'Coax jumper': '', 'Under the power line': '' });
    field.remove();
  });
});
