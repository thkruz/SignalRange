import { CampaignManager } from '@app/campaigns/campaign-manager';
import { AntennaRegistry } from '@app/equipment/antenna/antenna-registry';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { addLocaleBundle, t7e } from '@app/locales/i18n';
import { Logger } from '@app/logging/logger';
import { Router } from '@app/router';
import { SettingsManager } from '@app/settings/settings-manager';
import type { PluginDescriptor } from './plugin-descriptor';
import { pluginManifest } from './plugin-manifest';
import type { PluginApi, SignalRangePlugin } from './signal-range-plugin';

/** One row of PluginManager.list(): what the dev menu and e2e specs read. */
export interface PluginInfo {
  id: string;
  source: NonNullable<PluginDescriptor['source']>;
  /** Resolved from settings (alwaysEnabled counts as enabled). */
  enabled: boolean;
  /** True once register() completed without throwing. */
  loaded: boolean;
  /** Set when loading or registering failed. */
  error?: string;
  /** Set for descriptors with no module in this build (private-only in OSS). */
  unavailable?: boolean;
  version?: string;
  repoUrl?: string;
  compatible?: boolean;
}

interface ResolvedModule {
  mod: Record<string, unknown>;
  className: string | undefined;
  usedPrivate: boolean;
}

type PluginClass = new () => SignalRangePlugin;

/**
 * Loads the manifest at boot.
 *
 * Two phases, like keeptrack: every enabled module is fetched in parallel,
 * then plugins are instantiated and registered one at a time in manifest
 * order so a plugin can rely on the ones before it. A plugin that throws is
 * recorded and skipped; boot never fails because of a plugin.
 */
export class PluginManager {
  private static instance_: PluginManager | null = null;

  private manifest_: PluginDescriptor[] = pluginManifest;
  private readonly plugins_ = new Map<string, SignalRangePlugin>();
  private readonly info_ = new Map<string, PluginInfo>();
  private readyPromise_: Promise<void> | null = null;
  private isReady_ = false;
  private seeded_ = false;

  private constructor() {}

  static getInstance(): PluginManager {
    PluginManager.instance_ ??= new PluginManager();

    return PluginManager.instance_;
  }

  /** Test seam: dispose every plugin and forget the singleton. */
  static destroy(): void {
    PluginManager.instance_?.disposeAll();
    PluginManager.instance_ = null;
  }

  /** Test seam: swap the manifest before loadAll(). */
  setManifest(descriptors: PluginDescriptor[]): void {
    if (this.readyPromise_) {
      throw new Error('setManifest() must be called before loadAll().');
    }
    this.manifest_ = descriptors;
  }

  get manifest(): readonly PluginDescriptor[] {
    return this.manifest_;
  }

  /**
   * True when nothing is left to load. Also true before loadAll() when the
   * manifest has no loadable descriptor in this build, so the router can keep
   * its synchronous route handling in the plugin-free case.
   */
  get isReady(): boolean {
    return this.isReady_ || (!this.readyPromise_ && !this.hasLoadable_());
  }

  /** Resolves once every plugin has registered (starts loading if needed). */
  get ready(): Promise<void> {
    return this.loadAll();
  }

  /** Idempotent: the first call starts loading, later calls return the same promise. */
  loadAll(): Promise<void> {
    this.readyPromise_ ??= this.loadAllOnce_();

    return this.readyPromise_;
  }

  list(): PluginInfo[] {
    return [...this.info_.values()];
  }

  get(id: string): SignalRangePlugin | undefined {
    return this.plugins_.get(id);
  }

  has(id: string): boolean {
    return this.plugins_.has(id);
  }

  disposeAll(): void {
    for (const [id, plugin] of this.plugins_) {
      try {
        plugin.dispose();
      } catch (e) {
        Logger.warn(`[plugins] ${id}.dispose() threw`, e);
      }
    }
    this.plugins_.clear();
  }

  private static isLoadable_(descriptor: PluginDescriptor): boolean {
    return Boolean(descriptor.import) || (__IS_PRIVATE__ && Boolean(descriptor.privateImport));
  }

  private hasLoadable_(): boolean {
    return this.manifest_.some((d) => PluginManager.isLoadable_(d) && this.isEnabled_(d));
  }

  private isEnabled_(descriptor: PluginDescriptor): boolean {
    if (descriptor.alwaysEnabled) {
      return true;
    }

    // Settings must know the manifest defaults before they can answer; the
    // router asks isReady before loadAll() has run.
    this.seedSettings_();

    return SettingsManager.getInstance().isPluginEnabled(descriptor.id);
  }

  private seedSettings_(): void {
    if (this.seeded_) {
      return;
    }
    this.seeded_ = true;
    SettingsManager.getInstance().applyPluginDefaults(this.manifest_.map((d) => [d.id, d.defaultConfig] as [string, PluginDescriptor['defaultConfig']]));
  }

  private async loadAllOnce_(): Promise<void> {
    this.seedSettings_();

    const enabled = this.manifest_
      .filter((d) => {
        const isEnabled = this.isEnabled_(d);
        const loadable = PluginManager.isLoadable_(d);

        this.info_.set(d.id, {
          id: d.id,
          source: d.source ?? 'builtin',
          enabled: isEnabled,
          loaded: false,
          unavailable: !loadable,
          version: d.meta?.version,
          repoUrl: d.meta?.repoUrl,
          compatible: d.meta?.compatible,
        });

        return isEnabled && loadable;
      })
      .map((d, index) => ({ d, index }))
      .sort((a, b) => {
        const orderA = SettingsManager.getInstance().settings.plugins[a.d.id]?.order ?? a.d.defaultConfig.order ?? 0;
        const orderB = SettingsManager.getInstance().settings.plugins[b.d.id]?.order ?? b.d.defaultConfig.order ?? 0;

        return orderA - orderB || a.index - b.index;
      })
      .map(({ d }) => d);

    if (enabled.length === 0) {
      this.finish_([], []);

      return;
    }

    // Phase 1: fetch every module in parallel.
    const resolved = await Promise.all(enabled.map((d) => this.resolveModule_(d)));

    // Phase 2: instantiate and register in order.
    const api = this.buildApi_();
    const loaded: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < enabled.length; i++) {
      const descriptor = enabled[i];
      const module = resolved[i];

      if (!module) {
        failed.push(descriptor.id);
        continue;
      }

      try {
        await this.loadLocales_(descriptor);
        const plugin = PluginManager.instantiate_(descriptor, module);

        await plugin.register(api);
        this.plugins_.set(descriptor.id, plugin);
        this.markLoaded_(descriptor.id);
        loaded.push(descriptor.id);
      } catch (e) {
        this.markFailed_(descriptor.id, e);
        failed.push(descriptor.id);
      }
    }

    this.finish_(loaded, failed);
  }

  private finish_(loaded: string[], failed: string[]): void {
    this.isReady_ = true;

    if (loaded.length > 0) {
      Logger.info(`[plugins] loaded ${loaded.length}: ${loaded.join(', ')}`);
    }
    EventBus.getInstance().emit(Events.PLUGINS_READY, { loaded, failed });
  }

  private async resolveModule_(descriptor: PluginDescriptor): Promise<ResolvedModule | null> {
    if (__IS_PRIVATE__ && descriptor.privateImport) {
      try {
        return { mod: await descriptor.privateImport(), className: descriptor.privateClassName ?? descriptor.className, usedPrivate: true };
      } catch (e) {
        const consequence = descriptor.import ? 'Loading the open-source version instead.' : 'The plugin is unavailable this session.';

        Logger.warn(`[plugins] private module for "${descriptor.id}" failed to load (${(e as Error).message}). ${consequence}`);
        if (!descriptor.import) {
          this.markFailed_(descriptor.id, e);
        }
      }
    }

    if (!descriptor.import) {
      return null;
    }

    try {
      return { mod: await descriptor.import(), className: descriptor.className, usedPrivate: false };
    } catch (e) {
      this.markFailed_(descriptor.id, e);

      return null;
    }
  }

  private async loadLocales_(descriptor: PluginDescriptor): Promise<void> {
    for (const [lang, loader] of Object.entries(descriptor.locales ?? {})) {
      const loadedBundle = await loader();
      const bundle = 'default' in loadedBundle && typeof loadedBundle.default === 'object' ? loadedBundle.default : loadedBundle;

      addLocaleBundle(lang, bundle as Record<string, unknown>);
    }
  }

  private static instantiate_(descriptor: PluginDescriptor, module: ResolvedModule): SignalRangePlugin {
    const className = module.className;

    if (!className) {
      throw new Error(`descriptor "${descriptor.id}" has no className`);
    }

    const PluginCtor = module.mod[className] as PluginClass | undefined;

    if (typeof PluginCtor !== 'function') {
      throw new Error(`module for "${descriptor.id}" has no export named "${className}"`);
    }

    const plugin = new PluginCtor();

    if (plugin.id !== descriptor.id) {
      Logger.warn(`[plugins] class ${className} reports id "${plugin.id}" but the manifest says "${descriptor.id}"; the manifest id is used.`);
    }

    return plugin;
  }

  private markLoaded_(id: string): void {
    const info = this.info_.get(id);

    if (info) {
      info.loaded = true;
      info.error = undefined;
    }
  }

  private markFailed_(id: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const info = this.info_.get(id);

    if (info) {
      info.loaded = false;
      info.error = message;
    }
    Logger.error(`[plugins] "${id}" failed: ${message}`, error);
  }

  private buildApi_(): PluginApi {
    return {
      engineVersion: __APP_VERSION__,
      isPrivate: __IS_PRIVATE__,
      isAuthoring: __AUTHORING__,
      router: Router.getInstance(),
      campaigns: CampaignManager.getInstance(),
      antennas: AntennaRegistry.getInstance(),
      settings: SettingsManager.getInstance(),
      events: EventBus.getInstance(),
      t7e,
    };
  }
}
