import { html } from "../utils";

export abstract class BaseElement {
  protected html = html``;
  protected element: HTMLElement | null = null;

  init(): void {
    this.initializeDom();
    this.setupEventListeners();
  }

  /**
   * Render the component and return the DOM element
   */
  initializeDom(parentId?: string): HTMLElement {
    if (parentId) {
      const parentDom = document.getElementById(parentId);
      if (!parentDom) throw new Error(`Parent element ${parentId} not found`);

      parentDom.innerHTML = this.html;

      return parentDom;
    }

    if (!this.element) {
      const template = document.createElement('template');
      template.innerHTML = this.html.trim();
      this.element = template.content.firstElementChild as HTMLElement;
    }

    return this.element;
  }

  /**
   * Set up event listeners for the component
   * To be overridden by subclasses
   */
  protected setupEventListeners(): void {
    // Default implementation does nothing
  }
}