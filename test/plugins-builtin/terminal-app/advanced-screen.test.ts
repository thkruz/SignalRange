// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdvancedScreen, debugText } from '../../../src/plugins-builtin/terminal-app/screens/advanced-screen';
import type { TerminalScreenContext } from '../../../src/plugins-builtin/terminal-app/screens/terminal-screen';
import { TerminalAppModel, type TerminalGnss, type TerminalPhasedArraySlice } from '../../../src/plugins-builtin/terminal-app/terminal-app-model';
import { TerminalLink } from '../../../src/plugins-builtin/terminal-app/terminal-link';
import { SKYLINK_SKIN } from '../../../src/plugins-builtin/terminal-app/terminal-skin';

function setup(opts: { gnss?: TerminalGnss; obstruction?: number | null; noGnssReader?: boolean; panel?: boolean } = {}) {
  const w = { t: 1000, gnss: opts.gnss ?? { locationValid: true, satellites: 12 }, obstruction: opts.obstruction };
  const array = opts.panel ? ({ inOutage: false, lastLinkDrop: null, panel: { azDeg: 180, tiltDeg: 25 } } as unknown as TerminalPhasedArraySlice) : null;
  const model = new TerminalAppModel({
    skin: SKYLINK_SKIN,
    plant: { nowS: () => w.t, dishStatus: () => (w.gnss.locationValid ? 'online' : 'no-location'), powerDrawW: () => 55, gnss: opts.noGnssReader ? undefined : () => w.gnss },
    link: new TerminalLink({ routerPowered: () => true, routerBooted: () => true, laptopOnRouter: () => true, dishCablePathIntact: () => true, dishBooted: () => true }),
    phasedArray: () => array,
    obstructionFraction: opts.obstruction === undefined ? undefined : () => w.obstruction ?? null,
  });
  model.update();
  w.t += 90;
  model.update();
  const ctx = { skin: SKYLINK_SKIN, model } as unknown as TerminalScreenContext;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const screen = createAdvancedScreen(ctx);
  screen.mount(host);
  screen.sync(model.view());

  return { w, model, screen, host };
}

const value = (host: HTMLElement, id: string): string => host.querySelector(`[data-value="${id}"]`)?.textContent ?? '';

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('terminal model GNSS fields', () => {
  it('reads GNSS from the plant reader', () => {
    const { model } = setup({ gnss: { locationValid: false, satellites: 0 } });
    const d = model.view().data?.debug;

    expect(d?.locationValid).toBe(false);
    expect(d?.gnssSatellites).toBe(0);
    expect(model.view().data?.heroText).toBe('Searching');
  });

  it('defaults to a valid location without a GNSS reader', () => {
    const d = setup({ noGnssReader: true }).model.view().data?.debug;

    expect(d?.locationValid).toBe(true);
    expect(d?.gnssSatellites).toBe(12);
  });
});

describe('Advanced screen', () => {
  it('renders every field of the skin', () => {
    const { host } = setup({ panel: true, obstruction: 0.123 });

    expect(host.querySelectorAll('[data-field]')).toHaveLength(SKYLINK_SKIN.debugFields.length);
    expect(value(host, 'software-version')).toBe(SKYLINK_SKIN.softwareVersion);
    expect(value(host, 'uptime')).toBe('1 min');
    expect(value(host, 'boot-count')).toBe('1');
    expect(value(host, 'location-valid')).toBe('Valid');
    expect(value(host, 'gnss-satellites')).toBe('12');
    expect(value(host, 'alert-flags')).toBe('None');
    expect(value(host, 'tilt-boresight')).toBe('25 degrees / 180 degrees');
    expect(value(host, 'obstruction-fraction')).toBe('12.3 percent');
  });

  it('shows Not available for the obstruction fraction when no accumulator is wired', () => {
    const { host } = setup();

    expect(value(host, 'obstruction-fraction')).toBe('Not available');
    expect(value(host, 'tilt-boresight')).toBe('Not available');
  });

  it('shows the location as not valid without naming a cause', () => {
    const { host } = setup({ gnss: { locationValid: false, satellites: 0 } });

    expect(value(host, 'location-valid')).toBe('Not valid');
    expect(value(host, 'gnss-satellites')).toBe('0');
    expect(host.textContent?.toLowerCase()).not.toMatch(/jam|denied|spoof/u);
  });

  it('Copy debug data writes plain text to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { host } = setup({ gnss: { locationValid: false, satellites: 0 } });
    (host.querySelector('#adv-copy') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));

    expect(writeText).toHaveBeenCalledOnce();
    const text = writeText.mock.calls[0][0] as string;

    expect(text).toContain('Location: Not valid');
    expect(text).toContain('GNSS satellites: 0');
    expect(text).toContain('Obstruction: Not available');
    expect(host.querySelector('#adv-note')?.textContent).toBe('Debug data copied.');
    expect(debugText([{ id: 'uptime', label: 'Uptime', value: '1 min' }])).toBe('SkyLink debug data\nUptime: 1 min');
  });

  it('reports when copy is unavailable', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) } });
    const { host } = setup();
    (host.querySelector('#adv-copy') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));

    expect(host.querySelector('#adv-note')?.textContent).toBe('Copy is not available here.');
  });
});
