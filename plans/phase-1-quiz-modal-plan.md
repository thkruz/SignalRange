# Plan: Quiz Modal for Status Verification

## Summary

Add an interactive quiz system to objectives where players must correctly identify equipment status values to complete objectives. This transforms passive observation into active verification.

## Design Decisions

- **Timing**: Quiz is a condition - objective only completes after correct answer
- **Wrong Answers**: Deduct points and allow retry
- **Question Type**: Static pre-defined questions in scenario data

---

## Implementation

### 1. New Condition Type: `status-check`

Add to `src/objectives/objective-types.ts`:

```typescript
export type ConditionType =
  | 'equipment-powered'
  // ... existing types ...
  | 'status-check';  // New quiz-based condition

// New interface for quiz condition params
export interface StatusCheckParams {
  question: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation?: string;
  pointPenalty?: number;  // Points deducted per wrong answer (default: 5)
}
```

### 2. Quiz Modal Component

Create `src/modal/quiz-modal.ts` extending DraggableModal:

```typescript
class QuizModal extends DraggableModal {
  private currentQuiz_: StatusCheckParams | null = null;
  private objectiveId_: string | null = null;
  private attempts_: number = 0;

  showQuiz(objectiveId: string, quiz: StatusCheckParams): void;
  private handleOptionClick_(index: number): void;
  private showFeedback_(isCorrect: boolean, selectedIndex: number): void;
}
```

**Modal Layout:**
- Question text at top
- 4 option buttons (styled as cards)
- Character avatar (Charlie) in corner
- Feedback area for correct/incorrect

### 3. Quiz Manager

Create `src/modal/quiz-manager.ts`:

```typescript
class QuizManager {
  private static instance_: QuizManager | null = null;
  private pendingQuizzes_: Map<string, StatusCheckParams> = new Map();

  // Called when objective becomes active
  registerQuiz(objectiveId: string, quiz: StatusCheckParams): void;

  // Called when quiz is answered correctly
  markQuizComplete(objectiveId: string): void;

  // Check if objective has pending quiz
  hasQuiz(objectiveId: string): boolean;
  isQuizComplete(objectiveId: string): boolean;
}
```

### 4. ObjectivesManager Integration

Modify `src/objectives/objectives-manager.ts`:

```typescript
private evaluateCondition_(condition: ObjectiveCondition, state: GameState): boolean {
  switch (condition.type) {
    // ... existing cases ...

    case 'status-check':
      // Check if quiz has been completed for this objective
      return QuizManager.getInstance().isQuizComplete(this.currentObjectiveId_);
  }
}
```

### 5. EventBus Events

Add to `src/events/events.ts`:

```typescript
// Quiz events
QUIZ_SHOW = 'quiz:show',
QUIZ_ANSWERED = 'quiz:answered',
QUIZ_COMPLETED = 'quiz:completed',

// Event data interfaces
export interface QuizShowData {
  objectiveId: string;
  quiz: StatusCheckParams;
}

export interface QuizAnsweredData {
  objectiveId: string;
  isCorrect: boolean;
  selectedIndex: number;
  attempts: number;
  pointsDeducted: number;
}
```

### 6. Scenario Data Structure

Update scenario1.ts objectives to use quiz conditions:

```typescript
{
  id: 'phase-1-gpsdo',
  title: 'Phase 1: GPSDO Status Check',
  conditions: [
    {
      type: 'status-check',
      description: 'Verify GPSDO Stability Reading',
      params: {
        question: 'What is the current GPSDO stability reading?',
        options: [
          '2×10⁻¹¹ (Excellent)',
          '5×10⁻¹⁰ (Poor)',
          '1×10⁻⁸ (Degraded)',
          'No reading available'
        ],
        correctIndex: 0,
        explanation: 'The stability reading of 2×10⁻¹¹ indicates excellent frequency accuracy.',
        pointPenalty: 5
      },
      mustMaintain: false,
    },
  ],
}
```

---

## Files to Create

1. `src/modal/quiz-modal.ts` - Quiz modal component
2. `src/modal/quiz-modal.css` - Quiz styling
3. `src/modal/quiz-manager.ts` - Quiz state management

## Files to Modify

1. `src/objectives/objective-types.ts` - Add `status-check` condition type
2. `src/objectives/objectives-manager.ts` - Evaluate `status-check` conditions
3. `src/events/events.ts` - Add quiz events
4. `src/campaigns/nats/scenario1.ts` - Update objectives with quizzes

---

## UI Design

**Quiz Modal Appearance:**
```
┌─────────────────────────────────────────────┐
│  [Charlie Avatar]  Knowledge Check          │
├─────────────────────────────────────────────┤
│                                             │
│  What is the current GPSDO stability        │
│  reading?                                   │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  A) 2×10⁻¹¹ (Excellent)             │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  B) 5×10⁻¹⁰ (Poor)                  │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  C) 1×10⁻⁸ (Degraded)               │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  D) No reading available            │    │
│  └─────────────────────────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘
```

**Feedback States:**
- Correct: Green highlight, checkmark, explanation text
- Incorrect: Red highlight, X mark, "Try again" prompt, points deducted notice

---

## Point Penalty System

- Each wrong answer deducts `pointPenalty` points (default 5)
- Points deducted from the objective's total points
- Minimum score for objective is 0 (can't go negative)
- Track attempts for potential achievements/analytics

---

## Implementation Order

1. Add `status-check` condition type to objective-types.ts
2. Create QuizModal class with basic UI
3. Create QuizManager for state tracking
4. Add quiz events to events.ts
5. Integrate with ObjectivesManager evaluation
6. Update scenario1.ts with quiz conditions
7. Add CSS styling
8. Test end-to-end flow
