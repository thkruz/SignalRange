import { scaleDragging } from '@app/game-menu/scaled-drag';
import { displayScale, displayViewport } from '@app/game-menu/display-viewport';
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

/** Docking for tabs that need the centre of the screen clear */
export interface DockLeftPolicy {
  /** Windows open with their top edge level with this element */
  topEl: HTMLElement;
  /** Width in layout px for list windows (checklist, history) */
  width: () => number;
  /** Width in layout px for windows that show a page (the brief) */
  wideWidth: () => number;
  /** Left edge in layout px (default 8) */
  left?: () => number;
  /** Called after a window opens or closes, with whether any docked window is now on screen */
  onChange?: (anyDocked: boolean) => void;
}

export abstract class DraggableBox {
  protected boxId: string;
  protected boxEl: HTMLElement | null = null;
  protected draggie: Draggabilly | null = null;
  protected width: string | null = null;
  protected title: string = '';
  private static zIndexCounter_ = 10000;
  /**
   * Where floating windows open. 'left' docks them against the left edge, below
   * the top of `dockTopEl`, so a tab that needs the centre of the screen (the C3
   * bench) stays clickable. Set by that tab; null is the centred default.
   */
  private static dockLeft_: DockLeftPolicy | null = null;
  /** Every box built, so a dock change can move the ones already on screen */
  private static readonly all_ = new Set<DraggableBox>();

  static get dockLeft(): DockLeftPolicy | null {
    return DraggableBox.dockLeft_;
  }

  /** Change the docking policy and move every open window to match */
  static set dockLeft(policy: DockLeftPolicy | null) {
    DraggableBox.dockLeft_ = policy;
    for (const box of DraggableBox.all_) {
      if (!box.boxEl?.isConnected) {
        DraggableBox.all_.delete(box);
        continue;
      }
      if (box.isShowing() && box.placedDocked_ !== Boolean(policy)) box.place_(box.boxEl);
    }
    DraggableBox.notifyDock_();
  }

  /** Tell the docking tab whether any docked window is showing, so it can make room */
  private static notifyDock_(): void {
    const policy = DraggableBox.dockLeft_;
    if (!policy?.onChange) return;
    let any = false;
    for (const box of DraggableBox.all_) {
      if (box.placedDocked_ && box.isShowing()) any = true;
    }
    policy.onChange(any);
  }
  /** Whether the box was last placed docked, so a box reopens docked after the policy changes */
  private placedDocked_ = false;
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
    DraggableBox.all_.add(this);

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
            <button type="button" id="${this.boxId}-close" class="draggable-box__close-btn" title="Close this window" aria-label="Close ${this.title}">&#x2715; Close</button>
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

      if (this.width && !(DraggableBox.dockLeft && this.placedDocked_)) {
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
      if (!this.hasBeenPlaced_ || this.placedDocked_ !== Boolean(DraggableBox.dockLeft) || !this.isOnScreen_(boxContent)) {
        this.place_(boxContent);
      }
      this.sendToFront();
      DraggableBox.notifyDock_();
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

  /** Put the box where the current docking policy wants it */
  private place_(boxContent: HTMLElement): void {
    const dock = DraggableBox.dockLeft;
    if (dock) {
      this.placeDockedLeft_(boxContent, dock);
    } else {
      boxContent.classList.remove('is-docked-left');
      boxContent.style.width = '';
      boxContent.style.maxHeight = '';
      if (this.width) boxContent.style.minWidth = this.width;
      this.placeOnFirstOpen(boxContent);
    }
    this.hasBeenPlaced_ = true;
    this.placedDocked_ = Boolean(dock);
  }

  /** Dock against the left edge, from the top of the dock element down to the bottom of the window */
  private placeDockedLeft_(boxContent: HTMLElement, dock: DockLeftPolicy): void {
    const scale = displayScale();
    const frame = boxContent.querySelector<HTMLIFrameElement>('iframe');
    const width = Math.round(frame ? dock.wideWidth() : dock.width());
    if (frame) frame.style.width = '100%';
    const rect = dock.topEl.getBoundingClientRect();
    const top = window.scrollY + (rect.height > 0 ? rect.top / scale : 100);
    boxContent.classList.add('is-docked-left');
    boxContent.style.left = `${Math.round(dock.left?.() ?? 8)}px`;
    boxContent.style.top = `${top}px`;
    boxContent.style.width = `${width}px`;
    boxContent.style.minWidth = `${width}px`;
    boxContent.style.maxHeight = `${displayViewport().height - (top - window.scrollY) - 40}px`;
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

  /** Whether the window is on screen (a second click on its sidebar item closes it) */
  isShowing(): boolean {
    return Boolean(this.boxEl?.isConnected && this.boxEl.style.display !== 'none');
  }

  close(cb?: () => void) {
    if (this.boxEl) {
      this.boxEl.style.display = 'none';
      DraggableBox.notifyDock_();
      // ServiceLocator.getSoundManager()?.play(SoundNames.CLICK);
      if (cb) {
        cb();
      }
    }
  }

  dock(cb?: () => void) {
    if (this.boxEl) {
      this.boxEl.style.display = 'none';
      DraggableBox.notifyDock_();
      // ServiceLocator.getSoundManager()?.play(SoundNames.CLICK);
      if (cb) {
        cb();
      }
    }
  }
}
