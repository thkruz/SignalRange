# External Plugins

This folder holds **third-party SignalRange plugins** installed from a git URL. It
is managed entirely by the plugin CLI. Do not add files here by hand.

```bash
# Install a plugin from a git repo (clones it here, wires it into the build)
pnpm run plugin -- add https://github.com/someone/signal-range-plugin-foo

# List installed plugins and their compatibility
pnpm run plugin -- list

# Update / remove
pnpm run plugin -- update signal-range-plugin-foo
pnpm run plugin -- remove signal-range-plugin-foo

# Restore every plugin recorded in external-plugins.json (run on a fresh checkout)
pnpm run plugin -- restore
```

The individual plugin clones are **gitignored** (each is its own git repo). What
*is* committed is the reproducible record of your plugin set:

- [`external-plugins.json`](../../external-plugins.json) at the repo root: the
  lockfile of installed plugins, their URLs, and pinned commits.
- [`plugin-manifest.external.generated.ts`](../plugins/plugin-manifest.external.generated.ts):
  the generated manifest wiring, spread onto the built-in plugin manifest.

A fresh checkout of a fork that committed those two files can restore its exact
plugin set with `pnpm run plugin -- restore` (also run automatically by
`prebuild` and `predev` through `sync`).

Two things to know before installing:

- Plugin sources are compiled by the host build and type-checked by
  `pnpm run typecheck`, so a plugin with a type error fails the host's
  pre-commit hook until it is fixed or removed.
- A plugin's own `node_modules` are not compiled. Plugins declare no runtime
  dependencies; they use the engine's.

To **build a plugin**, see `pnpm run plugin -- create <name>` and
[docs/plugin-development-guide.md](../../docs/plugin-development-guide.md).
