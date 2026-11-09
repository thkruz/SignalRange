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
import { formatAge, tr } from '../strings';
import type { SpeedTestRecord, TerminalAppModel, TerminalView } from '../terminal-app-model';
import { APP_ACTION_VERBS } from '../terminal-evidence';

import type { TerminalScreen, TerminalScreenContext, TerminalScreenFactory } from './terminal-screen';

/** Sim seconds a speed test observes the link */
export const SPEED_TEST_WINDOW_S = 25;
/** What the router Wi-Fi can carry; a faster link reads as limited by the local network */
export const LOCAL_NETWORK_CAP_MBPS = 300;
/** A result below this share of what the dish itself reports means the limit was not the dish */
const DISH_SHARE_MIN = 0.9;

export const SPEED_TEST_CARD: RequirementCard = { id: 'terminal-speed-test', version: 1, label: 'Speed test', windowS: SPEED_TEST_WINDOW_S, priority: 'routine' };

/** The part of `WorkloadRunner` the speed test uses */
export type SpeedTestRunner = Pick<WorkloadRunner, 'ensureCard' | 'start' | 'getRun' | 'waitForRun' | 'effectiveProfile' | 'shareOf'>;

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

/** A speed test that has started and has not finished */
export interface PendingSpeedTest {
  runId: string;
  serviceId: string;
  startS: number;
  endS: number;
  share: ReturnType<SpeedTestRunner['shareOf']>;
}

/** Start a test without waiting. Returns null when the job cannot start. */
export function beginSpeedTest(backend: SpeedTestBackend): PendingSpeedTest | null {
  const { runner, serviceId } = backend;
  runner.ensureCard(SPEED_TEST_CARD);
  const started = runner.start(SPEED_TEST_CARD.id, serviceId);
  if (!started.ok) {
    return null;
  }

  return { runId: started.run.id, serviceId, startS: started.run.startS, endS: started.run.endS, share: runner.shareOf(started.run) };
}

/**
 * Read the outcome of a started test: 'running' while its window is open, null when it ended
 * without a usable result, the record (also stored on the model) otherwise.
 */
export function finishSpeedTest(backend: SpeedTestBackend, model: TerminalAppModel, pending: PendingSpeedTest): SpeedTestRecord | null | 'running' {
  const { runner, serviceId } = backend;
  const run = runner.getRun(pending.runId);
  if (run?.status === 'running') {
    return 'running';
  }
  model.update();
  const profile = runner.effectiveProfile(serviceId, pending.share);
  if (!run || run.status === 'aborted' || run.status === 'unsupported' || !profile) {
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

/** Run one test to the end, burning its sim time at once. Returns null when it did not finish or the link carried nothing. */
export function runSpeedTest(backend: SpeedTestBackend, model: TerminalAppModel): SpeedTestRecord | null {
  const pending = beginSpeedTest(backend);
  if (!pending) {
    return null;
  }
  backend.runner.waitForRun(pending.runId);
  const result = finishSpeedTest(backend, model, pending);

  return result === 'running' ? null : result;
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
    let pending: PendingSpeedTest | null = null;
    let lastView: TerminalView | null = null;

    const q = (id: string): HTMLElement | null => root?.querySelector(`#speed-${id}`) ?? null;
    const setHtml = (id: string, html: string): void => {
      const el = q(id);
      if (el && el.innerHTML !== html) {
        el.innerHTML = html;
      }
    };
    const mbps = (v: number): string => tr('speed.unitMbps', { value: v >= 100 ? Math.round(v) : v.toFixed(1) });

    function render(view: TerminalView): void {
      if (!root) {
        return;
      }
      const connected = view.link === 'connected';
      const available = connected && resolve(ctx) !== null;
      const button = q('start') as HTMLButtonElement | null;
      if (button) {
        button.disabled = !available || busy;
        button.textContent = busy ? tr('speed.running') : tr('speed.start');
      }
      const progress = q('progress');
      if (progress) {
        const total = pending ? Math.round(pending.endS - pending.startS) : 0;
        const done = pending ? Math.min(total, Math.max(0, Math.round(ctx.model.nowS() - pending.startS))) : 0;
        const text = busy ? tr('speed.progress', { done, total }) : '';
        progress.hidden = !busy;
        if (progress.textContent !== text) {
          progress.textContent = text;
        }
      }
      setHtml('note', !connected ? tr('speed.disabled') : available ? '' : tr('speed.unavailable'));
      setHtml('failed', failed ? tr('speed.failed') : '');
      const tests = ctx.model.speedTests();
      const last = tests[tests.length - 1];
      const nowS = view.data?.sampleTimeS ?? last?.tS ?? 0;
      setHtml(
        'result',
        last
          ? `<div class="row g-3">
              <div class="col-6 col-md-3"><div class="text-secondary small">${tr('speed.download')}</div><div class="h2 mb-0 font-monospace" id="speed-down">${mbps(last.downMbps)}</div></div>
              <div class="col-6 col-md-3"><div class="text-secondary small">${tr('speed.upload')}</div><div class="h2 mb-0 font-monospace" id="speed-up">${mbps(last.upMbps)}</div></div>
              <div class="col-6 col-md-3"><div class="text-secondary small">${tr('speed.latency')}</div><div class="h2 mb-0 font-monospace" id="speed-lat">${tr('speed.unitMs', { value: Math.round(last.latencyMs) })}</div></div>
              <div class="col-6 col-md-3"><div class="text-secondary small">${tr('speed.limit.title')}</div><div class="h2 mb-0" id="speed-limit">${tr(`speed.limit.${last.limit}`)}</div></div>
            </div>`
          : `<span class="text-secondary">${tr('speed.noResult')}</span>`
      );
      setHtml(
        'history',
        tests.length > 1
          ? [...tests]
              .slice(0, -1)
              .reverse()
              .map(
                (t) =>
                  `<tr><td>${tr('speed.ago', { age: formatAge(Math.max(0, nowS - t.tS)) })}</td><td>${mbps(t.downMbps)}</td><td>${mbps(t.upMbps)}</td><td>${tr('speed.unitMs', { value: Math.round(t.latencyMs) })}</td><td>${tr(`speed.limit.${t.limit}`)}</td></tr>`
              )
              .join('')
          : ''
      );
      const hist = q('history-card');
      if (hist) {
        hist.hidden = tests.length <= 1;
      }
    }

    /** Collect the result once the run's window has passed in sim time */
    const settle = (): void => {
      const backend = pending ? resolve(ctx) : null;
      if (!pending || !backend) {
        if (pending) {
          pending = null;
          busy = false;
          failed = true;
        }

        return;
      }
      const result = finishSpeedTest(backend, ctx.model, pending);
      if (result === 'running') {
        return;
      }
      pending = null;
      busy = false;
      failed = result === null;
      ctx.evidence?.action(
        'speed-test',
        APP_ACTION_VERBS.speedTest,
        result
          ? `Ran a speed test in the SkyLink app: ${Math.round(result.downMbps)} down, ${Math.round(result.upMbps)} up Mbps.`
          : 'Ran a speed test in the SkyLink app; it did not finish.'
      );
      ctx.refresh();
    };

    const onStart = (): void => {
      const backend = lastView?.link === 'connected' ? resolve(ctx) : null;
      if (!backend || busy) {
        return;
      }
      failed = false;
      pending = beginSpeedTest(backend);
      if (pending) {
        busy = true;
        settle();
      } else {
        failed = true;
        ctx.evidence?.action('speed-test', APP_ACTION_VERBS.speedTest, 'Ran a speed test in the SkyLink app; it did not finish.');
      }
      if (lastView) {
        render(lastView);
      }
    };

    return {
      id: 'speed-test',
      mount(container) {
        root = container;
        container.innerHTML = `
          <div class="card mb-3"><div class="card-header"><h3 class="card-title">${tr('speed.title')}</h3></div>
            <div class="card-body">
              <p class="text-secondary">${tr('speed.body', { seconds: SPEED_TEST_WINDOW_S })}</p>
              <button type="button" class="btn btn-primary" id="speed-start">${tr('speed.start')}</button>
              <div class="text-secondary mt-2" id="speed-progress" role="status" hidden></div>
              <div class="text-secondary mt-2" id="speed-note"></div>
              <div class="text-danger mt-2" id="speed-failed"></div>
            </div></div>
          <div class="card mb-3"><div class="card-header"><h3 class="card-title">${tr('speed.result')}</h3></div>
            <div class="card-body" id="speed-result"></div></div>
          <div class="card" id="speed-history-card" hidden><div class="card-header"><h3 class="card-title">${tr('speed.history')}</h3></div>
            <div class="table-responsive"><table class="table table-vcenter card-table"><thead><tr>
              <th></th><th>${tr('speed.download')}</th><th>${tr('speed.upload')}</th><th>${tr('speed.latency')}</th><th>${tr('speed.limit.title')}</th>
            </tr></thead><tbody id="speed-history"></tbody></table></div></div>`;
        q('start')?.addEventListener('click', onStart);
      },
      sync(view: TerminalView) {
        lastView = view;
        if (busy) {
          settle();
        }
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
