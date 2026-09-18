import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveWithin } from './safe-path';

const HERE = dirname(fileURLToPath(import.meta.url));

export const TEMPLATES_DIR = resolve(HERE, '..', 'templates');
// The destination ultimately derives from a CLI argument (create/export), so
// every scaffold write is confined to the workspace that contains this repo:
// `create` targets src/plugins-external/ inside the repo, `export` a sibling repo.
const WORKSPACE_ROOT = resolve(HERE, '..', '..', '..', '..');

export interface TemplateVars {
  readonly PLUGIN_PKG: string;
  readonly CLASS_NAME: string;
  readonly PLUGIN_ID: string;
  readonly DISPLAY_NAME: string;
  readonly ELEMENT_BASE: string;
  readonly ANTENNA_ID: string;
  readonly ENGINE_RANGE: string;
  readonly ENGINE_REF: string;
  readonly DESCRIPTION: string;
  readonly YEAR: string;
  readonly AUTHOR: string;
  /** Install URL shown in the README; a placeholder for scaffolds, the real repo for the export. */
  readonly REPO_URL: string;
  /** Manifest `repository` field; empty for scaffolds until the author publishes. */
  readonly REPOSITORY: string;
}

const PKG_PREFIX = 'signal-range-plugin-';

function words(kebab: string): string[] {
  return kebab.split('-').filter(Boolean);
}

export function pascalCase(kebab: string): string {
  return words(kebab)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

export function titleCase(kebab: string): string {
  return words(kebab)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

export function upperSnakeCase(kebab: string): string {
  return words(kebab)
    .map((s) => s.toUpperCase())
    .join('_');
}

/** Normalize user input to a kebab base name, dropping the package prefix if given. */
export function kebabCase(input: string): string {
  const lower = input.trim().toLowerCase();
  const stripped = lower.startsWith(PKG_PREFIX) ? lower.slice(PKG_PREFIX.length) : lower;

  return stripped.replaceAll(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');
}

function substitute(content: string, vars: TemplateVars): string {
  let out = content;

  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`__${key}__`, value);
  }

  return out;
}

/** Map a template-relative path to its rendered destination path. */
function targetRelPath(templateRel: string): string {
  const segments = templateRel.split(/[\\/]/u);
  const mapped = segments.map((seg) => (seg === 'github' ? '.github' : seg));
  const last = mapped.length - 1;
  const base = mapped[last];

  mapped[last] = base === 'gitignore.tmpl' ? '.gitignore' : base.replace(/\.tmpl$/u, '');

  return mapped.join('/');
}

function renderTree(srcDir: string, destDir: string, vars: TemplateVars, rel = ''): void {
  for (const name of readdirSync(join(srcDir, rel))) {
    const childRel = rel ? `${rel}/${name}` : name;
    const abs = join(srcDir, childRel);

    if (statSync(abs).isDirectory()) {
      renderTree(srcDir, destDir, vars, childRel);
      continue;
    }

    // targetRelPath is derived from template file names; confine the write to
    // destDir so a template path can never escape the scaffold directory.
    const destAbs = resolveWithin(destDir, targetRelPath(childRel));

    mkdirSync(dirname(destAbs), { recursive: true });

    // Binary assets are copied verbatim; text templates are substituted.
    if (childRel.endsWith('.tmpl')) {
      writeFileSync(destAbs, substitute(readFileSync(abs, 'utf8'), vars), 'utf8');
    } else {
      copyFileSync(abs, destAbs);
    }
  }
}

/** Render the full plugin skeleton into `destDir`. */
export function renderPlugin(destDir: string, vars: TemplateVars): void {
  // destDir traces back to a CLI argument: validate it lands inside the
  // workspace before creating anything, then thread the validated path through.
  const safeDest = resolveWithin(WORKSPACE_ROOT, destDir);

  mkdirSync(safeDest, { recursive: true });
  renderTree(TEMPLATES_DIR, safeDest, vars);
}

/** Build template vars for a plugin from its kebab base name + metadata. */
export function buildVars(base: string, hostVersion: string, opts: { readonly description: string; readonly author: string; readonly repository?: string }): TemplateVars {
  const [majorText, minorText] = hostVersion.split('.');
  const major = Number.parseInt(majorText, 10);
  const minor = Number.parseInt(minorText ?? '0', 10) || 0;
  const pascal = pascalCase(base);

  return {
    PLUGIN_PKG: `${PKG_PREFIX}${base}`,
    CLASS_NAME: `${pascal}Plugin`,
    PLUGIN_ID: `${pascal}Plugin`,
    DISPLAY_NAME: titleCase(base),
    ELEMENT_BASE: base,
    ANTENNA_ID: `${upperSnakeCase(base)}_ANTENNA`,
    ENGINE_RANGE: `>=${major}.${minor}.0 <${major + 1}.0.0`,
    ENGINE_REF: `v${hostVersion}`,
    DESCRIPTION: opts.description,
    YEAR: String(new Date().getFullYear()),
    AUTHOR: opts.author,
    REPO_URL: opts.repository ?? `https://github.com/YOU/${PKG_PREFIX}${base}`,
    REPOSITORY: opts.repository ?? '',
  };
}
