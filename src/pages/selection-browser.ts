import { prefersReducedMotion } from '@app/game-menu/display-preferences';
import { preloadArtwork, TRANSITION_MS } from '@app/presentation/transitions';
import './selection-motion.css';

/** Independent switches for the selection-page motion audition. */
export const SELECTION_MOTION = { signalSweep: true, orbitalTrace: false, detailReveal: true, hoverEmphasis: false };
const detailMotion = new WeakMap<HTMLElement, { animations: Animation[]; outgoing?: HTMLImageElement }>();

function configureSelectionMotion(page: HTMLElement | null): void {
  if (!page) return;
  page.classList.toggle('selection-motion-sweep', SELECTION_MOTION.signalSweep);
  page.classList.toggle('selection-motion-orbit', SELECTION_MOTION.orbitalTrace);
  page.classList.toggle('selection-motion-hover', SELECTION_MOTION.hoverEmphasis);
  const heading = page.querySelector('.selection-heading');
  if (heading && !heading.querySelector('.selection-orbit')) {
    const orbit = document.createElement('span');
    orbit.className = 'selection-orbit';
    orbit.setAttribute('aria-hidden', 'true');
    orbit.append(document.createElement('span'));
    heading.append(orbit);
  }
}

function cancelDetailMotion(detail: HTMLElement): void {
  const previous = detailMotion.get(detail);
  detailMotion.delete(detail);
  previous?.animations.forEach((animation) => animation.cancel());
  previous?.outgoing?.remove();
}

function revealSelectionDetail(detail: HTMLElement, outgoing?: HTMLImageElement): void {
  if (!SELECTION_MOTION.detailReveal || prefersReducedMotion() || typeof detail.animate !== 'function') return;
  const state: { animations: Animation[]; outgoing?: HTMLImageElement } = { animations: [] };
  detailMotion.set(detail, state);
  const groups = [detail.querySelector('.selection-briefing h2'), detail.querySelector('.selection-description'), detail.querySelector('.selection-actions')];
  groups.forEach((element, index) => {
    if (!element) return;
    const animation = element.animate(
      [
        { opacity: 0.35, transform: 'translateY(4px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      {
        duration: 160,
        delay: index * 30,
        easing: 'ease-out',
        fill: 'backwards',
      }
    );
    state.animations.push(animation);
  });
  const art = detail.querySelector('.selection-art');
  const incoming = art?.querySelector('img');
  if (outgoing && art && incoming) {
    state.outgoing = outgoing;
    outgoing.classList.add('selection-art-outgoing');
    outgoing.alt = '';
    outgoing.setAttribute('aria-hidden', 'true');
    art.append(outgoing);
    // Hold decoded previous artwork until the replacement can actually paint.
    const ready = typeof incoming.decode === 'function' ? incoming.decode().catch(() => {}) : Promise.resolve();
    void ready.then(() => {
      if (detailMotion.get(detail) !== state || !detail.isConnected) return;
      if (prefersReducedMotion()) {
        outgoing.remove();
        return;
      }
      const fade = outgoing.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out', fill: 'forwards' });
      state.animations.push(fade);
      void fade.finished.catch(() => {}).then(() => outgoing.remove());
    });
  }
}

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
  configureSelectionMotion(detail.closest('.selection-page'));
  cancelDetailMotion(detail);
  const template = document.createElement('template');
  template.innerHTML = markup;
  const oldImage = detail.querySelector('img');
  const nextImage = template.content.querySelector('img');
  const changed = oldImage?.getAttribute('src') !== nextImage?.getAttribute('src') || detail.querySelector('h2')?.textContent !== template.content.querySelector('h2')?.textContent;
  const wasVisible = detail.getClientRects().length > 0;
  const outgoing = oldImage && nextImage && oldImage.getAttribute('src') !== nextImage.getAttribute('src') ? oldImage : undefined;
  if (outgoing) outgoing.style.transform = getComputedStyle(outgoing).transform;
  if (nextImage?.getAttribute('src')) preloadArtwork(nextImage.getAttribute('src')!);
  if (oldImage && nextImage && oldImage.getAttribute('src') === nextImage.getAttribute('src')) nextImage.replaceWith(oldImage);
  const briefingScroll = detail.querySelector('.selection-briefing')?.scrollTop ?? 0;
  const active = detail.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
  const actionClass = active?.classList[0];
  detail.replaceChildren(template.content);
  const briefing = detail.querySelector('.selection-briefing');
  if (briefing) briefing.scrollTop = briefingScroll;
  if (actionClass) detail.querySelector<HTMLButtonElement>(`button.${actionClass}:not(:disabled)`)?.focus({ preventScroll: true });
  if (changed && wasVisible) revealSelectionDetail(detail, outgoing);
}

export function animateSelection(element: HTMLElement): void {
  configureSelectionMotion(element.closest('.selection-page'));
  // Detail changes own their crossfade; fading their parent would dim both images.
  if (element.matches('.selection-detail')) return;
  if (typeof element.animate !== 'function' || prefersReducedMotion()) return;
  for (const animation of element.getAnimations()) animation.cancel();
  element.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: TRANSITION_MS.interface, easing: 'ease-out' });
  const detail = element.querySelector<HTMLElement>('.selection-detail');
  if (detail) {
    cancelDetailMotion(detail);
    revealSelectionDetail(detail);
  }
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
  const page =
    Array.from(document.querySelectorAll<HTMLElement>('.selection-page')).find((element) => element.style.display === 'flex') ??
    document.querySelector<HTMLElement>('#app-shell-page');
  if (!page || typeof page.animate !== 'function' || prefersReducedMotion()) {
    navigate();
    return;
  }
  page.inert = true;
  const fade = page.animate([{ opacity: 1 }, { opacity: 0 }], { duration: TRANSITION_MS.scene, easing: 'ease-out', fill: 'forwards' });
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
