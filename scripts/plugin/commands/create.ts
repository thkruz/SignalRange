import { writeGeneratedManifest } from '../lib/codegen';
import { init as gitInit } from '../lib/git';
import { hostVersion } from '../lib/host-version';
import { assertNameAvailable, validatePluginStrict } from '../lib/install-helpers';
import { readLockfile, writeLockfile } from '../lib/lockfile';
import { CliError, log } from '../lib/log';
import { pluginDir } from '../lib/paths';
import { promptText } from '../lib/prompt';
import { buildVars, kebabCase, renderPlugin, titleCase } from '../lib/render-template';
import type { Flags } from '../lib/types';

/** The only scaffold kind SignalRange ships; accepted for forward compatibility. */
const KIND = 'antenna';

interface CreateOptions {
  readonly base: string;
  readonly description: string;
  readonly author: string;
}

async function gatherOptions(flags: Flags): Promise<CreateOptions> {
  const skip = Boolean(flags.yes);
  const base = kebabCase(await resolveName(flags, skip));

  if (!base) {
    throw new CliError('A plugin name is required. Usage: pnpm run plugin -- create <name> [--description <text>] [--author <name>] [--yes]');
  }
  if (!/^[a-z]/u.test(base)) {
    throw new CliError(`Plugin name "${base}" must start with a letter (it becomes the class name, plugin id, and antenna id).`);
  }
  if (flags.kind !== undefined && flags.kind !== KIND) {
    throw new CliError(`Unknown kind "${String(flags.kind)}" (the only kind is "${KIND}").`);
  }

  const defaultDesc = `A SignalRange plugin (${titleCase(base)}).`;
  const description = await resolveOption(flags.description, skip, defaultDesc, () => promptText('Short description', defaultDesc));
  const author = await resolveOption(flags.author, skip, '', () => promptText('Author', ''));

  return { base, description, author };
}

/** Return a flag value, its skip-default, or the interactive prompt result. */
function resolveOption(flag: string | boolean | undefined, skip: boolean, def: string, promptFn: () => Promise<string>): Promise<string> {
  if (typeof flag === 'string') {
    return Promise.resolve(flag);
  }

  return skip ? Promise.resolve(def) : promptFn();
}

function resolveName(flags: Flags, skip: boolean): Promise<string> {
  if (typeof flags.name === 'string') {
    return Promise.resolve(flags.name);
  }

  return skip ? Promise.resolve('') : promptText('Plugin name (kebab-case, e.g. big-dish)');
}

export async function createCommand(positionals: string[], flags: Flags): Promise<number> {
  const merged: Flags = { ...flags };

  if (positionals[0] && typeof merged.name !== 'string') {
    merged.name = positionals[0];
  }

  const { base, description, author } = await gatherOptions(merged);
  const vars = buildVars(base, hostVersion(), { description, author });
  const dir = pluginDir(vars.PLUGIN_PKG);

  assertNameAvailable(vars.PLUGIN_PKG);

  renderPlugin(dir, vars);
  validatePluginStrict(dir, vars.PLUGIN_PKG);

  try {
    gitInit(dir);
  } catch {
    log.warn('git init failed; the plugin folder was created but is not a git repo yet.');
  }

  recordLocalEntry(vars.PLUGIN_PKG);
  writeGeneratedManifest();

  printNextSteps(vars.PLUGIN_PKG, vars.PLUGIN_ID);

  return 0;
}

function printNextSteps(pkgName: string, pluginId: string): void {
  console.log('');
  log.success(`Created an ${KIND} plugin: src/plugins-external/${pkgName} (${pluginId})`);
  console.log('');
  console.log(log.bold('  Next steps'));
  console.log(`    1. Preview live:   ${log.bold(`pnpm run plugin -- dev ${pluginId}`)}`);
  console.log(`    2. Edit the code:  src/plugins-external/${pkgName}/src/plugin.ts`);
  console.log(`    3. Validate:       pnpm run plugin -- doctor ${pluginId}`);
  console.log(`    4. Run tests:      pnpm run plugin -- test ${pluginId}`);
  console.log('');
  console.log(log.dim(`  Publish: cd src/plugins-external/${pkgName} && git remote add origin <url> && git push -u origin main`));
  console.log(log.dim('  Guide:   docs/plugin-development-guide.md'));
  console.log('');
}

function recordLocalEntry(pkgName: string): void {
  const lock = readLockfile();

  lock.plugins[pkgName] = {
    url: pluginDir(pkgName),
    ref: 'local',
    commit: 'local',
    installedAt: new Date().toISOString(),
    local: true,
  };
  writeLockfile(lock);
}
