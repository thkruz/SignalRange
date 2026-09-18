import { findUndeclaredAntennas } from '../lib/antenna-check';
import { existingIds } from '../lib/existing-ids';
import { classifyCompat, hostVersion } from '../lib/host-version';
import { checkLocales, normalizeLocalesDir } from '../lib/locale-check';
import { CliError, log } from '../lib/log';
import { validateManifest } from '../lib/plugin-meta';
import { type ResolvedExternal, resolvePlugin } from '../lib/resolve-plugin';

type Status = 'PASS' | 'WARN' | 'FAIL';

const TAG: Record<Status, string> = {
  PASS: log.dim('PASS'),
  WARN: log.yellow('WARN'),
  FAIL: log.red('FAIL'),
};

function line(status: Status, label: string, detail = ''): void {
  console.log(`  [${TAG[status]}] ${label}${detail ? log.dim(`  (${detail})`) : ''}`);
}

export function doctorCommand(positionals: string[]): number {
  const name = positionals[0];

  if (!name) {
    throw new CliError('Usage: pnpm run plugin -- doctor <name>');
  }

  const resolved = resolvePlugin(name);

  if (resolved.kind !== 'external') {
    throw new CliError(`"${name}" is a built-in plugin; doctor only checks external plugins.`);
  }

  console.log(log.bold(`\nDoctor: ${resolved.name}@${resolved.manifest.version}\n`));

  const failed = [checkManifest(resolved), checkEngine(resolved)].includes(true);

  checkLocaleBundle(resolved);
  checkProvidedAntennas(resolved);

  console.log('');
  if (failed) {
    log.error('Doctor found blocking issues.');

    return 1;
  }
  log.success('Doctor passed.');

  return 0;
}

/** Manifest schema + disk consistency + id collisions. Returns true on FAIL. */
function checkManifest({ dir, manifest, name }: ResolvedExternal): boolean {
  const { errors, warnings } = validateManifest(manifest, { dir, expectedName: name, existingIds: existingIds(name) });

  if (errors.length === 0) {
    line('PASS', 'Manifest schema, entry files, and id collisions');
  }
  for (const e of errors) {
    line('FAIL', e);
  }
  for (const w of warnings) {
    line('WARN', w);
  }

  return errors.length > 0;
}

/** Engine compatibility. Returns true on FAIL. */
function checkEngine({ manifest }: ResolvedExternal): boolean {
  const compat = classifyCompat(manifest.engine);

  if (compat === 'ok') {
    line('PASS', `Engine ${manifest.engine} satisfies host ${hostVersion()}`);

    return false;
  }
  if (compat === 'minor-mismatch') {
    line('WARN', `Engine ${manifest.engine} vs host ${hostVersion()} (same major)`);

    return false;
  }
  line('FAIL', compat === 'invalid-range' ? `Engine "${manifest.engine}" is not a valid semver range` : `Engine ${manifest.engine} incompatible with host ${hostVersion()}`);

  return true;
}

/** English bundle present and namespaced under plugins.<id>. Advisory only. */
function checkLocaleBundle({ dir, manifest }: ResolvedExternal): void {
  const ids = manifest.plugins.map((p) => p.id);
  const enPath = `${normalizeLocalesDir(manifest.localesDir)}/en.json`;
  const loc = checkLocales(dir, ids, manifest.localesDir);

  if (!loc.hasEn) {
    line('WARN', `No ${enPath} found; user-facing strings will fall back to their keys`);

    return;
  }
  if (loc.parseError) {
    line('WARN', `${enPath} could not be read`, loc.parseError);

    return;
  }

  let clean = true;

  if (loc.extraRoots.length > 0) {
    clean = false;
    line('WARN', `${enPath} root keys should be only "plugins"`, `found: ${loc.extraRoots.join(', ')}`);
  }
  if (loc.missingIds.length > 0) {
    clean = false;
    line('WARN', `${enPath} has no plugins.<id> entry for: ${loc.missingIds.join(', ')}`);
  }
  if (clean) {
    line('PASS', `Locales: ${enPath} namespaced under plugins.${ids.join(' / plugins.')}`);
  }
}

/** Every provides.antennas id appears as a string literal under src/. Advisory only. */
function checkProvidedAntennas({ dir, manifest }: ResolvedExternal): void {
  const antennas = manifest.provides?.antennas ?? [];

  if (antennas.length === 0) {
    line('PASS', 'provides.antennas: none declared');

    return;
  }

  const missing = findUndeclaredAntennas(dir, antennas);

  if (missing.length === 0) {
    line('PASS', `provides.antennas found in src/: ${antennas.join(', ')}`);
  } else {
    line('WARN', `provides.antennas not found as a string literal under src/: ${missing.join(', ')}`);
  }
}
