import { prefersReducedMotion } from '@app/game-menu/display-preferences';

/** Shared interaction for the two mission-library screens. */
export function selectionKeyboard(event: KeyboardEvent): void {
  const target = event.target as HTMLElement;
  if (!target.matches('.selection-item, .selection-phase-toggle')) return;
  if (target.matches('.selection-phase-toggle') && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault();
    if ((target.getAttribute('aria-expanded') === 'true') !== (event.key === 'ArrowRight')) target.click();
    return;
  }
  const list = target.closest('.selection-list');
  const items = Array.from(list?.querySelectorAll<HTMLButtonElement>('.selection-item, .selection-phase-toggle') ?? []).filter((item) => !item.closest('[hidden]'));
  const index = items.indexOf(target as HTMLButtonElement);
  let next = index;
  if (event.key === 'ArrowDown') next = Math.min(index + 1, items.length - 1);
  else if (event.key === 'ArrowUp') next = Math.max(index - 1, 0);
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = items.length - 1;
  else return;
  event.preventDefault();
  items[next]?.focus();
  if (items[next]?.matches('.selection-item')) items[next].click();
}

/** Keep scroll and keyboard position when asynchronous progress updates arrive. */
export function updateSelectionList(list: HTMLElement, markup: string): void {
  const focused = list.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.selectionId : null;
  const scroll = list.scrollTop;
  list.innerHTML = markup;
  if (focused) {
    Array.from(list.querySelectorAll<HTMLButtonElement>('.selection-item, .selection-phase-toggle'))
      .find((item) => item.dataset.selectionId === focused)
      ?.focus({ preventScroll: true });
  }
  list.scrollTop = scroll;
}

/** Reuse decoded artwork and retain action focus across progress refreshes. */
export function updateSelectionDetail(detail: HTMLElement, markup: string): void {
  const template = document.createElement('template');
  template.innerHTML = markup;
  const oldImage = detail.querySelector('img');
  const nextImage = template.content.querySelector('img');
  if (oldImage && nextImage && oldImage.getAttribute('src') === nextImage.getAttribute('src')) nextImage.replaceWith(oldImage);
  const briefingScroll = detail.querySelector('.selection-briefing')?.scrollTop ?? 0;
  const active = detail.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
  const actionClass = active?.classList[0];
  detail.replaceChildren(template.content);
  const briefing = detail.querySelector('.selection-briefing');
  if (briefing) briefing.scrollTop = briefingScroll;
  if (actionClass) detail.querySelector<HTMLButtonElement>(`button.${actionClass}:not(:disabled)`)?.focus({ preventScroll: true });
}

export function animateSelection(element: HTMLElement): void {
  if (typeof element.animate !== 'function' || prefersReducedMotion()) return;
  for (const animation of element.getAnimations()) animation.cancel();
  element.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
}

let pendingExit: { page: HTMLElement; fade: Animation } | null = null;

export function cancelSelectionExit(): void {
  if (!pendingExit) return;
  const { page, fade } = pendingExit;
  pendingExit = null;
  page.inert = false;
  fade.cancel();
}

/** Fade a menu out before the router replaces it. No delay in reduced-motion mode. */
export function leaveSelection(navigate: () => void): void {
  cancelSelectionExit();
  const page = Array.from(document.querySelectorAll<HTMLElement>('.selection-page')).find((element) => element.style.display === 'flex');
  if (!page || typeof page.animate !== 'function' || prefersReducedMotion()) {
    navigate();
    return;
  }
  page.inert = true;
  const fade = page.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-in', fill: 'forwards' });
  pendingExit = { page, fade };
  void fade.finished
    .catch(() => {})
    .then(() => {
      if (pendingExit?.fade !== fade) return;
      pendingExit = null;
      page.inert = false;
      fade.cancel();
      navigate();
    });
}

/** Content is authored HTML; use this only for plain labels and attributes. */
export function selectionText(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
}
