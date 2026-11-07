import type { ScenarioData } from '@app/ScenarioData';
import { getAssetUrl } from '@app/utils/asset-url';
import './mission-loading-screen.css';

/** A real preparation screen; dismissed before mission dialogue and timers begin. */
export class MissionLoadingScreen {
  private readonly element_: HTMLDivElement;
  private readonly status_: HTMLParagraphElement;
  private readonly previousFocus_: HTMLElement | null;

  constructor(scenario: ScenarioData, onBack: () => void) {
    this.previousFocus_ = document.activeElement as HTMLElement | null;
    this.element_ = document.createElement('div');
    this.element_.className = 'mission-loading-screen';
    this.element_.setAttribute('role', 'dialog');
    this.element_.setAttribute('aria-modal', 'true');
    this.element_.setAttribute('aria-label', 'Preparing mission');
    const image = document.createElement('img');
    image.src = getAssetUrl('/assets/campaigns/' + scenario.imageUrl);
    image.alt = '';
    const content = document.createElement('div');
    content.className = 'mission-loading-content';
    const label = document.createElement('span');
    label.textContent = 'SIGNAL RANGE / MISSION PREPARATION';
    const title = document.createElement('h1');
    title.textContent = scenario.title;
    this.status_ = document.createElement('p');
    this.status_.setAttribute('role', 'status');
    this.status_.textContent = 'Preparing station and restoring saved progress…';
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = 'Back to missions';
    back.addEventListener('click', onBack);
    // Keep Tab within the loading dialog's only interactive control.
    back.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') event.preventDefault();
    });
    content.append(label, title, this.status_, back);
    this.element_.append(image, content);
    document.body.append(this.element_);
    back.focus({ preventScroll: true });
  }

  async reveal(): Promise<void> {
    if (typeof this.element_.animate === 'function' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      await this.element_.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: 'ease-out' }).finished.catch(() => {});
    }
    this.dispose();
  }

  fail(): void {
    this.status_.textContent = 'The station could not be prepared. Return to the mission list and try again.';
    if (!this.element_.isConnected) document.body.append(this.element_);
    this.element_.querySelector('button')?.focus({ preventScroll: true });
  }

  dispose(): void {
    if (!this.element_.isConnected) return;
    const restoreFocus = this.element_.contains(document.activeElement);
    for (const animation of this.element_.getAnimations?.() ?? []) animation.cancel();
    this.element_.remove();
    if (restoreFocus && this.previousFocus_?.isConnected) this.previousFocus_.focus({ preventScroll: true });
  }
}
