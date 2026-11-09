import { tr } from '../strings';
import type { TerminalScreenId } from '../terminal-skin';
import type { TerminalScreen, TerminalScreenFactory } from './terminal-screen';

/** A plain "coming soon" screen for a dashboard screen no package has built yet */
export function placeholderScreen(id: TerminalScreenId): TerminalScreenFactory {
  return (): TerminalScreen => ({
    id,
    mount(container) {
      container.innerHTML = `<div class="card"><div class="card-body text-center py-5"><h3 class="mb-2">${tr('placeholder.title')}</h3><div class="text-secondary">${tr('placeholder.body')}</div></div></div>`;
    },
    sync() {
      // Static
    },
    dispose() {
      // Nothing to release
    },
  });
}
