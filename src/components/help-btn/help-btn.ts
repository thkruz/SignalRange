import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { ModalManager } from "@app/modal/modal-manager";
import './help-btn.css';

export class HelpButton {
  protected html_: string;
  private readonly uniqueId: string;
  private dom_?: HTMLInputElement;
  private readonly helpTitle_: string;
  private readonly helpContent_: string;
  private readonly helpUrl_: string;
  constructor(
    uniqueId: string,
    helpTitle: string,
    helpContent: string,
    helpUrl: string | null = null
  ) {
    this.html_ = html`
      <div id="${uniqueId}" class="help-button-container">
        <button class="btn-help" data-action="open-help" title="Open Help Documentation">
          <span class="icon-help">?</span>
        </button>
      </div>
    `;

    this.uniqueId = uniqueId;
    this.helpTitle_ = helpTitle;
    this.helpContent_ = helpContent;
    this.helpUrl_ = helpUrl;
    const container = document.createElement('div');
    container.innerHTML = this.html_;

    EventBus.getInstance().on(Events.DOM_READY, this.onDomReady.bind(this));
  }

  onDomReady(): void {
    this.dom_ ??= qs(`#${this.uniqueId}`);
    const button = qs('.btn-help', this.dom);

    button.addEventListener('click', this.onClick.bind(this));
  }

  private onClick(e: MouseEvent): void {
    e.preventDefault();

    if (this.helpUrl_) {
      ModalManager.getInstance().show(
        this.helpTitle_,
        `<iframe src="${this.helpUrl_}" style="width:100%;height:600px;border:none;"></iframe>`
      );
    } else {
      ModalManager.getInstance().show(this.helpTitle_, this.helpContent_);
    }
  }

  get html(): string {
    return this.html_;
  }

  get dom(): HTMLInputElement {
    this.dom_ ??= qs(`#${this.uniqueId}`);

    return this.dom_;
  }

  static create(
    id: string,
    helpTitle: string,
    helpContent: string,
    helpUrl: string | null = null
  ): HelpButton {
    return new HelpButton(id, helpTitle, helpContent, helpUrl);
  }
}
