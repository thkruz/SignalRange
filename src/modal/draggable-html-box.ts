import { DraggableBox } from '@app/engine/ui/draggable-box';
import { html } from '@app/engine/utils/development/formatter';
import { getEl } from '@app/engine/utils/get-el';
import { ObjectivesManager } from '@app/objectives/objectives-manager';
import { updateChecklistWithMotion } from '@app/presentation/transitions';
import { Sfx } from '@app/sound/sfx-enum';
import SoundManager from '@app/sound/sound-manager';
import './draggable-html-box.css';

export class DraggableHtmlBox extends DraggableBox {
  /** Live boxes, so Escape can close the topmost one */
  private static readonly instances_ = new Set<DraggableHtmlBox>();
  private static isEscapeBound_ = false;

  readonly popupDom: HTMLElement;
  isOpen: boolean = true;
  onClose: () => void;

  /**
   * Escape closes the topmost open popup (brief, checklist, working document).
   * Keys pressed inside the brief's cross-origin iframe never reach this
   * page, so the player clicks the title bar first (nats-s06-F5).
   */
  private static handleEscape_(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    let top: DraggableHtmlBox | null = null;
    let topZ = -Infinity;
    for (const box of DraggableHtmlBox.instances_) {
      // The box's own element, not a lookup by id: a later scenario reuses the id
      const el = box.boxEl;
      if (!el?.isConnected) {
        // Its page was torn down; forget it
        DraggableHtmlBox.instances_.delete(box);
        continue;
      }
      if (!box.isOpen || el.style.display === 'none') continue;
      const z = Number(el.style.zIndex) || 0;
      if (z > topZ) {
        topZ = z;
        top = box;
      }
    }
    if (top) {
      e.preventDefault();
      SoundManager.getInstance().play(Sfx.UI_BACK);
      top.close();
    }
  }

  constructor(title: string, id: string, url?: string, parentId = 'sandbox-page') {
    super(`draggable-html-box-${id}`, {
      title,
      parentId,
      hasSiteDockButton: id === 'checklist',
      boxContentHtml: html`
      <div id="draggable-html-box-content-${id}" style="width:100%;height:100%;">
        ${url ? `<iframe src="${url}" style="width:600px;height:600px;max-height:calc(70vh - 5px);border:none;"></iframe>` : ''}
      </div>
    `.trim(),
    });

    this.popupDom = getEl(`draggable-html-box-content-${id}`);

    // Register this box as opened for objective tracking
    ObjectivesManager.registerOpenedBox(id);

    DraggableHtmlBox.instances_.add(this);
    if (!DraggableHtmlBox.isEscapeBound_) {
      document.addEventListener('keydown', DraggableHtmlBox.handleEscape_);
      DraggableHtmlBox.isEscapeBound_ = true;
    }

    this.onOpen();
  }

  protected getBoxContentHtml(): string {
    return ''; // Not used
  }

  protected onOpen(): void {
    super.onOpen();
    this.isOpen = true;
  }

  /**
   * On the field console (the tent control is present) the checklist docks at
   * the top right on first open, clear of the Site scene hotspots; elsewhere
   * it centres as before. The player can still drag it (c6-s02-F5).
   */
  protected placeOnFirstOpen(boxContent: HTMLElement): void {
    if (this.boxId !== 'draggable-html-box-checklist' || !document.getElementById('tent-control')) {
      super.placeOnFirstOpen(boxContent);
      return;
    }
    // Narrow and top-right: the strip beside the scene is empty, while a bottom dock covered the Service checks table (c6-s02-F5)
    this.dockBesideSite_(boxContent, false);
  }

  /** The checklist re-opens (objective change, icon click) docked beside the Site stage, never at a dragged spot */
  protected shouldRedockOnOpen(): boolean {
    return this.boxId === 'draggable-html-box-checklist' && this.canDockBesideSite();
  }

  open(cb?: () => void): void {
    super.open(cb);
    const dockBtn = this.boxEl?.querySelector<HTMLElement>('.draggable-box__site-dock-btn');
    if (dockBtn) dockBtn.style.display = this.canDockBesideSite() ? '' : 'none';
    this.isOpen = true;
  }

  /**
   * An objective change brings the checklist back to its dock: a dragged open box returns to the strip, and a closed
   * one re-opens there so the player sees the new open rows (c6-s02-F5). No-op where the checklist is not docked.
   */
  redockForObjectiveChange(): void {
    if (this.shouldRedockOnOpen()) {
      this.open();
    }
  }

  updateContent(lastChecklistHtml_: string) {
    updateChecklistWithMotion(this.popupDom, lastChecklistHtml_);
  }

  close(cb?: () => void): void {
    super.close(cb);
    if (this.onClose) {
      this.onClose();
    }
    this.isOpen = false;
  }
}
