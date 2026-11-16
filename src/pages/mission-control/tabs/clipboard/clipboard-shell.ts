import board from '@app/assets/images/ui/field-clipboard/board.png';
import paper from '@app/assets/images/ui/field-clipboard/paper.jpg';
import './clipboard-shell.css';

/**
 * ClipboardShell - The C6 field clipboard as one held object.
 *
 * A worn board with a steel clip at the top holds the sheet the player is on; the other sheets show as
 * paper tabs down the right edge. The sheet itself is a borrowed node (a workspace panel or the cover
 * sheet), so the shell only frames it and sheet state survives flipping and putting the board down.
 */

export interface ClipboardPage {
  /** Tab id for field workspaces, `cover` for the cover sheet */
  id: string;
  label: string;
  /** Marks the tab on the board edge, for example a count of unread memos; read again every second while the board is held */
  badge?: () => string | undefined;
  open: () => void;
}

export interface ClipboardShellOptions {
  pages: ClipboardPage[];
  activeId: string;
}

export class ClipboardShell {
  readonly element: HTMLElement;
  private readonly tabs_: HTMLElement;
  private badgeTimer_: number | null = null;

  constructor(content: HTMLElement, leave: HTMLButtonElement, options: ClipboardShellOptions) {
    this.element = document.createElement('section');
    this.element.className = 'cbk';
    this.element.style.setProperty('--cbk-board', `url("${board}")`);
    this.element.style.setProperty('--cbk-paper', `url("${paper}")`);
    const boardEl = document.createElement('div');
    boardEl.className = 'cbk-board';
    const sheet = document.createElement('div');
    sheet.className = 'cbk-paper';
    sheet.append(content);
    this.tabs_ = document.createElement('nav');
    this.tabs_.className = 'cbk-tabs';
    this.tabs_.setAttribute('aria-label', 'Clipboard pages');
    for (const page of options.pages) this.tabs_.append(this.tab_(page, page.id === options.activeId));
    // The put-down tag hangs from the foot of the board, so the board and its way out read as one object
    leave.classList.add('cbk-leave');
    boardEl.append(sheet, this.tabs_, leave);
    this.element.append(boardEl);
    const badged = options.pages.filter((page) => page.badge);
    if (badged.length > 0) {
      const refresh = (): void => {
        for (const page of badged) this.setBadge(page.id, page.badge?.());
      };
      refresh();
      this.badgeTimer_ = window.setInterval(refresh, 1000);
    }
  }

  /** Update the marker on one page tab */
  setBadge(id: string, badge: string | undefined): void {
    const tab = this.tabs_.querySelector<HTMLElement>(`[data-cbk-page="${id}"]`);
    if (!tab) return;
    if (badge) tab.dataset.badge = badge;
    else delete tab.dataset.badge;
  }

  dispose(): void {
    if (this.badgeTimer_ !== null) window.clearInterval(this.badgeTimer_);
    this.element.remove();
  }

  private tab_(page: ClipboardPage, active: boolean): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = page.label;
    button.dataset.cbkPage = page.id;
    if (page.id === 'cover') button.dataset.fieldClipboard = 'cover';
    else button.dataset.fieldObject = page.id;
    button.setAttribute('aria-pressed', String(active));
    button.addEventListener('click', () => {
      if (!active) page.open();
    });

    return button;
  }
}
