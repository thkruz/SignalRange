import { vi } from 'vitest';
import type { GroundStation } from '../../../src/assets/ground-station/ground-station';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';
import { ArrayControlPage } from '../../../src/plugins-builtin/phased-array/array-control-page';
import { KU_PHASED_ARRAY_UT_CONFIG } from '../../../src/plugins-builtin/phased-array/phased-array-config';
import { PhasedArrayCore, type PhasedArrayReadModel } from '../../../src/plugins-builtin/phased-array/phased-array-core';

const selection = vi.hoisted(() => ({ pin: vi.fn(() => true), isPinned: vi.fn(() => false), pinnedNorads: [] as number[] }));

vi.mock('../../../src/services/selection-service', () => ({ SelectionService: { getInstance: () => selection } }));
vi.mock('../../../src/simulation/simulation-manager', () => ({
  SimulationManager: { getInstance: () => ({ registry: { memberIndexOf: () => -1, memberName: () => '' } }) },
}));

function model(over: Partial<PhasedArrayReadModel> = {}): PhasedArrayReadModel {
  return {
    simMs: 1_000_000,
    mode: 'auto',
    visible: [
      { norad: 1, name: 'STARLINK-1', az: 10, el: 80, inScan: true, inExclusion: false },
      { norad: 2, name: 'STARLINK-2', az: 200, el: 20, inScan: false, inExclusion: false },
    ],
    target: { norad: 1, name: 'STARLINK-1', az: 10, el: 80 },
    candidate: { norad: 2, name: 'STARLINK-2', az: 200, el: 20 },
    handovers: [{ atMs: 1_120_000, fromNorad: 1, toNorad: 2, toName: 'STARLINK-2', reason: 'better' }],
    handoverCount: 3,
    lastHandover: null,
    lockLostReason: null,
    beam: { az: 10, el: 80 },
    inOutage: false,
    outageRemainingMs: 0,
    scanAngleDeg: 10,
    scanLossDb: 0.2,
    maxScanDeg: 57,
    beamwidthDeg: 4.4,
    gainDbi: 33,
    gOverTDbK: 9.5,
    geoArc: { enabled: true, widthDeg: 8, beamInGeoArc: false },
    panel: { azDeg: 0, tiltDeg: 0 },
    ...over,
  };
}

function makeCore(m: PhasedArrayReadModel) {
  const core = Object.create(PhasedArrayCore.prototype) as PhasedArrayCore;
  const fns = {
    getReadModel: vi.fn(() => m),
    getTargetTrack: vi.fn(() => [
      { az: 10, el: 80 },
      { az: 40, el: 60 },
    ]),
    setBeamMode: vi.fn(),
    stow: vi.fn(),
    lock: vi.fn(() => ({ ok: true }) as { ok: true } | { ok: false; reason: string }),
    setGeoArcEnabled: vi.fn(),
    setGeoArcWidthDeg: vi.fn(),
    scanLossDbAt: vi.fn(() => 3),
  };

  Object.assign(core, fns);
  Object.defineProperties(core, {
    geoArcEnabled: { get: () => m.geoArc.enabled },
    geoArcWidthDeg: { get: () => m.geoArc.widthDeg },
    phasedArrayConfig: { get: () => KU_PHASED_ARRAY_UT_CONFIG },
  });

  return { core, fns };
}

function makePage(m = model()) {
  const { core, fns } = makeCore(m);
  const gs = { uuid: 'u1', antennas: [core], state: { location: { latitude: 36, longitude: -105, elevation: 0 } } } as unknown as GroundStation;
  const page = new ArrayControlPage(gs, 'canvas-content', 0);

  return { page, fns, core };
}

const q = (id: string): HTMLElement => document.querySelector<HTMLElement>(`[id$="${id}"]`)!;

describe('ArrayControlPage', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="canvas-content"></div>';
    vi.useFakeTimers();
    selection.pin.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects an antenna that is not a phased array', () => {
    const gs = { uuid: 'u', antennas: [{}], state: {} } as unknown as GroundStation;

    expect(() => new ArrayControlPage(gs, 'canvas-content', 0)).toThrow();
  });

  it('builds on activate, shows the beam panel and removes everything on dispose', () => {
    const bus = EventBus.getInstance();
    const onSpy = vi.spyOn(bus, 'on');
    const offSpy = vi.spyOn(bus, 'off');
    const { page } = makePage();

    expect(page.tabLabel).toBe('Array Control');
    page.activate();
    expect(page.dom).not.toBeNull();
    expect(q('target').textContent).toContain('STARLINK-1');
    expect(q('target').textContent).toContain('NORAD 1');
    expect(q('scan-loss').textContent).toBe('0.20 dB');
    expect(q('beamwidth').textContent).toBe('4.40 deg');
    expect(q('link-state').textContent).toBe('LINK UP');
    expect(q('mode-auto').classList.contains('active')).toBe(true);

    const registered = onSpy.mock.calls.filter(([ev]) => ev === Events.UPDATE || ev === Events.DRAW);

    expect(registered).toHaveLength(2);
    page.dispose();
    for (const [ev, fn] of registered) {
      expect(offSpy).toHaveBeenCalledWith(ev, fn);
    }
    expect(document.querySelector('.array-control-tab')).toBeNull();
    expect(page.dom).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('mode buttons call the core', () => {
    const { page, fns } = makePage();

    page.activate();
    q('mode-manual').click();
    expect(fns.setBeamMode).toHaveBeenCalledWith('manual');
    q('mode-auto').click();
    expect(fns.setBeamMode).toHaveBeenCalledWith('auto');
    q('mode-stow').click();
    expect(fns.stow).toHaveBeenCalled();
    page.dispose();
  });

  it('GEO switch toggles the zone and the width is staged until Apply', () => {
    const { page, fns } = makePage();

    page.activate();
    const sw = q('geo-switch') as HTMLInputElement;

    expect(sw.checked).toBe(true);
    sw.checked = false;
    sw.dispatchEvent(new Event('change'));
    expect(fns.setGeoArcEnabled).toHaveBeenCalledWith(false);

    q('geo-inc-coarse').click();
    expect((q('geo-width') as HTMLInputElement).value).toBe('13');
    expect(fns.setGeoArcWidthDeg).not.toHaveBeenCalled();
    expect((q('geo-apply') as HTMLButtonElement).disabled).toBe(false);
    q('geo-apply').click();
    expect(fns.setGeoArcWidthDeg).toHaveBeenCalledWith(13);

    q('geo-dec-coarse').click();
    q('geo-cancel').click();
    expect((q('geo-width') as HTMLInputElement).value).toBe('8');
    page.dispose();
  });

  it('shows the warning row only when the beam is in the GEO arc', () => {
    const inArc = makePage(model({ geoArc: { enabled: false, widthDeg: 8, beamInGeoArc: true } }));

    inArc.page.activate();
    expect(q('geo-warning').style.display).toBe('');
    inArc.page.dispose();
    document.body.innerHTML = '<div id="canvas-content"></div>';
    const clear = makePage();

    clear.page.activate();
    expect(q('geo-warning').style.display).toBe('none');
    clear.page.dispose();
  });

  it('shows the refusal reason when lock() refuses, and nothing on success', () => {
    const { page, fns } = makePage();

    page.activate();
    fns.lock.mockReturnValueOnce({ ok: false, reason: 'in-exclusion' });
    page.lock_(2);
    expect(q('notice').style.display).toBe('');
    expect(q('notice').textContent).toContain('GEO protection band');
    fns.lock.mockReturnValueOnce({ ok: true });
    page.lock_(2);
    vi.setSystemTime(Date.now() + 10_000);
    page.lock_(2);
    expect(q('notice').style.display).toBe('none');
    page.dispose();
  });

  it('flags the handover outage and lists the strip segments', () => {
    const { page } = makePage(model({ inOutage: true }));

    page.activate();
    expect(q('link-state').textContent).toBe('HANDOVER OUTAGE');
    expect(q('strip').querySelectorAll('.array-strip-seg')).toHaveLength(2);
    expect(q('strip-note').textContent).toContain('SL-2');
    page.dispose();
  });

  it('throttles UPDATE-driven DOM sync to once a second and reads the model on the timer', () => {
    const { page, fns } = makePage();

    page.activate();
    const after = fns.getReadModel.mock.calls.length;
    const bus = EventBus.getInstance();
    const text = (): string => q('beamwidth').textContent ?? '';

    fns.getReadModel.mockReturnValue(model({ beamwidthDeg: 5.5 }));
    vi.setSystemTime(Date.now() + 5000);
    bus.emit(Events.UPDATE, 16 as never);
    // the model has not been re-read yet (timer), so the DOM keeps the old value
    expect(text()).toBe('4.40 deg');
    vi.advanceTimersByTime(1000);
    expect(fns.getReadModel.mock.calls.length).toBeGreaterThan(after);
    bus.emit(Events.UPDATE, 16 as never);
    expect(text()).toBe('5.50 deg');
    const syncedAt = Date.now();

    fns.getReadModel.mockReturnValue(model({ beamwidthDeg: 6.6 }));
    vi.advanceTimersByTime(1000);
    vi.setSystemTime(syncedAt + 500);
    bus.emit(Events.UPDATE, 16 as never);
    expect(text()).toBe('5.50 deg');
    vi.setSystemTime(syncedAt + 1500);
    bus.emit(Events.UPDATE, 16 as never);
    expect(text()).toBe('6.60 deg');
    page.dispose();
  });

  it('does not overwrite a focused width input during sync', () => {
    const { page } = makePage();

    page.activate();
    const input = q('geo-width') as HTMLInputElement;

    input.focus();
    input.value = '12';
    vi.setSystemTime(Date.now() + 5000);
    EventBus.getInstance().emit(Events.UPDATE, 16 as never);
    expect(input.value).toBe('12');
    page.dispose();
  });

  it('only pushes to the plot on DRAW when the model changed', () => {
    const { page, fns } = makePage();

    page.activate();
    const bus = EventBus.getInstance();

    bus.emit(Events.DRAW, 16 as never);
    expect(page.plottedDotCounts).toMatchObject({ target: 1, candidate: 1 });
    const setDots = vi.spyOn((page as unknown as { plot_: { setDots: () => void } }).plot_, 'setDots');

    bus.emit(Events.DRAW, 16 as never);
    bus.emit(Events.DRAW, 16 as never);
    expect(setDots).not.toHaveBeenCalled();
    fns.getReadModel.mockReturnValue(model({ simMs: 2_000_000 }));
    vi.advanceTimersByTime(1000);
    bus.emit(Events.DRAW, 16 as never);
    expect(setDots).toHaveBeenCalledTimes(1);
    page.dispose();
  });

  it('deactivate stops the feeds and activate restarts them', () => {
    const { page, fns } = makePage();

    page.activate();
    page.deactivate();
    fns.getReadModel.mockClear();
    vi.advanceTimersByTime(3000);
    expect(fns.getReadModel).not.toHaveBeenCalled();
    expect(page.dom?.style.display).toBe('none');
    page.activate();
    fns.getReadModel.mockClear();
    vi.advanceTimersByTime(2000);
    expect(fns.getReadModel).toHaveBeenCalledTimes(2);
    page.dispose();
  });
});
