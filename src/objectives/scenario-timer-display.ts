import { ObjectivesManager } from './objectives-manager';
import './scenario-timer-display.css';

/**
 * Displays a global scenario timer bar at the top of the screen
 * when the scenario has a time limit.
 */
export class ScenarioTimerDisplay {
  private static instance_: ScenarioTimerDisplay | null = null;
  private dom_: HTMLElement | null = null;
  private readonly objectivesManager_: ObjectivesManager;
  private updateInterval_: number | null = null;

  private constructor(objectivesManager: ObjectivesManager) {
    this.objectivesManager_ = objectivesManager;

    if (objectivesManager.hasScenarioTimer()) {
      this.createDisplay_();
      this.startUpdateLoop_();
    }
  }

  /**
   * Initialize the scenario timer display
   */
  static initialize(objectivesManager: ObjectivesManager): ScenarioTimerDisplay {
    if (ScenarioTimerDisplay.instance_) {
      ScenarioTimerDisplay.instance_.dispose();
    }
    ScenarioTimerDisplay.instance_ = new ScenarioTimerDisplay(objectivesManager);
    return ScenarioTimerDisplay.instance_;
  }

  /**
   * Get the singleton instance (may be null if not initialized)
   */
  static getInstance(): ScenarioTimerDisplay | null {
    return ScenarioTimerDisplay.instance_;
  }

  private createDisplay_(): void {
    // Create the timer element
    const el = document.createElement('div');
    el.className = 'scenario-timer-display';
    this.dom_ = el as unknown as HTMLElement;
    this.dom_.innerHTML = `
      <div class="scenario-timer-display__icon">&#9201;</div>
      <div class="scenario-timer-display__label">MISSION TIME</div>
      <div class="scenario-timer-display__time">--:--</div>
    `;

    // Insert at the top of the body
    document.body.appendChild(this.dom_);

    // Initial update
    this.updateDisplay_();
  }

  private startUpdateLoop_(): void {
    if (this.updateInterval_) return;

    this.updateInterval_ = window.setInterval(() => {
      this.updateDisplay_();
    }, 1000);
  }

  private updateDisplay_(): void {
    if (!this.dom_) return;

    const timeRemaining = this.objectivesManager_.getScenarioTimeRemaining();
    const timeEl = this.dom_.querySelector('.scenario-timer-display__time');

    if (timeEl) {
      timeEl.textContent = this.objectivesManager_.formatTimeRemaining(timeRemaining);
    }

    // Add urgency class when less than 60 seconds remain
    if (timeRemaining <= 60) {
      this.dom_.classList.add('timer-urgent');
    } else if (timeRemaining <= 300) {
      // Warning state when less than 5 minutes
      this.dom_.classList.add('timer-warning');
      this.dom_.classList.remove('timer-urgent');
    } else {
      this.dom_.classList.remove('timer-warning', 'timer-urgent');
    }
  }

  /**
   * Clean up the timer display
   */
  dispose(): void {
    if (this.updateInterval_) {
      clearInterval(this.updateInterval_);
      this.updateInterval_ = null;
    }

    if (this.dom_) {
      this.dom_.remove();
      this.dom_ = null;
    }

    ScenarioTimerDisplay.instance_ = null;
  }
}
