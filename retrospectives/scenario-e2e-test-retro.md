# Retrospective: Scenario 1 E2E Test Implementation

## What Worked

### 1. Quiz System Understanding
The key insight was that **quizzes are NOT auto-shown**. The `status-check` condition registers a quiz with `QuizManager`, but users must click either:
- The **pending quiz indicator** (`.pending-quiz-indicator__open-btn`)
- The **"?" button** in the checklist (`.condition-quiz-btn`)

This is documented in `objectives-manager.ts:1781-1782`:
```typescript
// Note: Quiz is NOT shown immediately - pending indicator appears instead
// User must click the indicator or "?" button to open the quiz
```

### 2. Answer Matching by Text (Not Index)
Quiz options are **shuffled** at display time. The test must match answers by text content, not by index position:
```typescript
const option = quizModal.locator('.quiz-option-btn', { hasText: answerText });
```

### 3. Robust Quiz Opening Strategy
The `waitForQuizToAppear()` helper tries multiple approaches in order:
1. Check if quiz is already visible (3s timeout)
2. Click pending indicator if visible (5s timeout)
3. Click checklist quiz button if visible (5s timeout)
4. Final wait with full timeout

### 4. Dialog Dismissal Between Objectives
After each objective completes, a character dialog may appear. Must dismiss with `dismissDialogIfPresent()` before proceeding to next quiz.

## What Didn't Work Initially

### Quiz Modal Never Appearing
First test run failed because we waited for `#quiz-modal` to appear automatically. The quiz system requires user interaction to show the modal.

**Fix**: Added logic to click the pending quiz indicator first.

## Key Selectors Reference

| Element | Selector |
|---------|----------|
| Quiz modal | `#quiz-modal, .quiz-box` |
| Quiz options | `.quiz-option-btn` |
| Quiz continue button | `#quiz-continue-btn` |
| Pending quiz indicator | `.pending-quiz-indicator__open-btn` |
| Checklist quiz button | `.condition-quiz-btn` |
| Dialog overlay | `.dialog-overlay.dialog-visible` |
| Level Complete modal | `#level-complete-modal` |
| Score display | `.total-value` |

## Replicating for Other Scenarios

### Step 1: Extract Correct Answers from Scenario File
Look at each objective's `conditions` array. For `status-check` conditions:
```typescript
{
  type: 'status-check',
  params: {
    options: ['Answer A', 'Answer B', 'Answer C', 'Answer D'],
    correctIndex: 0,  // <- This tells you which option is correct
  }
}
```

Create an array of objectives with their correct answer **text** (not index):
```typescript
const SCENARIO_N_OBJECTIVES = [
  { id: 'objective-id', correctAnswer: 'Full text of correct option' },
  // ...
];
```

### Step 2: Handle Special First Objective Conditions
Some scenarios have prerequisites before the quiz:
- **Scenario 1**: Open mission brief (`mission-brief-opened` condition)
- Other scenarios may require: selecting a ground station, opening a specific tab, etc.

Check the first objective's conditions and add corresponding setup steps.

### Step 3: Test Structure Template
```typescript
test.describe('Scenario N Full Completion', () => {
  test('completes all objectives', async ({ page, campaignSelectionPage, scenarioSelectionPage, missionControlPage }) => {
    test.setTimeout(300000); // 5 minutes

    // Navigate through campaign selection
    await campaignSelectionPage.goto();
    await campaignSelectionPage.selectCampaign('nats');
    await scenarioSelectionPage.startScenario('nats-scenarioN');
    await waitForSimulationReady(page);
    await missionControlPage.dismissDialogIfPresent();

    // Handle any special first-objective prerequisites
    // e.g., await missionControlPage.openMissionBrief();

    // Complete each objective
    for (const objective of SCENARIO_N_OBJECTIVES) {
      await waitForQuizToAppear(page);
      await answerQuizByText(page, objective.correctAnswer);
      await dismissDialogIfPresent(page);
      await page.waitForTimeout(300);
    }

    // Verify completion
    await expect(page.locator('#level-complete-modal')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.complete-modal__title')).toContainText('Mission Complete');
  });
});
```

### Step 4: Non-Quiz Objectives
Some scenarios have objectives with equipment interaction conditions (not just `status-check`):
- `antenna-locked` - Requires operating equipment
- `signal-detected` - Requires RF chain setup
- `tab-active` - Requires clicking specific tabs

For these, add steps to interact with equipment panels before/during the objective.

## Timing Considerations

| Action | Recommended Wait |
|--------|------------------|
| After simulation load | 2000ms (in `waitForSimulationReady`) |
| After answering quiz | 500ms |
| Between objectives | 300ms |
| Dialog dismiss timeout | 2000ms initial check |
| Full test timeout | 300000ms (5 minutes) |

## Files Modified

- `e2e/utils/simulation-helpers.ts` - Added `waitForQuizToAppear`, `answerQuizByText`, `dismissDialogIfPresent`
- `e2e/specs/scenario1-full-completion.spec.ts` - New test file

## What to Change Next Time

1. **Consider parameterized tests**: Could create a single test that takes scenario data as a parameter
2. **Add visual regression**: Screenshot at Level Complete modal to catch UI changes
3. **Test wrong answers**: Verify point penalties work correctly
4. **Test timeout scenarios**: Verify objective failure when time runs out
