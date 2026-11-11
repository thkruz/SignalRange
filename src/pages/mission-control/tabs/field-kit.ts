import cardsPng from '@app/assets/images/ui/field-kit/cards.png';
import clipboardJpg from '@app/assets/images/ui/field-kit/clipboard.jpg';
import documentsJpg from '@app/assets/images/ui/field-kit/documents.jpg';
import logbookPng from '@app/assets/images/ui/field-kit/logbook.png';
import notebookJpg from '@app/assets/images/ui/field-kit/notebook.jpg';
import radioJpg from '@app/assets/images/ui/field-kit/radio.jpg';

/** Mission-section items that live in the field kit instead of the station computer's sidebar. */
export type MissionItem = 'brief' | 'checklist' | 'dialog-history' | 'ops-log' | 'working-doc' | 'campaign-record';

/**
 * How the field kit reaches the mission windows. The asset tree sidebar fills this in when it is built; the
 * Site tab reads it, so the Site tab does not import the sidebar (that import closed a module cycle through
 * ObjectivesManager and the draggable boxes).
 */
export const missionItemBridge: {
  available: (item: MissionItem) => boolean;
  open: (item: MissionItem) => boolean;
  /** The scenario is still locked behind its mission brief */
  locked: () => boolean;
} = {
  available: () => false,
  open: () => false,
  locked: () => false,
};

/**
 * A page of a kit object: a workspace (a field tab, or a page of the Campaign 3 bench logbook), or a mission item
 * opened in its own window.
 */
export type KitSheet = { label: string; tabId: string } | { label: string; mission: MissionItem } | { label: string; clipboard: 'cover' };

export type FieldKitId = 'radio' | 'clipboard' | 'documents' | 'notebook' | 'logbook' | 'cards';

export interface FieldKitObject {
  id: FieldKitId;
  label: string;
  image: string;
  /** Pages in the order the object opens them; the first offered one opens on pick-up. */
  sheets: KitSheet[];
}

/** The four objects on the tray along the bottom of the Site view. */
export const FIELD_KIT: readonly FieldKitObject[] = [
  { id: 'radio', label: 'Radio', image: radioJpg, sheets: [{ label: 'Dialog history', mission: 'dialog-history' }] },
  {
    id: 'clipboard',
    label: 'Clipboard',
    image: clipboardJpg,
    sheets: [
      { label: 'Cover sheet', clipboard: 'cover' },
      { label: 'Handover form', tabId: 'field-handover' },
      { label: 'Equipment log', tabId: 'field-records' },
    ],
  },
  {
    id: 'documents',
    label: 'Documents',
    image: documentsJpg,
    sheets: [
      { label: 'Wiring diagram', tabId: 'field-path' },
      { label: 'Power plan', tabId: 'field-power' },
    ],
  },
  {
    id: 'notebook',
    label: 'Notebook',
    image: notebookJpg,
    sheets: [
      { label: 'Field notebook', tabId: 'field-notebook' },
      { label: 'Working document', mission: 'working-doc' },
      { label: 'Campaign record', mission: 'campaign-record' },
      { label: 'Ops log', mission: 'ops-log' },
    ],
  },
];

/**
 * Campaign 3: the two objects beside the bench. The logbook holds the worksheets, the station log and the
 * mission papers; its "Conversations" page is the dialog history (the station log already has a QSO
 * "Contacts" tab). Page ids starting `ham-` are pages of the Station tab, not mission-control tabs.
 */
export const BENCH_KIT: readonly FieldKitObject[] = [
  {
    id: 'logbook',
    label: 'Logbook',
    image: logbookPng,
    sheets: [
      { label: 'Worksheets', tabId: 'ham-worksheets' },
      { label: 'Station log', tabId: 'ham-log' },
      { label: 'Checklist', mission: 'checklist' },
      { label: 'Mission brief', mission: 'brief' },
      { label: 'Conversations', mission: 'dialog-history' },
      { label: 'Working document', mission: 'working-doc' },
      { label: 'Campaign record', mission: 'campaign-record' },
      { label: 'Ops log', mission: 'ops-log' },
    ],
  },
  { id: 'cards', label: 'Reference cards', image: cardsPng, sheets: [{ label: 'Reference cards', tabId: 'ham-cards' }] },
];

/** The kit object a workspace tab belongs to, or null (laptop, workloads, site). */
export function kitObjectFor(tabId: string, kit: readonly FieldKitObject[] = FIELD_KIT): FieldKitObject | null {
  return kit.find((item) => item.sheets.some((sheet) => 'tabId' in sheet && sheet.tabId === tabId)) ?? null;
}

/** The pages of a kit object the scenario offers: workspace tabs it lists and mission items that exist. */
export function offeredSheets(item: FieldKitObject, offeredTabs: ReadonlySet<string>, missionAvailable: (mission: MissionItem) => boolean): KitSheet[] {
  return item.sheets.filter((sheet) => {
    if ('tabId' in sheet) return offeredTabs.has(sheet.tabId);
    // The clipboard's cover sheet carries the task list, so it exists whenever the scenario has a checklist
    if ('clipboard' in sheet) return missionAvailable('checklist');

    return missionAvailable(sheet.mission);
  });
}

/** The pages of the clipboard the scenario offers, cover sheet first */
export function clipboardSheets(offeredTabs: ReadonlySet<string>, missionAvailable: (mission: MissionItem) => boolean): KitSheet[] {
  const item = FIELD_KIT.find((kit) => kit.id === 'clipboard');

  return item ? offeredSheets(item, offeredTabs, missionAvailable) : [];
}

/**
 * The row of other pages shown across the top of an open kit object. Picking one asks the caller to open it;
 * the page on screen is marked pressed.
 */
export function kitSheetsNav(
  tabId: string,
  offeredTabs: ReadonlySet<string>,
  missionAvailable: (mission: MissionItem) => boolean,
  open: (sheet: KitSheet) => void,
  kit: readonly FieldKitObject[] = FIELD_KIT
): HTMLElement | undefined {
  const item = kitObjectFor(tabId, kit);
  if (!item) return undefined;
  const sheets = offeredSheets(item, offeredTabs, missionAvailable);
  if (sheets.length < 2) return undefined;
  const nav = document.createElement('nav');
  nav.className = 'immersive-apps field-kit-sheets';
  nav.setAttribute('aria-label', `${item.label} pages`);
  for (const sheet of sheets) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = sheet.label;
    if ('tabId' in sheet) {
      button.dataset.fieldObject = sheet.tabId;
      button.setAttribute('aria-pressed', String(sheet.tabId === tabId));
    } else if ('clipboard' in sheet) {
      button.dataset.fieldClipboard = sheet.clipboard;
    } else {
      button.dataset.fieldMission = sheet.mission;
    }
    button.addEventListener('click', () => open(sheet));
    nav.append(button);
  }

  return nav;
}
