import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';
import * as C from '../../../src/ham/ham-conditions';
import { HamStationManager } from '../../../src/ham/ham-station-manager';
import { HamStationService } from '../../../src/ham/ham-station-service';
import { ScenarioManager } from '../../../src/scenario-manager';
import { FIXED_STEP_MS, SimClock } from '../../../src/simulation/sim-clock';
import { baseConfig, baseDevices, harness, packetConfig } from './harness';

afterEach(() => {
  HamStationService.destroy();
  HamStationManager.destroy();
  SimClock.reset();
  vi.restoreAllMocks();
});

/** Evaluate a condition against the live singleton, as the objective engine does */
function run_(c: ReturnType<typeof C.heard>): boolean {
  const f = c.params?.evaluator as (() => boolean) | undefined;
  return f ? f() : false;
}

const withDc = (dc: Record<string, unknown>) => baseDevices().map((d) => (d.id === 'psu' ? { ...d, dcSystem: { ...d.dcSystem!, ...dc } } : d));

describe('HamStationManager DC behaviour', () => {
  it('a high-resistance lead browns the radio out on TX; replacing it stops the resets', () => {
    const cfg = baseConfig({
      devices: withDc({}).map((d) => (d.id === 'mobile' ? { ...d, radio: { ...d.radio, txPowerW: 50 } } : d)),
      faults: [{ id: 'lead', target: 'psu', kind: 'high-resistance-lead', inspectClue: 'The lead is warm.', clearedBy: { action: 'repair' }, deenergizeToRepair: true }],
    });
    const h = harness(cfg);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'test' }, holdS: 3 });
    h.advance(4, 0.5);
    expect(h.m.resetCount('psu')).toBeGreaterThan(0);
    expect(h.actRefused({ type: 'repair', faultId: 'lead' }).refusal).toBe('energized');
    h.actOk({ type: 'power', deviceId: 'psu', on: false });
    h.actOk({ type: 'repair', faultId: 'lead' });
    h.actOk({ type: 'power', deviceId: 'psu', on: true });
    h.actOk({ type: 'power', deviceId: 'mobile', on: true });
    h.actOk({ type: 'log.note', text: 'lead replaced' });
    const before = h.m.resetCount('psu');
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'test' }, holdS: 3 });
    h.advance(4, 0.5);
    expect(h.m.resetCount('psu')).toBe(before);
    expect(C.evaluateWith(C.faultCleared('lead'), h.m)).toBe(true);
  });
});

describe('HamStationManager checkpoint', () => {
  it('round-trips mid-scenario state including battery charge and packet link', () => {
    const cfg = packetConfig();
    cfg.devices = cfg.devices.map((d) =>
      d.id === 'psu' ? { ...d, kind: 'battery' as const, dcSystem: { radioId: 'mobile', source: 'battery' as const, batteryUsableWh: 120, batterySoc: 1 } } : d
    );
    cfg.packet = { ...cfg.packet!, audio: { inputDevice: 'interface', outputDevice: 'interface', ptt: 'rts' } };
    const h = harness(cfg);
    h.actOk({ type: 'packet.connect' });
    h.advance(5);
    h.actOk({ type: 'ptt', deviceId: 'mobile', intent: { kind: 'test' }, holdS: 60 });
    h.advance(70, 5);
    h.actOk({ type: 'meter.mode', mode: 'DCV' });
    const soc = h.m.dcSystem('psu')?.state.battery.energyWh ?? 120;
    expect(soc).toBeLessThan(120);
    const saved = JSON.parse(JSON.stringify(h.m.getState()));

    const r = HamStationManager.createForTest(cfg, { nowS: 0 });
    expect(r.restoreState(saved)).toBe(true);
    expect(r.nowS).toBeCloseTo(h.m.nowS);
    expect(r.dcSystem('psu')?.state.battery.energyWh).toBeCloseTo(soc);
    expect(r.packetState()?.link).toBe(h.m.packetState()?.link);
    expect(r.revision).toBe(h.m.revision);
    expect(r.events('txOk:mobile').length).toBe(1);
    expect(r.meterState().mode).toBe('DCV');
    expect(r.restoreState({ ...saved, schema: 'other' })).toBe(false);
  });
});

describe('HamStationManager absent', () => {
  it('conditions evaluate false when no station is running', () => {
    expect(HamStationManager.isInitialized()).toBe(false);
    expect(run_(C.heard('training', 0.5))).toBe(false);
    expect(run_(C.eventHappened('txOk:mobile'))).toBe(false);
  });

  it('the service does not start without settings.hamStation', () => {
    vi.spyOn(ScenarioManager, 'getInstance').mockReturnValue({ settings: {} } as unknown as ScenarioManager);
    expect(HamStationService.start()).toBeNull();
    expect(HamStationManager.isInitialized()).toBe(false);
  });
});

describe('HamStationService', () => {
  const run = (steps: number) => {
    for (let i = 0; i < steps; i++) {
      SimClock.consumeFrame(FIXED_STEP_MS);
      SimClock.step();
      EventBus.getInstance().emit(Events.UPDATE, FIXED_STEP_MS);
    }
  };

  it('ticks on scenario time, and the quiz pause stops it', () => {
    SimClock.reset();
    vi.spyOn(ScenarioManager, 'getInstance').mockReturnValue({ settings: { hamStation: baseConfig({ pauseOnQuiz: true }) } } as unknown as ScenarioManager);
    const svc = HamStationService.start();
    expect(svc).not.toBeNull();
    run(60);
    const m = HamStationManager.getInstance();
    expect(m.nowS).toBeCloseTo(1, 1);
    EventBus.getInstance().emit(Events.QUIZ_SHOW, { objectiveId: 'o', conditionIndex: 0, question: 'q', options: ['a'], correctIndex: 0, pointPenalty: 5 });
    run(60);
    expect(m.nowS).toBeCloseTo(1, 1);
    EventBus.getInstance().emit(Events.QUIZ_DISMISSED, { objectiveId: 'o', conditionIndex: 0 });
    run(60);
    expect(m.nowS).toBeCloseTo(2, 1);
    expect(run_(C.heard('training', 0.5))).toBe(true);
    HamStationService.destroy();
    expect(HamStationManager.isInitialized()).toBe(false);
  });
});
