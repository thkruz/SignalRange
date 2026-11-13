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
  /** Adds a visible "Dock" control to the header that returns the box to the docked strip beside the Site stage */
  hasSiteDockButton?: boolean;
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
  private readonly hasSiteDockButton_: boolean;
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
    this.hasSiteDockButton_ = opts?.hasSiteDockButton ?? false;
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
            ${this.hasSiteDockButton_ ? `<button type="button" id="${this.boxId}-site-dock" class="draggable-box__site-dock-btn" title="Return this box to the docked strip beside the Site stage">Dock</button>` : ''}
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

    if (this.hasSiteDockButton_) {
      getEl(`${this.boxId}-site-dock`)?.addEventListener('click', () => this.redockBesideSite());
    }

    this.sendToFront();
  }

  /** Boxes that always come back to the docked strip when opened (so a dragged spot is never kept); default false */
  protected shouldRedockOnOpen(): boolean {
    return false;
  }

  /** Whether the Site-dock control applies right now (the field console, where the Site stage exists) */
  protected canDockBesideSite(): boolean {
    return !!document.getElementById('tent-control');
  }

  /** Returns the box to the docked strip beside the Site stage and reflows the stage (the header "Dock" control) */
  redockBesideSite(): void {
    const boxContent = this.boxEl;
    if (!boxContent || !this.canDockBesideSite()) return;
    this.releaseSiteGutter_();
    this.placeOnFirstOpen(boxContent);
    this.hasBeenPlaced_ = true;
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
      // The C3 bench's left dock wins while it is set; otherwise the field console's Site dock applies (placeOnFirstOpen)
      if (!this.hasBeenPlaced_ || this.placedDocked_ !== Boolean(DraggableBox.dockLeft) || !this.isOnScreen_(boxContent) || (!DraggableBox.dockLeft && this.shouldRedockOnOpen())) {
        this.place_(boxContent);
      } else if (!this.placedDocked_) {
        this.reserveSiteGutter_();
      }
      this.sendToFront();
      this.yieldToReadingBoxes_();
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
    if (document.getElementById('tent-control')) {
      this.dockBesideSite_(boxContent);

      return;
    }
    boxContent.style.top = `${window.scrollY + (displayViewport().height - boxContent.offsetHeight) / 2}px`;
    boxContent.style.left = `${(displayViewport().width - boxContent.offsetWidth) / 2}px`;
  }

  /** Boxes already docked beside the Site stage, so each new one cascades instead of hiding the last (c6-s02-F5, c6-s09-F4/F6) */
  private static siteDockCount_ = 0;

  /**
   * On the field console the Site stage (hotspots, path diagram tiles) fills the middle, so a centred box swallows
   * clicks meant for it. First opens go to a narrow top-right strip, each one offset a little from the last.
   */
  protected dockBesideSite_(boxContent: HTMLElement, cascade = true): void {
    const vp = displayViewport();
    const width = Math.min(360, Math.max(260, vp.width * 0.25));
    // A box that asks for its own column sits left of the strip, level with the first box, so neither covers the other
    const column = this.siteDockColumn_() ? width + 16 : 0;
    const step = column > 0 ? 0 : (cascade ? (DraggableBox.siteDockCount_++ % 5) * 28 : 0);
    boxContent.style.width = `${width}px`;
    boxContent.style.maxWidth = `${width}px`;
    boxContent.style.maxHeight = `${Math.max(240, vp.height - 190 - step)}px`;
    boxContent.style.overflowY = 'auto';
    boxContent.style.left = `${Math.max(8, vp.width - width - 16 - step - column)}px`;
    // Under the field HUD the strip starts below the watch cluster (watch, tent caption), never over it
    const hudBottom = document.querySelector('.mc-minimal-hud .mc-hud-cluster')?.getBoundingClientRect().bottom ?? 0;
    const top = Math.max(150, Math.ceil(hudBottom) + 16);
    boxContent.style.top = `${window.scrollY + top + step}px`;
    // Reserve the strip so the Site stage shrinks to fit beside the box instead of sitting under it (c6-s02-F5)
    this.siteGutter_ = width + 16 + step + column + 12;
    this.reserveSiteGutter_();
  }

  /** Whether this box docks in its own column left of the other docked boxes instead of cascading over them; default no */
  protected siteDockColumn_(): boolean {
    return false;
  }

  /** Right-hand strip (px) this box takes beside the Site stage while it is open; 0 when not docked */
  private siteGutter_ = 0;

  /** Open boxes docked beside the Site stage, for the widest strip to keep clear */
  private static readonly siteDocked_ = new Set<DraggableBox>();

  private reserveSiteGutter_(): void {
    if (this.siteGutter_ > 0) DraggableBox.siteDocked_.add(this);
    DraggableBox.applySiteGutter_();
  }

  private releaseSiteGutter_(): void {
    DraggableBox.siteDocked_.delete(this);
    DraggableBox.applySiteGutter_();
  }

  private static applySiteGutter_(): void {
    let gutter = 0;
    for (const box of DraggableBox.siteDocked_) gutter = Math.max(gutter, box.siteGutter_);
    document.documentElement.style.setProperty('--site-dock-gutter', `${gutter}px`);
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
        // A dragged box is floating: the Site stage takes its strip back until the player re-docks it
        this.releaseSiteGutter_();
        this.siteGutter_ = 0;
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

  /**
   * Boxes that must stay above every docked or floating box while open: a close-up's X would otherwise be
   * covered by the Checklist box whenever an objective change brings it forward (c6-s02-F5, c6-s07-F5).
   */
  private static readonly TOP_LAYER_IDS_ = ['part-closeup-modal'];

  /**
   * Boxes the player opened to read (the Campaign Record). The Checklist re-opens by itself on every objective change and
   * would otherwise cover them, including their Close button; it goes just behind them instead. Clicking the Checklist
   * still raises it (sendToFront from the pointer handler).
   */
  private static readonly READING_BOX_IDS_ = ['draggable-html-box-campaign-record'];

  private yieldToReadingBoxes_(): void {
    if (this.boxId !== 'draggable-html-box-checklist' || !this.boxEl) return;
    for (const id of DraggableBox.READING_BOX_IDS_) {
      const other = document.getElementById(id);
      const otherZ = Number(other?.style.zIndex) || 0;
      if (other && other.isConnected && other.style.display !== 'none' && otherZ > 0) {
        this.boxEl.style.zIndex = Math.max(1, Math.min(Number(this.boxEl.style.zIndex) || otherZ, otherZ - 1)).toString();
      }
    }
  }

  protected sendToFront() {
    const el = getEl(`${this.boxId}`)!;
    let z = DraggableBox.increaseMaxZIndex();
    if (!DraggableBox.TOP_LAYER_IDS_.includes(this.boxId)) {
      for (const id of DraggableBox.TOP_LAYER_IDS_) {
        const top = document.getElementById(`${id}-container`);
        const topZ = Number(top?.style.zIndex) || 0;
        if (top && top.style.display !== 'none' && top.isConnected && topZ > 0 && topZ <= z) {
          z = topZ - 1;
        }
      }
    }
    el.style.zIndex = z.toString();
  }

  /** Whether the window is on screen (a second click on its sidebar item closes it) */
  isShowing(): boolean {
    return Boolean(this.boxEl?.isConnected && this.boxEl.style.display !== 'none');
  }

  close(cb?: () => void) {
    if (this.boxEl) {
      this.releaseSiteGutter_();
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
      this.releaseSiteGutter_();
      this.boxEl.style.display = 'none';
      DraggableBox.notifyDock_();
      // ServiceLocator.getSoundManager()?.play(SoundNames.CLICK);
      if (cb) {
        cb();
      }
    }
  }
}
