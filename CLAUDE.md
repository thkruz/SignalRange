# Project instructions for Claude Code

## Code Conventions

- Private properties and methods end with `_` suffix (e.g., `domCache_`, `syncDomWithState_()`)
- Use `readonly` on properties set in constructor that should never change (e.g., `containerEl`, `boundHandlers`)
- Use `protected` (not `private`) for properties that subclasses or UI layers need to access
- Branded types (`Hertz`, `dB`, `Degrees`) require explicit casting - check type definitions early
- State handlers typed as `(state: Partial<T>) => void`, never `Function | null`
- Don't use bracket notation (`obj['method']()`) to access methods - make them public instead

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

## Planning

When you use Plan Mode or create multi-step plans in this repo:

- Store each plan as a Markdown file under `./plans/` in this project.
  - Filename convention: `phase-<n>-<short-topic>-plan.md`
  - Example: `phase-1-auth-refactor-plan.md`

- After completing a phase:
  - Write a brief retrospective to `./retrospectives/` in this project.
  - Filename convention: `phase-<n>-<short-topic>-retro.md`
  - Include sections: `What worked`, `What didn’t`, `What to change next time`.

- Never write plans or retrospectives into the home directory; always use project-relative paths.
