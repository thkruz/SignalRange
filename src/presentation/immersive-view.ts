import { displayViewport } from '@app/game-menu/display-viewport';
import './immersive-view.css';

/** Told when a held object is picked up (`open`) and just before it is put down (`closing`), dialog still connected. */
export type ImmersiveViewListener = (dialog: HTMLDialogElement, change: 'open' | 'closing') => void;

/** A focused in-world activity. Existing nodes are borrowed, never rebuilt. */
export class ImmersiveView {
  /** Views holding an object now, oldest first */
  private static readonly held_: ImmersiveView[] = [];
  private static readonly listeners_ = new Set<ImmersiveViewListener>();

  /**
   * Put down every held object the way the player would (its leave action, so the owner restores its own state).
   * Global surfaces that must be seen (the quiz the player asked for) use this instead of reaching into the dialog.
   */
  static closeAll(): void {
    for (const view of [...ImmersiveView.held_].reverse()) {
      view.leave_?.();
      view.close();
    }
  }

  /** The dialog of the most recently held object, or null when nothing is held */
  static topDialog(): HTMLDialogElement | null {
    return ImmersiveView.held_.at(-1)?.dialog_ ?? null;
  }

  /** Follow objects being picked up and put down; returns the unsubscribe */
  static onChange(listener: ImmersiveViewListener): () => void {
    ImmersiveView.listeners_.add(listener);

    return () => ImmersiveView.listeners_.delete(listener);
  }

  private static notify_(dialog: HTMLDialogElement, change: 'open' | 'closing'): void {
    for (const listener of [...ImmersiveView.listeners_]) listener(dialog, change);
  }

  private dialog_: HTMLDialogElement | null = null;
  private leave_: (() => void) | null = null;
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
    kind: 'equipment' | 'computer' | 'paper' | 'laptop' | 'transceiver',
    leave: () => void,
    navigation?: HTMLElement,
    frame?: (content: HTMLElement, leave: HTMLButtonElement) => { element: HTMLElement; dispose: () => void }
  ): void {
    this.close();
    this.opener_ = document.activeElement as HTMLElement | null;
    this.leave_ = leave;
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
    ImmersiveView.held_.push(this);
    ImmersiveView.notify_(dialog, 'open');
  }

  /** Whether this view is holding an object now */
  isOpen(): boolean {
    return this.dialog_ !== null;
  }

  close(): void {
    if (!this.dialog_) return;
    const index = ImmersiveView.held_.indexOf(this);
    if (index >= 0) ImmersiveView.held_.splice(index, 1);
    ImmersiveView.notify_(this.dialog_, 'closing');
    this.leave_ = null;
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
