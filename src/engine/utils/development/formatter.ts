import { errorManagerInstance } from '../errorManager';

/**
 * This is not a standard function. It is used in development for formatting template literals.
 * example: html\`\<div>example\</div>\`
 */
export const html = (strings: TemplateStringsArray, ...placeholders: (string | number)[]) => {
  for (const placeholder of placeholders) {
    if (typeof placeholder !== 'string' && typeof placeholder !== 'number') {
      errorManagerInstance.error(new Error('Invalid input'), 'html');
    }
    if (typeof placeholder === 'number' && !isFinite(placeholder)) {
      errorManagerInstance.error(new Error('Invalid number input'), 'html');
    }
    // Convert numbers to strings
    if (typeof placeholder === 'number') {
      placeholders[placeholders.indexOf(placeholder)] = placeholder.toString();
    }
  }

  return String.raw(strings, ...placeholders);
};

/**
 * This is not a standard function. It is used in development for formatting template literals.
 * example: glsl\`uniform float example\`
 */
export const glsl = (literals: TemplateStringsArray, ...placeholders: string[]): string => {
  let str = '';

  for (let i = 0; i < placeholders.length; i++) {
    str += literals[i];
    str += placeholders[i];
  }
  str += literals.at(-1);

  return str;
};
