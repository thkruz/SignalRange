/**
 * SignalRange plugin CLI: install, scaffold, and develop external plugins.
 *
 *   pnpm run plugin -- add <git-url|local-path> [--ref <r>] [--name <n>] [--force] [--yes]
 *   pnpm run plugin -- remove <name> [--keep-files]
 *   pnpm run plugin -- update [name] [--ref <r>] [--force]
 *   pnpm run plugin -- list [--json]
 *   pnpm run plugin -- restore
 *   pnpm run plugin -- sync [--check]
 *   pnpm run plugin -- create <name> [--description <d>] [--author <a>] [--yes]
 *   pnpm run plugin -- dev <name> [--scenario <c>/<s>] [--antenna <id>] [--headless] [--full] [--url] [--no-open]
 *   pnpm run plugin -- test <name> [--watch]
 *   pnpm run plugin -- doctor <name>
 */
import { addCommand } from './commands/add';
import { createCommand } from './commands/create';
import { devCommand } from './commands/dev';
import { doctorCommand } from './commands/doctor';
import { listCommand } from './commands/list';
import { removeCommand } from './commands/remove';
import { restoreCommand } from './commands/restore';
import { syncCommand } from './commands/sync';
import { testCommand } from './commands/test';
import { updateCommand } from './commands/update';
import { CliError, log } from './lib/log';
import type { Flags } from './lib/types';

interface ParsedArgs {
  readonly positionals: string[];
  readonly flags: Flags;
}

/** Flags that never take a value, so `--headless smoke` keeps `smoke` positional. */
const BOOLEAN_FLAGS = new Set(['force', 'yes', 'keep-files', 'check', 'json', 'watch', 'headless', 'full', 'no-open', 'url']);

/** Parse `--flag`, `--flag value`, and `--flag=value`; everything else is a positional. */
function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Flags = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const body = arg.slice(2);
    const eq = body.indexOf('=');

    if (eq !== -1) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
    } else if (!BOOLEAN_FLAGS.has(body) && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      flags[body] = argv[++i];
    } else {
      flags[body] = true;
    }
  }

  return { positionals, flags };
}

const HELP = `
SignalRange Plugin CLI

  add <git-url|local-path>   Install a plugin (clones into src/plugins-external/)
  remove <name>              Uninstall a plugin
  update [name]              Update one or all plugins to their latest ref
  list [--json]              List installed plugins and compatibility
  restore                    Clone plugins recorded in external-plugins.json
  sync [--check]             Regenerate the manifest from installed plugins
  create <name>              Scaffold a new antenna plugin skeleton
  dev <name>                 Boot a sandbox with only this plugin, live-reload
  test <name>                Run this plugin's unit tests
  doctor <name>              Validate a plugin (schema, collisions, locales, antennas)
`;

function main(): number | Promise<number> {
  // `pnpm run plugin -- sync` forwards the `--` separator itself; drop it wherever it lands.
  const [command, ...rest] = process.argv.slice(2).filter((arg) => arg !== '--');
  const { positionals, flags } = parseArgs(rest);

  switch (command) {
    case 'add':
      return addCommand(positionals, flags);
    case 'remove':
      return removeCommand(positionals, flags);
    case 'update':
      return updateCommand(positionals, flags);
    case 'list':
      return listCommand(flags);
    case 'restore':
      return restoreCommand();
    case 'sync':
      return syncCommand(flags);
    case 'create':
      return createCommand(positionals, flags);
    case 'dev':
      return devCommand(positionals, flags);
    case 'test':
      return testCommand(positionals, flags);
    case 'doctor':
      return doctorCommand(positionals);
    case undefined:
    case 'help':
    case '--help':
      console.log(HELP);

      return 0;
    default:
      log.error(`Unknown command: ${command}`);
      console.log(HELP);

      return 1;
  }
}

// Promise.resolve().then(main) routes synchronous throws into the same catch.
Promise.resolve()
  .then(main)
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e: unknown) => {
    if (e instanceof CliError) {
      log.error(e.message);
    } else {
      log.error(`Unexpected error: ${(e as Error).message}`);
      console.error((e as Error).stack);
    }
    process.exitCode = 1;
  });
