import { displayViewport } from '@app/game-menu/display-viewport';
import './immersive-view.css';

/** A focused in-world activity. Existing nodes are borrowed, never rebuilt. */
export class ImmersiveView {
  private dialog_: HTMLDialogElement | null = null;
  private marker_: Comment | null = null;
  private content_: HTMLElement | null = null;
  private opener_: HTMLElement | null = null;
  private dispose_: (() => void) | null = null;

  /**
   * `frame` wraps the borrowed content in an in-world object (the laptop shell) and receives the leave
   * button to place; it returns the element to show and a cleanup run on close.
   */
  open(
    content: HTMLElement,
    title: string,
    kind: 'equipment' | 'computer' | 'paper' | 'laptop',
    leave: () => void,
    navigation?: HTMLElement,
    frame?: (content: HTMLElement, leave: HTMLButtonElement) => { element: HTMLElement; dispose: () => void }
  ): void {
    this.close();
    this.opener_ = document.activeElement as HTMLElement | null;
    this.marker_ = document.createComment('immersive-return');
    content.before(this.marker_);
    this.content_ = content;
    const dialog = document.createElement('dialog');
    dialog.className = `immersive-view immersive-${kind}`;
    dialog.setAttribute('aria-label', title);
    const back = document.createElement('button');
    back.className = 'immersive-leave';
    back.textContent = kind === 'paper' ? 'Put down · Esc' : 'Step back · Esc';
    back.addEventListener('click', leave);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      leave();
    });
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        leave();
      }
      if (event.key === 'Tab') {
        const items = [
          ...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'),
        ].filter((el) => el.getClientRects().length > 0);
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
      event.stopPropagation();
    });
    if (navigation) dialog.append(navigation);
    if (frame) {
      const framed = frame(content, back);
      this.dispose_ = framed.dispose;
      dialog.append(framed.element);
    } else {
      dialog.append(content, back);
    }
    document.body.append(dialog);
    this.dialog_ = dialog;
    this.resize_();
    window.addEventListener('resize', this.resize_);
    dialog.showModal();
    back.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.dialog_) return;
    window.removeEventListener('resize', this.resize_);
    this.dialog_.close();
    this.dispose_?.();
    this.dispose_ = null;
    if (this.content_) this.marker_?.replaceWith(this.content_);
    this.dialog_.remove();
    this.dialog_ = null;
    this.content_ = null;
    this.marker_ = null;
    if (this.opener_?.isConnected) this.opener_.focus({ preventScroll: true });
  }

  private readonly resize_ = (): void => {
    const { width, height } = displayViewport();
    this.dialog_?.style.setProperty('width', `${width}px`);
    this.dialog_?.style.setProperty('height', `${height}px`);
  };
}
