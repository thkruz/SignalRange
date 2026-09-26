import { existsSync } from 'node:fs';
import { type CompatLevel, classifyCompat } from '../lib/host-version';
import { hasEnLocale } from '../lib/locale-check';
import { readLockfile } from '../lib/lockfile';
import { log } from '../lib/log';
import { pluginDir } from '../lib/paths';
import { readManifest } from '../lib/plugin-meta';
import type { Flags } from '../lib/types';

interface ListRow {
  readonly name: string;
  readonly version: string;
  readonly ids: readonly string[];
  readonly ref: string;
  readonly commit: string;
  readonly engine: string;
  readonly compat: CompatLevel | 'not-installed' | 'error';
  /** True when <localesDir>/en.json is present. */
  readonly locales: boolean;
  readonly antennas: readonly string[];
  readonly onDisk: boolean;
}

function buildRows(): ListRow[] {
  const lock = readLockfile();

  return Object.entries(lock.plugins).map(([name, entry]): ListRow => {
    const dir = pluginDir(name);
    const onDisk = existsSync(dir);
    const base: ListRow = {
      name,
      version: '?',
      ids: [],
      ref: entry.ref,
      commit: entry.commit.slice(0, 7),
      engine: '?',
      compat: onDisk ? 'error' : 'not-installed',
      locales: false,
      antennas: [],
      onDisk,
    };

    if (!onDisk) {
      return base;
    }

    try {
      const m = readManifest(dir);

      return {
        ...base,
        version: m.version,
        ids: m.plugins.map((p) => p.id),
        engine: m.engine,
        compat: classifyCompat(m.engine),
        locales: hasEnLocale(dir, m.localesDir),
        antennas: m.provides?.antennas ?? [],
      };
    } catch {
      return base;
    }
  });
}

const COMPAT_LABEL: Record<ListRow['compat'], string> = {
  ok: 'OK',
  'minor-mismatch': 'WARN',
  incompatible: 'INCOMPATIBLE',
  'invalid-range': 'BAD-RANGE',
  'not-installed': 'NOT-INSTALLED',
  error: 'ERROR',
};

export function listCommand(flags: Flags): number {
  const rows = buildRows();

  if (flags.json) {
    console.log(JSON.stringify(rows, null, 2));

    return 0;
  }

  if (rows.length === 0) {
    log.info('No external plugins installed. Add one with: pnpm run plugin -- add <git-url>');

    return 0;
  }

  log.plain(log.bold('\nInstalled external plugins:\n'));
  for (const r of rows) {
    const ids = r.ids.length > 0 ? r.ids.join(', ') : '—';
    const antennas = r.antennas.length > 0 ? r.antennas.join(', ') : '—';

    log.plain(`  ${log.bold(r.name)}  ${log.dim(`v${r.version}`)}${r.onDisk ? '' : log.dim('   (not on disk; run restore)')}`);
    log.plain(`    plugins:  ${ids}`);
    log.plain(`    ref:      ${r.ref} @ ${r.commit}`);
    log.plain(`    engine:   ${r.engine}   [${COMPAT_LABEL[r.compat]}]`);
    log.plain(`    locales:  ${r.locales ? 'yes' : 'no'}`);
    log.plain(`    antennas: ${antennas}`);
    log.plain('');
  }

  return 0;
}
