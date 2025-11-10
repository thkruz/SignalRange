import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { Logger } from "@app/logging/logger";

export abstract class BaseControlButton {
  private readonly html_: string;
  protected uniqueId: string;
  private dom_?: HTMLElement;

  protected constructor({
    uniqueId,
    label,
    ariaLabel,
    classNames = "physical-button control-button",
    subtext,
  }: {
    uniqueId: string;
    label: string;
    ariaLabel: string;
    classNames?: string;
    subtext?: string;
  }) {
    this.uniqueId = uniqueId;
    this.html_ = html`
      <button
        class="${uniqueId} ${classNames}" aria-label="${ariaLabel}"
      >
        <span class="button-text">${label}</span>
        ${subtext ? `<div class="subtext">${subtext}</div>` : ''}
      </button>
    `;
  }

  get html(): string {
    return this.html_;
  }

  get dom(): HTMLElement {
    this.dom_ ??= qs(`.${this.uniqueId}`);
    return this.dom_;
  }

  addEventListeners(): void {
    this.dom.addEventListener('click', this.handleClick_.bind(this));
  }

  protected abstract handleClick_(): void;

  // TODO: This should be an abstract eventually
  onEnterPressed(): void {
    Logger.info(`Processing request with ${this.uniqueId} because enter was pressed.`);
  }

  protected playSound(): void {
    // TODO: Integrate sound system when available
    // For now, this is a placeholder for the select sound
  }
}
