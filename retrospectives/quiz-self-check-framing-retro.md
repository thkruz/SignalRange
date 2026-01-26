# Retrospective: Quiz Self-Check Framing for Solo Scenarios

**Date:** 2026-01-25
**Feature:** Added `Character.SYSTEM` to support quizzes without NPC attribution

## Summary

Implemented a way to present quiz questions in solo scenarios (like Scenario 8: Night Shift) where no NPC is present to "ask" the questions. Instead of showing "Charlie Brooks asks:", the quiz now shows "Knowledge Check" with a `?` icon and "Verify your understanding" subtext.

## What Worked

1. **Reusing the existing `character` parameter** - Rather than adding a new parameter like `framing` or `hideCharacter`, extending the Character enum with a `SYSTEM` value kept the API simple. Scenarios just set `character: Character.SYSTEM` like they would any other character.

2. **Conditional header rendering** - Rebuilding the header HTML in `renderQuiz_()` based on character type was cleaner than trying to hide/show individual elements. The two rendering paths (NPC vs SYSTEM) are clearly separated.

3. **Minimal CSS changes** - Only needed one new class (`.quiz-self-check-icon`) that reuses existing CSS variables for consistent styling.

4. **Type safety** - TypeScript's exhaustive checking on Record types forced us to add entries for `SYSTEM` in all character lookup tables, preventing runtime errors.

## What Didn't Work

1. **Initial plan considered multiple approaches** - Spent exploration time evaluating `framing` parameter vs `Character.SYSTEM` vs `hideCharacter` boolean. In hindsight, the enum extension was clearly the simplest approach and could have been chosen faster.

2. **Manual edits for 12 status-check conditions** - Adding `character: Character.SYSTEM` to each condition in scenario8.ts was repetitive. A find-and-replace or batch edit would have been faster than 12 individual Edit tool calls.

## What to Change Next Time

1. **For repetitive edits**, consider using a single Edit with `replace_all: true` if the pattern is consistent, or batch multiple related changes into fewer edits.

2. **When extending enums for "special" values**, document clearly that this is a sentinel/marker value, not a real entity. The JSDoc comment helps but could be more prominent.

3. **Consider creating a helper** - If more scenarios need self-check quizzes, could add a `createSelfCheckCondition()` helper that pre-fills `character: Character.SYSTEM` to reduce boilerplate.

## Files Changed

- `src/modal/character-enum.ts` - Added `Character.SYSTEM` enum value
- `src/modal/quiz-modal.ts` - Conditional rendering for SYSTEM mode
- `src/modal/quiz-modal.css` - Added `.quiz-self-check-icon` styles
- `src/campaigns/nats/scenario8.ts` - Added character param to 12 conditions
