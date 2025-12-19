# Mission Failure Specification (v1)

Date: 2025-12-19  
Scope: Generic mission failure behavior for v1 campaigns (5 missions)  
Primary model: Soft-fail with restart from last checkpoint (full AppState restore)

## Goals

- Make failures feel fair, learnable, and actionable.
- Preserve player time by restarting from the last saved checkpoint.
- Ensure failure/retry works identically across devices using synced checkpoints.
- Keep v1 implementation small and robust; avoid deep refactors.

## Non-goals (v1)

- No permadeath / campaign-wide penalties.
- No complex branching fail states.
- No punitive score systems or rank gating.
- Do not treat generic equipment alarms as automatic failure.

## Definitions

- Mission: A scenario in a campaign.
- Checkpoint: A saved snapshot of the full AppState (equipment + ground station states + objective states), stored per scenario and synced across devices.
- Soft-fail: Mission ends, but player can immediately retry without losing campaign progress.

## Failure Model

### Core Rule

- Failures are explicit and scenario-authored.
- When a failure condition triggers, the mission enters a failed state and offers recovery actions.

### Triggers (v1)

Only use these trigger categories in v1:

1. Objective-authored fail conditions (recommended)

Examples:

- Transmitted outside assigned band for > N seconds.
- Exceeded allowed power/EIRP for > N seconds.
- Lost required lock for > N seconds.
- Failed to complete a required step in the correct order.

1. Optional: mission timeout (only if needed for the mission)

- If a mission has a hard time limit, failure triggers on timeout.
- If time pressure is not a design requirement, omit timeouts in v1.

Explicitly avoid in v1:

- “Any alarm = fail” rules.
- Hidden failure rules that surprise the player.

## Player Experience (UX)

### On Failure

When mission failure occurs:

- Pause/stop mission progression (no further objective progression until player chooses an action).
- Display a "Mission Failed" modal/overlay.
- Provide:
  - A short human-readable failure reason (one sentence).
  - Optional details (the rule violated, the threshold, and the observed value/time).

### Failure Actions (Buttons)

Provide these actions in the failure modal:

1. Restart from last checkpoint (default / primary)

- Restores the last synced checkpoint for this scenario.
- Expected to restore full AppState.

1. Restart mission (fresh)

- Clears the scenario checkpoint, then restarts the mission from initial scenario defaults.
- Campaign completion state remains unchanged.

1. Back to mission list

- Exits to scenario selection.
- Does not modify progress.

### Messaging Requirements

- “Restart from last checkpoint” should explain what that means in one line:
  - Example: “Restores your last saved state from objective completion.”
- If no checkpoint exists, the primary action becomes “Restart mission (fresh)” and the checkpoint action is disabled/hidden.

## Persistence and Progression Rules

### What Failure Must NOT Do

- Must not add to completed missions.
- Must not clear completion history.
- Must not silently clear the checkpoint.

### Checkpoint Rules

- Checkpoints are saved at minimum on objective completion.
- “Restart from checkpoint” loads the latest checkpoint for the scenario.
- Checkpoints are per scenario (not per campaign) and synced across devices.

### Cross-device Consistency

- The same failure + retry choices should work after:
  - refreshing the page,
  - switching devices,
  - returning later.

## Implementation Contract (Generic)

### State Restore Requirements

- Checkpoint restore must restore full AppState:
  - objective states,
  - ground station states,
  - equipment states.

### Failure Notification and Handling

A mission failure implementation should provide:

- A single authoritative failure signal ("mission failed") emitted by scenario/objectives.
- A failure payload containing:
  - mission/scenario identifier,
  - a failure reason code,
  - a display message,
  - optional debug info (thresholds, observed values).

### Restart Behaviors

- Restart from checkpoint
  - Load checkpoint from synced progress store.
  - Apply checkpoint AppState.
  - Reinitialize mission runtime to a consistent state (simulation, objectives, dialogs).

- Restart fresh
  - Clear checkpoint for scenario.
  - Start mission from scenario defaults.

## Edge Cases

- No checkpoint exists:
  - Hide/disable “Restart from last checkpoint”.
  - Offer only “Restart mission (fresh)” and “Back to mission list”.

- Checkpoint exists but is incompatible (version mismatch):
  - Show a clear message: “Checkpoint is from a different version and can’t be restored.”
  - Offer “Restart mission (fresh)”.

- Failure occurs during a save:
  - Do not block the failure modal.
  - If restart-from-checkpoint is chosen and the save is still in progress, either wait for completion or load the most recent stable checkpoint.

## Testing / Acceptance Criteria

Minimum acceptance for v1:

- Trigger a failure → modal shows reason and actions.
- Restart from checkpoint restores:
  - equipment state,
  - ground station state,
  - objective progress.
- Restart fresh clears checkpoint and starts from defaults.
- Back to mission list preserves progress.
- Behavior works after refresh and on a second device.

## Out of Scope (Future Enhancements)

- Scoring, graded debriefs, and leaderboards.
- Partial checkpoints (mid-objective) and timed autosaves.
- Multiple checkpoint slots.
- Branching fail states and adaptive difficulty.
