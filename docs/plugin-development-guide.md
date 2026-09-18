# Plugin development guide

SignalRange plugins are small git repositories that the engine compiles into its
own bundle. A plugin registers things through a fixed API at boot: today that is
antenna hardware configs (with an optional custom core class), routes, and
campaigns. Everything a plugin adds shows up wherever the engine already looks,
so a plugin antenna appears in every sandbox's loadout picker with no UI work.

The toolchain is a port of keeptrack-space's `scripts/plugin/` CLI. If you have
used that, the commands and files are the same with `keeptrack` replaced by
`signal-range`.

## Quick start

```bash
# In a SignalRange checkout
pnpm install

# Scaffold a plugin (creates src/plugins-external/signal-range-plugin-my-dish)
pnpm run plugin -- create my-dish

# Boot the app with only this plugin enabled, in a sandbox, with its antenna selected
pnpm run plugin -- dev signal-range-plugin-my-dish

# Validate and test it
pnpm run plugin -- doctor signal-range-plugin-my-dish
pnpm run plugin -- test signal-range-plugin-my-dish

# Publish: the folder is its own git repo
cd src/plugins-external/signal-range-plugin-my-dish
git remote add origin git@github.com:you/signal-range-plugin-my-dish.git
git push -u origin main
```

Users install a published plugin with:

```bash
pnpm run plugin -- add https://github.com/you/signal-range-plugin-my-dish
pnpm run build        # or restart pnpm run dev
```

The public template repo, `thkruz/signal-range-plugin-example`, is the rendered
output of `create` and can be used with GitHub's "Use this template" button when
you do not have an engine checkout to hand.

## What gets committed where

| File | Lives in | Committed | Purpose |
|---|---|---|---|
| `src/plugins-external/<name>/` | engine | no (gitignored) | The plugin clone; its own git repo |
| `external-plugins.json` | engine root | yes | Lockfile: url, ref, pinned commit per plugin |
| `src/plugins/plugin-manifest.external.generated.ts` | engine | yes | Generated descriptors; empty upstream |
| `signal-range-plugin.json` | plugin | yes | The plugin's manifest |

`pnpm run plugin -- sync` reconciles the three: it restores missing clones from
the lockfile and regenerates the manifest from what is on disk. `prebuild` and
`predev` run it, so a fresh checkout that committed the lockfile rebuilds the
same plugin set. `sync --check` fails when the committed file has drifted.

## The manifest

```json
{
  "formatVersion": 1,
  "name": "signal-range-plugin-my-dish",
  "version": "0.1.0",
  "description": "A 4.5 m Ka-band dish.",
  "author": "You",
  "repository": "https://github.com/you/signal-range-plugin-my-dish",
  "engine": ">=1.1.0 <2.0.0",
  "plugins": [
    {
      "id": "MyDishPlugin",
      "className": "MyDishPlugin",
      "entry": "src/plugin.ts",
      "defaultConfig": { "enabled": true, "order": 500 },
      "dependencies": []
    }
  ],
  "localesDir": "locales",
  "provides": { "antennas": ["MY_DISH_ANTENNA"] }
}
```

- `name` must equal the install directory name and be kebab-case.
- `engine` is a semver range checked against the engine's `package.json`
  version. A same-major mismatch warns; a different major refuses to install
  unless `--force`.
- Each `plugins[]` entry becomes one descriptor. `id` is the plugin's key in
  settings and locales and MUST equal the class's `readonly id`. `className`
  MUST be a named export of `entry`.
- `provides.antennas` is informational: `doctor` checks the ids appear in the
  source, and `dev` selects the first one in the sandbox it opens.

## The plugin class

```ts
import { type PluginApi, SignalRangePlugin } from '@app/plugins/signal-range-plugin';

export class MyDishPlugin extends SignalRangePlugin {
  readonly id = 'MyDishPlugin';

  register(api: PluginApi): void {
    api.antennas.register('MY_DISH_ANTENNA', config, { source: `plugin:${this.id}` });
  }

  dispose(): void {
    // optional
  }
}
```

`register()` runs once at boot, after the plugin's locale bundle is merged and
before the router resolves the first route, so anything registered here exists
before any scenario builds equipment. It may be async. A plugin that throws is
logged and skipped; boot never fails because of a plugin.

### PluginApi

| Member | What it is |
|---|---|
| `engineVersion` | The host version string |
| `isPrivate`, `isAuthoring` | Build flags |
| `antennas` | `AntennaRegistry`: `register(id, config, { source, core? })`, `unregister`, `get`, `find`, `has`, `list` |
| `router` | `Router`: `addRoute({ pattern, show, hide })` |
| `campaigns` | `CampaignManager`: `registerCampaign(data)` |
| `settings` | `SettingsManager` (read your own config with `settings.settings.plugins[id]`) |
| `events` | The application `EventBus` |
| `t7e` | Translate; your strings live under `plugins.<id>.*` |

The api is additive: members are only ever added within a major version.

### Antennas

`register(id, config)` takes an `AntennaConfig` (see
`src/equipment/antenna/antenna-configs.ts` for every field). Ids are upper
snake case and must not collide with a built-in or another plugin; a plugin may
re-register its own id (hot reload) but never someone else's.

Pass `core` to supply a factory that builds a custom `AntennaCore` subclass. The
factory is used for the headless variant Mission Control instantiates; the
DOM-bearing UI classes stay the engine's. This is the hook for behaviour that a
config cannot express (electronic beam steering, multi-beam terminals).

### Locales

Put strings in `locales/en.json`, rooted at `plugins.<id>`:

```json
{ "plugins": { "MyDishPlugin": { "antennaName": "My Dish 4.5m Ka-Band" } } }
```

The generated manifest wires the file in; the PluginManager merges it before
`register()` runs, so `api.t7e('plugins.MyDishPlugin.antennaName')` works
inside `register()`. Only English is bundled today; the machinery is ready for
more.

## Trying it in a sandbox

Every campaign sandbox has a LOADOUT control in the command bar. It lists every
registered antenna, built-in and plugin, per station. Applying a choice restarts
the sandbox from a clean store; the choice is remembered per scenario in
localStorage. For a one-shot launch (e2e specs, the dev harness) append
`?antenna=<ID>` to the sandbox URL; `?antenna.1=<ID>` targets the second
station.

## The dev harness and the settings override

`pnpm run plugin -- dev <name>` boots the app with a settings override that
enables only your plugin (`isStrictPluginList`), opens a sandbox, and selects
your first antenna. The override travels as `?settingsOverride=<base64url JSON>`
and is also honoured from `window.settingsOverride` (set by an init script).
Overrides are session-only; user toggles in the dev menu persist in
localStorage.

`dev --url` prints the URL without starting anything, which is handy for a
browser you already have open.

## Testing

Plugin unit tests live in `__tests__/` and run under the engine's vitest with
the same jsdom environment and aliases (`pnpm run plugin -- test <name>`). They
are excluded from the engine's own suite. The scaffolded test shows the pattern:
register with a minimal `PluginApi`, then assert against the registry and a
headless antenna built from your config.

The scaffolded CI workflow checks out the engine at the version your manifest
targets, installs your plugin with `add`, and runs typecheck and tests.

## Things to know

- **The engine type-checks plugin sources.** `tsconfig.json` includes
  `src/plugins-external/**`, so a type error in an installed plugin fails
  `pnpm run typecheck` and the pre-commit hook until it is fixed or the plugin is
  removed. That is deliberate: a plugin that does not compile cannot ship.
- **No runtime dependencies.** The build does not compile a plugin's
  `node_modules`. Use the engine's dependencies.
- **Class names survive minification.** Production builds keep class names, so
  resolving `className` by string is safe.
- **Lint stops at the plugin boundary.** Biome excludes `src/plugins-external/`,
  so third-party code is not held to the engine's rules.
- **HMR is tolerated.** The registry lets a plugin replace its own ids, so an
  edit under `pnpm run dev` does not throw on re-registration.

## Not yet available to plugins

Mission Control tabs, objective condition types, fault types, and an in-app
plugin manager UI. Each is an additive `PluginApi` member for a later phase.
