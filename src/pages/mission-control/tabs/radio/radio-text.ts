/**
 * Dialog text is authored with HTML (`<p>`, `<br>`, `<b>`). The radio pad and subtitle are plain-text surfaces
 * that escape everything, so the tags would print literally. Reduce authored HTML to plain paragraphs.
 */

/** Plain-text paragraphs of an authored HTML string (no tags, entities decoded, empty paragraphs dropped) */
export function toPlainParagraphs(html: string): string[] {
  if (!html) return [];
  const withBreaks = html.replace(/<\s*br\s*\/?>/giu, '\n').replace(/<\/\s*(p|div|li|h[1-6])\s*>/giu, '\n');
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');

  return (doc.body.textContent ?? '')
    .split(/\n+/u)
    .map((p) => p.replace(/\s+/gu, ' ').trim())
    .filter((p) => p.length > 0);
}

/** One-line plain text (paragraphs joined with a space) */
export function toPlainLine(html: string): string {
  return toPlainParagraphs(html).join(' ');
}
