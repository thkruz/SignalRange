/**
 * @file plain-text - Scenario copy that carries a little markup, as plain paragraphs
 * @description Descriptions and dialog text hold `<br/>`, `<p>` and entities (`&amp;`). Parsing them (the parser
 * never runs scripts) decodes entities and drops only real tags, so a literal "SNR < 10 dB" survives.
 */

const BLOCKS = 'p,div,li,h1,h2,h3,h4,h5,h6,tr,blockquote';

/** The text of `html` as non-empty paragraphs: each `<br>`, block element and raw newline starts a new one */
export function htmlToParagraphs(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const br of doc.body.querySelectorAll('br')) br.replaceWith('\n');
  for (const block of doc.body.querySelectorAll(BLOCKS)) block.append('\n');

  return (doc.body.textContent ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}
