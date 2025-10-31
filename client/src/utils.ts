/**
 * Template literal helper for HTML
 * Used in development for formatting template literals
 * Example: html`<div>example</div>`
 */
export const html = (strings: TemplateStringsArray, ...placeholders: any[]): string => {
  for (const placeholder of placeholders) {
    if (typeof placeholder !== 'string' && typeof placeholder !== 'number' && typeof placeholder !== 'boolean') {
      console.error('Invalid input to html template', placeholder);
    }
  }

  return String.raw(strings, ...placeholders);
};

/**
 * Safely escape HTML to prevent XSS
 */
export const escapeHtml = (str: string): string => {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

/**
 * Query selector helper with type safety
 */
export const qs = <T extends HTMLElement = HTMLElement>(selector: string, parent: Document | HTMLElement = document): T | null => {
  return parent.querySelector<T>(selector);
};

/**
 * Query all selector helper with type safety
 */
export const qsa = <T extends HTMLElement = HTMLElement>(selector: string, parent: Document | HTMLElement = document): T[] => {
  return Array.from(parent.querySelectorAll<T>(selector));
};