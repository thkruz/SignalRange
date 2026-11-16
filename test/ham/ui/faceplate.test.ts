import { afterEach, describe, expect, it } from 'vitest';
import type { HamStationManager } from '../../../src/ham/ham-station-manager';
import { ART_FOR_KIND } from '../../../src/ham/ui/bench/bench-art';
import { Faceplate } from '../../../src/ham/ui/bench/faceplate';

interface Fake {
  kind: string;
  energized: boolean;
  radio?: { vfoMHz: number; mode: string; txPowerW: number };
  keyed?: boolean;
  open?: boolean;
  meterMode?: string;
  display?: string;
  swr?: number;
  volts?: number;
  amps?: number;
  sweep?: { minSwr: number; fMHz: number };
}

function fakeManager(f: Fake): HamStationManager {
  return {
    device: (id: string) => ({ id, kind: f.kind }),
    energized: () => f.energized,
    radio: () => f.radio,
    keyed: () => (f.keyed ? { deviceId: 'dev' } : null),
    liveReception: () => [{ squelchOpen: Boolean(f.open) }],
    meterState: () => ({ mode: f.meterMode ?? 'OFF' }),
    lastMeasurement: (q: { instrument: string }) => {
      if (q.instrument === 'multimeter') return f.display ? { value: 0, context: { display: f.display } } : undefined;
      if (q.instrument === 'swr-meter') return f.swr ? { value: f.swr } : undefined;

      return undefined;
    },
    dcSystem: () => ({ state: { sourceConnected: true }, measure: () => ({ vSource: f.volts ?? 0, currentA: f.amps ?? 0 }) }),
    lastSweep: () => (f.sweep ? { measurement: { value: f.sweep.fMHz, context: { minSwr: f.sweep.minSwr } } } : null),
  } as unknown as HamStationManager;
}

const texts = (fp: Faceplate): string => [...fp.el.querySelectorAll('.ham-faceplate-live text')].map((t) => t.textContent).join('|');

let root: HTMLElement;
const make = (): { fp: Faceplate; root: HTMLElement } => {
  root = document.createElement('div');
  document.body.append(root);
  const fp = new Faceplate(root);
  root.append(fp.el);

  return { fp, root };
};

afterEach(() => document.body.replaceChildren());

describe('Faceplate', () => {
  it('renders the picture and hit regions for every art kind', () => {
    for (const kind of Object.keys(ART_FOR_KIND)) {
      const { fp } = make();
      fp.show('dev');
      fp.update(fakeManager({ kind, energized: true, radio: { vfoMHz: 146.52, mode: 'fm', txPowerW: 5 } }), true);
      expect(fp.el.getAttribute('data-testid')).toBe('ham-faceplate-dev');
      expect(fp.el.querySelector('img')?.getAttribute('src')).toContain('/bench/');
      expect(fp.el.querySelectorAll('[data-testid^="ham-face-dev-"]').length).toBeGreaterThan(0);
      fp.dispose();
    }
  });

  it('radio screen follows the manager', () => {
    const { fp } = make();
    fp.show('dev');
    fp.update(fakeManager({ kind: 'handheld', energized: true, radio: { vfoMHz: 146.52, mode: 'fm', txPowerW: 5 } }), true);
    expect(texts(fp)).toBe('146.520|FM 5 W');
    fp.update(fakeManager({ kind: 'handheld', energized: true, open: true, radio: { vfoMHz: 146.52, mode: 'fm', txPowerW: 5 } }), true);
    expect(texts(fp)).toContain('BUSY');
    fp.update(fakeManager({ kind: 'handheld', energized: true, keyed: true, radio: { vfoMHz: 147.0, mode: 'fm', txPowerW: 5 } }), true);
    expect(texts(fp)).toBe('147.000|FM TX');
    fp.update(fakeManager({ kind: 'handheld', energized: false, radio: { vfoMHz: 147.0, mode: 'fm', txPowerW: 5 } }), true);
    expect(texts(fp)).toBe('');
    fp.dispose();
  });

  it('multimeter, analyzer, swr and psu draw their readings', () => {
    const { fp } = make();
    fp.show('dev');
    fp.update(fakeManager({ kind: 'multimeter', energized: true, meterMode: 'DCV', display: '12.6 V' }), true);
    expect(texts(fp)).toBe('12.6 V|DCV|DCV');
    fp.update(fakeManager({ kind: 'analyzer', energized: true }), true);
    expect(texts(fp)).toBe('READY');
    fp.update(fakeManager({ kind: 'analyzer', energized: true, sweep: { minSwr: 1.34, fMHz: 146.5 } }), true);
    expect(texts(fp)).toContain('SWR 1.34');
    expect(texts(fp)).toContain('146.500 MHz');
    const needleAt = (): string | null | undefined => [...fp.el.querySelectorAll('.ham-faceplate-live line')].pop()?.getAttribute('x2');
    fp.update(fakeManager({ kind: 'swr-meter', energized: true }), true);
    const rest = needleAt();
    fp.update(fakeManager({ kind: 'swr-meter', energized: true, swr: 2 }), true);
    const two = needleAt();
    fp.update(fakeManager({ kind: 'swr-meter', energized: true, swr: 20 }), true);
    expect(new Set([rest, two, needleAt()]).size).toBe(3);
    fp.update(fakeManager({ kind: 'power-supply', energized: true, volts: 13.8, amps: 3 }), true);
    expect(texts(fp)).toContain('ON');
    fp.update(fakeManager({ kind: 'power-supply', energized: false }), true);
    expect(texts(fp)).toContain('OFF');
    fp.dispose();
  });

  it('sdr led glows only when energized', () => {
    const { fp } = make();
    fp.show('dev');
    fp.update(fakeManager({ kind: 'sdr', energized: false }), true);
    expect(fp.el.querySelectorAll('.ham-faceplate-live circle').length).toBe(0);
    fp.update(fakeManager({ kind: 'sdr', energized: true }), true);
    expect(fp.el.querySelectorAll('.ham-faceplate-live circle').length).toBe(2);
    fp.dispose();
  });

  it('clicking a region focuses and flashes the matching control', () => {
    const { fp, root: r } = make();
    const input = document.createElement('input');
    input.setAttribute('data-testid', 'ham-radio-dev-dial');
    const ptt = document.createElement('button');
    ptt.setAttribute('data-testid', 'ham-ptt-dev-transmit');
    r.append(input, ptt);
    fp.show('dev');
    fp.update(fakeManager({ kind: 'handheld', energized: true, radio: { vfoMHz: 146.52, mode: 'fm', txPowerW: 5 } }), true);
    fp.el.querySelector('[data-testid="ham-face-dev-screen"]')?.dispatchEvent(new Event('click'));
    expect(document.activeElement).toBe(input);
    expect(input.classList.contains('ham-face-flash')).toBe(true);
    fp.el.querySelector('[data-testid="ham-face-dev-ptt"]')?.dispatchEvent(new Event('click'));
    expect(document.activeElement).toBe(ptt);
    // No matching control: nothing happens
    fp.el.querySelector('[data-testid="ham-face-dev-speaker"]')?.dispatchEvent(new Event('click'));
    expect(document.activeElement).toBe(ptt);
    fp.dispose();
  });
});
