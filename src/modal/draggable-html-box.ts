import { DraggableBox } from "@app/engine/ui/draggable-box";
import { html } from "@app/engine/utils/development/formatter";
import { getEl } from "@app/engine/utils/get-el";
import './draggable-html-box.css';

export class DraggableHtmlBox extends DraggableBox {
  protected readonly popupDom: HTMLElement;
  isOpen: boolean = true;
  onClose: () => void;

  constructor(title: string, id: string, url?: string,) {
    super(`draggable-html-box-${id}`,
      {
        title,
        parentId: 'sandbox-page',
        boxContentHtml: html`
      <div id="draggable-html-box-content-${id}" style="width:100%;height:100%;">
        ${url ? `<iframe src="${url}" style="width:600px;height:600px;border:none;"></iframe>` : ''}
      </div>
    `.trim()
      });

    this.popupDom = getEl(`draggable-html-box-content-${id}`);

    this.onOpen();
  }

  protected getBoxContentHtml(): string {
    return ''; // Not used
  }

  protected onOpen(): void {
    super.onOpen();
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
