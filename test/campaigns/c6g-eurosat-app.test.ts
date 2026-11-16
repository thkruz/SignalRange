/**
 * Campaign 6 package G: the EuroSat modem operator app beside the SkyLink app. Independent state per terminal,
 * inventory per scenario, per-terminal runtime cache, checkpoint round trip, the S15 history and jitter display.
 */

import type { FrontlineScenarioData } from '@app/campaigns/frontline/scenario-support';
import { frontlineScenario1Data } from '@app/campaigns/frontline/scenario1';
import { frontlineScenario9Data } from '@app/campaigns/frontline/scenario9';
import { frontlineScenario10Data } from '@app/campaigns/frontline/scenario10';
import { frontlineScenario11Data } from '@app/campaigns/frontline/scenario11';
import { frontlineScenario14Data } from '@app/campaigns/frontline/scenario14';
import { frontlineScenario15Data } from '@app/campaigns/frontline/scenario15';
import { frontlineScenario16Data } from '@app/campaigns/frontline/scenario16';
import { EventBus } from '@app/events/event-bus';
import { PhysicalPlantService as Service } from '@app/physical/physical-plant-service';
import { collectManagerStates, restoreManagerStates } from '@app/scenarios/checkpoint-manager-states';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModemDashboardPage } from '../../src/plugins-builtin/terminal-app/modem-dashboard';
import { ModemRuntime } from '../../src/plugins-builtin/terminal-app/modem-runtime';
import { beginSpeedTest, finishSpeedTest } from '../../src/plugins-builtin/terminal-app/screens/speed-test-screen';
import { eurosatAvailable } from '../../src/plugins-builtin/terminal-app/terminal-app-plugin';
import { TerminalRuntime } from '../../src/plugins-builtin/terminal-app/terminal-runtime';
import { TerminalRuntimeCache } from '../../src/plugins-builtin/terminal-app/terminal-runtime-cache';
import { bootScenario, tick } from './frontline-completion-support';

const objectives = vi.hoisted(() => ({ states: new Map<string, { isActive: boolean; isCompleted: boolean }>() }));

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({ objectivesManager: { getObjectiveState: (id: string) => objectives.states.get(id) } }),
    hasInstance: () => true,
    destroy: () => undefined,
  },
}));

const EUS_PART = 'vsat-modem';

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(15);
  objectives.states.clear();
  document.body.innerHTML = '<div id="host"></div>';
});

afterEach(() => {
  Service.destroy();
  EventBus.destroy();
});

const availableIn = (data: FrontlineScenarioData): boolean => {
  bootScenario(data);

  return eurosatAvailable();
};

describe('EuroSat app inventory', () => {
  it('is absent in S9 and S10, present from S11 to S16, absent in the camp', () => {
    expect(availableIn(frontlineScenario9Data)).toBe(false);
    Service.destroy();
    expect(availableIn(frontlineScenario10Data)).toBe(false);
    Service.destroy();
    for (const data of [frontlineScenario11Data, frontlineScenario14Data, frontlineScenario15Data, frontlineScenario16Data]) {
      expect(availableIn(data)).toBe(true);
      Service.destroy();
    }
    expect(availableIn(frontlineScenario1Data)).toBe(false);
  });

  it('builds no runtime without a plant or without a modem path', () => {
    expect(ModemRuntime.forStation()).toBeNull();
    bootScenario(frontlineScenario10Data);
    expect(ModemRuntime.forStation()).toBeNull();
  });
});

describe('per-terminal runtime cache', () => {
  it('keeps one runtime per (plant, terminal id) and skips disposed ones', () => {
    const cache = new TerminalRuntimeCache<{ isDisposed: boolean }>();
    const plant = {};
    const a = { isDisposed: false };
    const b = { isDisposed: false };
    cache.set(plant, 'skylink', a);
    cache.set(plant, 'eurosat', b);
    expect(cache.get(plant, 'skylink')).toBe(a);
    expect(cache.get(plant, 'eurosat')).toBe(b);
    expect(cache.get({}, 'eurosat')).toBeUndefined();
    b.isDisposed = true;
    expect(cache.get(plant, 'eurosat')).toBeUndefined();
    expect(cache.get(plant, 'skylink')).toBe(a);
  });

  it('gives the SkyLink and EuroSat apps separate runtimes and models on one plant', () => {
    bootScenario(frontlineScenario11Data);
    const modem = ModemRuntime.forStation();
    const sky = TerminalRuntime.forStation();
    expect(modem).not.toBeNull();
    expect(ModemRuntime.forStation()).toBe(modem);
    expect(sky).not.toBe(modem as unknown);
    expect(modem?.model.serviceId()).not.toBe(sky?.model.serviceId());
  });
});

describe('EuroSat app behaviour', () => {
  it('restarting the modem power-cycles only the modem and leaves the SkyLink terminal running', () => {
    const svc = bootScenario(frontlineScenario11Data);
    svc.plant.setPartMode(EUS_PART, 'run');
    tick(30);
    const modem = ModemRuntime.forStation();
    const skyBefore = svc.plant.getPartState('skylink');
    modem?.restartModem();
    tick(1);
    expect(
      svc.plant
        .getLog()
        .filter((e) => e.verb === 'powerCycle')
        .map((e) => e.target)
    ).toEqual([EUS_PART]);
    expect(svc.plant.getPartState('skylink')?.rebooting).toBe(skyBefore?.rebooting);
    expect(modem?.model.view().link).toBe('modem-unreachable');
    tick(60);
    expect(modem?.model.view().link).toBe('connected');
    expect(modem?.model.view().data?.restartCount).toBe(1);
  });

  it('shows the last data under an unreachable banner while the modem is down', () => {
    const svc = bootScenario(frontlineScenario11Data);
    svc.plant.setPartMode(EUS_PART, 'run');
    tick(40);
    const modem = ModemRuntime.forStation();
    expect(modem?.model.view().data).not.toBeNull();
    svc.plant.setPartMode(EUS_PART, 'standby');
    tick(2);
    const view = modem?.model.view();
    expect(view?.link).toBe('modem-unreachable');
    expect(view?.stale).toBe(true);
    expect(view?.data).not.toBeNull();
  });

  it('lists the S15 link-lost registration drops without naming a cause', () => {
    const svc = bootScenario(frontlineScenario15Data);
    objectives.states.set('s15-record-anomaly', { isActive: true, isCompleted: false });
    tick(20);
    svc.services?.takeSample(frontlineScenario15Data.settings?.physicalPlant?.service?.paths.find((p) => p.terminalPartId === EUS_PART)?.id ?? '', 'registration', 'terminal-app');
    tick(5);
    const modem = ModemRuntime.forStation();
    const history = modem?.model.view().data?.history ?? [];
    expect(history.some((h) => h.kind === 'lost' && h.reason === 'signal-lost')).toBe(true);

    const page = new ModemDashboardPage('host', modem ?? null);
    page.activate();
    page.showScreen('history');
    const html = document.getElementById('eurosat-screen')?.innerHTML ?? '';
    expect(html).toContain('data-reason="signal-lost"');
    expect(html.toLowerCase()).not.toMatch(/jam|interfer|attack|enemy/u);
    page.dispose();
  });

  it('shows jitter on the speed test, or Unavailable when the profile has none', () => {
    const svc = bootScenario(frontlineScenario11Data);
    svc.plant.setPartMode(EUS_PART, 'run');
    tick(40);
    const modem = ModemRuntime.forStation();
    const runner = Service.workloadsOrNull();
    const serviceId = modem?.model.serviceId() ?? '';
    expect(runner).not.toBeNull();
    if (!runner || !modem) {
      return;
    }
    const backend = { runner, serviceId };
    const pending = beginSpeedTest(backend);
    expect(pending).not.toBeNull();
    runner.waitForRun(pending?.runId ?? '');
    const record = finishSpeedTest(backend, modem.model, pending as never);
    expect(record).not.toBe('running');
    expect(record && record !== 'running' ? typeof record.jitterMs : '').toMatch(/number|object/u);
    const page = new ModemDashboardPage('host', modem);
    page.activate();
    page.showScreen('speed-test');
    const html = document.getElementById('eurosat-screen')?.innerHTML ?? '';
    expect(html).toContain('eurosat-speed-jitter');
    page.dispose();
  });
});

describe('terminal page visibility', () => {
  it('hides a deactivated page even though its root carries d-flex (display: flex !important)', () => {
    bootScenario(frontlineScenario11Data);
    const page = new ModemDashboardPage('host', ModemRuntime.forStation());
    page.activate();
    expect(page.dom?.style.getPropertyValue('display')).toBe('');
    page.deactivate();
    expect(page.dom?.style.getPropertyValue('display')).toBe('none');
    expect(page.dom?.style.getPropertyPriority('display')).toBe('important');
    page.activate();
    expect(page.dom?.style.getPropertyValue('display')).toBe('');
    page.dispose();
  });
});

describe('EuroSat and SkyLink checkpoint round trip', () => {
  it('restores both apps independently, including state saved before the app was built', () => {
    const svc = bootScenario(frontlineScenario11Data);
    svc.plant.setPartMode(EUS_PART, 'run');
    tick(40);
    const modem = ModemRuntime.forStation();
    const sky = TerminalRuntime.forStation();
    modem?.model.recordSpeedTest({ tS: 10, downMbps: 12, upMbps: 3, latencyMs: 600, limit: 'skylink', jitterMs: 55 });
    sky?.model.recordSpeedTest({ tS: 20, downMbps: 99, upMbps: 9, latencyMs: 40, limit: 'skylink', jitterMs: null });
    modem?.model.view();
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    expect(Object.keys(saved.physicalPlant.terminalApps).sort()).toEqual(['eurosat', 'skylink']);

    Service.destroy();
    bootScenario(frontlineScenario11Data);
    restoreManagerStates(saved);
    // Apps are built lazily after the restore: the pending state is applied on creation
    const modem2 = ModemRuntime.forStation();
    const sky2 = TerminalRuntime.forStation();
    expect(modem2?.model.speedTests().map((t) => t.downMbps)).toEqual([12]);
    expect(modem2?.model.speedTests()[0].jitterMs).toBe(55);
    expect(sky2?.model.speedTests().map((t) => t.downMbps)).toEqual([99]);
  });

  it('applies saved state to apps that already exist', () => {
    const svc = bootScenario(frontlineScenario11Data);
    svc.plant.setPartMode(EUS_PART, 'run');
    tick(40);
    const modem = ModemRuntime.forStation();
    modem?.model.recordSpeedTest({ tS: 10, downMbps: 12, upMbps: 3, latencyMs: 600, limit: 'skylink', jitterMs: null });
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    modem?.model.recordSpeedTest({ tS: 11, downMbps: 13, upMbps: 3, latencyMs: 600, limit: 'skylink', jitterMs: null });
    restoreManagerStates(saved);
    expect(modem?.model.speedTests()).toHaveLength(1);
  });
});
