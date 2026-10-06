#!/usr/bin/env node
/**
 * Scenario authoring editor launcher (phase 15.8 B).
 *
 *   pnpm run author                 check the setup, then start the dev server and open /author
 *   pnpm run author:intake <PR#>    (maintainer) move a PR's staged clip audio to R2
 *
 * The editor itself lives in the private submodule (src/private/app). This
 * script only gets a collaborator's machine to the point where it runs: Node,
 * the GitHub CLI (Submit for review uses it), the submodule and its
 * dependencies. Each missing piece stops with the command that fixes it.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createConnection } from 'node:net';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const privateApp = join(repoRoot, 'src', 'private', 'app');
const isWindows = process.platform === 'win32';
const DEV_PORT = 3000;

const ok = (msg) => console.log(`  ✓ ${msg}`);
function stop(msg, fix) {
  console.error(`\n  ✗ ${msg}`);
  if (fix) console.error(`    Fix: ${fix}`);
  process.exit(1);
}

/** Run quietly; true on exit 0. */
function succeeds(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { cwd: repoRoot, stdio: 'ignore', shell: isWindows, ...opts });
  return res.status === 0;
}

/** Run with output shown; stop on failure. */
function step(label, cmd, args, fix) {
  console.log(`  … ${label}`);
  const res = spawnSync(cmd, args, { cwd: repoRoot, stdio: 'inherit', shell: isWindows });
  if (res.status !== 0) stop(`${label} failed`, fix);
  ok(label);
}

function checkSetup() {
  console.log('\nChecking the authoring setup\n');

  const wanted = Number(JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).engines.node.replace(/[^\d]/gu, ''));
  const major = Number(process.versions.node.split('.')[0]);
  if (major < wanted) stop(`Node ${process.versions.node} is too old; the engine needs ${wanted}+.`, 'install Node from https://nodejs.org (LTS), then run this again');
  ok(`Node ${process.versions.node}`);

  if (!succeeds('gh', ['--version'])) stop('The GitHub CLI (gh) is not installed. Submit for review uses it.', 'install it from https://cli.github.com, then run this again');
  if (!succeeds('gh', ['auth', 'status'])) stop('The GitHub CLI is not signed in.', 'run `gh auth login` (GitHub.com, HTTPS, browser), then run this again');
  // Lets git push over HTTPS with the gh login (Submit pushes to your fork).
  succeeds('gh', ['auth', 'setup-git']);
  ok('GitHub CLI signed in');

  if (!existsSync(join(privateApp, 'index.ts'))) {
    // .gitmodules records the SSH URL for CI; collaborators use HTTPS through gh.
    step(
      'Fetching the private authoring module',
      'git',
      ['-c', 'url.https://github.com/.insteadOf=git@github.com:', 'submodule', 'update', '--init', 'src/private'],
      'ask Ted for access to thkruz/signal-range-private, accept the invite, then run this again',
    );
  } else {
    ok('Private authoring module present');
  }

  if (!existsSync(join(repoRoot, 'node_modules'))) step('Installing engine dependencies', 'pnpm', ['install'], 'install pnpm (`npm install -g pnpm`), then run this again');
  else ok('Engine dependencies installed');

  if (!existsSync(join(privateApp, 'node_modules', 'ts-morph'))) step('Installing editor dependencies', 'npm', ['ci', '--prefix', privateApp], 'run `npm ci --prefix src/private/app` and read its error');
  else ok('Editor dependencies installed');
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

const BROWSER_OPENERS = {
  win32: (url) => ['cmd', ['/c', 'start', '', url]],
  darwin: (url) => ['open', [url]],
};

function openBrowser(url) {
  const [cmd, args] = (BROWSER_OPENERS[process.platform] ?? ((u) => ['xdg-open', [u]]))(url);
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}

async function launch() {
  const url = `http://localhost:${DEV_PORT}/author`;
  if (await portOpen(DEV_PORT)) {
    console.log(`\nA dev server is already running; opening ${url}\n`);
    openBrowser(url);
    return;
  }
  console.log(`\nStarting the dev server; the editor opens at ${url} when it is ready (Ctrl+C to stop).\n`);
  const server = spawn('pnpm', ['run', 'dev'], { cwd: repoRoot, stdio: 'inherit', shell: isWindows });
  server.on('exit', (code) => process.exit(code ?? 0));
  for (let i = 0; i < 180; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await portOpen(DEV_PORT)) {
      openBrowser(url);
      return;
    }
  }
  console.error(`\nThe dev server did not open port ${DEV_PORT} within three minutes; check the output above.`);
}

async function runIntake(prArg) {
  const pr = Number(prArg);
  if (!Number.isInteger(pr) || pr <= 0) stop('Usage: pnpm run author:intake <PR number>');
  const intakePath = join(privateApp, 'authoring', 'server', 'intake.cjs');
  if (!existsSync(intakePath)) stop('The private authoring module is not checked out.', 'git submodule update --init src/private');
  const { intake } = createRequire(import.meta.url)(intakePath);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await intake({
      repoRoot,
      pr,
      confirmUpload: async (moved) => {
        const answer = await rl.question(`\nUpload to R2 now? The sync sends every new or changed file under public/assets, not only these ${moved.length}. [y/N] `);
        return answer.trim().toLowerCase() === 'y';
      },
      syncR2: () => {
        const res = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'sync-r2-assets.js')], { cwd: repoRoot, stdio: 'inherit' });
        if (res.status !== 0) throw new Error('R2 sync failed; the PR is unchanged. Fix the sync and run intake again.');
      },
    });
  } catch (err) {
    stop(err.message);
  } finally {
    rl.close();
  }
}

const [command, arg] = process.argv.slice(2);
if (command === 'intake') {
  await runIntake(arg);
} else if (command === undefined) {
  checkSetup();
  await launch();
} else {
  stop(`Unknown command '${command}'. Use \`pnpm run author\` or \`pnpm run author:intake <PR#>\`.`);
}
