import { scaleDragging } from '@app/game-menu/scaled-drag';
import { displayViewport } from '@app/game-menu/display-viewport';

import { errorManagerInstance } from '@engine/utils/errorManager';
import { getEl } from '@engine/utils/get-el';
import Draggabilly from 'draggabilly';
import { html } from '../utils/development/formatter';
import { showEl } from '../utils/get-el';
import { DraggableBox } from './draggable-box';


export abstract class DraggableModal extends DraggableBox {
  protected abstract getModalContentHtml(): string;

  constructor(boxId: string, opts?: { width?: string; title?: string }) {
    super(boxId, { ...opts, skipDomCreation: true });
  }

  protected override onOpen(): void {
    super.onOpen();
    const modalContainer = getEl(`${this.boxId}-container`) as HTMLElement;

    if (modalContainer) {
      modalContainer.addEventListener('click', (e: MouseEvent) => {
        if (e.target === modalContainer) {
          this.close();
        }
      });
    }
  }

  override open(cb?: () => void) {
    if (!this.boxEl) {
      // Create modal structure
      document.body.insertAdjacentHTML('beforeend', html`
        <div id="${this.boxId}-container" class="modal" style="display:none;">
          <div id="${this.boxId}" class="draggable-box" style="pointer-events:auto;">
            <div class="draggable-box__title-bar">
              <div class="draggable-box__title">
                <h3 style="margin: 0;">${this.getBoxTitleHtml()}</h3>
              </div>
              <span id="${this.boxId}-close" class="draggable-box__btn draggable-box__close-btn"></span>
            </div>
            <div class="draggable-box__content">
              ${this.getBoxContentHtml()}
            </div>
          </div>
        </div>
      `);
      this.boxEl = getEl(`${this.boxId}-container`) as HTMLElement;
      this.initDraggabilly_();
      this.onOpen();
    }

    if (this.boxEl) {
      showEl(this.boxEl);
      const modalContent = getEl(`${this.boxId}`)!;

      if (this.width) {
        modalContent.style.minWidth = this.width;
      }
      if (this.height) {
        modalContent.style.minHeight = this.height;
      }
      modalContent.style.top = `${(displayViewport().height - modalContent.offsetHeight) / 2}px`;
      modalContent.style.left = `${(displayViewport().width - modalContent.offsetWidth) / 2}px`;
      this.sendToFront();
      if (cb) {
        cb();
      }
    } else {
      errorManagerInstance.log(`Failed to open modal: ${this.boxId}`);
    }
  }

  /**
   * The modal's `.modal` container is a fixed stacking context (z-index 1000), so the box's own z-index never
   * lifts it above a box in another context such as the docked Checklist. Move the container with the box.
   */
  protected override sendToFront(): void {
    super.sendToFront();
    const container = getEl(`${this.boxId}-container`);
    const box = getEl(`${this.boxId}`);
    if (container && box) {
      container.style.zIndex = box.style.zIndex;
    }
  }

  protected initDraggabilly_() {
    const boxContent = getEl(`${this.boxId}`);

    if (boxContent && !this.draggie) {
      this.draggie = new Draggabilly(boxContent, {
        containment: getEl(`${this.boxId}-container`)!,
      });
      scaleDragging(this.draggie, boxContent, getEl(`${this.boxId}-container`)!);

      // Bring modal to front when clicked or dragged
      this.draggie.on('pointerDown', () => {
        this.sendToFront();
      });

      boxContent.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button === 2) {
          boxContent.style.top = `${(displayViewport().height - boxContent.offsetHeight) / 2}px`;
          boxContent.style.left = `${(displayViewport().width - boxContent.offsetWidth) / 2}px`;
          this.sendToFront();
        }
      });
    }
  }

  // getBoxContentHtml delegates to getModalContentHtml for modal
  protected override getBoxContentHtml(): string {
    return this.getModalContentHtml();
  }
}
