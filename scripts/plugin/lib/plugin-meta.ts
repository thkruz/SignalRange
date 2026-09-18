import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CliError } from './log';
import type { PluginEntry, SignalRangePluginManifest } from './types';

export const MANIFEST_FILENAME = 'signal-range-plugin.json';
export const SUPPORTED_FORMAT_VERSION = 1;

/** Read and JSON-parse a plugin's signal-range-plugin.json. Throws CliError on failure. */
export function readManifest(dir: string): SignalRangePluginManifest {
  const file = join(dir, MANIFEST_FILENAME);

  if (!existsSync(file)) {
    throw new CliError(`No ${MANIFEST_FILENAME} found in ${dir}`);
  }

  let parsed: SignalRangePluginManifest;

  try {
    parsed = JSON.parse(readFileSync(file, 'utf8')) as SignalRangePluginManifest;
  } catch (e) {
    throw new CliError(`${MANIFEST_FILENAME} is not valid JSON: ${(e as Error).message}`);
  }

  return parsed;
}

export interface ValidationResult {
  readonly errors: string[];
  readonly warnings: string[];
}

export interface ValidateOptions {
  /** Plugin folder; when given, entry files are checked on disk. */
  readonly dir?: string;
  /** Install directory name the manifest `name` must equal. */
  readonly expectedName?: string;
  /** Ids already taken by built-ins + other installed plugins. */
  readonly existingIds?: Set<string>;
}

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PLUGIN_ID = /^[A-Za-z][A-Za-z0-9]*$/u;

/**
 * Validate a manifest's shape and, when `dir` is given, its consistency with the
 * files on disk (entry exists, class exported, id declared).
 */
export function validateManifest(manifest: SignalRangePluginManifest, opts: ValidateOptions = {}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (manifest.formatVersion !== SUPPORTED_FORMAT_VERSION) {
    errors.push(`formatVersion must be ${SUPPORTED_FORMAT_VERSION} (got ${JSON.stringify(manifest.formatVersion)})`);
  }
  if (typeof manifest.name !== 'string' || !KEBAB.test(manifest.name)) {
    errors.push(`name must be kebab-case (got ${JSON.stringify(manifest.name)})`);
  }
  if (opts.expectedName && manifest.name !== opts.expectedName) {
    errors.push(`name "${manifest.name}" must equal the install directory name "${opts.expectedName}"`);
  }
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    errors.push('version is required (semver string)');
  }
  if (typeof manifest.engine !== 'string' || manifest.engine.length === 0) {
    errors.push('engine is required (semver range, e.g. ">=1.1.0 <2.0.0")');
  }
  if (manifest.localesDir !== undefined && (typeof manifest.localesDir !== 'string' || manifest.localesDir.length === 0)) {
    errors.push('localesDir must be a non-empty string when present');
  }
  validateProvides(manifest, errors);

  if (!Array.isArray(manifest.plugins) || manifest.plugins.length === 0) {
    errors.push('plugins must be a non-empty array');

    return { errors, warnings };
  }

  const seenIds = new Set<string>();

  for (const p of manifest.plugins) {
    validateEntry(p, opts, seenIds, errors, warnings);
  }

  return { errors, warnings };
}

function validateProvides(manifest: SignalRangePluginManifest, errors: string[]): void {
  const provides = manifest.provides;

  if (provides === undefined) {
    return;
  }
  if (provides === null || typeof provides !== 'object' || Array.isArray(provides)) {
    errors.push('provides must be an object when present');

    return;
  }
  if (provides.antennas !== undefined && (!Array.isArray(provides.antennas) || provides.antennas.some((a) => typeof a !== 'string' || a.length === 0))) {
    errors.push('provides.antennas must be an array of non-empty strings when present');
  }
}

function validateEntry(p: PluginEntry, opts: ValidateOptions, seenIds: Set<string>, errors: string[], warnings: string[]): void {
  const label = p.id ?? '(missing id)';

  if (typeof p.id !== 'string' || !PLUGIN_ID.test(p.id)) {
    errors.push(`[${label}] id must be a PascalCase identifier`);

    return;
  }
  if (typeof p.className !== 'string' || p.className.length === 0) {
    errors.push(`[${label}] className is required`);
  }
  if (typeof p.entry !== 'string' || p.entry.length === 0) {
    errors.push(`[${label}] entry is required`);
  }
  if (!p.defaultConfig || typeof p.defaultConfig.enabled !== 'boolean') {
    errors.push(`[${label}] defaultConfig.enabled (boolean) is required`);
  }
  if (p.dependencies !== undefined && (!Array.isArray(p.dependencies) || p.dependencies.some((d) => typeof d !== 'string'))) {
    errors.push(`[${label}] dependencies must be an array of plugin ids when present`);
  }
  if (seenIds.has(p.id)) {
    errors.push(`[${label}] duplicate id within this manifest`);
  }
  seenIds.add(p.id);

  if (opts.existingIds?.has(p.id)) {
    errors.push(`id "${p.id}" collides with a built-in or already-installed plugin; choose a unique id`);
  }

  if (opts.dir && typeof p.entry === 'string' && typeof p.className === 'string') {
    validateEntryFile(p, opts.dir, errors, warnings);
  }
}

function validateEntryFile(p: PluginEntry, dir: string, errors: string[], warnings: string[]): void {
  const entryPath = resolve(dir, p.entry);

  if (!existsSync(entryPath)) {
    errors.push(`[${p.id}] entry file not found: ${p.entry}`);

    return;
  }

  const src = readFileSync(entryPath, 'utf8');

  // Named export of the class (what PluginManager.instantiate_ resolves via mod[className]).
  const exportRe = new RegExp(`export\\s+(?:abstract\\s+)?class\\s+${p.className}\\b`, 'u');

  if (!exportRe.test(src)) {
    errors.push(`[${p.id}] entry must contain "export class ${p.className}"`);
  }

  // id invariant (SignalRangePlugin keys settings and locales by this.id).
  const idRe = new RegExp(`id\\s*=\\s*['"]${p.id}['"]`, 'u');

  if (!idRe.test(src)) {
    warnings.push(`[${p.id}] could not confirm "readonly id = '${p.id}'" in ${p.entry}; the class id MUST equal its manifest id`);
  }
}
