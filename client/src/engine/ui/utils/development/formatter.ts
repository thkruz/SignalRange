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
