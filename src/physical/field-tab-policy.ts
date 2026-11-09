/**
 * @file field-tab-policy - Trainer unlock for the engineering tabs at 'field' stations (Phase 40 WP1)
 *
 * At a Campaign 6 field station Mission Control shows only the Site tab plus
 * plugin station tabs. The trainer can turn the professional engineering tabs
 * on. The flag is in-memory only and resets whenever a scenario loads.
 */
export class FieldTabPolicy {
  private static engineeringUnlocked_ = false;
  private static readonly listeners_ = new Set<() => void>();

  static isEngineeringUnlocked(): boolean {
    return FieldTabPolicy.engineeringUnlocked_;
  }

  static setEngineeringUnlocked(value: boolean): void {
    if (FieldTabPolicy.engineeringUnlocked_ === value) {
      return;
    }
    FieldTabPolicy.engineeringUnlocked_ = value;
    FieldTabPolicy.notify_();
  }

  /** Back to the default (locked). Called when a scenario loads. */
  static reset(): void {
    FieldTabPolicy.setEngineeringUnlocked(false);
  }

  /** Subscribe to unlock changes; returns the unsubscribe function. */
  static onChange(listener: () => void): () => void {
    FieldTabPolicy.listeners_.add(listener);

    return () => FieldTabPolicy.listeners_.delete(listener);
  }

  private static notify_(): void {
    FieldTabPolicy.listeners_.forEach((listener) => listener());
  }
}
