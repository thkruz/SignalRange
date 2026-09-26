/**
 * Render the plugin template to a standalone directory, using example
 * placeholder values, to (re)generate the public `signal-range-plugin-example`
 * repo used for GitHub's "Use this template" flow. Keeps that repo from
 * drifting out of sync with scripts/plugin/templates.
 *
 *   pnpm run plugin:export-template -- <out-dir>
 */
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { hostVersion } from './lib/host-version';
import { log } from './lib/log';
import { REPO_ROOT } from './lib/paths';
import { buildVars, renderPlugin } from './lib/render-template';
import { resolveStrictlyWithin } from './lib/safe-path';

const WORKSPACE_ROOT = resolve(REPO_ROOT, '..');

function main(): number {
  const outArg = process.argv.slice(2).find((a) => a !== '--');

  if (!outArg || outArg.startsWith('--')) {
    log.error('Usage: pnpm run plugin:export-template -- <out-dir>');

    return 1;
  }

  // outArg is CLI-controlled and feeds a recursive rmSync below. Resolve it
  // (relative to cwd) then confine it to the workspace so it can never delete
  // a path outside the repo's containing folder; also refuse the workspace
  // root and the repo root themselves.
  let outDir: string;

  try {
    outDir = resolveStrictlyWithin(WORKSPACE_ROOT, resolve(outArg));
  } catch (e) {
    log.error((e as Error).message);

    return 1;
  }

  if (outDir === REPO_ROOT) {
    log.error('Refusing to export onto the repo root itself.');

    return 1;
  }

  const vars = buildVars('example', hostVersion(), {
    description: 'An example SignalRange plugin: adds a 4.5 m Ka-band antenna that shows up in every sandbox loadout. Use this repo as a template.',
    author: 'Theodore Kruczek',
    repository: 'https://github.com/thkruz/signal-range-plugin-example',
  });

  // Clean the target so a removed template file doesn't linger in the export.
  rmSync(outDir, { recursive: true, force: true, maxRetries: 5 });
  renderPlugin(outDir, vars);

  log.success(`Rendered template to ${outDir}`);
  log.step('Commit this directory as the public signal-range-plugin-example repo.');

  return 0;
}

process.exitCode = main();
