import graphPaper from '@app/assets/images/ui/field-documents/graph-paper.jpg';
import laminate from '@app/assets/images/ui/field-documents/laminate.jpg';
import './documents-shell.css';

/**
 * DocumentsShell - The C6 field documents held as one printed sheet.
 *
 * The wiring diagram is a laminated print (grease pencil on the laminate); the power plan is a planning
 * sheet on graph paper. The sheet itself is a borrowed node (the workspace panel), so the shell only frames it
 * and sheet state survives flipping and putting the sheet down. The other document shows as a tab on the right edge.
 */

export interface DocumentsPage {
  /** Workspace tab id (`field-path`, `field-power`) */
  id: string;
  label: string;
  open: () => void;
}

export interface DocumentsShellOptions {
  pages: DocumentsPage[];
  activeId: string;
}

export class DocumentsShell {
  readonly element: HTMLElement;

  constructor(content: HTMLElement, leave: HTMLButtonElement, options: DocumentsShellOptions) {
    this.element = document.createElement('section');
    this.element.className = 'docs';
    this.element.dataset.docsSheet = options.activeId;
    this.element.style.setProperty('--docs-laminate', `url("${laminate}")`);
    this.element.style.setProperty('--docs-graph', `url("${graphPaper}")`);
    const sheet = document.createElement('div');
    sheet.className = 'docs-sheet';
    sheet.append(content);
    const tabs = document.createElement('nav');
    tabs.className = 'docs-tabs';
    tabs.setAttribute('aria-label', 'Documents');
    for (const page of options.pages) tabs.append(this.tab_(page, page.id === options.activeId));
    leave.classList.add('docs-leave');
    const holder = document.createElement('div');
    holder.className = 'docs-holder';
    holder.append(sheet, tabs, leave);
    this.element.append(holder);
  }

  dispose(): void {
    this.element.remove();
  }

  private tab_(page: DocumentsPage, active: boolean): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = page.label;
    button.dataset.fieldObject = page.id;
    button.setAttribute('aria-pressed', String(active));
    button.addEventListener('click', () => {
      if (!active) page.open();
    });

    return button;
  }
}
