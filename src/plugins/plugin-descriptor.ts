import type { PluginConfiguration } from './plugin-configuration';

/** Metadata the CLI precomputes at sync time for an external plugin. */
export interface ExternalPluginMetaEntry {
  /** Package name from signal-range-plugin.json `name`. */
  packageName: string;
  /** Plugin's own semver. */
  version: string;
  /** Repository URL for the "view source" link. */
  repoUrl: string;
  /** One-line description. */
  description: string;
  /** Declared engine compatibility range (semver). */
  engine: string;
  /** Resolved git commit the clone is pinned to. */
  commit: string;
  /** Precomputed at sync time: does `engine` satisfy the host version? */
  compatible: boolean;
}

/** Async loader for a locale bundle; accepts a JSON module or a plain object. */
export type LocaleBundleLoader = () => Promise<{ default: Record<string, unknown> } | Record<string, unknown>>;

/**
 * One entry in the plugin manifest.
 *
 * Mirrors keeptrack's descriptor: `import` is the open-source module, and
 * `privateImport` (present only when the private submodule is compiled in,
 * `__IS_PRIVATE__`) is tried first and falls back to `import` if it fails to
 * load. A descriptor with neither is skipped, which is how a private-only
 * plugin stays invisible in the OSS build without any stub files.
 */
export interface PluginDescriptor {
  /** Config key. MUST equal the plugin class's `readonly id`. */
  id: string;

  /** Dynamic import of the OSS module (omit for private-only plugins). */
  import?: () => Promise<Record<string, unknown>>;

  /** Named export in `import` that extends SignalRangePlugin. */
  className?: string;

  /** Dynamic import of the private module; `undefined` in OSS builds. */
  privateImport?: () => Promise<Record<string, unknown>>;

  /** Named export in `privateImport` (defaults to `className`). */
  privateClassName?: string;

  /** Default configuration; the single source of truth for `enabled`/`order`. */
  defaultConfig: PluginConfiguration;

  /** When true the plugin loads regardless of user configuration. */
  alwaysEnabled?: boolean;

  /** Ids of plugins that must be enabled for this one to work (dev harness strict list). */
  dependencies?: string[];

  /** Locale bundles keyed by language code, loaded before `register()`. */
  locales?: Record<string, LocaleBundleLoader>;

  /** Where the plugin came from. Informational (dev menu, plugin list). */
  source?: 'builtin' | 'private' | 'external';

  /** CLI-precomputed metadata for external plugins. */
  meta?: ExternalPluginMetaEntry;
}
