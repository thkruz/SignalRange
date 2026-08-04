# Phase 8 — Campaign 3 distinct visual identity (modern SDR application)

## Problem

Campaign 3 (`ham-sdr`, "Backyard Operator") reads as Campaign 1 with a green accent.
Three separate causes:

1. **The existing theme is under-committed.** `body.campaign-ham-sdr`
   ([tabler-overrides.css:172-230](../src/tabler-overrides.css#L172)) changes the accent to
   phosphor green and adds Verdana + `border-radius: 0` + `2px outset` beveled buttons, aiming at
   "2000s hobbyist freeware." The bevels/typography are too subtle to register, and the direction
   itself is being replaced (see Decisions).
2. **The Mission Control chrome cannot be themed at all.**
   [mission-control-page.css](../src/pages/mission-control/mission-control-page.css) hardcodes
   `#292929` on `.app-shell-header`, `.command-bar-left`, `.command-bar-right`, `.aos-countdown`
   and `.app-shell-sidebar`, plus `#6b6b6b` borders and `#1f1f1f` canvas — no `--mc-*` vars. This
   is why the top bar stays grey against ham-sdr's dark body. **Campaigns 2, 4 and 5 have the
   same bug.**
3. **Equipment panels cannot be themed at all.** The 9 equipment CSS files carry ~319 hardcoded
   hex values and essentially zero `var()` usage, so every campaign's faceplates are identical.

Separately, [global-command-bar.ts:87](../src/pages/mission-control/global-command-bar.ts#L87)
hardcodes `ORBITAL<span>OPS</span>` and a globe icon for every campaign — narratively wrong for a
backyard station with no ops floor.

## Decisions (confirmed with the user)

| Question | Decision |
|---|---|
| Visual direction | **Modern SDR application** (GQRX / SDR#): near-black bg, thin 1px outline panels with no fill, mono chrome, waterfall accent. Not the retro-freeware route. |
| Accent hue | **Cyan `#22d3ee`**, not the teal `#2ee6a8` — teal collides with the hardcoded healthy-emerald `#10b981` and the `#4caf50` status LEDs. |
| Top bar fix | **Tokenize the shared CSS for all campaigns.** Base token values are byte-identical to today's greys so Campaign 1 renders unchanged; 2/4/5 get correct bars for free. |
| Header identity | **Per-campaign, all five filled in.** New optional `CampaignData` field. |
| Equipment overrides | **Tokenize shared CSS, author values for Campaign 3 only.** 1/2/4/5 keep today's exact faceplates. |
| Mono reach | **Chrome, labels, readouts, tables.** Prose (mission overview, briefs, dialog) stays sans for legibility. |
| Surfaces in scope | MC chrome · cards/panels/forms/modals · equipment panels · scenario list page. |

The campaign *selection* page at `/` is deliberately out of scope: it lists all five campaigns
at once, and the router only sets `body.campaign-<id>` for `/campaigns/:id*` paths
([router.ts:127-137](../src/router.ts#L127)), so there is no single campaign to theme.

## Invariants

- **Semantic colors stay campaign-invariant.** `--mc-danger*`, the alarm-bar states, timer
  warning/urgent/failed colors, and the equipment status LEDs (`#f44336` / `#4caf50` / `#2196f3`
  / amber) are *not* tokenized into campaign-overridable slots. This extends the existing rule
  already documented in the base theme block.
- **No HTML/structure changes** beyond the header-identity substitution, which swaps text and an
  icon class in place.
- **Campaigns 1, 2, 4, 5 must render exactly as they do today** except for the top bar/sidebar
  colors, which for 2/4/5 is the point of the fix and for 1 must be a no-op.

## Palette (Campaign 3)

| Slot | Value |
|---|---|
| accent / `--mc-accent-red` | `#22d3ee` |
| accent bright | `#67e8f9` |
| accent dark | `#0e7490` |
| body / surface-0 | `#0b1014` |
| surface-1 | `#111a20` |
| surface-2 | `#17242c` |
| surface-3 | `#1f3038` |
| border | `#22333d` |
| mono stack | `ui-monospace, 'Cascadia Code', Consolas, 'DejaVu Sans Mono', monospace` |

## Steps

1. **Chrome tokens.** Add `--mc-chrome-bar-bg`, `--mc-chrome-bar-border`, `--mc-chrome-canvas-bg`,
   `--mc-chrome-scroll-*` to `:root` with today's literal values; replace the hardcoded hex in
   `mission-control-page.css` with them.
2. **Equipment tokens.** Add a `--mc-equip-*` set to `:root` whose values are exactly the greys
   in use today (`#1a1a1a`, `#1b1b1b`, `#222`, `#2a2a2a`, `#333`, `#444`, `#555`, `#666`, text
   `#fff`/`#aaa`/`#ccc`), then substitute across the 9 equipment files. Leave status colors alone.
3. **Rewrite the ham-sdr theme block.** Remove the Verdana stack and the `outset`/`inset` bevel
   rules. Add the cyan palette, the mono chrome scoping, flat 1px outline panel treatment, and
   ham-sdr overrides for the new chrome + equipment tokens.
4. **`headerIdentity`** on `CampaignData` — `{ name, nameAccent, icon }`, optional, defaulting to
   today's `ORBITAL`/`OPS`/`fa-earth-americas`. Values: C1 `ORBITAL|OPS` globe ·
   C2 `ATLANTIC|OPS` earth-europe · C3 `BACKYARD|SDR` satellite-dish · C4 `COUNTER|COMMS`
   tower-broadcast · C5 `SIGNAL|HUNTER` crosshairs.
5. **Command bar** resolves the identity via `CampaignManager.getCampaignForScenario()` at field-init
   time (before `html_`, matching how `isTimeSkipEnabled_` already works) and renders it.
6. **Scenario list page** — `scenario-selection.css` has 90 hardcoded hex / 9 vars; tokenize the
   structural ones so the ham-sdr body class reaches it.
7. **Verify** — `npm run type-check`, `npx vitest run`, then a live sweep: Campaign 1 for
   pixel-identity, Campaign 3 for the new look, and 2/4/5 for the newly-themed bars.

## Risks

- The equipment substitution is the largest and least reversible chunk; a wrong mapping silently
  changes Campaign 1's faceplates. Mitigation: base token values are copied verbatim from the
  literals they replace, so the diff is provably a no-op for the base theme, and Campaign 1 gets a
  live look afterward.
- `scenario-selection.css` and `timeline-deck.css` (31 hex) may contain colors that are load-bearing
  for readability at low contrast; tokenize conservatively rather than exhaustively.
