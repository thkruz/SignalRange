/**
 * @file speed-test-screen - SkyLink Speed test (phase 40, WP4)
 * @description Runs a job through the workload runner (`src/physical/workload-runner.ts`), which is
 * the evidence path: a speed test is something the player did. The run takes sim time (D9): the
 * runner skips the scenario clock for the test window. The result is what a consumer app can say:
 * download, upload, latency and whether the dish or the local network set the limit.
 */
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import type { WorkloadRunner } from '@app/physical/workload-runner';
import type { RequirementCard } from '@app/physical/workload-types';
import { formatAge } from '../strings';
import type { SpeedTestRecord, TerminalAppModel, TerminalView } from '../terminal-app-model';
import { APP_ACTION_VERBS } from '../terminal-evidence';
import { ts } from './stats-strings';
import type { TerminalScreen, TerminalScreenContext, TerminalScreenFactory } from './terminal-screen';

/** Sim seconds a speed test observes the link */
export const SPEED_TEST_WINDOW_S = 25;
/** What the router Wi-Fi can carry; a faster link reads as limited by the local network */
export const LOCAL_NETWORK_CAP_MBPS = 300;
/** A result below this share of what the dish itself reports means the limit was not the dish */
const DISH_SHARE_MIN = 0.9;

export const SPEED_TEST_CARD: RequirementCard = { id: 'terminal-speed-test', version: 1, label: 'Speed test', windowS: SPEED_TEST_WINDOW_S, priority: 'routine' };

/** The part of `WorkloadRunner` the speed test uses */
export type SpeedTestRunner = Pick<WorkloadRunner, 'ensureCard' | 'start' | 'waitForRun' | 'effectiveProfile' | 'shareOf'>;

export interface SpeedTestBackend {
  runner: SpeedTestRunner;
  serviceId: string;
}

/**
 * Decide what limited a test. Local network: the result is below what the dish reports (shared
 * capacity or something past the dish) or above what the router can carry.
 */
export function speedTestLimit(measuredDownMbps: number, rawDownMbps: number, dishDownMbps: number): SpeedTestRecord['limit'] {
  if (rawDownMbps > LOCAL_NETWORK_CAP_MBPS) {
    return 'local-network';
  }
  if (dishDownMbps > 0 && measuredDownMbps < dishDownMbps * DISH_SHARE_MIN) {
    return 'local-network';
  }

  return 'skylink';
}

/** Run one test. Returns null when it did not finish or the link carried nothing. */
export function runSpeedTest(backend: SpeedTestBackend, model: TerminalAppModel): SpeedTestRecord | null {
  const { runner, serviceId } = backend;
  runner.ensureCard(SPEED_TEST_CARD);
  const started = runner.start(SPEED_TEST_CARD.id, serviceId);
  if (!started.ok) {
    return null;
  }
  const share = runner.shareOf(started.run);
  const run = runner.waitForRun(started.run.id);
  model.update();
  const profile = runner.effectiveProfile(serviceId, share);
  if (!run || run.status === 'running' || run.status === 'aborted' || run.status === 'unsupported' || !profile) {
    return null;
  }
  const cap = LOCAL_NETWORK_CAP_MBPS;
  const down = Math.min(profile.downMbps, cap);
  const record: SpeedTestRecord = {
    tS: run.endS,
    downMbps: down,
    upMbps: Math.min(profile.upMbps, cap),
    latencyMs: profile.rttMs,
    limit: speedTestLimit(down, profile.downMbps, model.view().data?.downMbps ?? 0),
  };
  model.recordSpeedTest(record);

  return record;
}

/** Default backend: the live plant's workload runner and this terminal's service path */
function liveBackend(ctx: TerminalScreenContext): SpeedTestBackend | null {
  const runner = PhysicalPlantService.workloadsOrNull();
  const serviceId = ctx.model.serviceId();

  return runner && serviceId ? { runner, serviceId } : null;
}

/** Build the factory for a backend source (tests pass their own) */
export function createSpeedTestScreenFor(resolve: (ctx: TerminalScreenContext) => SpeedTestBackend | null): TerminalScreenFactory {
  return (ctx: TerminalScreenContext): TerminalScreen => {
    let root: HTMLElement | null = null;
    let failed = false;
    let busy = false;
    let lastView: TerminalView | null = null;

    const q = (id: string): HTMLElement | null => root?.querySelector(`#speed-${id}`) ?? null;
    const setHtml = (id: string, html: string): void => {
      const el = q(id);
      if (el && el.innerHTML !== html) {
        el.innerHTML = html;
      }
    };
    const mbps = (v: number): string => ts('speed.unitMbps', { value: v >= 100 ? Math.round(v) : v.toFixed(1) });

    function render(view: TerminalView): void {
      if (!root) {
        return;
      }
      const connected = view.link === 'connected';
      const available = connected && resolve(ctx) !== null;
      const button = q('start') as HTMLButtonElement | null;
      if (button) {
        button.disabled = !available || busy;
        button.textContent = busy ? ts('speed.running') : ts('speed.start');
      }
      setHtml('note', !connected ? ts('speed.disabled') : available ? '' : ts('speed.unavailable'));
      setHtml('failed', failed ? ts('speed.failed') : '');
      const tests = ctx.model.speedTests();
      const last = tests[tests.length - 1];
      const nowS = view.data?.sampleTimeS ?? last?.tS ?? 0;
      setHtml(
        'result',
        last
          ? `<div class="row g-3">
              <div class="col-6 col-md-3"><div class="text-secondary small">${ts('speed.download')}</div><div class="h2 mb-0 font-monospace" id="speed-down">${mbps(last.downMbps)}</div></div>
              <div class="col-6 col-md-3"><div class="text-secondary small">${ts('speed.upload')}</div><div class="h2 mb-0 font-monospace" id="speed-up">${mbps(last.upMbps)}</div></div>
              <div class="col-6 col-md-3"><div class="text-secondary small">${ts('speed.latency')}</div><div class="h2 mb-0 font-monospace" id="speed-lat">${ts('speed.unitMs', { value: Math.round(last.latencyMs) })}</div></div>
              <div class="col-6 col-md-3"><div class="text-secondary small">${ts('speed.limit.title')}</div><div class="h2 mb-0" id="speed-limit">${ts(`speed.limit.${last.limit}`)}</div></div>
            </div>`
          : `<span class="text-secondary">${ts('speed.noResult')}</span>`
      );
      setHtml(
        'history',
        tests.length > 1
          ? [...tests]
              .slice(0, -1)
              .reverse()
              .map(
                (t) =>
                  `<tr><td>${ts('speed.ago', { age: formatAge(Math.max(0, nowS - t.tS)) })}</td><td>${mbps(t.downMbps)}</td><td>${mbps(t.upMbps)}</td><td>${ts('speed.unitMs', { value: Math.round(t.latencyMs) })}</td><td>${ts(`speed.limit.${t.limit}`)}</td></tr>`
              )
              .join('')
          : ''
      );
      const hist = q('history-card');
      if (hist) {
        hist.hidden = tests.length <= 1;
      }
    }

    const onStart = (): void => {
      const backend = lastView?.link === 'connected' ? resolve(ctx) : null;
      if (!backend || busy) {
        return;
      }
      busy = true;
      failed = false;
      const result = runSpeedTest(backend, ctx.model);
      ctx.evidence?.action(
        'speed-test',
        APP_ACTION_VERBS.speedTest,
        result
          ? `Ran a speed test in the SkyLink app: ${Math.round(result.downMbps)} down, ${Math.round(result.upMbps)} up Mbps.`
          : 'Ran a speed test in the SkyLink app; it did not finish.'
      );
      busy = false;
      failed = result === null;
      ctx.refresh();
      if (lastView) {
        render(lastView);
      }
    };

    return {
      id: 'speed-test',
      mount(container) {
        root = container;
        container.innerHTML = `
          <div class="card mb-3"><div class="card-header"><h3 class="card-title">${ts('speed.title')}</h3></div>
            <div class="card-body">
              <p class="text-secondary">${ts('speed.body', { seconds: SPEED_TEST_WINDOW_S })}</p>
              <button type="button" class="btn btn-primary" id="speed-start">${ts('speed.start')}</button>
              <div class="text-secondary mt-2" id="speed-note"></div>
              <div class="text-danger mt-2" id="speed-failed"></div>
            </div></div>
          <div class="card mb-3"><div class="card-header"><h3 class="card-title">${ts('speed.result')}</h3></div>
            <div class="card-body" id="speed-result"></div></div>
          <div class="card" id="speed-history-card" hidden><div class="card-header"><h3 class="card-title">${ts('speed.history')}</h3></div>
            <div class="table-responsive"><table class="table table-vcenter card-table"><thead><tr>
              <th></th><th>${ts('speed.download')}</th><th>${ts('speed.upload')}</th><th>${ts('speed.latency')}</th><th>${ts('speed.limit.title')}</th>
            </tr></thead><tbody id="speed-history"></tbody></table></div></div>`;
        q('start')?.addEventListener('click', onStart);
      },
      sync(view: TerminalView) {
        lastView = view;
        render(view);
      },
      dispose() {
        q('start')?.removeEventListener('click', onStart);
        root = null;
        lastView = null;
      },
    };
  };
}

export const createSpeedTestScreen: TerminalScreenFactory = createSpeedTestScreenFor(liveBackend);
