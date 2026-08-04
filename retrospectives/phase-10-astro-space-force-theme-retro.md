# Phase 10 retro — Astro "Space Force" theme for Campaigns 4 and 5

Plan: [phase-10-astro-space-force-theme-plan.md](../plans/phase-10-astro-space-force-theme-plan.md)

## What worked

- **Extracting the real tokens beat imitating the look.** The SSC reference apps are SPAs
  whose HTML tells you nothing, but their webpack CSS bundles carry the entire Astro UXDS
  token set (`--color-background-base-default:#101923` etc.). Curling two bundles produced
  an authoritative palette, typography and status ladder in minutes — no eyeballing hexes
  off screenshots.
- **Phases 8 and 9 paid off exactly as designed.** The whole retheme was: new values in the
  two existing `body.campaign-*` blocks, one new `body.chrome-astro` block, and two content
  switches in the command bar. No shared rule was edited unscoped; C1–C3 verified
  pixel-faithful on the first try.
- **The classification strip was already the Astro pattern.** Our `--mc-classification-*`
  ladder turned out hex-identical to Astro's (both descend from astro.css), so the
  user's mid-flight request — C4 in Top Secret style reading "G14 CLASSIFIED", C5 in
  Secret style reading "SPECIAL PROGRAM" — was the two-var + `content` override the
  tactical block's comment had documented in advance.
- **Declaring status tokens per-campaign, not on `:root`.** `--mc-status-*` exists only in
  the C4/C5 blocks; shared consumers reference them with the old literals as fallbacks
  (`var(--mc-status-normal, #22c55e)`), so the C2 security console is untouched while the
  same CSS re-inks under C4/C5.
- **The chrome-identity E2E spec earned its keep** — it pinned down every behavior the new
  variant had to keep (bands, asset ordering, TASK label) and forced explicit decisions
  about what changed (mirror off, 1px, Roboto, year/DOY clock).

## What didn't

- **The first C4 screenshot shipped an invisible wordmark.** The accent slot got Astro's
  *dark* interactive blue (#005a8f), and the shared wordmark rule paints in the base
  accent — "COMMS" all but vanished against the header plate. Astro renders interactive
  text on dark surfaces in the *light* variant; fixed with a scoped
  `body.chrome-astro .command-bar-left .text-blue-500 { color: var(--mc-accent-red-bright) }`.
  Lesson: when a palette has dark/light interactive pairs, decide per consumer which half
  each slot feeds; a single "accent" value cannot serve both fills and text.
- **Sibling-structure assertions broke when the campaigns' markings diverged.** The E2E
  `structural()` comparator treated the classification band *text* as structure; once C4
  and C5 wore different fictional markings it had to be relaxed to "bands exist". Encoding
  content strings as structure is over-assertion.
- **Screenshot automation fought the per-station tab model.** EA Assessment and
  Geolocation only exist after selecting a ground station, and generic `getByText` clicks
  timed out against the sidebar; the working recipe is container-scoped locators
  (`#asset-tree-sidebar-container .list-group-item`) with `force: true`.

## What to change next time

- When adopting an external design system, pull its distributable (CDN/webpack bundle)
  first and derive from tokens, not screenshots.
- Any new accent family should land as an explicit pair of slots (fill vs on-dark text)
  instead of overloading `--mc-accent-red` + `-bright`, which almost invert meaning under
  Astro (#005a8f fill, #4dacff text).
- The remaining status-system work — pairing colors with shapes for colorblind operators
  and worst-status-wins rollup in the asset tree — is engine/TS work, deliberately left
  out of this CSS phase; it deserves its own phase with the six-level ladder as input.
