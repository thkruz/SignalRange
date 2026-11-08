import { scaleDragging } from '@app/game-menu/scaled-drag';
import { displayViewport } from '@app/game-menu/display-viewport';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import Draggabilly from 'draggabilly';
import { html } from '../utils/development/formatter';
import { getEl, showEl } from '../utils/get-el';
import './engine-ui.css';

interface DraggableBoxOptions {
  height?: string;
  width?: string;
  title?: string;
  isDockable?: boolean;
  boxContentHtml?: string;
  parentId?: string;
  skipDomCreation?: boolean;
}

export abstract class DraggableBox {
  protected boxId: string;
  protected boxEl: HTMLElement | null = null;
  protected draggie: Draggabilly | null = null;
  protected width: string | null = null;
  protected title: string = '';
  private static zIndexCounter_ = 10000;
  protected isDockable = false;
  height: string;

  static getMaxZIndex(): number {
    return this.zIndexCounter_;
  }

  static increaseMaxZIndex(): number {
    this.zIndexCounter_ += 1;

    return this.zIndexCounter_;
  }

  constructor(boxId: string, opts?: DraggableBoxOptions) {
    this.boxId = boxId;
    this.title = opts?.title ?? '';
    this.width = opts?.width ?? '300px';
    this.height = opts?.height ?? '300px';
    this.isDockable = opts?.isDockable ?? false;

    if (!this.boxEl && !opts?.skipDomCreation) {
      const parentDom = opts?.parentId ? getEl(opts.parentId) : document.getElementsByTagName('body')[0];

      parentDom.insertAdjacentHTML('beforeend', html`
        <div id="${this.boxId}" class="draggable-box" style="pointer-events:auto;">
          <div class="draggable-box__title-bar">
            <div class="draggable-box__title">
              <span>
                ${this.getBoxTitleHtml()}
              </span>
            </div>
            ${this.isDockable ? `<span id="${this.boxId}-dock" class="draggable-box__btn draggable-box__dock-btn"></span>` : ''}
            <span id="${this.boxId}-close" class="draggable-box__btn draggable-box__close-btn"></span>
          </div>
          <div class="draggable-box__content">
            ${opts?.boxContentHtml ?? this.getBoxContentHtml()}
          </div>
        </div>
      `);
    }

    EventBus.getInstance().on(Events.ROUTE_CHANGED, () => {
      this.close();
    });
  }

  protected abstract getBoxContentHtml(): string;

  protected onOpen(): void {
    if (!this.boxEl) {
      this.boxEl = getEl(this.boxId);
      this.initDraggabilly_();
      this.onOpen();
    }
    getEl(`${this.boxId}-close`)!.addEventListener('click', () => this.close());

    if (this.isDockable) {
      getEl(`${this.boxId}-dock`)!.addEventListener('click', () => this.dock());
    }

    this.sendToFront();
  }

  open(cb?: () => void) {
    if (this.boxEl) {
      showEl(this.boxEl);
      const boxContent = getEl(`${this.boxId}`)!;

      if (this.width) {
        boxContent.style.minWidth = this.width;
      }

      if (this.height) {
        boxContent.style.minHeight = this.height;
      }

      if (cb) {
        cb();
      }

      // Centre on the first open only (after cb, so offsetHeight/offsetWidth
      // are the real ones). A reopened box comes back where the player left
      // it; re-centring on every open put the checklist and the Working
      // Document back over the console (nats-s14-F2, s24-F5). A box that
      // would reopen off-screen (window resized since) is centred again.
      if (!this.hasBeenPlaced_ || !this.isOnScreen_(boxContent)) {
        this.placeOnFirstOpen(boxContent);
        this.hasBeenPlaced_ = true;
      }
      this.sendToFront();
    } else {
      console.log(`Failed to open box: ${this.boxId}`);
    }
  }

  /** Set once the box has been positioned; later opens keep its (dragged) position */
  private hasBeenPlaced_ = false;

  /**
   * Where the box goes the first time it opens. Default: centred in the
   * window (accounting for page scroll). Override to dock it instead.
   */
  protected placeOnFirstOpen(boxContent: HTMLElement): void {
    boxContent.style.top = `${window.scrollY + (displayViewport().height - boxContent.offsetHeight) / 2}px`;
    boxContent.style.left = `${(displayViewport().width - boxContent.offsetWidth) / 2}px`;
  }

  /** Whether the box's title bar is inside the window (so the player can grab it) */
  private isOnScreen_(boxContent: HTMLElement): boolean {
    const left = parseFloat(boxContent.style.left);
    const top = parseFloat(boxContent.style.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) {
      return false;
    }

    return left < displayViewport().width - 40 && left + Math.max(boxContent.offsetWidth, 40) > 40 && top >= window.scrollY && top < window.scrollY + displayViewport().height - 20;
  }

  protected getBoxTitleHtml(): string {
    return this.title;
  }

  protected initDraggabilly_() {
    const boxContent = getEl(`${this.boxId}`);

    if (boxContent && !this.draggie) {
      this.draggie = new Draggabilly(boxContent, {
        containment: getEl('root')!,
      });
      scaleDragging(this.draggie, boxContent, getEl('root')!);
      this.draggie.on('dragStart', () => {
        boxContent.style.height = 'fit-content';
        boxContent.style.maxHeight = '80%';
      });
      this.draggie.on('pointerDown', () => {
        this.sendToFront();
      });
      boxContent.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button === 2) {
          boxContent.style.top = `${(window.scrollY + (displayViewport().height - boxContent.offsetHeight) / 2)}px`;
          boxContent.style.left = `${(displayViewport().width - boxContent.offsetWidth) / 2}px`;
          this.sendToFront();
        }
      });
    }
  }

  protected sendToFront() {
    getEl(`${this.boxId}`)!.style.zIndex = DraggableBox.increaseMaxZIndex().toString();
  }

  close(cb?: () => void) {
    if (this.boxEl) {
      this.boxEl.style.display = 'none';
      // ServiceLocator.getSoundManager()?.play(SoundNames.CLICK);
      if (cb) {
        cb();
      }
    }
  }

  dock(cb?: () => void) {
    if (this.boxEl) {
      this.boxEl.style.display = 'none';
      // ServiceLocator.getSoundManager()?.play(SoundNames.CLICK);
      if (cb) {
        cb();
      }
    }
  }
}
