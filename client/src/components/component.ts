/**
 * Base Component Class
 * All UI components should extend this class
 */
export abstract class Component<T = any> {
  protected element: HTMLElement | null = null;
  protected props: T;

  constructor(props?: T) {
    this.props = props ?? {} as T;
  }

  /**
   * Render the component and return the DOM element
   */
  public abstract render(): HTMLElement;

  /**
   * Update component props and re-render
   */
  public update(newProps: Partial<T>): void {
    this.props = { ...this.props, ...newProps };
    if (this.element?.parentElement) {
      const newElement = this.render();
      this.element.parentElement.replaceChild(newElement, this.element);
    }
  }

  /**
   * Mount the component to a parent element
   */
  public mount(parent: HTMLElement): void {
    const element = this.render();
    parent.appendChild(element);
  }

  /**
   * Unmount the component from its parent
   */
  public unmount(): void {
    this.element?.remove();
    this.element = null;
  }

  /**
   * Create an HTML element with optional classes and attributes
   */
  protected createElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options?: {
      className?: string | string[];
      id?: string;
      attributes?: Record<string, string>;
      styles?: Partial<CSSStyleDeclaration>;
      innerHTML?: string;
      textContent?: string;
    }
  ): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);

    if (options?.className) {
      const classes = Array.isArray(options.className) ? options.className : [options.className];
      element.classList.add(...classes);
    }

    if (options?.id) {
      element.id = options.id;
    }

    if (options?.attributes) {
      Object.entries(options.attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
    }

    if (options?.styles) {
      Object.assign(element.style, options.styles);
    }

    if (options?.innerHTML) {
      element.innerHTML = options.innerHTML;
    }

    if (options?.textContent) {
      element.textContent = options.textContent;
    }

    return element;
  }

  /**
   * Add event listener to an element
   */
  protected addEventListener<K extends keyof HTMLElementEventMap>(
    element: HTMLElement,
    event: K,
    handler: (event: HTMLElementEventMap[K]) => void
  ): void {
    element.addEventListener(event, handler as EventListener);
  }
}