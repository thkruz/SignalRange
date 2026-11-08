import { Sfx } from './sfx-enum';
import SoundManager from './sound-manager';

const MENU = '.selection-page, .game-menu, .complete-modal, .mission-loading-screen, #modal-profile, .header, #header, .mission-alarm-heading';
let installed = false;

/** Delegation survives menu replacement; equipment and quizzes keep their event-driven audio. */
export function initializeUiSounds(): void {
  if (installed) return;
  installed = true;
  document.addEventListener(
    'click',
    (event) => {
      const control = (event.target as Element | null)?.closest<HTMLElement>('button, a[href], [role="tab"], input[type="checkbox"]');
      if (!control?.closest(MENU) || control.dataset.sound === 'none') return;
      const action = `${control.dataset.action ?? ''} ${control.id} ${control.className}`;
      const sound = control.matches(':disabled, [aria-disabled="true"]')
        ? Sfx.UI_ERROR
        : /back|cancel|close|resume/iu.test(action)
          ? Sfx.UI_BACK
          : /confirm|launch|continue|next|play-again|replay/iu.test(action)
            ? Sfx.UI_CONFIRM
            : Sfx.UI_CLICK;
      SoundManager.getInstance().play(sound);
    },
    true
  );
  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>('button:disabled, [aria-disabled="true"]');
      if (target?.closest(MENU)) SoundManager.getInstance().play(Sfx.UI_ERROR);
    },
    true
  );
  window.addEventListener('beforeprint', () => SoundManager.getInstance().play(Sfx.PRINTER));
  document.addEventListener(
    'cancel',
    (event) => {
      if ((event.target as Element | null)?.matches('.game-menu')) SoundManager.getInstance().play(Sfx.UI_BACK);
    },
    true
  );
}
