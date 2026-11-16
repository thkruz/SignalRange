import { toPlainLine, toPlainParagraphs } from '@app/pages/mission-control/tabs/radio/radio-text';
import { describe, expect, it } from 'vitest';

describe('radio-text', () => {
  it('turns paragraphs into plain strings with no tags', () => {
    const out = toPlainParagraphs('<p>The application has stopped updating.</p><p>Check the <b>hub</b> &amp; wait.</p>');
    expect(out).toEqual(['The application has stopped updating.', 'Check the hub & wait.']);
    for (const p of out) expect(p).not.toMatch(/[<>]/u);
  });

  it('splits on br and drops empty paragraphs', () => {
    expect(toPlainParagraphs('one<br>two<br/><p> </p>three')).toEqual(['one', 'two', 'three']);
  });

  it('never yields markup from hostile input', () => {
    expect(toPlainLine('<img src=x onerror=alert(1)>hi')).toBe('hi');
  });

  it('joins paragraphs into one line', () => {
    expect(toPlainLine('<p>a</p><p>b</p>')).toBe('a b');
  });
});
