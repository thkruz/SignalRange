# Retrospective: Scenario Progress Persistence Fix

## Summary
Fixed bug where scenario progress was not persisting across page refresh despite "Progress Saved" toast appearing.

## What Worked

- **SandboxPage as reference**: Having a working implementation in SandboxPage made it easy to understand the correct pattern for checkpoint loading
- **Exploration agents**: Using parallel Explore agents quickly identified all four root causes across multiple files
- **Two-layer storage architecture understanding**: Recognizing that backend saves (ProgressSaveManager) and local storage sync (SyncManager) are separate systems was key to the fix

## What Didn't Work

- **Initial assumption about sync timing**: First plan assumed ground station had a `restoreState` method, but the actual pattern uses `sync()` called by SyncManager after writing to local storage provider
- **Import path confusion**: `syncManager` is exported from `@app/sync/storage` not the main `@app/sync` index - required a second edit to fix
- **Moving ground station creation broke UI**: Moving `createGroundStationsFromScenario_()` from `init_()` to `initializeAsync_()` broke UI components that depended on ground stations existing synchronously
- **syncFromStorage early return**: The sync manager's `syncFromStorage` method returns early when `equipment` is null (line 198), which meant ground stations were never synced when passing `null` for equipment. Required manual ground station sync in `loadCheckpointIfExists_()`

## What to Change Next Time

- Check the exact export paths before adding imports
- When a feature works in one page (SandboxPage) but not another (MissionControlPage), immediately diff the initialization flows line-by-line
- The pattern "write to storage provider, then load from storage" is the canonical way to inject external state into the sync system
