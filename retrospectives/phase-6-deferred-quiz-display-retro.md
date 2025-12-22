# Retrospective: Deferred Quiz Display with Continue Flow

## Summary
Implemented a non-obstructive quiz system where quizzes don't appear immediately when objectives activate. Instead, a pending indicator appears after 15 seconds, and users must explicitly interact to view and complete quizzes.

## What Worked

1. **Event-driven architecture made changes clean** - The existing EventBus pattern allowed adding a new `QUIZ_PENDING` event without modifying unrelated code. Each component (QuizManager, PendingQuizIndicator, QuizModal) could respond independently.

2. **Separation of concerns paid off** - The QuizManager handles state, QuizModal handles UI, and PendingQuizIndicator handles notifications. This made it easy to modify each piece without breaking others.

3. **Incremental implementation** - Breaking the work into 5 clear steps (add event, remove immediate show, emit on register, update indicator, gate completion) made progress trackable and reversible.

4. **Existing pending indicator infrastructure** - The `PendingQuizIndicator` class already existed for dismissed quizzes, so extending it to handle initial pending state was straightforward.

## What Didn't Work

1. **Initial plan didn't account for delay requirement** - The 15-second delay was added after the main implementation. Could have asked about timing preferences upfront during planning.

2. **Close behavior edge case missed initially** - Forgot to handle the case where user closes the quiz window after answering correctly but before clicking Continue. Required a follow-up fix to emit the pending answer on close.

3. **Message text iteration** - Started with "Quiz available - click to open" then changed to "Complete the quiz to continue" - should have clarified the desired UX copy earlier.

## What to Change Next Time

1. **Ask about timing/delays early** - When implementing notification-style features, explicitly ask about timing preferences (immediate vs delayed, duration, etc.) during planning.

2. **Map all close/dismiss paths** - When adding gated interactions (like requiring Continue), enumerate all ways a user can exit the flow and ensure each path is handled correctly.

3. **Clarify copy/messaging upfront** - Include specific text strings in the plan so they can be approved before implementation.

4. **Consider timeout cleanup holistically** - When adding timeouts, immediately add cleanup in all relevant lifecycle methods (dispose, completion handlers, etc.) rather than as afterthoughts.

## Files Modified

- `src/events/events.ts` - Added `QUIZ_PENDING` event and `QuizPendingData` interface
- `src/objectives/objectives-manager.ts` - Removed immediate `showQuiz()` call
- `src/modal/quiz-manager.ts` - Emit `QUIZ_PENDING` on register, set pending key
- `src/modal/pending-quiz-indicator.ts` - Listen for `QUIZ_PENDING`, 15s delay, timeout management
- `src/modal/quiz-modal.ts` - Gate completion behind Continue click, handle close-after-correct
