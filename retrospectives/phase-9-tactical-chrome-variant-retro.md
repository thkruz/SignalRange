# Phase 9 retro — tactical chrome variant (Campaigns 4 & 5)

Plan: [phase-9-tactical-chrome-variant-plan.md](../plans/phase-9-tactical-chrome-variant-plan.md)

Shipped: `CampaignData.chromeVariant` → `body.chrome-<variant>` from the Router, an empty
`standard` block (C1/C2), C3's layout rules re-keyed to `chrome-sdr`, and a `chrome-tactical` block
that mirrors the workspace, moves the tab strip to the bottom, lists satellites above ground
stations, sets a DTG clock and TASK/MSN timers, closes the page with a classification strip, and
tints the faceplates olive (C4) / coyote (C5). Fonts are now self-hosted; no third-party font
request remains.

## What worked

- **A variant layer between the shared CSS and the campaign accent.** Layout is authored once and
  worn by two campaigns; hue stays per campaign. `standard` is defined as "the rules already in the
  file", so it ships as an empty block — C1 and C2 could not drift even in principle, and the
  sibling relationship the feature is *about* is structural rather than maintained by hand.
- **Mirroring with `row-reverse` and `order` instead of moving elements.** The invariant paid off
  immediately: `signal-hunter-geolocation.spec.ts` — which drives the C5 console end to end —
  passed untouched, and so did navigation and campaign-flow. That is the proof that "visual only"
  held; no amount of screenshotting would have shown it.
- **Generating the two things that were long blocks of near-identical values.** The 24 `@font-face`
  declarations and both 24-token equipment ramps came out of scratchpad scripts (phase-8 retro item
  4). The ramps are a fixed darken + hue-bias mix off the base grey ramp, so the relative steps
  between tokens — several of which are gradient partners — are preserved by construction rather
  than by care.
- **Asserting relationships, not just values.** The E2E spec ends with
  `structural(C5) === structural(C4)`, `structural(C2) === structural(C1)`, and
  `structural(C4) !== structural(C1)`. Those three lines are the actual product requirement; per-
  campaign assertions alone would pass happily while the pairs drifted apart.
- **Geometry in the probe, not appearance.** `sidebar.x > canvas.x`, `tabBar.y > content.y`,
  `satellites.y < stations.y` are cheap, stable, and say exactly what the feature claims.
- **The live check earned its keep again.** Type-check was clean and 4,691 unit tests passed
  against a build that did not compile at all in the browser (below). Nothing in the unit suite can
  see a webpack loader failure.

## What the playtest changed

Four things only became visible once it was running, which is the whole argument for the live
sweep being non-optional:

- **Moving navigation was wrong, twice.** The sidebar on the right read as broken rather than
  different; so did the tab strip along the bottom. Both were built, seen, and reverted. A
  navigation rail belongs where every other rail the operator has used sits, and tabs head a
  workspace — relocating either costs orientation on every single interaction, while the "different
  system" payoff lands once, on first sight. The command bar mirroring survived and carries the
  signal on its own. Reverting also deleted the collateral those moves had needed (chevron flip,
  tooltip direction, an inverted active-tab border), so the variant got *smaller* twice.
  The general form: **spend novelty on chrome, not on where the operator's hand already goes.**
- **The classification strip was accent-colored, which was a category error.** Classification
  markings are a published convention: green means Unclassified to everyone who has sat at one of
  these consoles. Tying it to the campaign accent made it decoration. It now takes AstroUX colors,
  bands top and bottom, and the whole ladder (CUI → TS//SCI) is tokenized in `:root` next to
  `--mc-danger*`, under the same "campaigns must not override this" rule.
- **Line weight was an axis I had left on the table.** 2px panel rules against the base 1px
  separates the consoles even in grayscale, and cost one token.
- **The world map's visibility circle was one layer doing two jobs.** It drew a ring around each
  ground *station*, sized by the satellite's altitude. At LEO that is a plausible 20° pass-planning
  ring; at GEO it is a fixed 76° blob over the site, and it reads as a claim about the sensor —
  "this station can see to northern Japan". Splitting it fixed the ambiguity: satellite coverage
  rides the sub-point (blue, default on), station access rides the station (amber, opt-in, only on
  the focused-satellite tab where "access to *what*" has an answer). Worth noting what is *not* a
  candidate: an antenna's actual field of view is a 0.5–2° pencil beam, sub-pixel at world scale —
  a station-centered circle can honestly show access, never FOV. Pre-existing defect (C5 and C3 had
  it too), invisible until a GEO target put a 76° circle on a one-site map.
- **Campaign 4 had no 2D map, and the reason was in the data, not the UI.** COBALT-4 was a fixed
  `Satellite` with no ephemeris, so there was nothing to plot. Its authored az 175 / el 30 was also
  not physically realizable — a GEO bird at azimuth 175 from 34°N is at 50.4° elevation, not 30°.
  Authoring a real GEO TLE (slot 115.1°W, `scripts/author-tle-ccs.mjs`) fixed both at once: the
  target now appears on the world map and ground track like Campaign 5's SENTRY birds, and the
  geometry is self-consistent. Campaign 5, meanwhile, already had the map — the report covered both
  campaigns, but only one of them was actually missing anything.

## What didn't

- **`url('/fonts/…')` in CSS is a module request to css-loader, not a server path.** The build
  failed with `Can't resolve '/fonts/roboto-latin-300-normal.woff2' in .../src` for all twelve
  files, and the app never mounted. Fixed with `url: { filter: (url) => !url.startsWith('/') }` on
  the css-loader options. Worth knowing generally: any root-relative asset URL added to CSS in this
  repo needs that filter, or the file has to be imported through webpack instead of copied.
- **Playwright's `reuseExistingServer` hid the fix.** The re-run after the loader change failed
  with the identical error, which read as "the fix didn't work" — the dev server from the previous
  run was still up on 3000 with the old config. A webpack config change needs the server killed;
  nothing in the harness restarts it.
- **A hand-rolled module mock froze the collaborator's surface.** `test/router.test.ts` mocked
  `CampaignManager.getInstance()` as `{ registerCampaign }`. Adding a `getCampaign()` call to the
  router broke five tests with `getCampaign is not a function` — a failure about the mock, not
  about the code. The fix was to teach the mock the new method and then use it properly: the added
  body-class tests swap the return value per test to cover tactical, the `standard` fallback, stale
  class removal, and the no-campaign route.
- **I nearly left campaign hue inside a shared variant block.** C3's rules carried literal
  `rgba(34, 211, 238, …)` cyan. Re-keyed to `chrome-sdr` they would have been a second campaign's
  color waiting to be inherited by the first campaign that wore the variant. Substituting
  `rgba(var(--mc-accent-red-rgb), …)` is provably identical today and keeps the layer honest.
- **The `--mc-input-well` token exists only because of that cleanup.** One `#060b0e` literal had no
  var to hide behind, so it got a token declared on the campaign and consumed with a fallback. Fine,
  but it is a reminder that "tokenize the structure" and "tokenize the color" are two different
  passes and the second one finds stragglers.

## What to change next time

1. **Restart the dev server after touching `webpack.config.js`.** Playwright reuses it, and a stale
   server reports the *old* build's errors — indistinguishable from a fix that failed.
2. **Grep the test mocks before adding a call to a singleton.** `vi.mock` factories in this repo are
   partial by construction; a new method on an existing collaborator is a breaking change to every
   file that mocked it.
3. **Keep variant blocks hue-free.** `rgba(var(--mc-accent-red-rgb), α)`, never a literal. The test
   for whether a rule belongs in a variant is "would this be right if a differently-colored campaign
   wore it?"
4. **Prove a font arrived, don't read `font-family`.** Computed style reports the declared stack
   whether or not a single byte loaded. `document.fonts` entries with `status === 'loaded'` plus the
   response status codes is the check; it also confirmed zero requests to googleapis/gstatic.
5. **When two things must stay siblings, assert the equality directly.** Cheaper than reviewing two
   screenshots side by side, and it fails on the day someone tunes one of the pair.
6. **Check whether a "missing feature" is missing data before touching the UI.** C4's absent map
   was one unauthored TLE, and chasing it surfaced a geometry error in the scenario that had been
   sitting there since the campaign was written. A UI-side workaround would have plotted the target
   in the wrong place and buried the real defect.
7. **Difference that fights convention reads as breakage, not as identity.** Mirroring the command
   bar says "different system"; mirroring the navigation rail, or moving the tabs, says "something
   is wrong with this build". Both were tried and both came back out.
8. **Re-check the RF numbers after changing the geometry they were authored against.** Giving
   COBALT-4 a real orbit moved its look angles by 0.4°, which is most of a 5 m dish's 0.56° beam:
   the jam antenna's parked position was still the rounded 175/50 and beacon C/N fell from 0.7 dB
   to −12.1 dB. Nothing failed — the objective tolerance is 3° — so only reading the live dashboard
   caught it. The site now parks on the true angles (174.9/50.4) and C/N is back to 0.8 dB.

## Follow-ups not done

- **C2 and C3 faceplates are unchanged** — C2 still base grey, C3 still cyan. Deliberate; this pass
  authored C4/C5 only.
- **`'Inter'` is referenced throughout the CSS and has never been fetched**, so body text runs on a
  system fallback in every campaign. Adopting or removing it changes C1's type and did not belong in
  a phase about C4/C5.
- **Only Roboto Condensed 400/700 are vendored.** A tactical rule asking for 300 or 500 will get a
  synthesized weight; add the files if that comes up.
- **The campaign selection page at `/` still cannot be themed** (all five campaigns at once, no body
  class) — unchanged since phase 8.
- **C4/C5 scenario cards still point at the NATS campaign image**, so the scenario list shows the
  "IMAGE NOT FOUND" placeholder. Pre-existing, visible in every screenshot of that page, and now
  more conspicuous next to a finished-looking theme.
- **No tactical scenario mounts the contact timeline deck yet.** The strip was verified against a
  deck-enabled scenario by forcing the class on at runtime (page height unchanged at 870px, no
  overflow), not by a real scenario.
