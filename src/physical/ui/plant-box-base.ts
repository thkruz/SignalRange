/**
 * @file plant-box-base - Shared base for the physical-plant floating panels
 * @description DevMenuBox-style lazy DOM creation, show/toggle, and a throttled
 * UPDATE subscription that runs only while the box is open.
 */

import { DraggableBox } from '@app/engine/ui/draggable-box';
import { html } from '@app/engine/utils/development/formatter';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import './plant-ui.css';

export abstract class PlantBox extends DraggableBox {
  private static readonly UPDATE_INTERVAL_MS = 1000;

  private domCreated_ = false;
  private lastSyncTime_ = 0;
  private readonly boundUpdateHandler_: () => void;
  private subscribed_ = false;

  protected constructor(boxId: string, title: string, width: string) {
    super(boxId, { width, height: '0px', title, skipDomCreation: true });
    this.boundUpdateHandler_ = this.throttledSync_.bind(this);
  }

  /** Content inside `.pp-box` (rendered once) */
  protected abstract renderContent_(): string;

  /** Called once after the DOM exists */
  protected abstract bind_(root: HTMLElement): void;

  /** Called when the box opens and then at most once a second while it is open */
  protected abstract sync_(root: HTMLElement): void;

  protected get root_(): HTMLElement | null {
    return this.boxEl?.querySelector<HTMLElement>('.pp-box') ?? null;
  }

  isOpen(): boolean {
    return this.boxEl !== null && this.boxEl.style.display !== 'none';
  }

  show(): void {
    if (!this.domCreated_) {
      this.createDom_();
    }
    this.open();
    this.subscribe_();
    this.syncNow();
  }

  toggle(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.show();
    }
  }

  override close(cb?: () => void): void {
    this.unsubscribe_();
    super.close(cb);
  }

  /** Immediate refresh (after a direct user action) */
  syncNow(): void {
    const root = this.root_;
    if (root) {
      this.lastSyncTime_ = Date.now();
      this.sync_(root);
    }
  }

  /** Remove the DOM and subscriptions (scenario teardown) */
  protected destroyBase_(): void {
    this.unsubscribe_();
    document.getElementById(this.boxId)?.remove();
    this.boxEl = null;
    this.draggie = null;
    this.domCreated_ = false;
  }

  private subscribe_(): void {
    if (!this.subscribed_) {
      EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
      this.subscribed_ = true;
    }
  }

  private unsubscribe_(): void {
    if (this.subscribed_) {
      EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
      this.subscribed_ = false;
    }
  }

  private throttledSync_(): void {
    if (Date.now() - this.lastSyncTime_ < PlantBox.UPDATE_INTERVAL_MS) {
      return;
    }
    this.syncNow();
  }

  protected getBoxContentHtml(): string {
    return html`<div class="pp-box">${this.renderContent_()}</div>`;
  }

  private createDom_(): void {
    document.body.insertAdjacentHTML(
      'beforeend',
      html`
      <div id="${this.boxId}" class="draggable-box" style="pointer-events:auto; display:none;">
        <div class="draggable-box__title-bar">
          <div class="draggable-box__title"><span>${this.title}</span></div>
          <button type="button" id="${this.boxId}-close" class="draggable-box__close-btn" title="Close this window" aria-label="Close">&#x2715; Close</button>
        </div>
        <div class="draggable-box__content">${this.getBoxContentHtml()}</div>
      </div>
    `
    );
    this.domCreated_ = true;
    this.onOpen();
    const root = this.root_;
    if (root) {
      this.bind_(root);
    }
  }
}
