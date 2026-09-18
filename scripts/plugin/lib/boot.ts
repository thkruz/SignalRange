import { type ChildProcess, spawnSync } from 'node:child_process';
import type { Page } from 'playwright';

/** Where `pnpm run dev` (rspack serve) listens. */
export const DEV_SERVER_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

/** Sandbox the dev harness boots into unless --scenario says otherwise. */
export const DEFAULT_SCENARIO = 'nats/nats-sandbox';

export interface DevOverrideOptions {
  readonly pluginId: string;
  readonly dependencies: readonly string[];
  /** false => isStrictPluginList (only the target + deps + alwaysEnabled boot). */
  readonly full: boolean;
}

export interface DevUrlOptions extends DevOverrideOptions {
  /** `<campaignId>/<scenarioId>`. */
  readonly scenario: string;
  /** Antenna registry id for the `?antenna=` loadout override; omitted when undefined. */
  readonly antenna?: string;
}

/**
 * settingsOverride for a focused plugin-dev boot: strict-plugin-list isolation
 * so ONLY the target plugin (plus its declared dependencies and always-enabled
 * infra) loads.
 */
export function buildDevOverride(opts: DevOverrideOptions): Record<string, unknown> {
  const plugins: Record<string, { enabled: boolean }> = { [opts.pluginId]: { enabled: true } };

  for (const dep of opts.dependencies) {
    plugins[dep] = { enabled: true };
  }

  return { isStrictPluginList: !opts.full, plugins };
}

/**
 * Mirror of SettingsManager.encodeOverride: JSON → UTF-8 bytes as chars → base64url.
 * Node 24 has a global `btoa`, so no Buffer round-trip is needed.
 */
export function encodeOverride(override: Record<string, unknown>): string {
  const json = JSON.stringify(override);
  const utf8 = encodeURIComponent(json).replace(/%([0-9A-F]{2})/gu, (_m, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));

  return btoa(utf8).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/[=]+$/u, '');
}

/** Split `--scenario <campaignId>/<scenarioId>` into its route segments. */
export function parseScenario(spec: string): { campaignId: string; scenarioId: string } {
  const parts = spec.split('/').filter(Boolean);

  if (parts.length !== 2) {
    throw new Error(`Scenario must be "<campaignId>/<scenarioId>" (got "${spec}").`);
  }

  return { campaignId: parts[0], scenarioId: parts[1] };
}

/** The full URL the dev harness opens. */
export function buildDevUrl(opts: DevUrlOptions): string {
  const { campaignId, scenarioId } = parseScenario(opts.scenario);
  const params = new URLSearchParams({ settingsOverride: encodeOverride(buildDevOverride(opts)) });

  if (opts.antenna) {
    params.set('antenna', opts.antenna);
  }

  return `${DEV_SERVER_URL}/campaigns/${encodeURIComponent(campaignId)}/scenarios/${encodeURIComponent(scenarioId)}?${params.toString()}`;
}

/** One GET; true when the server answered with anything below 500. */
export function isServerUp(url: string, timeoutMs = 5_000): Promise<boolean> {
  return fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    .then((r) => r.status < 500)
    .catch(() => false);
}

/**
 * Poll a URL until it responds, the timeout elapses, or `abandoned()` reports
 * the server process is gone. rspack serve holds requests until the first
 * compile finishes, so each probe has its own short timeout.
 */
export function waitForServer(url: string, timeoutMs: number, abandoned: () => boolean = () => false): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve) => {
    const attempt = (): void => {
      isServerUp(url, 10_000).then((ok) => {
        if (ok) {
          resolve(true);
        } else if (abandoned() || Date.now() >= deadline) {
          resolve(false);
        } else {
          setTimeout(attempt, 1_000);
        }
      });
    };

    attempt();
  });
}

/** Browser console chatter that is never the plugin's fault. */
const BENIGN_CONSOLE = [/\[HMR\]/u, /\[webpack-dev-server\]/u, /\[rspack-dev-server\]/u, /favicon\.ico/u, /Download the React DevTools/u];

export function isBenignConsole(text: string): boolean {
  return BENIGN_CONSOLE.some((re) => re.test(text));
}

/**
 * Wait for the app to finish booting: every plugin registered and the
 * mission-control tab bar on screen. String-form expressions dodge the tsx
 * `__name` helper that a serialized arrow function would drag along.
 */
export async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction('window.signalRange && window.signalRange.plugins && window.signalRange.plugins.isReady === true', undefined, { timeout: 60_000 });
  await page.waitForSelector('#tab-bar', { state: 'visible', timeout: 60_000 });
}

/**
 * Kill a spawned dev server. With `shell: true` on Windows the child is a
 * cmd.exe whose grandchildren (pnpm → rspack) survive a plain kill(), so use
 * taskkill's tree mode there.
 */
export function killTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.pid === undefined) {
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill();
  }
}

/** Resolve once the user presses Ctrl+C. */
export function waitForSigint(): Promise<void> {
  return new Promise((resolve) => {
    process.once('SIGINT', () => resolve());
  });
}
