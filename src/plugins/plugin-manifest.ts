/**
 * Plugin manifest: the single list of everything the PluginManager may load.
 * Array order is load order (ties broken by `order` in each plugin's config).
 *
 * Adding a built-in plugin:
 * 1. Add a PluginDescriptor here (import, class name, default config).
 * 2. Optionally add its id to SignalRangePluginsConfiguration for typed access.
 *
 * Private imports are guarded by `__IS_PRIVATE__` (compile-time constant from
 * DefinePlugin). In OSS builds the ternary folds to `undefined`, so rspack
 * never resolves the `@private` path and no stub files are needed. This is the
 * same mechanism keeptrack uses for `proImport`.
 *
 * External plugins (cloned into src/plugins-external by the plugin CLI) arrive
 * through the generated manifest, which is committed and empty upstream.
 */
import type { PluginDescriptor } from './plugin-descriptor';
import { externalPluginManifest } from './plugin-manifest.external.generated';

export const builtinPluginManifest: PluginDescriptor[] = [
  // ── Private edition ────────────────────────────────────────────────────────
  {
    id: 'Authoring',
    privateImport: __IS_PRIVATE__ ? () => import('@private/index') : undefined,
    privateClassName: 'AuthoringPlugin',
    defaultConfig: { enabled: true },
    alwaysEnabled: true,
    source: 'private',
  },
];

export const pluginManifest: PluginDescriptor[] = [...builtinPluginManifest, ...externalPluginManifest];
