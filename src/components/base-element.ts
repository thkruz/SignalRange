
export abstract class BaseElement {
  protected abstract html_: string;
  protected dom_: HTMLElement | null = null;
  protected domCacehe_: { [key: string]: HTMLElement } = {};

  get dom(): HTMLElement | null {
    return this.dom_;
  }

  protected init_(parentId = 'root', type: 'add' | 'replace' = 'replace'): void {
    this.initDom_(parentId, type);
    this.addEventListeners_();
  }

  /**
   * Render the component and return the DOM element
   */
  protected initDom_(parentId: string, type: 'add' | 'replace' = 'replace'): HTMLElement {
    if (parentId) {
      const parentDom = document.getElementById(parentId);
      if (!parentDom) throw new Error(`Parent element ${parentId} not found`);

      if (type === 'replace') {
        parentDom.innerHTML = this.html_;
      } else {
        parentDom.insertAdjacentHTML('beforeend', this.html_);
      }

      return parentDom;
    }

    if (!this.dom_) {
      const template = document.createElement('template');
      template.innerHTML = this.html_.trim();
      this.dom_ = template.content.firstElementChild as HTMLElement;
    }

    return this.dom_;
  }

  /**
   * Set up event listeners for the component
   * To be overridden by subclasses
   */
  protected abstract addEventListeners_(): void;
}