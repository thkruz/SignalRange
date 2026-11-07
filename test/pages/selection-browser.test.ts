import { afterEach, describe, expect, it, vi } from 'vitest';
import { selectionKeyboard, updateSelectionDetail, updateSelectionList } from '../../src/pages/selection-browser';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('selection browser', () => {
  it('retains keyboard focus and scroll when progress replaces the list', () => {
    document.body.innerHTML = '<div class="selection-list"><button class="selection-item" data-selection-id="two">Two</button></div>';
    const list = document.querySelector<HTMLElement>('.selection-list')!;
    list.querySelector('button')!.focus();
    list.scrollTop = 120;
    updateSelectionList(list, '<button class="selection-item" data-selection-id="two">Two completed</button>');
    expect((document.activeElement as HTMLElement).dataset.selectionId).toBe('two');
    expect(list.scrollTop).toBe(120);
  });

  it('keeps the decoded artwork when the launch controls change after loading', () => {
    document.body.innerHTML = '<section id="detail"><img src="/art.jpg"><div class="selection-briefing">Brief</div><button class="launch">Start</button></section>';
    const detail = document.querySelector<HTMLElement>('#detail')!;
    const image = detail.querySelector('img');
    detail.querySelector('button')!.focus();
    updateSelectionDetail(detail, '<img src="/art.jpg"><div class="selection-briefing">Brief</div><button class="launch">Continue</button>');
    expect(detail.querySelector('img')).toBe(image);
    expect(document.activeElement?.textContent).toBe('Continue');
  });

  it('arrow keys select the next row without invoking a launch action', () => {
    document.body.innerHTML = '<div class="selection-list"><button class="selection-item">One</button><button class="selection-item">Two</button></div>';
    const list = document.querySelector<HTMLElement>('.selection-list')!;
    const buttons = list.querySelectorAll('button');
    const select = vi.fn();
    buttons[1].addEventListener('click', select);
    list.addEventListener('keydown', selectionKeyboard);
    buttons[0].focus();
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(buttons[1]);
    expect(select).toHaveBeenCalledOnce();
  });
});
