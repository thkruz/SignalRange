import { DraggableBox } from '@app/engine/ui/draggable-box';
import { html } from '@app/engine/utils/development/formatter';
import { getEl } from '@app/engine/utils/get-el';
import { ObjectivesManager } from '@app/objectives/objectives-manager';
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
      top.close();
    }
  }

  constructor(title: string, id: string, url?: string, parentId = 'sandbox-page') {
    super(`draggable-html-box-${id}`, {
      title,
      parentId,
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

  open(cb?: () => void): void {
    super.open(cb);
    this.isOpen = true;
  }

  updateContent(lastChecklistHtml_: string) {
    this.popupDom.innerHTML = lastChecklistHtml_;
  }

  close(cb?: () => void): void {
    super.close(cb);
    if (this.onClose) {
      this.onClose();
    }
    this.isOpen = false;
  }
}
