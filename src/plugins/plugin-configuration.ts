/**
 * Per-plugin user configuration, folded into SettingsManager.settings.plugins.
 * The manifest supplies the default; localStorage and the settings override
 * (window.settingsOverride / ?settingsOverride=) layer on top.
 */
export interface PluginConfiguration {
  enabled: boolean;
  /** Load order among plugins; lower loads first. Default 0. */
  order?: number;
}

/**
 * Keys match `id` values in plugin-manifest.ts. Add a named key here when a
 * built-in plugin needs type-safe access from presets or the dev harness; any
 * other id (external plugins) is still accepted through the index signature.
 */
export interface SignalRangePluginsConfiguration {
  Authoring?: PluginConfiguration;
  [pluginId: string]: PluginConfiguration | undefined;
}
