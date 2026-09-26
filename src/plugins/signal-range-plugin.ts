import type { CampaignManager } from '@app/campaigns/campaign-manager';
import type { AntennaRegistry } from '@app/equipment/antenna/antenna-registry';
import type { EventBus } from '@app/events/event-bus';
import type { t7e } from '@app/locales/i18n';
import type { Router } from '@app/router';
import type { SettingsManager } from '@app/settings/settings-manager';

/**
 * What a plugin may touch. Every member is an existing engine registry or
 * service; the api object is a stable front door, not a new abstraction.
 *
 * Additive by policy: new capabilities are new optional members, existing ones
 * never change shape within a major version.
 */
export interface PluginApi {
  /** Host version, e.g. "1.1.0" (the value plugins declare compatibility against). */
  readonly engineVersion: string;
  /** True when the private submodule is compiled in. */
  readonly isPrivate: boolean;
  /** True only for development builds of the private edition. */
  readonly isAuthoring: boolean;

  /** Register routes outside the core page set (see Router.addRoute). */
  readonly router: Router;
  /** Register campaigns and scenarios. */
  readonly campaigns: CampaignManager;
  /** Register antenna hardware configs and optional core factories. */
  readonly antennas: AntennaRegistry;
  /** Read user configuration (plugins may not write other plugins' settings). */
  readonly settings: SettingsManager;
  /** The application event bus. */
  readonly events: EventBus;
  /** Translate a key; plugin strings live under `plugins.<id>.*`. */
  readonly t7e: typeof t7e;
}

/**
 * Base class every plugin extends.
 *
 * Two hard rules, both checked by the CLI's `doctor` command:
 * 1. The entry module must have a named export matching `className` in
 *    signal-range-plugin.json.
 * 2. `id` must equal the manifest's plugin `id` (it keys settings and locales).
 */
export abstract class SignalRangePlugin {
  /** Must equal the manifest id. */
  abstract readonly id: string;

  /** Called once at boot, after locales are merged and before any route resolves. */
  abstract register(api: PluginApi): void | Promise<void>;

  /** Optional teardown (tests, hot reload). */
  dispose(): void {
    // Nothing by default.
  }
}
