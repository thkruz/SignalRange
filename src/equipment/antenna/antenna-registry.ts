import { ANTENNA_CONFIG_KEYS } from './antenna-config-keys';
import { ANTENNA_CONFIGS, type AntennaConfig } from './antenna-configs';
import type { AntennaCore, AntennaState } from './antenna-core';

/**
 * Identifier of an antenna hardware config. Built-ins keep their enum (and its
 * autocomplete); plugins register plain strings. The `string & {}` half is what
 * keeps the enum members visible in completions while still admitting any id.
 */
export type AntennaConfigId = ANTENNA_CONFIG_KEYS | (string & {});

/**
 * Builds a headless antenna for a config that needs custom behaviour (a plugin
 * subclassing AntennaCore, e.g. a phased array with electronic steering).
 * Mission Control uses it in place of AntennaUIHeadless for that id.
 */
export type AntennaCoreFactory = (parentId: string, configId: AntennaConfigId, initialState: Partial<AntennaState>, teamId: number, serverId: number) => AntennaCore;

export type AntennaSource = 'builtin' | `plugin:${string}`;

export interface AntennaRegistryEntry {
  id: string;
  config: AntennaConfig;
  source: AntennaSource;
  core?: AntennaCoreFactory;
}

export interface RegisterAntennaOptions {
  /** Who owns this id; plugins pass `plugin:<PluginId>`. Default 'builtin'. */
  source?: AntennaSource;
  /** Optional core factory for configs with custom behaviour. */
  core?: AntennaCoreFactory;
}

/**
 * Open registry of antenna hardware configs.
 *
 * Seeded from ANTENNA_CONFIGS, so every built-in resolves exactly as before;
 * AntennaCore looks ids up here instead of indexing the record directly. A
 * plugin may add ids, may replace its own ids (hot reload), and may never
 * touch a built-in or another plugin's id.
 */
export class AntennaRegistry {
  private static instance_: AntennaRegistry | null = null;
  private readonly entries_ = new Map<string, AntennaRegistryEntry>();

  private constructor() {
    for (const [id, config] of Object.entries(ANTENNA_CONFIGS)) {
      this.entries_.set(id, { id, config, source: 'builtin' });
    }
  }

  static getInstance(): AntennaRegistry {
    AntennaRegistry.instance_ ??= new AntennaRegistry();

    return AntennaRegistry.instance_;
  }

  /** Test seam: drop every plugin registration. */
  static destroy(): void {
    AntennaRegistry.instance_ = null;
  }

  static isBuiltin(id: string): id is ANTENNA_CONFIG_KEYS {
    return id in ANTENNA_CONFIGS;
  }

  register(id: string, config: AntennaConfig, options: RegisterAntennaOptions = {}): void {
    const source = options.source ?? 'builtin';

    if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(id)) {
      throw new Error(`Antenna config id "${id}" must start with a letter and contain only letters, digits, "_" or "-".`);
    }

    const existing = this.entries_.get(id);

    if (existing && existing.source === 'builtin') {
      throw new Error(`Antenna config "${id}" is built in and cannot be replaced.`);
    }
    if (existing && existing.source !== source) {
      throw new Error(`Antenna config "${id}" is already registered by ${existing.source}.`);
    }

    this.entries_.set(id, { id, config, source, core: options.core });
  }

  /** Remove a plugin id. Built-ins are permanent; returns false when nothing changed. */
  unregister(id: string): boolean {
    const existing = this.entries_.get(id);

    if (!existing || existing.source === 'builtin') {
      return false;
    }

    return this.entries_.delete(id);
  }

  has(id: string): boolean {
    return this.entries_.has(id);
  }

  find(id: string): AntennaRegistryEntry | undefined {
    return this.entries_.get(id);
  }

  /** Resolve a config or throw with the list of what would have matched. */
  get(id: AntennaConfigId): AntennaConfig {
    const entry = this.entries_.get(id);

    if (!entry) {
      const plugins = this.list()
        .filter((e) => e.source !== 'builtin')
        .map((e) => `${e.id} (${e.source})`);
      const hint = plugins.length > 0 ? `Plugin antennas: ${plugins.join(', ')}.` : 'No plugin antennas are registered.';

      throw new Error(`Unknown antenna config "${id}". ${hint}`);
    }

    return entry.config;
  }

  /** Every entry: built-ins in declaration order, then plugin entries in registration order. */
  list(): AntennaRegistryEntry[] {
    return [...this.entries_.values()];
  }
}
