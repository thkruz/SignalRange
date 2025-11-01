import { BaseElement } from "./base-element";

/**
 * Base Component Class
 * All UI components should extend this class
 */
export abstract class Component<T = any> extends BaseElement {
  protected element: HTMLElement | null = null;
  protected props: T;

  constructor(props?: T) {
    super();
    this.props = props ?? {} as T;
  }

  /**
   * Update component props and re-render
   */
  public update(newProps: Partial<T>): void {
    this.props = { ...this.props, ...newProps };
    if (this.element?.parentElement) {
      const newElement = this.initializeDom();
      this.element.parentElement.replaceChild(newElement, this.element);
    }
  }
}