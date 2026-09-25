import { expect, Locator, Page } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { waitForQuizToAppear } from './simulation-helpers';

/**
 * Shared helpers for the Campaign 5 (Signal Hunter) full-completion specs.
 *
 * The geolocation console only correlates while the duty-cycled interferer is
 * transmitting (>= 70% of the integration window), so the capture helpers
 * here track the interferer's on/off phase and start captures inside the
 * on-window instead of retrying blind across cycles.
 *
 * Interferer state is read through the window.debugObjective dev hook: the
 * `evaluatesNow` field of a signal-detected condition is the live "interferer
 * present at the analyzer" answer, independent of the observation gate, so
 * it works as an ON/OFF probe before and after the objective completes.
 *
 * Off-windows are skipped with window.advanceClock (one clock, so the interferer schedule, the capture integration clock, and
 * the satellite geometry all agree). Jumps happen only BETWEEN captures: the
 * console counts on-time in update ticks across the integration, and a jump
 * inside one would end it with almost no ticks.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

/** Interferer duty-cycle description used to plan captures */
export interface DutyCycle {
  onSeconds: number;
  periodSeconds: number;
}

/** Phase tracker state shared across capture calls within one page session */
export interface InterfererPhase {
  /** Mission-clock ms (Date.now() + skipped) at which the last observed on-window began */
  onStartMs: number | null;
}

/** Everything the capture helpers need to plan captures against the duty cycle */
export interface CaptureContext {
  page: Page;
  phase: InterfererPhase;
  /** Objective whose signal-detected condition serves as the ON/OFF probe */
  probeObjectiveId: string;
  duty: DutyCycle;
  /** Correlator integration window, s */
  windowS: number;
  log?: (line: string) => void;
}

/** Console fix summary, parsed from #geo-fix-summary */
export interface FixSummary {
  lat: number;
  lon: number;
  semiMajorKm: number | null;
  semiMinorKm: number | null;
}

interface DebugObjectiveResult {
  error?: string;
  isActive?: boolean;
  isCompleted?: boolean;
  conditions?: Array<{ type: string; evaluatesNow: boolean; isSatisfied: boolean; observed: boolean | null }>;
}

/** Great-circle distance between two lat/lon points, km (haversine) */
export function greatCircleKm(a: LatLon, b: LatLon): number {
  const R = 6371.0088;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Parse "35.170°, -103.720° · ±12×5 km (95%)" into its parts; null when no fix */
export function parseFixSummary(text: string): FixSummary | null {
  const coord = /(-?\d+\.\d+)°, ?(-?\d+\.\d+)°/.exec(text);
  if (!coord) {
    return null;
  }
  const ellipse = /±(\d+)×(\d+)\s*km/.exec(text);
  return {
    lat: parseFloat(coord[1]),
    lon: parseFloat(coord[2]),
    semiMajorKm: ellipse ? parseInt(ellipse[1], 10) : null,
    semiMinorKm: ellipse ? parseInt(ellipse[2], 10) : null,
  };
}

/** window.debugObjective('<id>') dump, for diagnostics and the ON/OFF probe */
export async function debugObjective(page: Page, objectiveId: string): Promise<DebugObjectiveResult> {
  return page.evaluate((id) => {
    const hook = (window as unknown as { debugObjective?: (id: string) => DebugObjectiveResult }).debugObjective;
    return hook ? hook(id) : { error: 'debugObjective hook missing' };
  }, objectiveId);
}

/**
 * Whether the interferer is on the air right now, read as the live evaluation
 * of the named objective's signal-detected condition.
 */
export async function isInterfererOn(page: Page, probeObjectiveId: string): Promise<boolean> {
  const dump = await debugObjective(page, probeObjectiveId);
  const condition = dump.conditions?.find((c) => c.type === 'signal-detected');
  if (!condition) {
    throw new Error(`No signal-detected condition on '${probeObjectiveId}': ${JSON.stringify(dump)}`);
  }
  return condition.evaluatesNow;
}

/** Mission-clock now (scenario-elapsed ms) as the page sees it */
export async function missionNowMs(page: Page): Promise<number> {
  return page.evaluate(() => {
    const hooks = window as unknown as { missionElapsedMs?: () => number };
    return hooks.missionElapsedMs?.() ?? 0;
  });
}

/** Skip the clock forward by `deltaMs` and let one update tick run */
export async function advanceMissionClockMs(page: Page, deltaMs: number, settleMs = 250): Promise<void> {
  if (deltaMs <= 0) {
    return;
  }
  await page.waitForFunction(() => typeof (window as any).advanceClock === 'function');
  await page.evaluate((ms) => (window as any).advanceClock(ms), deltaMs);
  await page.waitForTimeout(settleMs);
}

/**
 * Bring the scenario to the start of an interferer on-window and return the
 * mission-clock ms at which that window began (accurate to about one scan
 * step plus a tick).
 *
 * With a known phase the helper jumps straight to the next on-window start
 * and verifies with the probe. Without one (first call, or the probe
 * disagreed with the prediction) it scans forward in `stepMs` jumps: through
 * the rest of any current on-window, then through the off-window until the
 * probe flips ON.
 */
export async function ensureOnWindowStart(ctx: CaptureContext, opts: { stepMs?: number; leadMs?: number } = {}): Promise<number> {
  const { page, phase, probeObjectiveId, duty } = ctx;
  const { stepMs = 1000, leadMs = 400 } = opts;
  const periodMs = duty.periodSeconds * 1000;
  const onMs = duty.onSeconds * 1000;

  if (phase.onStartMs !== null) {
    const now = await missionNowMs(page);
    const elapsed = now - phase.onStartMs;
    const cycles = Math.ceil(elapsed / periodMs);
    const nextStart = phase.onStartMs + cycles * periodMs;
    await advanceMissionClockMs(page, nextStart - now + leadMs);
    if (await isInterfererOn(page, probeObjectiveId)) {
      phase.onStartMs = nextStart;
      return nextStart;
    }
    // Prediction drifted: fall through to a fresh scan
    phase.onStartMs = null;
  }

  // Scan out of any current on-window
  let guard = Math.ceil(onMs / stepMs) + 5;
  while (guard-- > 0 && (await isInterfererOn(page, probeObjectiveId))) {
    await advanceMissionClockMs(page, stepMs);
  }
  // Scan through the off-window to the next rising edge
  guard = Math.ceil((periodMs - onMs) / stepMs) + 5;
  while (guard-- > 0 && !(await isInterfererOn(page, probeObjectiveId))) {
    await advanceMissionClockMs(page, stepMs);
  }
  if (!(await isInterfererOn(page, probeObjectiveId))) {
    throw new Error('Interferer never came on the air during the phase scan');
  }
  phase.onStartMs = await missionNowMs(page);
  return phase.onStartMs;
}

/** Number of visible measurement rows, excluding the empty-state placeholder */
export async function measurementCount(page: Page): Promise<number> {
  const placeholder = await page.locator('#geo-measurement-rows td[colspan]').count();
  if (placeholder > 0) {
    return 0;
  }
  return page.locator('#geo-measurement-rows tr').count();
}

/** Click via DOM dispatch, immune to the draggable checklist floating over the console */
export async function domClick(page: Page, selector: string): Promise<void> {
  await page.locator(selector).evaluate((el) => (el as HTMLElement).click());
}

/** Set a console numeric input and fire its change handler */
export async function setConsoleInput(page: Page, selector: string, value: number): Promise<void> {
  await page.locator(selector).evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = String(v);
    input.dispatchEvent(new Event('change'));
  }, value);
}

/**
 * Press CAPTURE once and wait for the integration to resolve. Returns the
 * terminal capture message ("CAPTURE n: ..." on success, "NO CORRELATION ..."
 * or "CORRELATOR FAULT ..." otherwise).
 */
export async function captureOnce(page: Page, windowS: number): Promise<string> {
  const msg = page.locator('#geo-capture-msg');
  await expect(page.locator('#geo-capture-btn')).toBeEnabled({ timeout: 5000 });
  await domClick(page, '#geo-capture-btn');
  await expect(msg).toHaveText(/INTEGRATING/i, { timeout: 3000 });

  const deadline = Date.now() + windowS * 1000 + 8000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(250);
    const text = ((await msg.textContent().catch(() => '')) ?? '').trim();
    if (/^(CAPTURE|NO CORRELATION|CORRELATOR)/.test(text)) {
      return text;
    }
  }
  throw new Error('Capture did not resolve inside the integration window');
}

/**
 * Collect captures until the console holds at least `target` measurements.
 * Captures are started only with enough of the on-window left for the
 * integration (plus the phase-calibration slop), and off-windows are skipped
 * with a clock jump. Returns the final measurement count.
 */
export async function collectCaptures(ctx: CaptureContext, target: number): Promise<number> {
  const { page, duty, windowS } = ctx;
  const log = ctx.log ?? (() => undefined);
  // Slop for the 1 s phase scan + a tick, on top of the full window
  const minRemainingMs = windowS * 1000 + 2500;
  let count = await measurementCount(page);
  let windows = 0;

  while (count < target) {
    if (windows++ > 12) {
      throw new Error(`Needed more than 12 on-windows to reach ${target} captures (have ${count})`);
    }
    const onStart = await ensureOnWindowStart(ctx);
    for (;;) {
      const remaining = duty.onSeconds * 1000 - ((await missionNowMs(page)) - onStart);
      if (count >= target || remaining < minRemainingMs) {
        break;
      }
      const result = await captureOnce(page, windowS);
      count = await measurementCount(page);
      log(`window ${windows} phase +${((duty.onSeconds * 1000 - remaining) / 1000).toFixed(1)}s: ${result} (count=${count})`);
    }
  }
  return count;
}

/** Press COMPUTE FIX and return the parsed summary (throws when no fix appears) */
export async function computeFix(page: Page): Promise<FixSummary> {
  await domClick(page, '#geo-compute-btn');
  const summary = page.locator('#geo-fix-summary');
  await expect(summary).toHaveText(/°,/, { timeout: 5000 });
  const parsed = parseFixSummary(((await summary.textContent()) ?? '').trim());
  if (!parsed) {
    throw new Error('Fix summary had no coordinate pair');
  }
  return parsed;
}

/**
 * Compute a fix and, while it misses `maxErrorKm`, capture `extraPerRound`
 * more measurements and recompute (bounded). Returns the final fix, its
 * great-circle error, and the capture count it was solved from.
 */
export async function computeFixWithin(
  ctx: CaptureContext,
  truth: LatLon,
  maxErrorKm: number,
  opts: { extraPerRound?: number; maxRounds?: number } = {}
): Promise<{ fix: FixSummary; errorKm: number; captures: number }> {
  const { page } = ctx;
  const log = ctx.log ?? (() => undefined);
  const { extraPerRound = 3, maxRounds = 4 } = opts;
  let captures = await measurementCount(page);
  let fix = await computeFix(page);
  let errorKm = greatCircleKm(fix, truth);
  log(`fix from ${captures} captures: ${fix.lat.toFixed(3)}, ${fix.lon.toFixed(3)} -> ${errorKm.toFixed(1)} km (target ${maxErrorKm} km)`);

  for (let round = 0; round < maxRounds && errorKm > maxErrorKm; round++) {
    captures = await collectCaptures(ctx, captures + extraPerRound);
    fix = await computeFix(page);
    errorKm = greatCircleKm(fix, truth);
    log(`fix from ${captures} captures: ${fix.lat.toFixed(3)}, ${fix.lon.toFixed(3)} -> ${errorKm.toFixed(1)} km (target ${maxErrorKm} km)`);
  }
  return { fix, errorKm, captures };
}

/** Answer a SYSTEM status-check quiz (option matched by text) and dismiss its feedback */
export async function answerStatusCheck(page: Page, answerText: string): Promise<void> {
  await waitForQuizToAppear(page);

  const option = page.locator('.quiz-option-btn', { hasText: answerText });
  await expect(option).toBeVisible({ timeout: 10000 });
  await option.click();

  const feedbackContinue = page.locator('#quiz-continue-btn');
  await expect(feedbackContinue).toBeVisible({ timeout: 5000 });
  await feedbackContinue.click();
}

/** A status-check answer keyed by a fragment of its question text */
export interface StatusCheckAnswer {
  question: RegExp;
  answer: string;
}

/**
 * Answer `count` pending status-check quizzes in whatever order the
 * QuizManager surfaces them (the pending key is the LAST registered quiz,
 * and completion promotes the next incomplete one), matching each by its
 * #quiz-question text. Dismisses the feedback panel and any completion
 * dialog / working-document box between quizzes. Returns the questions seen.
 */
export async function answerPendingStatusChecks(page: Page, answers: StatusCheckAnswer[], count: number): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < count; i++) {
    await waitForQuizToAppear(page);
    const question = ((await page.locator('#quiz-question').textContent()) ?? '').trim();
    const match = answers.find((a) => a.question.test(question));
    if (!match) {
      throw new Error(`No answer configured for quiz question: ${question}`);
    }
    seen.push(question);

    const option = page.locator('.quiz-option-btn', { hasText: match.answer });
    await expect(option).toBeVisible({ timeout: 10000 });
    await option.click();

    const feedbackContinue = page.locator('#quiz-continue-btn');
    await expect(feedbackContinue).toBeVisible({ timeout: 5000 });
    await feedbackContinue.click();

    await page.waitForTimeout(500);
    await closeWorkingDocumentIfOpen(page);
  }
  return seen;
}

/**
 * Close the Working Document box if a documentLine quiz just opened it. The
 * box auto-shows on the first entry and floats over the consoles.
 */
export async function closeWorkingDocumentIfOpen(page: Page): Promise<void> {
  const box = page.locator('#draggable-html-box-working-document');
  if (await box.isVisible({ timeout: 1000 }).catch(() => false)) {
    const closeBtn = box.locator('.draggable-box__close-btn, [id$="-close"]').first();
    if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await closeBtn.click();
    }
  }
}

/** The checklist `.objective-item` whose title matches, regardless of collapse */
export function objectiveItem(missionControl: MissionControlPage, title: string): Locator {
  return missionControl.objectivesChecklist.locator('.objective-item', { hasText: title });
}

/** Poll the checklist until the named objective carries the `completed` class */
export async function waitForObjectiveComplete(missionControl: MissionControlPage, title: string, timeout = 45000): Promise<void> {
  if (!(await missionControl.objectivesChecklist.isVisible().catch(() => false))) {
    await missionControl.openChecklist();
  }
  await expect(objectiveItem(missionControl, title)).toHaveClass(/completed/, { timeout });
}
