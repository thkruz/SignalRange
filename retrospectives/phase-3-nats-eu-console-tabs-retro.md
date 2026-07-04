# Retrospective — nats-eu (Campaign 2) operator console tabs

**Scope:** Wired the four operator-facing Mission Control console tabs deferred from the phase-2 mechanics build, making the `nats-eu-sandbox` fully click-through playable. Every mechanic (M1–M8) can now be driven by a human in-app: M1/M2/M3/M5/M6/M7 via the new tabs, M4/M8 time-driven as before.

## What was built

- **4 new gated tabs** in `src/pages/mission-control/tabs/` (ts + css each), all following the `EaAssessmentTab` conventions (BaseElement, `domCache_`, bound `Events.UPDATE` handler with throttle, `activate`/`deactivate`/`dispose`):
  - `link-budget-tab` (M1) — Friis worksheet inputs → Compute → acceptance badge; live achieved C/N from the active modem (`receiver.getSnrForModem`, the same read as the `receiver-snr-threshold` condition) → Commit Link → margin badge. Keyed per ground station (needs the receiver).
  - `commanding-tab` (M2/M5) — Doppler-comp switch, command-window badge, COMSEC key lifecycle (begin/complete rotation), **guarded zeroize** (arm switch enables the button — zeroize is irreversible), canned command buttons + manual-id send, command log with reject reasons.
  - `contact-schedule-tab` (M3) — per-contact station selects, live conflict list, plan-status badge (VALID / CONFLICTS / INCOMPLETE). Purely action-driven; no sim-tick listener at all.
  - `security-console-tab` (M6+M7) — audit log with per-entry Flag buttons + Mark Reviewed, access-control account selects, TRANSEC panel (mode select, load/drop hop-set key, sync badge). Panels render per settings block, so a transec-only scenario gets just the TRANSEC card.
- **Tab registration** in `tabbed-canvas.ts` gated on `settings.linkBudget` / `commanding` / `contactSchedule` / `security || transec` — the exact `geolocation`/`electronicAttack` opt-in pattern, so the legacy nats campaign (which declares none of these) is provably unaffected.
- **Small engine additions** (backward-compatible, opt-in block only): `CommandingConfig.commands` (canned command list for one-click sends), `CommandingManager.getConfig()` and `isWindowOpen()`; sandbox got three canned TT&C commands.
- **Tests:** `test/pages/mission-control/tabs/nats-eu-console-tabs.test.ts` (6 tests) drives each tab through REAL DOM clicks against the real sandbox settings and asserts the exact manager predicates the condition evaluators read — the click-through proof in CI. Plus 3 gating tests in `tabbed-canvas.test.ts` (absent by default, present with blocks, transec-only case) and window/commands assertions in the mechanics test.

## What worked

- Copying `EaAssessmentTab` structurally (badge CSS included) made each tab mechanical to write; type-check and all 6 DOM tests passed on the first run.
- Event delegation (one listener on the tbody/panel, `closest('[data-*]')`) for row buttons and selects means re-rendering rows never orphans listeners.
- Rebuilding audit-log rows **only when the visible-entry count changes** avoids churning flag buttons under the user's cursor while still surfacing time-scheduled entries.
- The DOM-level test file mirrors the engine mechanics test one-for-one (same worksheet numbers, same command ids), so a green pair proves UI → manager → condition end to end.

## What didn't / watch-outs

- No `--mc-success-*` variable exists; the established convention is hard-coded `#22c55e` green + semantic `--mc-danger-*` red per-tab. Followed it, but the badge CSS is now duplicated in a fifth file (see below).
- `CommandingManager`/`SecurityConsoleCore` keep private wall-clock mission clocks; the UI can only ask (`isWindowOpen()`, `getVisibleLog()`), not display a countdown. Fine for now, but a scored scenario with a tight command window may want a visible T-minus.
- The commit-link flow reads C/N from `receivers[0]`'s **active modem** only — matches the condition default, but multi-receiver stations would need a selector.
- ESLint's flat config ignores `src/` entirely (pre-existing); type-check + vitest are the only enforcement gates.

## What to change next time

- Extract the shared pill-badge CSS (now copied in gps-timing, ea-assessment, link-budget, commanding, contact-schedule, security-console) into one `--mc-*`-based utility stylesheet.
- Consider a small `ConsoleTab` base class capturing the repeated boilerplate (throttled UPDATE sync, `cache_`, activate/deactivate/dispose) before the next gated console lands.
