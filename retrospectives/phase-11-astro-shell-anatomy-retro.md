# Phase 11 retro — Astro shell anatomy for Campaigns 4 and 5

Plan: [phase-11-astro-shell-anatomy-plan.md](../plans/phase-11-astro-shell-anatomy-plan.md)

## What worked

- **Anatomy, not skin, is what makes "a different system".** Phase 10's palette swap
  still read as C1 in a different color because the shell's *shapes* were unchanged.
  Re-anatomizing three surfaces — GSB top bar, underline tabs, dark asset rail — did
  what four color ramps couldn't. The user called this correctly.
- **CSS `::before` labels on existing badges.** The CRIT/CAUT/INFO monitoring-chip
  labels are pure CSS content on the existing `.alarm-count` spans — no template
  learned any wording, and C1–C3 never render them. The only TS change the chips
  needed was "render all three even at zero" (variant-gated), because an Astro
  monitoring icon at 0 is standing information, not noise.
- **The phase-9 discipline held again**: rail stayed left, tabs stayed top, DOM order
  untouched — every locator and unit test survived without edits (4691 pass, zero
  test churn beyond none).
- **Surface slots doubling as semantic slots.** `--mc-surface-4` was authored in
  phase 10 as the Astro *selected* color in both campaign ramps, so the rail's
  selected-row rule is campaign-agnostic (`background: var(--mc-surface-4)`).

## What didn't

- **Anchor underlines surfaced only in the new anatomy.** The base theme has always
  underlined the selected list-group anchor; inside a boxed red row it read as
  intentional, on a flat Astro rail it read as a rendering bug. Restyling a component
  changes which of its inherited quirks are visible — screenshot after, not just
  before.
- **State backgrounds vs. variant backgrounds needed explicit arbitration.** The
  timer clock-block rule (`body.chrome-astro .timer-display`) out-specifies the
  state tints (`.timer-display.timer-warning`), which silently killed the pulse
  animation's visual base. Resolved deliberately: state lives in the digit colors
  (higher-specificity `.timer-value` rules survive), backgrounds stay flat. When a
  variant flattens boxes, audit every stateful class that painted those boxes.

## What to change next time

- The flush-tile workspace (option D) is the approved-but-deferred remainder; do it
  as its own small phase with per-tab seam QA.
- The monitoring chips currently aggregate by severity. The full Astro pattern is
  per-subsystem chips (RF/ACU/CRYPTO...) with worst-status rollup — that belongs
  with the status-symbol/rollup engine work already noted in the phase-10 retro.
