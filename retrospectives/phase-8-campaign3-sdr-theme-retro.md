# Phase 8 retro — Campaign 3 distinct visual identity (modern SDR app)

Plan: [phase-8-campaign3-sdr-theme-plan.md](../plans/phase-8-campaign3-sdr-theme-plan.md)

## What worked

- **Asking before styling.** The four up-front questions (direction, top-bar fix scope, header
  identity, surface scope) changed the work substantially. The half-built retro-freeware direction
  already in the tree would have been the default assumption, and it was the wrong one — it got
  deleted instead of extended.
- **"Base token values copied verbatim from the literal they replace."** This made the equipment
  refactor - 34 files, ~190 substitutions - provably a no-op for Campaign 1. Verified numerically,
  not by eye: `.equipment-case` still computes to `#2a2a2a → #1f1f1f`, `#444`, `8px`, `Roboto`.
- **Mechanical substitution with a word-boundary guard.** `s/#444\b/var(--mc-equip-border-light)/`
  with 6-digit forms replaced before 3-digit ones. `\b` is what stopped `#fff` from eating the
  first half of `#fff9c4` and `#333` from clipping `#333333`. Auditing the *remaining* hex values
  afterwards (grouped by frequency) was the check that proved only semantics were left.
- **A computed-style probe next to every screenshot.** Printing the resolved `barBg`, wordmark and
  faceplate gradient per campaign caught the cascade bug below, which the screenshots alone would
  not have — a dark grey bar next to a dark blue body looks plausible.
- **Distinguishing semantic from structural color up front.** The ~10 status colors (`#f44336`,
  `#4caf50`, `#2196f3`, amber) were deliberately left hardcoded, extending the pre-existing
  "`--mc-danger*` must not be overridden" rule. That is also why the accent moved to cyan.

## What didn't

- **I got CSS custom property resolution wrong, twice, in the same way.** I assumed
  `--mc-chrome-bar-bg: var(--mc-surface-1)` declared on `:root` would re-resolve per campaign. It
  does not: a `var()` inside a custom property is substituted **where the property is declared**,
  and the result inherits as an already-resolved literal. So it froze to the base `#292929` and
  campaigns 2/4/5 kept a grey bar even though their borders changed. The fix is to leave the slot
  undefined and resolve at point of use: `var(--mc-chrome-bar-bg, var(--mc-surface-1))`.
- **That same bug was already in the codebase, and much wider than my version of it.** The whole
  legacy `--color-*` alias block sat in `:root`, so `--color-primary: var(--mc-accent-red)` had
  been frozen to Campaign 1 red since it was written. Every campaign rendered red for anything
  styled through those aliases — the scenario list's START button and the site wordmark, among
  others. This is a real part of *why* Campaign 3 "looked like Campaign 1 with color changes":
  a chunk of the app was never able to follow the accent at all. Moving the block to `body` fixed
  all five campaigns at once.
- **Fixing shared theming made one campaign temporarily worse-looking.** Once C2's chrome went
  blue, its Contact Timeline deck was still red and now clashed where before it had matched. A
  shared-CSS fix can create *relative* inconsistency in surfaces that were never in scope;
  timeline-deck.css had to be tokenized in the same pass to avoid shipping that.
- **I wrote three corrupted hex values** (`#21384４`, `#2a4插a`, `#33566３`) while typing a long
  token block. The IDE's `Invalid hex color` diagnostic caught them immediately, but it is a
  reminder that a 30-line block of near-identical hex values is worth generating rather than typing.
- **My own screenshot harness needed two fixes** before it produced anything: `playwright` does not
  resolve from the scratchpad (needs `createRequire` against the project), and the intro dialog
  blocks all navigation until a mousedown is *held* past the skip threshold.

## What to change next time

1. **Never put `var()` inside a custom property declared on `:root`** if any descendant is meant to
   override the referenced token. Either declare the alias on `body` (where the campaign class
   lands) or resolve at point of use with a fallback. Both patterns are now commented in
   `tabler-overrides.css`; read those before adding a token.
2. **Grep for frozen aliases before believing a theme is "just colors."** `grep -n "var(--" ` inside
   `:root` blocks is a 5-second check that would have found the START-button class of bug years ago.
3. **Probe computed styles, don't just screenshot.** For theme work, assert the resolved value per
   campaign. A theme bug that produces a *plausible* color is invisible to eyeballing.
4. **Count distinct values before deciding a tokenization is too big.** 337 raw hex looked
   prohibitive; it was ~15 repeated structural greys plus semantics, which is a one-pass job.
5. **When tokenizing gradients, tokenize both stops together.** A half-tokenized
   `linear-gradient(var(--tok), #1f1f1f)` shifts one end and leaves the other grey. Grepping for
   gradients that mix `var(` and `#` found the stragglers.

## Follow-ups not done

- Campaigns 2/4/5 still use the base grey **equipment faceplates**; the tokens are in place, the
  values are not authored (deliberate — scoped to C3 this pass).
- The campaign *selection* page at `/` cannot be per-campaign themed (all five at once, no body
  class). Unchanged by design.
- ~9 near-white text values and `#000` display glass remain hardcoded in equipment CSS. They read
  correctly on any dark theme, so they were left alone.
- No E2E spec asserts theme identity. A cheap one would be the computed-style probe from the
  scratchpad harness, turned into a Playwright test over all five campaigns.
