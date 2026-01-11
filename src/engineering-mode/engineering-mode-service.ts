/**
 * Engineering Mode Service
 *
 * Manages the ENGINEERING_MODE global flag for showing/hiding advanced controls.
 * Used to simplify the UI for new students by hiding advanced spectrum analyzer
 * controls (Scale, Ref Level, Refresh Rate, Markers).
 */

declare global {
  interface Window {
    ENGINEERING_MODE?: boolean;
    FORCE_ENGINEERING_BUTTON?: boolean;
  }
}

export class EngineeringModeService {
  private static instance_: EngineeringModeService;
  private readonly callbacks_: ((enabled: boolean) => void)[] = [];

  private constructor() {
    // Initialize to false if not already set
    if (window.ENGINEERING_MODE === undefined) {
      window.ENGINEERING_MODE = false;
    }
  }

  static getInstance(): EngineeringModeService {
    if (!EngineeringModeService.instance_) {
      EngineeringModeService.instance_ = new EngineeringModeService();
    }
    return EngineeringModeService.instance_;
  }

  isEnabled(): boolean {
    return window.ENGINEERING_MODE === true;
  }

  setEnabled(enabled: boolean): void {
    window.ENGINEERING_MODE = enabled;
    this.notifyListeners_();
  }

  toggle(): void {
    window.ENGINEERING_MODE = !window.ENGINEERING_MODE;
    this.notifyListeners_();
  }

  onChange(callback: (enabled: boolean) => void): void {
    this.callbacks_.push(callback);
  }

  private notifyListeners_(): void {
    const enabled = this.isEnabled();
    this.callbacks_.forEach(cb => cb(enabled));
  }
}
