import { ScenarioManager } from '@app/scenario-manager';
import { SimClock } from '@app/simulation/sim-clock';
import { syncManager } from '@app/sync/storage';
import html2canvas from 'html2canvas';

export interface FeedbackSnapshot {
  capturedAt: string;
  version: string;
  commit: string;
  route: string;
  scenarioId: string | null;
  viewport: { width: number; height: number; pixelRatio: number };
  screen: { dialogs: string[]; tabs: string[] };
  clock: { runMs: number; scenarioMs: number; speed: number };
  gameState: unknown;
}

/** Capture only game data: never auth storage, cookies, full URLs or user profiles. */
export function captureFeedbackState(): FeedbackSnapshot {
  let scenarioId: string | null = null;
  try {
    scenarioId = ScenarioManager.getInstance().data?.id ?? null;
  } catch {
    // Selection screens do not have a scenario yet.
  }
  const visible = (selector: string): string[] =>
    Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => element.id || element.className);
  return {
    capturedAt: new Date().toISOString(),
    version: __APP_VERSION__,
    commit: __GIT_COMMIT_SHA__,
    route: location.pathname,
    scenarioId,
    viewport: { width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio },
    screen: { dialogs: visible('dialog[open], [role="dialog"], .draggable-modal'), tabs: visible('[role="tab"][aria-selected="true"], .nav-link.active') },
    clock: { runMs: SimClock.runMs(), scenarioMs: SimClock.scenarioElapsedMs(), speed: SimClock.speed },
    gameState: JSON.parse(JSON.stringify(syncManager.getCurrentState())),
  };
}

/** html2canvas clones synchronously, before the feedback dialog is shown. */
export async function captureFeedbackScreen(): Promise<string> {
  const dialogs = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).map((dialog) => ({
    bounds: dialog.getBoundingClientRect(),
    background: getComputedStyle(dialog).backgroundColor,
    backdrop: getComputedStyle(dialog, '::backdrop').backgroundColor,
  }));
  const canvas = await html2canvas(document.body, {
    width: innerWidth,
    height: innerHeight,
    x: scrollX,
    y: scrollY,
    scale: Math.min(1, 1920 / innerWidth, 1080 / innerHeight),
    useCORS: true,
    allowTaint: false,
    logging: false,
    imageTimeout: 5000,
    backgroundColor: '#0b1119',
    ignoreElements: (element) =>
      element.hasAttribute('data-feedback-ui') ||
      element.matches('#profile-btn, #profile-name, #profile-email, #profile-initials, input[type="password"], input[type="email"], [data-feedback-private]'),
    onclone: (clone) => {
      // Cloned dialogs lose the browser's top layer. Preserve their viewport
      // positions and stacking explicitly without changing the live game.
      clone.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach((dialog, index) => {
        const original = dialogs[index];
        if (!original) return;
        const { bounds } = original;
        const backdrop = clone.createElement('div');
        Object.assign(backdrop.style, { position: 'fixed', inset: '0', background: original.backdrop, zIndex: `${2147480000 + index * 2}` });
        clone.body.append(backdrop);
        Object.assign(dialog.style, {
          position: 'fixed',
          left: `${bounds.left}px`,
          top: `${bounds.top}px`,
          width: `${bounds.width}px`,
          height: `${bounds.height}px`,
          margin: '0',
          maxHeight: 'none',
          boxSizing: 'border-box',
          transform: 'none',
          animation: 'none',
          opacity: '1',
          background: original.background,
          zIndex: `${2147480001 + index * 2}`,
        });
      });
      // Native range inputs otherwise render as text fields in html2canvas.
      clone.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((input) => {
        const track = clone.createElement('div');
        track.style.cssText = 'position:relative;height:6px;margin:10px 0;border-radius:4px;background:#646b74;flex:1';
        const thumb = clone.createElement('div');
        const min = Number(input.min || 0);
        const max = Number(input.max || 100);
        const ratio = Math.max(0, Math.min(1, (Number(input.value) - min) / (max - min || 1)));
        thumb.style.cssText = `position:absolute;left:${ratio * 100}%;top:-5px;width:16px;height:16px;border-radius:50%;background:#d6dce4;transform:translateX(-50%)`;
        track.append(thumb);
        input.replaceWith(track);
      });
    },
  });
  const screenshot = canvas.toDataURL('image/jpeg', 0.85);
  if (!screenshot.startsWith('data:image/jpeg;base64,') || screenshot.length > 3_000_000) throw new Error('Screen capture is too large.');
  return screenshot;
}
