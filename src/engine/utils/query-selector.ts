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
