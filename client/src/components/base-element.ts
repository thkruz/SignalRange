import { html } from "../utils";

export abstract class BaseElement {
  protected html = html``;
  protected element: HTMLElement | null = null;

  init(): void {
    this.render();
    this.setupEventListeners();
  }

  /**
   * Render the component and return the DOM element
   */
  render(): HTMLElement {
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