import { BaseElement } from "../components/base-element";

/**
 * Abstract base class for page components
 * Contains common functionality shared across different pages
 */
export abstract class AbstractPage extends BaseElement {
  protected container: HTMLElement;
  protected isInitialized: boolean = false;

  constructor(protected containerId: string) {
    super();

    this.container = document.getElementById(containerId)!;

    if (!this.container) {
      const bodyContent = document.getElementsByClassName('body-content')[0];
      if (bodyContent) {
        this.container = document.createElement('div');
        this.container.id = containerId;
        bodyContent.appendChild(this.container);
      } else {
        throw new Error('Body content container not found');
      }
    }
  }

  /**
   * Clean up resources when page is destroyed
   */
  destroy(): void {
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.isInitialized = false;
  }

  /**
   * Show the page
   */
  show(): void {
    if (this.container) {
      this.container.style.display = 'block';
      if (!this.isInitialized) {
        this.init();
        this.isInitialized = true;
      }
    }
  }

  /**
   * Hide the page
   */
  hide(): void {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  /**
   * Common method to show loading state
   */
  protected showLoading(message: string = 'Loading...'): void {
    if (this.container) {
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'loading';
      loadingDiv.textContent = message;
      this.container.appendChild(loadingDiv);
    }
  }

  /**
   * Common method to hide loading state
   */
  protected hideLoading(): void {
    if (this.container) {
      const loadingElements = this.container.querySelectorAll('.loading');
      loadingElements.forEach(el => el.remove());
    }
  }

  /**
   * Common method to display errors
   */
  protected showError(error: string): void {
    if (this.container) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error';
      errorDiv.textContent = error;
      this.container.appendChild(errorDiv);
    }
  }

  /**
   * Common method to clear errors
   */
  protected clearErrors(): void {
    if (this.container) {
      const errorElements = this.container.querySelectorAll('.error');
      errorElements.forEach(el => el.remove());
    }
  }

  /**
   * Common validation helper
   */
  protected validateRequired(value: string, fieldName: string): boolean {
    if (!value || value.trim() === '') {
      this.showError(`${fieldName} is required`);
      return false;
    }
    return true;
  }

  /**
   * Common method to get form data
   */
  protected getFormData(formSelector: string): FormData | null {
    if (!this.container) return null;

    const form = this.container.querySelector(formSelector) as HTMLFormElement;
    return form ? new FormData(form) : null;
  }
}