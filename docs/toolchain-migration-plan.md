# Toolchain migration plan: align signal-range with keeptrack-space

> **STATUS 2026-09-12: all eight phases are done and committed on `dev`.**
> Phase 0 needed no work (tree was clean). The only deliberate deferral is the
> Biome **warning** backlog (Phase 2 step 6), which gates nothing. See the
> "Outcome" section at the end for what was measured and what differed from
> this plan.

Written 2026-09-10. Reference repo: `D:\code\keeptrack\keeptrack-space` (v13.10.0).
keeptrack.space did this same migration in 2026 in this order: pnpm, Biome, CI, tsgo,
rspack/SWC, hooks. Its commit history is the playbook (see "Prior art" at the end).

## Target state (what keeptrack-space runs)

| Concern | signal-range today | Target (keeptrack-space) |
|---|---|---|
| Package manager | npm + `package-lock.json` | pnpm 10.33 (`nodeLinker: hoisted`), `pnpm-lock.yaml` |
| Node | CI: 20 (deploy) / 22 (build); no pin | Node 24 (`.nvmrc`, `engines`, `volta`) |
| Lint | ESLint 9 with **one rule** (`import/no-unresolved`) | Biome 2.5.4, full rule set + custom `require-unicode-regexp.grit` plugin |
| Format | none | Biome formatter (2-space, single quotes, 180 cols, LF) |
| Typecheck | `tsc --noEmit` (incremental) | `tsgo --noEmit` (TS 7 native) with `tsc` fallback script |
| Bundler | webpack 5 + `ts-loader` | rspack 2 + `builtin:swc-loader`, persistent cache |
| Unit tests | vitest 4 + jsdom | same (already aligned; small config deltas) |
| E2E | Playwright | same |
| Git hooks | husky installed, **no hooks** | pre-commit (lint+typecheck), commit-msg (conventional), pre-push (lint+typecheck+test) |
| Line endings | no `.gitattributes` | `.gitattributes` forcing LF |
| Editor | ESLint code actions | Biome formatter + code actions |

### Baseline measurements (this machine, 2026-09-10)

| Step | Current | Notes |
|---|---|---|
| `npm run lint` (ESLint) | 1.3 s | Only one rule is enabled, so this is not a real gate. |
| `tsc --noEmit` (cold) | 3.1 s | Small project; tsgo gain will be modest. |
| `npm run build` (webpack prod) | 14.7 s | SWC should cut this to a few seconds; dev rebuilds are the bigger win. |
| Biome `check` dry run, keeptrack config | 0.7 s | 476 files (src + test, engine and private excluded). |

The speed gain on signal-range is real but modest at this size. The larger effect of the
migration is that signal-range gets an actual lint gate, a formatter, and hooks for the first
time, with the same rules as keeptrack so the two codebases stop drifting.

## Biome dry run against signal-range (keeptrack's `biome.json` verbatim)

Lint: 105 errors, 1156 warnings. Format: 400 of 476 files need reformatting.
Import order: 179 files.

| Rule | Count | Level | Auto-fix |
|---|---|---|---|
| assist/source/organizeImports | 179 | error | yes |
| style/useConsistentArrowReturn | 43 | error | yes |
| style/useExponentiationOperator | 39 | error | yes |
| style/useShorthandAssign | 8 | error | yes |
| style/noCommonJs | 6 | error | manual |
| style/useConst | 4 | error | yes |
| style/useCollapsedElseIf | 2 | error | yes |
| style/useGroupedAccessorPairs | 2 | error | manual |
| complexity/noArguments | 1 | error | manual |
| style/useBlockStatements | 611 | warn | yes (unsafe) |
| complexity/useLiteralKeys | 178 | warn | yes (unsafe) |
| suspicious/noExplicitAny | 85 | warn | manual |
| plugin require-unicode-regexp | 53 | warn | manual (add `u`) |
| suspicious/noEmptyBlockStatements | 51 | warn | manual |
| suspicious/useIterableCallbackReturn | 48 | warn | manual |
| correctness/noUnusedInstantiation | 33 | warn | manual |
| style/useTemplate | 25 | warn | yes (unsafe) |
| style/useDefaultSwitchClause | 17 | warn | manual |
| suspicious/useAwait | 17 | warn | manual |
| suspicious/noAlert | 14 | warn | manual |
| style/noNestedTernary | 10 | warn | manual |
| remaining 8 rules | 12 | warn | mixed |

Only errors fail `biome check` (and therefore hooks and CI). After `biome check --write`, the
manual error backlog is 9 diagnostics. Warnings are cleared area by area afterwards, exactly as
keeptrack did in its `clear the biome warnings in ...` commit series.

## Sequencing constraint: commit in-flight work first

The format commit touches 400 of 476 files. `PROJECT_STATE.md` lists several finished but
UNCOMMITTED phases and `git status` shows modified files under `src/`. Land all of that on `dev`
before Phase 2 step 2, or every open branch has to be rebased through a whole-repo reformat.

Every phase below is its own commit series (or PR) on `dev`. Do not combine phases.

---

## Phase 1: npm to pnpm (about 1 hour)

Mirrors keeptrack commits `776ab9c2`, `518d7fae`, `49b220fd`, `7ba4c431`.

1. Add `pnpm-workspace.yaml` copied from keeptrack (`nodeLinker: hoisted`,
   `strictPeerDependencies: false`, `autoInstallPeers: true`). Hoisted layout keeps webpack and
   later rspack loaders resolving without changes.
2. `package.json`: add `"packageManager": "pnpm@10.33.0"`, `engines` (node >=24, pnpm >=10),
   `volta.node = 24.x`. Move npm `overrides` to `pnpm.overrides`. Add
   `pnpm.ignoredBuiltDependencies: ["esbuild", "core-js"]`. Decide on `supabase`: its postinstall
   downloads the CLI binary. CI already installs with `--ignore-scripts`; locally list it under
   `pnpm.onlyBuiltDependencies` if the CLI is wanted, otherwise under `ignoredBuiltDependencies`.
3. `pnpm import` to build `pnpm-lock.yaml` from `package-lock.json`, then delete
   `package-lock.json`. `pnpm install --frozen-lockfile` must pass.
4. Scripts: `npm run` becomes `pnpm run`; `npx eslint` / `npx tsx` become `pnpm exec ...`
   (keeptrack `ad23f8f5`). Playwright `webServer.command` becomes `pnpm run dev`.
5. Add `.nvmrc` with `24`.
6. CI: rewrite `.github/actions/setup-node-project/action.yml` to keeptrack's `node-setup`
   shape (pnpm/action-setup@v4, setup-node with `cache: pnpm`, node 24,
   `pnpm install --frozen-lockfile`). `deploy-pipeline.yml` has two inline copies of the old
   setup (node 20, `npm ci --ignore-scripts`) in `build-production` and `build-uat`; switch both
   to the composite action. `npm audit` becomes `pnpm audit --audit-level=critical`.
   `npx playwright install` becomes `pnpm exec playwright install`.
7. Docs: README, CLAUDE.md, CODE_PATTERNS.md, deploy.md, DEPLOYMENT_CONFIGURATION.md,
   e2e-attestation workflow text (`npm run test:e2e`).

Verify: clean clone, `pnpm install --frozen-lockfile`, `pnpm run build`, `pnpm test`,
`pnpm run test:e2e` smoke, Build Pipeline green.

## Phase 2: ESLint to Biome (half a day for errors; warnings cleared over time)

Mirrors keeptrack `fc1d40d2`, `0f799c53`, `13228213`, `e0f40a29`, `36bab5f2`, `82c6fbbc`,
`ed285220`, then the per-area warning commits.

1. **Config commit** `chore(biome): replace ESLint with Biome`
   - Copy `biome.json` from keeptrack verbatim, then edit only `files.includes`:
     `src/**/*.{js,ts,tsx}`, `test/**/*.{js,ts,tsx}`, `e2e/**/*.ts`, `build/**/*.ts`,
     `!src/engine/**` (vendored engine, already ESLint-ignored), `!src/private/**`
     (submodule; see gotchas), `!**/*.min.*`. Drop keeptrack's `globals` entries
     `settingsManager` and `M`; keep `noUndeclaredVariables: off` so the build-time defines
     declared in `src/declaration.d.ts` need no globals list.
   - Copy `biome-plugins/require-unicode-regexp.grit` unchanged.
   - Dev deps: add `@biomejs/biome` pinned exactly to `2.5.4` (same as keeptrack, no caret).
     Remove `eslint`, `eslint-plugin-import`. Delete `.eslintrc` and `eslint.config.mjs`.
   - Scripts: `lint: biome check ./src ./test ./e2e ./build`, `lint:fix: biome check --write ...`,
     `format: biome format --write ...`.
   - `.vscode/settings.json`: replace the ESLint `codeActionsOnSave` and `eslint.execArgv`
     entries with keeptrack's Biome block (`[typescript]` default formatter `biomejs.biome`,
     `source.fixAll.biome`, `source.organizeImports.biome`, `files.eol: \n`). Add
     `.vscode/extensions.json` recommending `biomejs.biome`.
2. **Mechanical commit** `style(biome): format and auto-fix src with Biome`
   - `pnpm exec biome check --write ./src ./test ./e2e ./build`. Then `pnpm test` and
     `pnpm run typecheck`. No hand edits in this commit.
   - Decide separately whether to run `--write --unsafe` for `useBlockStatements` (611),
     `useLiteralKeys` (178) and `useTemplate` (25). Keeptrack did apply autofixes broadly
     (`e0f40a29`); review the diff for `useLiteralKeys` because bracket access on private
     members is sometimes intentional in tests (keeptrack later turned that rule off in tests,
     `36bab5f2`, and the copied config already carries that override).
3. **Manual error cleanup** (9 diagnostics): `noCommonJs` (6, `require(` in `src`),
   `useGroupedAccessorPairs` (2), `noArguments` (1). Lint must exit 0 here.
4. **Remove the 29 `eslint-disable` comments.** They are dead text under Biome. Where a
   suppression is still needed use `// biome-ignore lint/<group>/<rule>: <reason>`.
5. **CI**: lint job runs `pnpm run lint`; update the step summary text.
6. **Warnings, by area, later** (each its own `refactor(<area>): :recycle: clear the biome
   warnings ...` commit as keeptrack did): regex `u` flag (53), `noExplicitAny` (85),
   `noEmptyBlockStatements` (51), `useIterableCallbackReturn` (48), and the rest. Not a blocker
   for anything else in this plan.

Gotchas:
- `src/private` is a git submodule with its own repo. Biome walks into it unless force-ignored,
  and a nested `biome.json` there breaks the parent lint run (keeptrack `82c6fbbc`). Exclude it
  here and give `signal-range-private` its own `biome.json` linted by its own CI
  (keeptrack `7869f6d2`).
- `scripts/*.js` are CommonJS one-offs (four are jest-era migration scripts that can be
  deleted). Keep `scripts/**` out of `files.includes` for now, same as keeptrack lints only
  `src/**`.
- Biome does not type-check. `noUnusedVariables` is a warning; the real unused-code gate stays
  `noUnusedLocals`/`noUnusedParameters` in tsconfig.

## Phase 3: tsc to tsgo for typecheck (about 1 hour)

Mirrors keeptrack `8e175de1`.

1. Add `@typescript/native-preview` pinned to keeptrack's exact version
   (`7.0.0-dev.20260707.2`). Keep `typescript` 5.9 for the IDE and as fallback.
2. tsconfig changes TS 7 requires (see keeptrack `tsconfig.base.json`):
   - `moduleResolution: "node"` becomes `"bundler"` (node10 was removed).
   - Remove `baseUrl`; make `paths` relative to the config (`"./src/*"`).
   - Add `isolatedModules: true` (also required for SWC in Phase 4; it surfaces ambiguous
     type re-exports before they break the bundle).
   - Raise `target`/`lib` to `es2022` to match keeptrack and the SWC target.
   - The emit options (`declaration`, `sourceMap`, `outDir`, `rootDir`, `removeComments`) are
     only used by `ts-loader` today and become dead in Phase 4. Keep them until Phase 4, then
     drop them.
3. Scripts: rename `type-check` to `typecheck` (keeptrack name, referenced by hooks and CI),
   `typecheck: tsgo --noEmit -p tsconfig.json`, `typecheck:tsc: tsc --noEmit -p tsconfig.json`.
   Update the CI type-check job and any docs that say `npm run type-check`.
4. Verify `tsgo` honours `tsconfig.performance.json` (`incremental`, `.tsbuildinfo`); if not,
   drop the incremental settings, since tsgo is fast enough cold.
5. Optional: `typecheck:test: tsgo --noEmit -p tsconfig.test.json` so the 153 test files get
   type-checked in CI. Nothing checks them today.

## Phase 4: webpack + ts-loader to rspack + SWC (half a day including verification)

Mirrors keeptrack `4d85b5e4`, `ea6c4002`, `6b9b7444`, `99554f92`. Source of truth for every
option below: `keeptrack-space/build/webpack-manager.ts` (loader rules around lines 260-315,
cache at 326-350).

signal-range has one edition plus the private flag, so a single `rspack.config.ts` replaces
`webpack.config.js`. Do not port keeptrack's multi-profile `build-manager.ts`.

Mapping from the current `webpack.config.js`:

| webpack today | rspack |
|---|---|
| `html-webpack-plugin` (two instances) | `rspack.HtmlRspackPlugin` (`template`, `chunks`, `filename` all supported) |
| `copy-webpack-plugin` | `rspack.CopyRspackPlugin` (same `patterns`/`globOptions.ignore`) |
| `webpack.DefinePlugin` | `rspack.DefinePlugin`, same entries |
| `case-sensitive-paths-webpack-plugin` | no equivalent; drop it. Linux CI builds catch casing errors. |
| `ts-loader` | `builtin:swc-loader` (`jsc.parser.syntax: typescript`, `jsc.target: es2022`) |
| `style-loader` + `css-loader` (with the `url.filter` for `/fonts/`) | keep both, bump to css-loader 7 / style-loader 4 (keeptrack versions); the filter still applies |
| `asset/resource` rules | unchanged |
| `devtool: source-map` | unchanged for dev; keeptrack uses `hidden-source-map` + `SwcJsMinimizerRspackPlugin` + `LightningCssMinimizerRspackPlugin` in prod, adopt those |
| `devServer` (`static`, `port 3000`, `hot`, `historyApiFallback` rewrites, `setupMiddlewares`) | same keys under `@rspack/dev-server`; `devServer.app` is still the Express app the private `dev-middleware.cjs` registers on |
| `dotenv` loading, `IS_PRIVATE` / `IS_AUTHORING` detection | unchanged, config is still Node code |
| no cache | persistent cache in `node_modules/.cache/rspack`, disabled when `process.env.CI` (keeptrack 99554f92) |

Steps:
1. Dev deps: add `@rspack/core` and `@rspack/cli` (`^2.0.5`). Remove `webpack`, `webpack-cli`,
   `webpack-dev-server`, `ts-loader`, `html-webpack-plugin`, `copy-webpack-plugin`,
   `case-sensitive-paths-webpack-plugin`, `file-loader` (already unused).
2. Write `rspack.config.ts` (ESM imports; `@rspack/cli` loads TS configs directly). Leave
   `package.json` without `"type": "module"` so the CJS scripts keep working.
3. Scripts: `build: cross-env NODE_ENV=production rspack build --mode production`,
   `dev: cross-env NODE_ENV=development rspack serve --mode development`.
4. Drop the tsconfig emit options noted in Phase 3.
5. Verify, in this order:
   - `pnpm run build`: `dist/index.html`, `dist/auth/callback.html`, hashed `main.*.js` and
     `popup-callback.*.js`, `dist/fonts/`, `dist/images/`, `dist/assets/characters/`,
     `dist/logo.png` all present. Diff the file list against a webpack build from before.
   - Build-time defines: `__APP_VERSION__`, `__GIT_COMMIT_SHA__`, `__IS_PRIVATE__`,
     `__AUTHORING__`, `process.env.PUBLIC_*` resolve in the bundle (grep the output).
   - `pnpm run dev`: port 3000, `/auth/callback` served from the HTML file, HMR works.
   - Private edition (Ted only): authoring middleware still registers under `NODE_ENV=development`.
   - Full Playwright suite (it boots the dev server), then a wrangler `deploy --dry-run`.
6. Record before/after build times in this document.

### Measured results (this machine, 2026-09-12)

| Step | webpack + ts-loader | rspack + SWC | Change |
|---|---|---|---|
| Production build, cold | 12.9 s | 0.96 s | 13x faster |
| Production build, warm (persistent cache) | n/a (no cache) | 0.20 s | 65x vs webpack cold |
| Dev server first compile | ~11 s | 0.43 s | 25x faster |
| `typecheck` (tsc -> tsgo) | 4.4 s | 0.6 s | 7x faster |

`dist/` was compared against a webpack build taken before Phase 1. After excluding
the `.d.ts`/`.d.ts.map` files ts-loader used to emit (753 files of pure build noise
that never belonged in `dist/`), the two outputs match file for file, with two
benign differences: the async chunk is renumbered (644 -> 783), and webpack's
`main.js.LICENSE.txt` sidecar is gone because SWC keeps the `/*! */` license
banners inline in the bundle instead of extracting them. No attribution is lost.

Gotchas:
- SWC strips types without checking them. Type safety is now only `pnpm run typecheck`, which
  Phase 5's hooks and the existing CI job enforce. Do Phase 3 before Phase 4.
- `isolatedModules` (Phase 3) is mandatory; SWC cannot see across files, so
  `export { SomeType }` without `type` fails at bundle time.
- The private submodule's TypeScript goes through SWC too; if it uses `const enum` or
  namespace merging across files it needs fixing there.

## Phase 5: git hooks (about 1 hour)

`.husky/` exists with only the `_` runtime; no hooks and no `prepare` script, so nothing runs
today. Copy from keeptrack:

- `pre-commit`: `pnpm run lint` + `pnpm run typecheck`, silent unless failing. Copy verbatim
  (rename the KeepTrack wording in the footer).
- `commit-msg`: conventional-commit subject check. signal-range already uses
  `type(scope): :emoji: message` (see git log and the Copilot instructions in
  `.vscode/settings.json`), so this only formalises current practice.
- `pre-push`: lint + typecheck + `pnpm run test`. The suite is about 4,700 tests; time it. If it
  is more than a couple of minutes locally, keep the hook but consider `vitest run --changed`.
- Skip keeptrack's `post-checkout`/`post-commit`/`post-merge` hooks; they are git-lfs only.
- `package.json`: `"prepare": "husky install"`, `husky` dev dep at keeptrack's `^8` (or 9 with
  `"prepare": "husky"`; pick one and match keeptrack when it upgrades).
- Add `.gitattributes` from keeptrack (`* text=auto`, LF for text, binary lists). One
  renormalisation commit: `git add --renormalize .`. This pairs with Biome's
  `lineEnding: lf` so Windows checkouts stop producing CRLF diffs.

## Phase 6: vitest config alignment (about 1 hour)

Already on vitest 4 + `@vitest/coverage-v8` 4, so this is small:

- `test.deps.inline` is the pre-vitest-1 key; move to `server.deps.inline` and confirm vitest 4
  still needs it for `uuid` and `ootk`.
- Add keeptrack's `maxWorkers: Math.min(12, availableParallelism() - 1)` cap. It exists because
  Windows forks OOM on a 32-core box during pre-push runs (keeptrack `0a878970`).
- Coverage: `include: ['src/**/*.ts']`, exclude tests, `reportOnFailure: true`, and
  `thresholds` set at current actuals (run `pnpm run test:coverage` once to baseline), then
  ratchet upward like keeptrack does.
- Keep tests in `test/` (not colocated); no reason to move them.

## Phase 7: CI workflow parity (about 1 hour, mostly done in Phases 1-3)

- `build-pipeline.yml`: lint job runs Biome, type-check job runs `pnpm run typecheck`, test job
  unchanged apart from pnpm, security-audit uses `pnpm audit`. Bump `actions/checkout` and
  `actions/setup-node` to the majors keeptrack uses (v6).
- `deploy-pipeline.yml`: both build jobs on the composite action (Node 24, pnpm).
- Keep yamllint, TruffleHog, CodeQL, dependency-review, E2E attestation as they are.
- Wrangler deploy is untouched; only `dist/` matters to it.

## Phase 8: docs and cleanup (about 1 hour)

- CLAUDE.md: copy keeptrack's "every regex MUST have the `u` flag" section and its build-time
  constants note (rspack `DefinePlugin`, then `vitest.config` `define`, then `declaration.d.ts`),
  replace `npm` and `eslint` mentions.
- README / CODE_PATTERNS.md / deploy.md: pnpm commands.
- Delete `.tsbuildinfo` from the tree if tsgo does not use it, and the four jest-era
  `scripts/fix-*.js` / `migrate-jest-to-vitest.js` one-offs.
- `.deepsource.toml` still lists a React plugin; harmless, leave or delete.

## Out of scope (deliberate)

- semantic-release, auto-changelog, `version` script, CITATION updates: signal-range has no
  release or npm-publish process. Separate decision.
- typedoc, tsup `build:lib`, SonarQube, coverage merge scripts, multi-profile builds.
- `signal-range-home` (Astro, ESLint 8 + Prettier) and `signal-range-docs` (Astro): Biome only
  partially formats `.astro` files, so those repos need their own evaluation.
- `signal-range-private`: gets its own `biome.json` in its own repo after Phase 2.

## Recommended order and effort

| # | Phase | Effort | Depends on |
|---|---|---|---|
| 0 | Commit all in-flight work on `dev` | - | - |
| 1 | pnpm | 1 h | 0 |
| 2 | Biome (config, autofix, errors) | 3-4 h | 0, 1 |
| 7 | CI parity for 1-2 | 30 min | 1, 2 |
| 3 | tsgo + tsconfig modernisation | 1 h | 1 |
| 4 | rspack + SWC | 4 h | 3 |
| 5 | hooks + `.gitattributes` | 1 h | 2, 3 |
| 6 | vitest deltas | 1 h | 1 |
| 8 | docs and cleanup | 1 h | all |
| - | Biome warning backlog by area | ongoing | 2 |

About two working days for everything except the warning backlog.

## Prior art: keeptrack-space commits to crib from

```
776ab9c2 chore(pnpm): migrate package manager from npm to pnpm
518d7fae chore(ci): run CI and release on pnpm
49b220fd chore(pnpm): move pnpm settings to pnpm-workspace.yaml
fc1d40d2 chore(biome): replace ESLint 8 + Prettier with Biome
0f799c53 chore(ci): run lint via Biome in CI
13228213 style(biome): format and auto-fix src with Biome
e0f40a29 style(lint): apply Biome autofixes
36bab5f2 chore(biome): disable useLiteralKeys in test files
82c6fbbc fix(biome): force-ignore plugins-pro so nested config stops breaking lint
7869f6d2 chore(ci): lint plugins-pro with its own Biome config in CI
ed285220 chore(biome): exclude vendored sources and restore the 8-param limit
8e175de1 chore(typescript): run typecheck + declaration emit on TypeScript 7 native (tsgo)
4d85b5e4 perf(build): transpile with rspack SWC instead of ts-loader
ea6c4002 perf(build): drop babel-loader; let rspack SWC transpile node_modules JS
6b9b7444 chore(build): remove unused Babel toolchain
99554f92 perf(build): scope source-map-loader to src + add persistent rspack cache
0a878970 chore(vitest): cap fork concurrency to prevent memory issues
ad23f8f5 refactor(dev-server): replace npx with pnpm exec for commands
```

---

## Outcome (2026-09-12)

| Phase | Commit | Result |
|---|---|---|
| 1 pnpm | `8615799` | pnpm 10.33 hoisted, node 24 via volta, CI on pnpm |
| 2 Biome | `6f71d91`, `45bc98e`, `b36db21`, `951b927` | lint gate exits 0 for the first time |
| 3 tsgo | `b245595` | typecheck 4.4s -> 0.6s |
| 4 rspack + SWC | `a01cced` | build 12.9s -> 0.96s (0.20s warm) |
| 5 hooks | `27d364d` | pre-commit / commit-msg / pre-push all live |
| 6 vitest | `ec4ada6` | worker cap, real coverage gate |
| 7 CI parity | `f15dc43` | checkout/setup-node v6 |
| 8 docs + cleanup | `ce81d2a` | CLAUDE.md rules, jest-era files deleted |

### Where reality differed from the plan

- **`@rspack/dev-server` has no Express `app`.** The plan assumed `devServer.app`
  stayed an Express instance for the private authoring middleware; it is not, and
  registering on it crashed the dev server outright. The config now creates its
  own Express app and mounts it through `setupMiddlewares`. `express` is an
  explicit devDependency again (webpack-dev-server used to supply it).
- **tsgo does not auto-include `@types`.** `types: ["node"]` had to be declared
  explicitly or `process` and the `NodeJS` namespace go unresolved. `tsc` never
  needed this, so it only shows up once tsgo runs.
- **`isolatedModules` found five real type re-exports**, in the agc-module and
  notch-filter-module barrels. These would have broken the Phase 4 SWC bundle,
  which is exactly why Phase 3 comes first.
- **Two `CopyRspackPlugin` patterns were already dead.** `public/assets/logo.png`
  does not exist and `public/assets/characters` holds only `.png` files that the
  pattern's own ignore list excludes. copy-webpack-plugin stayed silent;
  CopyRspackPlugin errors. Both kept with `noErrorOnMissing`.
- **No renormalisation commit was needed.** Biome's Phase 2 format pass had
  already written every file as LF, so `git add --renormalize .` was a no-op.
- **`deps.inline` is obsolete.** vitest 4 runs the full suite green without the
  `uuid`/`ootk` inlining, so it was deleted rather than moved to
  `server.deps.inline`.
- **husky is v9, not keeptrack's v8.** The `.husky/_` runtime already in the repo
  was the v9 layout, so hooks omit the `_/husky.sh` sourcing line that v10 will
  reject.
- **`typecheck:test` exists but is not a CI gate.** The 153 test files have never
  been type-checked and currently produce 660 errors. Turning that into a gate is
  its own piece of work.

### Still open

- Biome warning backlog: 1346 warnings, none of which gate anything. Largest
  groups are `useBlockStatements` (622), `useLiteralKeys` (178), the regex `u`
  flag plugin (110) and `noExplicitAny` (98). Clear by area, as keeptrack did.
- 660 type errors in `test/**`, gated behind `pnpm run typecheck:test`.
- CI has not run yet; the `actions/*@v6` bump and the pnpm/Biome/tsgo jobs need a
  green Build Pipeline to confirm.
