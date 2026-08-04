# Phase 9 — Tactical chrome variant (Campaigns 4 & 5 as one distinct system)

Follows [phase-8-campaign3-sdr-theme-plan.md](phase-8-campaign3-sdr-theme-plan.md) and its
[retro](../retrospectives/phase-8-campaign3-sdr-theme-retro.md), which built the token layer this
phase spends.

## Problem

Phase 8 gave every campaign a themeable chrome and gave Campaign 3 a genuinely different *look*.
What it did not give any campaign is a different *layout*. C1, C2, C4 and C5 are still the same
screen with a different hue:

- identity + clock top-left, timers top-right, asset tree on the left, tab strip above the canvas,
  "Ground Stations" above "Satellites", same wordmark treatment, same clock format;
- C4 (`ccs`) and C5 (`signal-hunter`) each got ~30 lines of accent/surface overrides in
  [tabler-overrides.css:531-625](../src/tabler-overrides.css#L531) and nothing else — they read as
  "Campaign 1 in olive" and "Campaign 1 in brown";
- their equipment faceplates are still the base grey (an explicit phase-8 follow-up: the
  `--mc-equip-*` tokens exist, the values were only authored for C3).

Meanwhile the intended grouping is 2 + 1 + 2:

| Campaigns | Fiction | Should feel |
|---|---|---|
| C1 `nats` · C2 `nats-eu` | Two facilities of one commercial teleport operator | **The same product**, different site (red vs blue) |
| C3 `ham-sdr` | A hobbyist in a backyard | A consumer SDR app — **already shipped** |
| C4 `ccs` · C5 `signal-hunter` | 9th EWS / 22nd EWS — two squadrons, one service | **A different system entirely**, and clearly siblings of each other |

## Approach

Introduce a **chrome variant** between "shared CSS" and "per-campaign accent". Layout and
typography are authored once per variant; hue stays per campaign. Under the hood nothing changes —
same components, same DOM order, same tab ids, same engine.

```text
shared CSS  →  body.chrome-<variant>  (layout, typography, relief)  →  body.campaign-<id>  (hue)
                 standard  C1, C2
                 sdr       C3
                 tactical  C4, C5   ← all new work lands here
```

`standard` is defined as "the rules already in the file", so it ships as an empty block: C1 and C2
stay pixel-identical and stay siblings by construction.

## Decisions

| Question | Decision |
|---|---|
| Where does the variant live? | New optional `chromeVariant?: 'standard' \| 'sdr' \| 'tactical'` on `CampaignData`, defaulting to `'standard'`. The Router adds `body.chrome-<variant>` next to the `body.campaign-<id>` it already sets. |
| How different is "different"? | Layout mirroring + reordering. **No new components, no new logic, no DOM reordering** — see Invariants. |
| C4 vs C5 distinction | Unchanged from today: OD green vs coyote brown accents, different wordmark/icon. Everything structural is shared, which is what makes them read as one system. |
| C1/C2 work | None. Verification only — they already share layout and differ solely in accent/surface temperature, which is the intended relationship. |
| C3 | Optionally re-key its layout/typography rules from `body.campaign-ham-sdr` to `body.chrome-sdr` (mechanical, provably no-op). Colors stay campaign-scoped. Droppable if the churn isn't wanted. |
| How much mirroring? | **All four inversions** — sidebar side, command bar, asset-tree section order, and the tab strip to the bottom. |
| Sidebar wording | **Unchanged.** "Assets / Ground Stations / Satellites" stay as they are in every campaign; no `lexicon` field. The classification strip carries the military signal on its own. |
| Condensed font | **Roboto Condensed, self-hosted.** And while we are in there, Roboto moves in-house too: no font is fetched from Google at runtime any more. |

## Invariants

- **Mirroring is visual only.** Achieved with `flex-direction: row-reverse` / `order`, never by
  reordering elements in a template. Every `qs()` selector, unit test and Playwright locator keeps
  working because the DOM is untouched.
- **No engine, condition, event, tab-id, or asset-id changes.** This phase touches presentation
  and one small data field (`chromeVariant`).
- **Sidebar and section labels are untouched.** Every campaign keeps "Assets / Ground Stations /
  Satellites", so nothing that reads those strings — including E2E locators — moves.
- **Semantic colors stay campaign-invariant** — `--mc-danger*`, alarm-bar states, timer
  warning/urgent/failed, equipment status LEDs. Same rule as phases 8 and earlier.
- **C1, C2, C3 render exactly as they do today.** The C3 selector rename must be provably a no-op.
- **No `var()` inside a custom property declared on `:root`** (phase-8 retro item 1). New tokens
  either resolve at point of use with a fallback, or are declared on `body`.

## The distinctions

Nine changes, all cheap, all gated on `body.chrome-tactical`.

| # | Surface | Standard (C1/C2) | Tactical (C4/C5) | Mechanism |
|---|---|---|---|---|
| 1 | Workspace | asset tree left, canvas right | **asset tree right** | `.app-shell-main { flex-direction: row-reverse }` + border side swap |
| 2 | Command bar | identity + clock left, timers right | **mirrored** | `.app-shell-header { flex-direction: row-reverse }` + border side swap |
| 3 | Asset tree order | Ground Stations, then Satellites | **Satellites first** | `order` on the section groups |
| 4 | Tab strip | above the canvas | ~~below the canvas~~ **reverted, see revisions** | — |
| 5 | Clock | `15 MAR 2027 22:05:15` | **`152205Z MAR 27`** (DTG) | local formatter in the command bar, keyed to the variant |
| 6 | Timer labels | OBJECTIVE / MISSION | **TASK / MSN** | variant label map in the command-bar template |
| 7 | Page footer | none | **`UNCLASSIFIED // TRAINING USE ONLY`** strip | `.app-shell-page::after` as a flex item |
| 8 | Typography | system sans, sentence case, 4px radii | **Roboto Condensed, uppercase, wide tracking, 0 radii** | variant CSS |
| 9 | Faceplates | grey moulded plastic | **matte OD-green (C4) / coyote (C5), square, hard shadow** | `--mc-equip-*` values per campaign |

Items 1–4 change the muscle memory of the screen; 5, 7 and 8 change what it *is*. Sidebar and
section labels stay identical in every campaign — the strip does the naming work instead.

## Steps

### 1. Variant plumbing

- `chromeVariant?: 'standard' | 'sdr' | 'tactical'` on `CampaignData`
  ([campaign-types.ts](../src/campaigns/campaign-types.ts)), documented as optional with a
  `standard` default.
- Author it: C1/C2 `standard` (explicit, for readability), C3 `sdr`, C4/C5 `tactical`.
- [router.ts:127-137](../src/router.ts#L127) — `updateCampaignBodyClass_` already strips
  `campaign-*` and adds the new one; extend it to strip `chrome-*` and add
  `chrome-${CampaignManager.getInstance().getCampaign(id)?.chromeVariant ?? 'standard'}`.
  `getCampaign()` is a lookup over static data, safe at route time.

### 2. (Optional) Re-key C3

Mechanical `body.campaign-ham-sdr` → `body.chrome-sdr` on the *layout and typography* rule blocks
only ([tabler-overrides.css:360-529](../src/tabler-overrides.css#L360)); the color/token block at
267-358 stays campaign-scoped. Prove no-op with the computed-style probe before/after.

### 3. Self-hosted fonts

Prerequisite for step 9, and a standalone improvement: **no font is fetched from a third party at
runtime any more.** Today [public/index.html:8-10](../public/index.html#L8) preconnects to
`fonts.googleapis.com` / `fonts.gstatic.com` and pulls Roboto 300/400/500/700.

- Vendor the woff2 files (Latin + latin-ext subsets) into `public/fonts/`: Roboto at the four
  weights already in use, Roboto Condensed at 400/700. Source them from `@fontsource/roboto` and
  `@fontsource/roboto-condensed` and check the files in — both are Apache-2.0; ship the
  `LICENSE.txt` alongside them.
- Add `{ from: 'public/fonts/', to: 'fonts/' }` to the `CopyWebpackPlugin` patterns
  ([webpack.config.js:88](../webpack.config.js#L88)). The `.woff2` loader rule already exists
  ([webpack.config.js:56](../webpack.config.js#L56)) but is not what serves these — the copy
  pattern keeps the URLs stable at `/fonts/…`.
- New `src/fonts.css` with the `@font-face` blocks (`font-display: swap`), imported ahead of
  `@tabler/core` so the declarations exist before anything asks for the family.
- Delete the three Google Fonts tags from `public/index.html`.

**This one step touches every campaign**, because Roboto is what `--mc-equip-font` resolves to on
all five. Verify faceplate text renders identically before and after — a missing weight shows up as
a subtly heavier or wider label, not as a visible failure.

### 4. Structural hooks in the asset tree

`renderAssetTree_` emits four sibling `list-group` divs with no distinguishing class. Add
`asset-group-overview`, `asset-group-mission`, `asset-group-stations`, `asset-group-satellites`
(class only, no styling in the base theme, no DOM reordering). `.asset-tree` is already
`display: flex; flex-direction: column`
([asset-tree-sidebar.css:159](../src/pages/mission-control/asset-tree-sidebar.css#L159)), so the
tactical variant just assigns `order`. Explicit `order` rather than `column-reverse` — the latter
would also throw Mission Overview to the bottom.

### 5. Mirrored shell (`body.chrome-tactical`)

`row-reverse` on `.app-shell-main` and `.app-shell-header`, plus the four things that ride along:

- `.command-bar-left` `border-right` → `border-left`; `.command-bar-right` the reverse
  ([mission-control-page.css:25-43](../src/pages/mission-control/mission-control-page.css#L25)).
- `.app-shell-sidebar` and `.asset-tree-sidebar` `border-right` → `border-left`.
- Collapse-button chevrons point the wrong way once the tree is on the right —
  `transform: scaleX(-1)` on `.sidebar-collapse-btn img` (composes fine with the existing
  `filter: invert(1)`); no new assets.
- Collapsed-mode tooltips fly out with `left: 100%` and would leave the viewport from a
  right-hand sidebar — flip to `right: 100%` and mirror the arrow's border side
  ([asset-tree-sidebar.css:258-301](../src/pages/mission-control/asset-tree-sidebar.css#L258)).

### 6. Tab strip to the bottom

`.tabbed-canvas { flex-direction: column-reverse }`, `.canvas-header` `border-bottom` →
`border-top`, and the active-tab treatment inverts: base uses
`border-top: 2px solid var(--mc-accent-red)` with a `padding-top` compensation
([tabler-overrides.css:780-791](../src/tabler-overrides.css#L780)) — tactical moves both to the
bottom edge. Check `.nav-tabs` `sticky-top` interplay while doing it.

### 7. DTG clock + timer labels

`SimulatedTimeTickData` already carries `timestampMs`
([events.ts:301-306](../src/events/events.ts#L301)), so the command bar can format locally and
`OpsLogManager.formatMilitaryDateTime_` — and every log consumer of it — is left alone. Add a
`formatDtg(timestampMs)` helper next to
[time-skip-format.ts](../src/pages/mission-control/time-skip-format.ts), select it in
`onSimulatedTimeTick_` by variant, and drive the two timer labels from the same variant lookup
(resolved before `html_`, matching `headerIdentity_`/`isTimeSkipEnabled_`).

### 8. Classification strip

CSS-only: `body.chrome-tactical .app-shell-page::after { content: 'UNCLASSIFIED // TRAINING USE
ONLY'; flex: 0 0 auto; }`. `.app-shell-page` is already a flex column, so `::after` becomes its
last flex item and lands below the timeline deck when a scenario mounts one. Costs ~20px of canvas
height — verify against the `calc(100vh - 80px)` budget.

### 9. Tactical typography and relief

`'Roboto Condensed'` (self-hosted, step 3) on chrome only — bar, tabs, sidebar, card headers,
buttons, badges, table headers — plus uppercase, wide letter-spacing, `--tblr-border-radius: 0`,
`--mc-equip-radius: 0`, hairline borders. Prose stays sans and sentence case: same carve-out
phase 8 made for C3, for the same legibility reason.

### 10. Tactical faceplates

Author `--mc-equip-*` for both campaigns — closes phase-8 follow-up #1 for C4/C5. Same 24-token
structure, two tints: OD-green-shifted for `ccs`, coyote-shifted for `signal-hunter`, both darker
and flatter than base with `--mc-equip-case-shadow` a hard 1px rim rather than a soft moulding.

**Generate the ramps, don't type them** (phase-8 retro item: three corrupted hex values came out of
hand-typing a long token block). Define two anchors and a mechanical HSL shift from the base ramp,
emit the block from a scratchpad script, paste the output.

## Risks

- **Mirroring ripples further than the two `row-reverse` lines.** The four follow-on items in
  step 5 are the known ones; scrollbar side and the draggable mission-brief/checklist boxes are
  the suspects to check live.
- **The bottom tab strip is the most invasive rule.** It inverts a component the base theme styles
  heavily (active-tab border, padding compensation, hover underline). Confirmed in scope; if it
  fights the base cascade it is still the cheapest item to back out, since 1–3 already carry the
  "different system" read on their own.
- **`::after` banner eats canvas height.** Scenarios that mount the timeline deck (C2 today, C4/C5
  possibly later) have the tightest vertical budget; verify with a deck-enabled scenario even
  though none is tactical yet.
- **Self-hosting the fonts is the one global change in this phase.** Every campaign's faceplates
  resolve `--mc-equip-font` to Roboto, so a missing weight or a bad `@font-face` path degrades all
  five silently — the browser just falls back. Check the Network panel for zero third-party font
  requests *and* four Roboto weights actually loading. (`'Inter'` is referenced in CSS but has
  never been fetched, so the base body text is already on a system fallback; leave that alone
  rather than quietly changing C1's body type in a theming phase.)
- **C5 has a live E2E spec** (`e2e/specs/signal-hunter-geolocation.spec.ts`) that drives the
  mirrored layout. Selectors are id/class-based so it should pass untouched — running it is the
  proof that "visual only" held.
- **The `:root` var() trap** (phase-8 retro) — any new token must resolve at point of use.

## Verification

1. `npm run type-check` · `npx vitest run`.
2. Extend the phase-8 computed-style probe into a geometry probe over all five campaigns, asserting
   per campaign: sidebar `x` relative to canvas `x`, tab-bar `y` relative to content `y`, resolved
   bar bg / accent / faceplate gradient / resolved font family, clock text matching the expected
   format, banner presence. C1/C2/C3 values must be identical to the pre-change run — capture that
   baseline **before** touching the fonts, since step 3 moves them for everyone.
3. `npx playwright test e2e/specs/signal-hunter-geolocation.spec.ts` (`--workers=1` locally).
4. Live sweep: C1 and C2 unchanged and matching each other; C3 unchanged; C4 and C5 mirrored,
   distinct from C1/C2, and obviously siblings.
5. Promote the probe to `e2e/specs/campaign-chrome-identity.spec.ts` — closes phase-8 follow-up #4
   and locks all three variants against regression.

## Revisions after the first playtest (2026-07-25)

Four changes to what is written above, all made after seeing the built thing:

1. **Navigation stays where it is; only the chrome changes.** Two of the four inversions were
   built, tried and reverted:
   - The **asset tree goes back on the left**. It is a navigation rail, and every other rail the
     operator has used is on the left. The collapse-chevron flip and tooltip-direction flip that
     the mirrored tree needed went with it.
   - The **tab strip goes back to the top of the canvas**, for the same reason — tabs head a
     workspace, and moving them cost more orientation than the novelty bought. Square corners stay;
     the active-tab accent rides the top edge again from the base theme.

   The *command bar* mirroring survives, and carries the "different system" signal on its own. The
   remaining differences are all chrome (type, weight, color, marking) plus the asset-tree section
   order, which changes what is emphasized rather than where anything lives.
2. **The classification marking bands top and bottom** (`::before` + `::after`), and takes its
   colors from the AstroUX space-ops palette rather than the campaign accent — `#007a33` on white
   for Unclassified, with CUI/Confidential/Secret/Top Secret/TS//SCI tokenized alongside it. A
   classification color that changed per campaign would be worse than no marking, since the color
   *is* the message. Source: `keeptrack-space/public/css/astroux/css/astro.css` and
   `src/plugins/classification-bar/classification-bar.ts`.
3. **Line weight becomes a fourth axis of difference.** `--mc-panel-border-width` is 2px in
   tactical against the base 1px, applied to panels, faceplates and chrome dividers. The three
   variants now differ in weight as well as color, type and layout — distinguishable in grayscale.
4. **The world map's visibility circle became two circles.** It drew one, around each *ground
   station*, sized by the satellite's altitude. At GEO that is a fixed 76° blob centered on the
   site and reads as "this station can see to northern Japan". Now:
   - **Satellite coverage** (blue dashed, on by default) rides the sub-point — the ordinary
     footprint, correct at any altitude, and the station is simply inside it or not.
   - **Station access** (amber dotted, opt-in) is the old circle, kept because it answers a real
     pass-planning question, but only offered on the *focused satellite* tab and labeled with the
     pair. Its radius is a property of (station, satellite), not of the station, so on the
     all-assets overview map there is no honest single answer to draw.

   Note that an antenna's literal field of view is not a candidate for either: these are 0.5–2°
   pencil beams (the C4 5 m dish is 0.56° HPBW), which is a sub-pixel dot at world scale. What a
   station-centered circle can honestly show is access, not FOV.
5. **COBALT-4 gets a real orbit.** Campaign 4 had no 2D map because its only satellite was a
   fixed-geometry `Satellite` with no ephemeris. (Campaign 5 already had the map — SENTRY-7/9 are
   SGP4 birds.) Its authored az 175 / el 30 could not both be true for a GEO bird seen from 34°N,
   so azimuth was kept and elevation follows the orbit: slot 115.1°W, az 174.9 / el 50.4, held to
   0.05° across the scenario. TLE authored by `scripts/author-tle-ccs.mjs`; the two pointing
   conditions, the objective text and the site's parked antenna state moved from el 30 to el 50.

## Resolved before build (2026-07-25)

- **Mirroring scope** — all four inversions, tab strip included.
- **Sidebar wording** — unchanged in every campaign. No `lexicon` field; the classification strip
  is the only added text.
- **Font** — Roboto Condensed, and every font file self-hosted out of `public/fonts/`. The Google
  Fonts request goes away entirely (step 3).

## Deliberately out of scope

- The campaign *selection* page at `/`. It lists all five campaigns at once and the Router only
  sets a campaign class for `/campaigns/:id*`, so there is no variant to apply — unchanged since
  phase 8.
- The standalone `/sandbox` route ([router.ts:91](../src/router.ts#L91)). No campaign id in the
  path means no campaign class and no chrome class, so it stays `standard`. Per-campaign sandboxes
  reached as `/campaigns/:id/scenarios/sandbox` **do** get the variant, which is what we want.
- The scenario-list page at `/campaigns/:id` gets the body class too, so C4/C5 pick up the
  tactical typography and square corners there for free. That is desirable; no extra work, but
  check it in the live sweep rather than being surprised by it.
- C2/C3 equipment faceplate values. C2's are still base grey by choice; this phase authors C4/C5
  only.
