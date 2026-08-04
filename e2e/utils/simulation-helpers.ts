import { Page, expect } from '@playwright/test';

/**
 * Wait for the simulation to initialize and stabilize.
 * The app has async initialization in MissionControlPage.
 */
export async function waitForSimulationReady(page: Page): Promise<void> {
  // Wait for the app shell to be visible
  await expect(page.locator('#app-shell-page')).toBeVisible({ timeout: 15000 });

  // Wait for ground stations to appear in the asset tree
  const gsItems = page.locator('[data-asset-type="ground-station"], .ground-station-item, .asset-tree-item');
  await expect(gsItems.first()).toBeVisible({ timeout: 15000 });

  // Give the simulation time to start the game loop
  await page.waitForTimeout(2000);
}

/**
 * Wait for a specific DOM state in the simulation.
 * Useful for waiting on equipment state changes.
 */
export async function waitForDomState(
  page: Page,
  selector: string,
  expectedText: string,
  timeout = 30000
): Promise<void> {
  await page.waitForFunction(
    ({ sel, text }) => {
      const element = document.querySelector(sel);
      return element?.textContent?.includes(text) ?? false;
    },
    { sel: selector, text: expectedText },
    { timeout }
  );
}

/**
 * Wait for an objective to become active.
 */
export async function waitForObjectiveActive(page: Page, objectiveId: string): Promise<void> {
  await page.waitForFunction(
    (id) => {
      const objective = document.querySelector(`[data-objective-id="${id}"]`);
      return objective?.classList.contains('active') ?? false;
    },
    objectiveId,
    { timeout: 30000 }
  );
}

/**
 * Wait for an objective to be completed.
 */
export async function waitForObjectiveCompleted(page: Page, objectiveId: string): Promise<void> {
  await page.waitForFunction(
    (id) => {
      const objective = document.querySelector(`[data-objective-id="${id}"]`);
      // The element must EXIST before its state means anything: without this
      // guard a missing objective resolved as `undefined !== null` -> true,
      // so a typo'd id or an unrendered checklist passed instantly.
      if (!objective) return false;
      return objective.classList.contains('completed') ||
        objective.querySelector('.completed') !== null;
    },
    objectiveId,
    { timeout: 30000 }
  );
}

/**
 * Wait for a dialog/modal to appear.
 */
export async function waitForDialog(page: Page): Promise<void> {
  await page.locator('.dialog-box, .scenario-dialog, .modal-confirm').waitFor({ state: 'visible', timeout: 10000 });
}

/**
 * Dismiss any visible dialog.
 */
export async function dismissDialog(page: Page): Promise<void> {
  const dialog = page.locator('.dialog-box, .scenario-dialog');
  if (await dialog.isVisible()) {
    const closeButton = dialog.locator('.close-btn, button:has-text("Continue"), button:has-text("OK")').first();
    await closeButton.click();
    await expect(dialog).not.toBeVisible();
  }
}

/**
 * Clear browser storage to start fresh.
 */
export async function clearStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

/**
 * Wait for the quiz modal to appear and answer it.
 * @param optionIndex 0-based index of the correct answer
 */
export async function answerQuiz(page: Page, optionIndex: number): Promise<void> {
  const quizModal = page.locator('.quiz-modal');
  await expect(quizModal).toBeVisible({ timeout: 10000 });

  const options = quizModal.locator('.quiz-option');
  await options.nth(optionIndex).click();

  const continueButton = quizModal.locator('.quiz-continue-btn, .quiz-submit-btn, button:has-text("Continue")');
  await continueButton.click();

  // Wait for quiz to close or show result
  await page.waitForTimeout(500);
}

/**
 * Check if an element exists and is visible.
 */
export async function isVisible(page: Page, selector: string): Promise<boolean> {
  const element = page.locator(selector);
  try {
    await expect(element).toBeVisible({ timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for the quiz modal to appear.
 * If the quiz isn't auto-shown, clicks the pending quiz indicator to open it.
 */
export async function waitForQuizToAppear(page: Page, timeout = 30000): Promise<void> {
  const quizModal = page.locator('#quiz-modal, .quiz-box');

  // First check if quiz is already visible
  try {
    await expect(quizModal).toBeVisible({ timeout: 3000 });
    return;
  } catch {
    // Quiz not visible, try to open via pending indicator
  }

  // Click the pending quiz indicator if visible
  // Be more specific to avoid matching wrong buttons
  const pendingIndicator = page.locator('.pending-quiz-indicator__open-btn');
  try {
    await expect(pendingIndicator).toBeVisible({ timeout: 5000 });
    await pendingIndicator.click();
    await expect(quizModal).toBeVisible({ timeout: 5000 });
    return;
  } catch {
    // Pending indicator class not found, try generic Open Quiz button
  }

  // Try the generic "Open Quiz" button in the pending quiz toast (bottom left)
  const openQuizBtn = page.locator('.pending-quiz-toast button:has-text("Open Quiz"), .toast button:has-text("Open Quiz")');
  try {
    await expect(openQuizBtn.first()).toBeVisible({ timeout: 3000 });
    await openQuizBtn.first().click();
    await expect(quizModal).toBeVisible({ timeout: 5000 });
    return;
  } catch {
    // Toast button not found, try checklist
  }

  // Try clicking quiz button in checklist
  const checklistQuizBtn = page.locator('.condition-quiz-btn, .quiz-btn, [data-quiz-btn]');
  try {
    await expect(checklistQuizBtn.first()).toBeVisible({ timeout: 5000 });
    await checklistQuizBtn.first().click();
    await expect(quizModal).toBeVisible({ timeout: 5000 });
    return;
  } catch {
    // Still no quiz, wait for it with full timeout
  }

  // Final attempt - just wait for the quiz modal
  await expect(quizModal).toBeVisible({ timeout });
}

/**
 * Answer a quiz by finding the option with matching text content.
 * This handles shuffled quiz options by matching text rather than index.
 * @param answerText The text content of the correct answer option
 */
export async function answerQuizByText(page: Page, answerText: string): Promise<void> {
  const quizModal = page.locator('#quiz-modal, .quiz-box');
  await expect(quizModal).toBeVisible({ timeout: 10000 });

  const optionButtons = quizModal.locator('.quiz-option-btn');
  await expect(optionButtons.first()).toBeVisible({ timeout: 10000 });

  const normalize = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();

  const toWordSet = (value: string): Set<string> => {
    const cleaned = normalize(value).replace(/[^a-z0-9\s-]/g, ' ');
    return new Set(cleaned.split(/\s+/g).filter(Boolean));
  };

  const answerNorm = normalize(answerText);
  const answerWords = toWordSet(answerText);

  const optionTexts = await optionButtons.allTextContents();

  let bestIndex = -1;
  let bestScore = -1;

  for (let i = 0; i < optionTexts.length; i++) {
    const optionText = optionTexts[i] ?? '';
    const optionNorm = normalize(optionText);

    // Fast path: substring match ignoring whitespace/punctuation variants.
    if (optionNorm.includes(answerNorm) || answerNorm.includes(optionNorm)) {
      bestIndex = i;
      bestScore = Number.POSITIVE_INFINITY;
      break;
    }

    // Fallback: token overlap (helps when copy is tweaked slightly).
    const optionWords = toWordSet(optionText);
    if (answerWords.size === 0 || optionWords.size === 0) continue;

    let overlap = 0;
    for (const w of answerWords) {
      if (optionWords.has(w)) overlap++;
    }

    const score = overlap / Math.max(answerWords.size, optionWords.size);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  // Require a minimum similarity unless we hit the fast-path.
  if (!Number.isFinite(bestScore) && bestIndex < 0) {
    throw new Error(`No quiz options found (answer: ${answerText})`);
  }

  if (bestScore !== Number.POSITIVE_INFINITY && bestScore < 0.45) {
    const available = optionTexts.map((t) => `- ${t.trim()}`).join('\n');
    throw new Error(
      `Could not match quiz answer.\nAnswer: ${answerText}\nOptions:\n${available}`
    );
  }

  await optionButtons.nth(bestIndex).click();

  // Wait for the continue button to appear and click it
  // Exclude quiz option buttons that might contain text matching "Continue" (e.g., "continues")
  const continueButton = quizModal.locator(
    '#quiz-continue-btn, .quiz-continue-btn, .quiz-submit-btn, button:has-text("Continue"):not(.quiz-option-btn)'
  );
  await expect(continueButton.first()).toBeVisible({ timeout: 5000 });
  await continueButton.first().click();

  // Wait for quiz to process the answer
  await page.waitForTimeout(500);
}

/**
 * Dismiss dialog overlay if present.
 * Used to dismiss objective completion dialogs between quizzes.
 */
export async function dismissDialogIfPresent(page: Page): Promise<void> {
  const dialogOverlay = page.locator('.dialog-overlay.dialog-visible');
  try {
    if (await dialogOverlay.isVisible({ timeout: 2000 })) {
      const closeBtn = dialogOverlay.locator('button:has-text("Continue"), button:has-text("OK"), .close-btn, .dialog-close').first();
      if (await closeBtn.isVisible({ timeout: 1000 })) {
        await closeBtn.click();
        await expect(dialogOverlay).not.toBeVisible({ timeout: 5000 });
      }
    }
  } catch {
    // No dialog present, continue
  }
}
