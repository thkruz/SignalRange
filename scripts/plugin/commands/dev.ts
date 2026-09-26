import type { ChildProcess } from 'node:child_process';
import type { Browser, BrowserType, Page } from 'playwright';
import { buildDevUrl, DEFAULT_SCENARIO, DEV_SERVER_URL, isBenignConsole, isServerUp, killTree, waitForReady, waitForServer, waitForSigint } from '../lib/boot';
import { CliError, log } from '../lib/log';
import { REPO_ROOT } from '../lib/paths';
import { resolvePlugin } from '../lib/resolve-plugin';
import { runShim } from '../lib/run';
import type { Flags } from '../lib/types';

const USAGE = 'Usage: pnpm run plugin -- dev <name> [--scenario <campaignId>/<scenarioId>] [--antenna <id>] [--headless] [--full] [--url] [--no-open]';

interface DevFlags {
  readonly headless: boolean;
  readonly full: boolean;
  readonly noOpen: boolean;
  readonly urlOnly: boolean;
}

export async function devCommand(positionals: string[], flags: Flags): Promise<number> {
  const name = positionals[0];

  if (!name) {
    throw new CliError(USAGE);
  }

  const resolved = resolvePlugin(name);
  const pluginId = resolved.id;
  const dependencies = resolved.kind === 'external' ? resolved.dependencies : [];
  const antennaFlag = typeof flags.antenna === 'string' && flags.antenna ? flags.antenna : undefined;
  const antenna = antennaFlag ?? (resolved.kind === 'external' ? resolved.manifest.provides?.antennas?.[0] : undefined);
  const scenario = typeof flags.scenario === 'string' && flags.scenario ? flags.scenario : DEFAULT_SCENARIO;
  const devFlags: DevFlags = {
    headless: Boolean(flags.headless),
    full: Boolean(flags.full),
    noOpen: Boolean(flags['no-open']),
    urlOnly: Boolean(flags.url),
  };

  let url: string;

  try {
    url = buildDevUrl({ pluginId, dependencies, full: devFlags.full, scenario, antenna });
  } catch (e) {
    throw new CliError(`${(e as Error).message}\n${USAGE}`);
  }

  if (devFlags.urlOnly) {
    console.log(url);

    return 0;
  }

  const server = await ensureServer();

  if (devFlags.noOpen) {
    log.success(`Dev server ready for ${pluginId}. Open:\n  ${url}`);
    if (server) {
      log.step('Press Ctrl+C to stop the dev server.');
      await waitForSigint();
      killTree(server);
    }

    return 0;
  }

  return runDevLoop(pluginId, url, devFlags, server);
}

/**
 * Playwright is installed as a dependency of @playwright/test, so the bare
 * specifier normally resolves; fall back to the test package's re-export when
 * the package manager did not hoist it.
 */
async function loadChromium(): Promise<BrowserType> {
  try {
    return (await import('playwright')).chromium;
  } catch {
    return (await import('@playwright/test')).chromium;
  }
}

function forwardConsole(page: Page): void {
  page.on('console', (msg) => {
    const type = msg.type();

    if ((type === 'warning' || type === 'error') && !isBenignConsole(msg.text())) {
      console.log(`${log.dim('[browser]')} ${type}: ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    if (!isBenignConsole(err.message)) {
      console.log(`${log.red('[browser] pageerror:')} ${err.message}`);
    }
  });
}

async function runDevLoop(pluginId: string, url: string, flags: DevFlags, server: ChildProcess | null): Promise<number> {
  // Lazy import so `add`/`list`/etc. don't pay Playwright's load cost.
  const chromium = await loadChromium();
  const browser = await chromium.launch({ headless: flags.headless });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();

  forwardConsole(page);

  log.info(`Booting ${pluginId} at ${url}`);
  try {
    await page.goto(url);
    await waitForReady(page);
  } catch (e) {
    await browser.close().catch(() => undefined);
    if (server) {
      killTree(server);
    }
    throw new CliError(`The app did not become ready: ${(e as Error).message}`);
  }

  let reloads = 0;

  page.on('load', () => {
    waitForReady(page)
      .then(() => {
        reloads += 1;
        log.step(`Reloaded (#${reloads}); ${pluginId} ready.`);
      })
      .catch(() => {
        // A reload mid-rebuild can race; the next load event will settle.
      });
  });

  log.success(`Dev session live for ${pluginId}. Edit your plugin; the app rebuilds and reloads automatically.`);
  log.step(`Press Ctrl+C to stop.${flags.headless ? ' (headless)' : ''}`);

  await waitForExit(browser, server);

  return 0;
}

/** Ensure a warm dev server; spawn one if absent. Returns the spawned child (to kill on exit) or null. */
async function ensureServer(): Promise<ChildProcess | null> {
  if (await isServerUp(DEV_SERVER_URL)) {
    log.step(`Reusing dev server at ${DEV_SERVER_URL}.`);

    return null;
  }

  log.info(`No dev server at ${DEV_SERVER_URL}; starting "pnpm run dev" (the first compile can take a minute).`);

  const child = runShim('pnpm', ['run', 'dev'], { cwd: REPO_ROOT, stdio: ['inherit', 'pipe', 'pipe'] });
  let exited = false;

  child.stdout?.on('data', (buf: Buffer) => process.stdout.write(buf));
  child.stderr?.on('data', (buf: Buffer) => process.stderr.write(buf));
  child.on('exit', () => {
    exited = true;
  });

  // rspack serve accepts connections immediately but holds every request until
  // the first compile finishes, so polling the URL is the readiness signal.
  if (!(await waitForServer(DEV_SERVER_URL, 300_000, () => exited))) {
    killTree(child);
    throw new CliError(exited ? '"pnpm run dev" exited before the server answered.' : 'Dev server did not answer within 300 s.');
  }

  return child;
}

function waitForExit(browser: Browser, server: ChildProcess | null): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const shutdown = (): void => {
      if (done) {
        return;
      }
      done = true;
      if (server) {
        killTree(server);
      }
      resolve();
    };

    browser.on('disconnected', shutdown);
    process.on('SIGINT', () => {
      browser
        .close()
        .catch(() => undefined)
        .finally(shutdown);
    });
  });
}
