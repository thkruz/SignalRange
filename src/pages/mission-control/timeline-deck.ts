import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import './timeline-deck.css';

/**
 * TimelineDeck
 *
 * Displays the mission timeline at the bottom of the app shell.
 * Can be collapsed and expanded.
 */
export class TimelineDeck {
  readonly id = 'timeline-deck-container';
  protected dom_: HTMLElement | null = null;

  constructor(private readonly parentContainerId_: string) {
    this.init_();
  }

  private readonly html_ = html`
    <footer id="${this.id}" class="app-shell-timeline">
      <div class="timeline-header">
        <div class="timeline-header-left">
          <span>Mission Timeline</span>
          <div class="timeline-zoom-controls">
            <button>2H</button>
            <button class="active">6H</button>
            <button>24H</button>
          </div>
        </div>
        <button class="timeline-collapse-btn">
          <svg class="timeline-collapse-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
          </svg>
        </button>
      </div>
      <div class="timeline-content">
        <!-- Timeline content will be generated here -->
      </div>
      <div class="timeline-axis"></div>
    </footer>
  `;

  private init_(): void {
    const parentDom = qs(`#${this.parentContainerId_}`);
    parentDom?.insertAdjacentHTML('beforeend', this.html_);
    this.dom_ = qs(`#${this.id}`, parentDom);
    this.generateGanttPlaceholder_();
    this.addEventListeners_();
  }

  private addEventListeners_(): void {
    const collapseBtn = qs('.timeline-collapse-btn', this.dom_);
    collapseBtn?.addEventListener('click', () => {
      this.dom_?.classList.toggle('collapsed');
      collapseBtn.classList.toggle('is-rotated', this.dom_?.classList.contains('collapsed'));
    });
  }

  /**
   * Generates a placeholder Gantt chart for the timeline content.
   * This is for display purposes and will be replaced with dynamic data.
   */
  private generateGanttPlaceholder_(): void {
    const content = qs('.timeline-content', this.dom_);
    const axis = qs('.timeline-axis', this.dom_);
    if (!content || !axis) return;

    const placeholderHtml = html`
      <!-- Grid Lines -->
      <div class="timeline-grid">
        <div class="timeline-grid-line"></div>
        <div class="timeline-grid-line"></div>
        <div class="timeline-grid-line"></div>
        <div class="timeline-grid-line"></div>
      </div>

      <!-- Tracks -->
      <div class="timeline-tracks">
        <!-- Track 1: Ground Stations -->
        <div class="timeline-track">
          <div class="timeline-track-label">GS VISIBILITY</div>
          <div class="timeline-track-lane">
            <div class="timeline-block pass-active" style="left: 10%; width: 15%;">MIA-01</div>
            <div class="timeline-block pass-inactive" style="left: 40%; width: 10%;">LHR-02</div>
            <div class="timeline-block pass-active" style="left: 80%; width: 15%;">MIA-01</div>
          </div>
        </div>
        <!-- Track 2: Eclipse -->
        <div class="timeline-track">
          <div class="timeline-track-label">LIGHTING</div>
          <div class="timeline-track-lane">
            <div class="timeline-block sun" style="left: 0; width: 20%;"></div>
            <div class="timeline-block eclipse" style="left: 20%; width: 35%;">ECLIPSE</div>
            <div class="timeline-block sun" style="left: 55%; width: 45%;"></div>
          </div>
        </div>
        <!-- Track 3: Schedule -->
        <div class="timeline-track">
          <div class="timeline-track-label">SCHEDULE</div>
          <div class="timeline-track-lane">
            <div class="timeline-block activity-downlink" style="left: 12%; width: 5%;" title="Payload Downlink"></div>
            <div class="timeline-block activity-fsw" style="left: 85%; width: 5%;" title="Fsw Update"></div>
          </div>
        </div>
      </div>

      <!-- Playhead Cursor -->
      <div class="timeline-cursor"></div>
    `;

    content.innerHTML = placeholderHtml;
    axis.innerHTML = html`
      <span>12:00</span>
      <span>14:00</span>
      <span>16:00</span>
      <span>18:00</span>
      <span>20:00</span>
    `;
  }

}