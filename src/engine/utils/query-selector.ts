/**
 * Query selector helper with type safety
 */

export const qs = <T extends HTMLElement = HTMLElement>(selector: string, parent: Document | HTMLElement = document): T => {
  const queriedElement = parent.querySelector<T>(selector);

  if (!queriedElement) {
    throw new Error(`Element not found for selector: ${selector}`);
  }

  return queriedElement;
};
/**
 * Query all selector helper with type safety
 */

export const qsa = <T extends HTMLElement = HTMLElement>(selector: string, parent: Document | HTMLElement = document): T[] => {
  return Array.from(parent.querySelectorAll<T>(selector));
};
