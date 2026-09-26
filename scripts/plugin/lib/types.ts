/**
 * Shared types for the plugin CLI. The on-disk `signal-range-plugin.json`
 * schema and the `external-plugins.json` lockfile schema live here.
 */

/** Parsed `--flag` values from the command line. */
export type Flags = Record<string, string | boolean>;

/** One plugin entry inside a repo's signal-range-plugin.json `plugins` array. */
export interface PluginEntry {
  /** Plugin id. MUST equal the plugin class's `readonly id`. */
  readonly id: string;
  /** Named export in `entry` to instantiate. */
  readonly className: string;
  /** Repo-relative path to the entry module (explicit extension, POSIX separators). */
  readonly entry: string;
  /** Default configuration folded into SettingsManager.settings.plugins. */
  readonly defaultConfig: { readonly enabled: boolean; readonly order?: number };
  /** Ids of plugins this plugin needs (dev harness strict-list boot set). */
  readonly dependencies?: readonly string[];
  /** When true, always enabled regardless of user config. */
  readonly alwaysEnabled?: boolean;
}

/** What a plugin contributes to the engine's registries (informational). */
export interface PluginProvides {
  /** Antenna registry ids the plugin registers. */
  readonly antennas?: readonly string[];
}

/** A repo's signal-range-plugin.json manifest. */
export interface SignalRangePluginManifest {
  readonly formatVersion: number;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly author?: string;
  readonly repository?: string;
  /** Semver range against the host package.json version. */
  readonly engine: string;
  readonly plugins: readonly PluginEntry[];
  /** Folder holding `en.json` (default "locales"). */
  readonly localesDir?: string;
  readonly provides?: PluginProvides;
}

/** One installed plugin recorded in external-plugins.json. */
export interface LockEntry {
  readonly url: string;
  readonly ref: string;
  readonly commit: string;
  readonly installedAt: string;
  /** True for `create`/local-path installs: restore warns instead of cloning. */
  readonly local?: boolean;
}

/** The external-plugins.json lockfile. */
export interface Lockfile {
  readonly formatVersion: number;
  readonly plugins: Record<string, LockEntry>;
}
