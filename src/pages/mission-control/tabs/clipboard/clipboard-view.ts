import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { ImmersiveView } from '@app/presentation/immersive-view';
import { clipboardSheets, type MissionItem } from '../field-kit';
import { ClipboardCover } from './clipboard-cover';
import { type ClipboardPage, ClipboardShell } from './clipboard-shell';

/** The pages of the clipboard the scenario offers; the cover opens through `openCover` */
export function clipboardPages(
  offered: ReadonlySet<string>,
  missionAvailable: (mission: MissionItem) => boolean,
  openCover: () => void,
  unreadNotices: () => number = () => 0
): ClipboardPage[] {
  const pages: ClipboardPage[] = [];
  for (const sheet of clipboardSheets(offered, missionAvailable)) {
    if ('clipboard' in sheet) {
      pages.push({ id: 'cover', label: sheet.label, open: openCover });
    } else if ('tabId' in sheet) {
      const tabId = sheet.tabId;
      const page: ClipboardPage = { id: tabId, label: sheet.label, open: () => EventBus.getInstance().emit(Events.SWITCH_TAB, { tabId }) };
      // Unread notices mark the equipment log's tab
      if (tabId === 'field-records') page.badge = () => (unreadNotices() > 0 ? String(unreadNotices()) : undefined);
      pages.push(page);
    }
  }

  return pages;
}

/**
 * ClipboardView - Holds the clipboard open at its cover sheet. A tab for the handover form or the
 * equipment log puts this view down and switches to that workspace, which the canvas then holds on the
 * same board.
 */
export class ClipboardView {
  private static instance_: ClipboardView | null = null;
  private readonly immersive_ = new ImmersiveView();
  private cover_: ClipboardCover | null = null;

  static get(): ClipboardView {
    ClipboardView.instance_ ??= new ClipboardView();

    return ClipboardView.instance_;
  }

  get isOpen(): boolean {
    return this.immersive_.isOpen();
  }

  /** `pages` are the clipboard's tabs as the scenario offers them */
  open(pages: ClipboardPage[]): void {
    if (this.immersive_.isOpen()) return;
    this.cover_ = new ClipboardCover();
    this.immersive_.open(
      this.cover_.element,
      'Field documents',
      'paper',
      () => this.close(),
      undefined,
      (content, leave) => {
        const shell = new ClipboardShell(content, leave, { pages, activeId: 'cover' });
        // Picking a form page puts the cover down first; the canvas then holds that page on the board
        for (const tab of shell.element.querySelectorAll<HTMLButtonElement>('.cbk-tabs button')) {
          tab.addEventListener('click', () => this.close(), { capture: true });
        }

        return { element: shell.element, dispose: () => shell.dispose() };
      }
    );
  }

  close(): void {
    this.immersive_.close();
    this.cover_?.dispose();
    this.cover_ = null;
  }
}
