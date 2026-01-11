# SignalRange Development Retrospectives - Consolidated Learnings

A synthesis of lessons learned from 14 development retrospectives covering testing, architecture, deployment, and feature implementation.

---

## Testing Strategies

### Unit Testing Patterns That Work

**Consistent mocking structure** accelerates test creation. Establishing a pattern once and reusing it across all test files reduces cognitive load:

```typescript
mockEventBus = { on: jest.fn(), off: jest.fn(), emit: jest.fn() };
(EventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);
```

**Event registration/unregistration tests** are highly reliable. Verifying EventBus `on`/`off` calls catches real integration issues without complex DOM assertions.

**Element existence tests** serve as a reliable baseline for UI components:

```typescript
it('should have frequency input', () => {
  expect(container.querySelector('#freq-input')).not.toBeNull();
});
```

**Type guard testing** with pure functions achieves 100% coverage easily and requires no mocking.

**Testing private methods via type casting** (`as unknown as`) allows testing internal logic without modifying production code, though this should be used judiciously.

### Unit Testing Pitfalls

**Jest mock hoisting** disallows out-of-scope variable references in `jest.mock()` factory functions. Use `null` or primitive values instead of `document.createElement()`.

**DOM state sync assertions** often fail because:
- Sync methods check preconditions (e.g., `isPowered`) before updating
- Mocks may not be called with expected parameters
- Internal caching or throttling prevents immediate updates

**Solution**: Test that mocks are called rather than checking DOM state values.

**Slider value assertions** don't work reliably in jsdom. Test associated display elements (`#az-value`) instead of the slider's value attribute.

**Mock return values must be set before adapter construction**:

```typescript
// CORRECT - mock before construction
mockModule.getSomeValue.mockReturnValue(expectedValue);
adapter = new SomeAdapter(mockModule, container);

// WRONG - adapter already called sync with default mock value
adapter = new SomeAdapter(mockModule, container);
mockModule.getSomeValue.mockReturnValue(expectedValue);
```

**Singleton reset** requires manual instance clearing between tests:

```typescript
(ModalLogin as unknown as { instance_: null }).instance_ = null;
```

### E2E Testing Insights

**Quiz systems may require user interaction** to display. Don't assume modals appear automatically—check for pending indicators and trigger clicks programmatically.

**Match quiz answers by text content, not index**—options may be shuffled at display time:

```typescript
const option = quizModal.locator('.quiz-option-btn', { hasText: answerText });
```

**Dismiss dialogs between objectives** to prevent interference with subsequent interactions.

**Recommended timeouts**:
| Action | Wait Time |
|--------|-----------|
| After simulation load | 2000ms |
| After answering quiz | 500ms |
| Between objectives | 300ms |
| Full test timeout | 5 minutes |

### Testing Architecture Recommendations

- **Consider dependency injection** for classes with many imports—makes mocking straightforward
- **Separate pure logic from DOM manipulation** to enable testing without DOM mocking
- **Use integration tests for complex modules** with database or API dependencies
- **Create shared mock factories** for common dependencies (DraggableModal, SoundManager, etc.)
- **Mock at boundaries, not internals**—mock at the class level, not the client level
- **Read adapter implementations before writing tests**—understand gating conditions, throttling, and initialization order

---

## Signal Processing & RF Simulation

### Signal Power Variation Chain

Signal power variation occurs at **three distinct layers**, each adding independent noise:

```
Satellite (source) → Antenna (propagation) → Spectrum Analyzer (display)
```

| Layer | Source | Type | Notes |
|-------|--------|------|-------|
| Satellite | Perlin noise, rain fade, scintillation | Random | Primary source of realistic variation |
| Antenna | FSPL, atmospheric, pointing loss | Deterministic | Physics-based, not random |
| Display | Noise floor, signal jitter | Random | Visual realism only |

**Key insight**: Variations stack approximately additively. Each layer's contribution seems small in isolation but combines to excessive total variation if not tuned together.

### Tuning Recommendations

- **Perlin noise** for smooth, slow-varying drift (satellite layer) is the primary realism dial
- **Atmospheric effects** (rain, scintillation) should be subtle additions, not major contributors
- **Display jitter** is purely cosmetic—keep it minimal to avoid masking real signal changes
- Consider a centralized "realism" dial that scales all noise sources proportionally

### Stacking Math

```
Total ≈ Satellite + Antenna + Display
      ≈ (±1.0 Perlin + ±0.15 scint + 0.12 rain) + 0 + ±0.07 jitter
      ≈ ±0.8 to ±1.0 dB typical
```

---

## Architecture Patterns

### State Management

**Separate "recent" vs "cumulative" counters from the start**. Cumulative counters are for statistics; recent values (with decay) determine current status. Retrofitting this distinction is painful.

```typescript
interface CouplerState {
  isEnabled: boolean;    // User toggle
  isActive: boolean;     // Computed: enabled + valid configuration
  // NOT just isPowered—too simplistic
}
```

**Use raw values for real-time status determination**. Smoothing is for display aesthetics, not operational decisions. Status should reflect current reality, not historical averages.

### Module Design

**Singleton patterns** (e.g., CryptoModule, FaultInjector) simplify integration—consumers just call `getInstance()`.

**Strategy pattern** enables clean separation between orchestrators and algorithms. Wrapping existing controllers preserves backward compatibility while enabling extension.

**Keep pure calculation modules separate** (e.g., FECSimulator). Input → output with no side effects makes testing and debugging straightforward.

**Clean separation of concerns**: State logic in core modules, UI in adapters, signal processing in dedicated classes.

### Event-Driven Communication

**EventBus pub/sub** with well-defined events (CRYPTO_STATE_CHANGED, FAULT_CHANGED, etc.) decouples modules effectively.

**Adding new events is clean** when the architecture is already event-driven. Each component (manager, indicator, modal) can respond independently without modifying unrelated code.

**HTML generated at construction** limits dynamic UI updates. Consider dynamic option population when mode changes.

### State Persistence Architecture

**Two-layer storage pattern**: Backend saves (ProgressSaveManager) and local storage sync (SyncManager) are separate systems. Understanding this separation is key to debugging persistence issues.

**The canonical pattern for injecting external state**:
1. Write to storage provider
2. Load from storage via SyncManager
3. SyncManager calls `sync()` on equipment

**Watch for early returns**: Sync methods may return early when certain parameters are null, silently skipping synchronization. Check sync method preconditions when state isn't restoring.

**Reference working implementations**: When a feature works in one page but not another, immediately diff the initialization flows line-by-line.

### Code Organization

**Each equipment piece should be removable by deleting its file**. This principle requires clean separation between UI, signal processing, and state management.

**Template literal HTML rendering** with manual DOM updates balances performance with maintainability.

### Interface Design

**Prefer numeric IDs over UUIDs for config-file references**. UUIDs generated at runtime are unusable in static scenario configs. Numeric IDs (e.g., `antenna_id: 1`) work cleanly in both code and config files.

**When changing interfaces, check both core class AND adapter**. Adapters often have parallel implementations that need matching updates.

**Unused parameters after refactoring**: When simplifying code removes usage of a constructor parameter, add a getter to satisfy TypeScript's strict unused variable checks while maintaining API compatibility.

---

## Build & Deployment

### Webpack Gotchas

**Don't over-engineer build-time features**. A standard `DefinePlugin` is sufficient for version/SHA injection. "Dynamic" behavior during development provided zero practical value while introducing subtle timing bugs.

**Understand webpack's hook lifecycle** before hooking into internals. Registering plugin hooks during the `compilation` phase doesn't affect the current compilation—only subsequent ones.

**Test production builds locally** (`npm run build`) before pushing CI changes.

### Cloudflare Workers Deployment

**Pin wrangler version in CI** to match local development version. Version mismatches cause config parsing issues.

**Always specify config file explicitly** (`--config wrangler.jsonc`) when not using default `wrangler.toml`.

**Always specify accountId** even with a single account—avoids API lookup failures.

**Verify secrets placement**: GitHub environment secrets (production/uat) vs repository-level secrets behave differently.

---

## Algorithm Implementation

### Tuning Real-Time Systems

**Start with theoretical analysis** before coding. Calculating maximum tracking rates upfront would have immediately revealed LEO incompatibility.

**Test threshold values empirically** with actual scenarios. Theoretical thresholds (BER > 1e-6, Viterbi < 0.7) proved too strict for training purposes.

**Document threshold rationale**. Status thresholds encode operational knowledge—document the reasoning for future maintainers.

### Tracking Algorithm Learnings

**Hill-climbing stops when optimal**; proactive pursuit never stops. For moving targets, continue stepping in the "momentum" direction even when signal is stable.

**Theoretical limits matter**:
```
max_rate = step_size × decisions_per_second
         = 0.02° × 6/sec = 0.12°/s
```

This hard limit determines what can and cannot be tracked without program track.

**Hysteresis prevents oscillation**. Requiring consecutive samples before regime changes prevents rapid mode switching from noise.

**Velocity-based detection** works better than pure metadata—it adapts to actual target motion regardless of cataloged orbit type.

---

## Content & Documentation

### Scenario Development

**Reference-driven approach** ensures consistency. Using an established scenario as a style guide works well for tutorial content.

**Educational context in descriptions** explains *why* actions matter, not just *what* to do:
- ✓ "Cold LNBs have unstable noise figures"
- ✗ "Enable the heater"

**Validate coordinate consistency** when touching scenario files, even for text-only changes. Flag discrepancies between descriptions and condition params.

**Audio asset tracking**: When adding dialog clips, create a checklist of required audio files so they can be tracked and created.

### Dialog Writing

**Action-oriented titles with explanatory descriptions** work well for teaching. The pattern "acknowledge-teach-navigate-prompt" creates a guided experience.

**Professional competence over emotional engagement**—realistic mentor portrayal better prepares students for industry environments.

---

## UX Feature Implementation

### Notification & Modal Patterns

**Deferred display with indicators** works well for non-urgent information. Example: Quiz appears after 15-second delay via pending indicator, not immediately on objective activation.

**Gate completion behind explicit action** (e.g., Continue button) when you need acknowledgment, but **handle all exit paths**:
- Close button after correct answer
- Dismiss via overlay click
- Browser back/refresh

**Ask about timing/delays early** in feature planning. "When should this appear?" and "How long before notification?" affect implementation significantly.

**Clarify copy/messaging upfront**. Include specific text strings in plans so they can be approved before implementation.

### Timeout Management

**Add cleanup in all lifecycle methods** when introducing timeouts:
- dispose()
- completion handlers
- error handlers
- component unmount

Don't add timeout cleanup as an afterthought—enumerate all cleanup points during initial implementation.

---

## Process Improvements

### Before Implementation

1. **Read existing interfaces first**—thoroughly understand type definitions before writing interacting code
2. **Create test scenarios first**—define specific test cases before implementing features
3. **Calculate theoretical limits**—some approaches are fundamentally unsuitable for certain problems

### During Implementation

1. **Plan-first approach** with detailed tracking helps manage complex multi-module work
2. **Prefer simpler solutions**—complexity must be justified by practical value
3. **Use smaller test iterations first**—start with 100-iteration smoke tests before scaling to 1000

### For Testing

1. **Prefer testing behavior over implementation details**
2. **Test DOM element existence as baseline**
3. **Document limitations in tests**—tests that show what doesn't work prevent future developers from expecting impossible behavior

### Debugging Cross-Cutting Issues

1. **Use parallel exploration** to quickly identify root causes across multiple files
2. **Check exact export paths** before adding imports—`syncManager` from `@app/sync/storage` not `@app/sync`
3. **When moving initialization order**, verify UI components don't depend on synchronous availability of the moved resources
4. **Grep for patterns** (`Math.random`, `variation`) to locate injection points across codebase

---

## Quick Reference Tables

### Test Pattern Reliability

| Pattern | Reliability | Use Case |
|---------|-------------|----------|
| Event handler calls | High | User interaction |
| EventBus subscriptions | High | Integration points |
| Element existence | High | UI structure |
| Text content (static) | Medium | Labels, headings |
| DOM state values | Low | Avoid—use mock call assertions |

### Module Testability Spectrum

| Module Type | Approach | Coverage Achievable |
|-------------|----------|---------------------|
| Pure functions/type guards | Unit tests | 100% |
| Self-contained error classes | Unit tests | 100% |
| Adapters with EventBus | Unit tests with mocks | 70-80% |
| Modals with DOM dependencies | Partial unit + E2E | 50-60% |
| Auth with external services | Integration tests | Variable |

### Threshold Tuning Impact

| Component | Initial → Final | Impact |
|-----------|-----------------|--------|
| BER threshold | 1e-6 → 1e-5 | More forgiving status |
| Viterbi threshold | 0.7 → 0.6 | Realistic training |
| C/N requirement | ~13 dB → ~10 dB | Achievable scenarios |

---

## Files Produced Across All Retrospectives

**Test files created**: 26 files, 500+ tests
**Modules implemented**: FECSimulator, CryptoModule, FaultInjector, TrackingOrchestrator, VelocityMonitor, RegimeClassifier, 4 tracking strategies
**Infrastructure fixes**: Webpack plugin, Cloudflare deployment pipeline, scenario checkpoint persistence
**Content updates**: Scenario 3 dialogs, tap points card modes, deferred quiz display
**Refactoring**: Antenna ID standardization (UUID → numeric), signal power variation tuning

---

*Last updated: January 2026*
*Sources: 14 development retrospectives*
