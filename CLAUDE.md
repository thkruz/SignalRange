# Project instructions for Claude Code

## Code Conventions

- Private properties and methods end with `_` suffix (e.g., `domCache_`, `syncDomWithState_()`)
- Use `readonly` on properties set in constructor that should never change (e.g., `containerEl`, `boundHandlers`)
- Use `protected` (not `private`) for properties that subclasses or UI layers need to access
- Branded types (`Hertz`, `dB`, `Degrees`) require explicit casting - check type definitions early
- State handlers typed as `(state: Partial<T>) => void`, never `Function | null`
- Don't use bracket notation (`obj['method']()`) to access methods - make them public instead
- Always use LF line endings, never CRLF (enforced by `.gitattributes` and Biome's `lineEnding: lf`)
- **Every regex MUST have the `u` flag** (enforced by the custom Biome plugin `biome-plugins/require-unicode-regexp.grit`; the `v` flag is also accepted). This applies everywhere: source code, tests, and e2e specs. It currently reports as a Biome **warning**, so it does not fail the build; the mandate still stands and it is slated to be ratcheted to an error once the existing violations are cleared.

  ```typescript
  // BAD
  /[a-z]+/.test(str)
  name.replace(/\s+/g, '-')

  // GOOD
  /[a-z]+/u.test(str)
  name.replace(/\s+/gu, '-')
  ```

## CSS/Tabler

- CSS custom properties use `--mc-*` namespace for Mission Control semantics
- Import order: `@tabler/core` → `tabler-overrides.css` → `index.css`
- Use Tabler utility classes (`d-flex`, `justify-content-between`, `mb-2`, `fw-bold`, `font-monospace`)
- Cards: `card h-100` for equal heights, with `card-header` and `card-body`
- Forms: `form-range` for sliders, `form-check form-switch` for toggles

## Architecture Patterns

- Equipment modules use Core/UI separation: `*-core.ts` (business logic) and `*-ui-standard.ts` (DOM/UI)
- Adapters: DOM caching (`domCache_` Map), extract handlers to private methods (not inline), `dispose()` cleanup
- UI components created BEFORE `super()` call; components needing `uniqueId` created AFTER
- RotaryKnob uses callback-in-constructor; PowerSwitch/ToggleSwitch use `addEventListeners()` method
- Factories return base Core type for polymorphism

## EventBus Events

- `Events.UPDATE` - Fires on each simulation tick; use for periodic state sync in adapters
- `Events.DRAW` - Fires for canvas rendering only; do NOT use for DOM updates
- When using `.bind(this)` for event handlers, store the bound reference to properly remove it later:

```typescript
private readonly boundUpdateHandler_: () => void;

constructor() {
  this.boundUpdateHandler_ = this.syncDomWithState_.bind(this);
  EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
}

dispose(): void {
  EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
}
```

## Adapter Throttling Pattern

For adapters listening to `Events.UPDATE`, throttle DOM updates to avoid performance issues:

```typescript
private static readonly UPDATE_INTERVAL_MS = 1000;
private lastSyncTime_: number = 0;

private throttledSync_(): void {
  const now = Date.now();
  if (now - this.lastSyncTime_ < ClassName.UPDATE_INTERVAL_MS) return;
  this.lastSyncTime_ = now;
  this.syncDomWithState_();
}
```

Direct user actions (button clicks, toggles) should bypass throttling for immediate feedback.

## Protecting Input Fields During DOM Sync

When `syncDomWithState_()` updates input fields, it can overwrite what the user is typing. Always check `document.activeElement` before updating inputs, selects, or textareas:

```typescript
// Skip updating if user is focused on this input
const input = qs<HTMLInputElement>('#my-input', this.dom_);
if (input && document.activeElement !== input) {
  input.value = state.someValue.toString();
}
```

Apply this pattern to all user-editable fields in sync methods.

## Equipment Adjust Controls (Phase 6+)

For numeric equipment controls (frequency, gain, power, etc.), use the `equip-adjust-control` pattern:

### HTML Structure

```html
<div class="equip-adjust-control">
  <label class="equip-adjust-label">CONTROL NAME</label>
  <div class="equip-adjust-row">
    <div class="equip-adjust-buttons equip-adjust-decrease">
      <button id="xxx-dec-coarse" class="btn-equip">-N</button>
      <button id="xxx-dec-fine" class="btn-equip">-n</button>
    </div>
    <div class="equip-adjust-display">
      <input type="number" id="xxx-value" class="equip-adjust-input" />
    </div>
    <div class="equip-adjust-buttons equip-adjust-increase">
      <button id="xxx-inc-fine" class="btn-equip">+n</button>
      <button id="xxx-inc-coarse" class="btn-equip">+N</button>
    </div>
    <span class="equip-adjust-unit">UNIT</span>
  </div>
</div>
```

### Adapter Staged Values Pattern

RF equipment changes must use staged values + Apply button to prevent accidental changes:

```typescript
private stagedValue_: number = DEFAULT;

private adjustStagedValue_(delta: number): void {
  this.stagedValue_ = Math.max(MIN, Math.min(MAX, this.stagedValue_ + delta));
  const input = this.domCache_.get('valueInput') as HTMLInputElement;
  if (input) input.value = this.stagedValue_.toString();
}

private applyHandler_(): void {
  this.module.handleValueChange(this.stagedValue_);
  this.syncDomWithState_(this.module.state);
}
```

### Key Rules

- Input field IS the display - don't create separate display elements
- Use fixed `width: 3.5rem` on `.btn-equip` for vertical alignment
- Status indicators use text spans (e.g., "Locked"/"Unlocked"), not LED circles
- Toggle handlers must check state before calling toggle methods: `if (state !== isChecked)`
- The `qs()` function throws on missing elements - remove refs when removing HTML elements
- Use `cacheElement_(htmlId, cacheKey)` helper when HTML IDs differ from cache keys

## Satellite Constructor

The `Satellite` class constructor takes signal arrays in a specific order:

```typescript
new Satellite(
  noradId: number,
  uplinkSignals: RfSignal[],    // First array: signals satellite RECEIVES
  downlinkSignals: RfSignal[],  // Second array: signals satellite TRANSMITS directly
  config: { az, el, rotation, frequencyOffset }
)
```

**Key Points:**

- **First array (uplinks)**: Use `origin: SignalOrigin.SATELLITE_RX` - these are signals the satellite receives and transponds
- **Second array (downlinks)**: Use `origin: SignalOrigin.TRANSMITTER` - these are signals the satellite transmits directly (e.g., beacons)
- **Transponder**: Automatically converts uplink signals to downlinks using `frequencyOffset`
  - Example: Uplink at 5943 MHz with `frequencyOffset: 2.225e9` → Downlink at 3718 MHz
- **Don't duplicate**: If a signal is in the uplink array, the transponder creates the downlink automatically. Don't add it to both arrays.

## TypeScript Type Checking

**Always use the pnpm script to check for TypeScript errors:**

```bash
pnpm run typecheck
```

**Do NOT run tsc directly on individual files:**

```bash
# WRONG - will fail with module resolution errors
pnpm exec tsc --noEmit src/campaigns/nats/scenario5.ts
```

This project uses `@app/*` path aliases (e.g., `@app/types`, `@app/equipment/...`) that require the full tsconfig.json configuration. Running tsc on individual files bypasses this and produces false "Cannot find module" errors.

## Build-Time Constants (DefinePlugin)

- rspack `DefinePlugin` in `rspack.config.mts` injects compile-time constants — prefer this over generated files or runtime lookups for any value known at build time
- Existing constants: `__APP_VERSION__` (from `package.json`), `__GIT_COMMIT_SHA__`, `__IS_PRIVATE__`, `__AUTHORING__`, plus the `process.env.PUBLIC_*` values
- Always use `JSON.stringify()` when adding values — `DefinePlugin` does textual replacement, so strings must be wrapped as JS string literals
- To add a new constant, all three must be updated or it breaks in one environment:
  1. `DefinePlugin` in `rspack.config.mts` (the bundle)
  2. `define` in `vitest.config.mts` (the tests)
  3. the ambient declaration in `src/declaration.d.ts` (the type checker)

## Linting and Formatting

- Biome (`biome.json`) is both the linter and the formatter: `pnpm run lint` checks, `pnpm run lint:fix` applies safe fixes, `pnpm run format` formats
- Only **errors** fail the gate; warnings are a backlog being cleared area by area
- `src/engine/**` (vendored) and `src/private/**` (submodule) are excluded from linting
- Biome does not type-check. The unused-code gate is `noUnusedLocals`/`noUnusedParameters` in tsconfig, via `pnpm run typecheck`

## Git Commits

- Do NOT add `Co-Authored-By` lines to commit messages
- Use conventional commit format: `type(scope): description`
- Use emoji in commit titles for clarity:
  - Example: feat: :sparkles: Add new frequency adjustment control
  - ✨ `:sparkles:` for new features
  - 🐛 `:bug:` for bug fixes
  - ♻️ `:recycle:` for refactoring
  - 📝 `:memo:` for documentation changes
- Common types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

## Planning

When you use Plan Mode or create multi-step plans in this repo:

- Store each plan as a Markdown file under `src/private/plans/` (the private submodule) in this project.
  - Filename convention: `phase-<n>-<short-topic>-plan.md`
  - Example: `phase-1-auth-refactor-plan.md`

- After completing a phase:
  - Write a brief retrospective to `src/private/retrospectives/` (the private submodule) in this project.
  - Filename convention: `phase-<n>-<short-topic>-retro.md`
  - Include sections: `What worked`, `What didn’t`, `What to change next time`.

- Never write plans or retrospectives into the home directory; always use project-relative paths.

## Private Content (`src/private` submodule)

`src/private` is the private `thkruz/signal-range-private` submodule. It holds plans, retros,
sprint docs, the NATS/BOA world bible and working notes. Nothing in the OSS build reads it, and
contributors without access build and test without it.

- **New plans, retros, sprint notes, content bibles and internal docs are private by default.**
  Put them under `src/private/`, not in `docs/`, unless Ted says they are there for OSS users.
  `docs/` is for contributor-facing material only (scenario guide, NICE guide, platform guide, schema).
- **Two-commit rule.** When committing "all changes", first run `git -C src/private status`. If it
  is dirty, commit inside the submodule (conventional commits, same as here) and push it, then bump
  the pointer in this repo with `chore(private): :wrench: update subproject commit reference`.
  Never commit a pointer to an unpushed submodule commit. Push with
  `git push --recurse-submodules=on-demand`.
- The parent `.gitignore` does not reach inside the submodule; add ignore rules to
  `src/private/.gitignore`.
- `.gitmodules` uses the SSH URL (CI deploy key). Local checkouts point origin at HTTPS:
  `git -C src/private remote set-url origin https://github.com/thkruz/signal-range-private.git`.
