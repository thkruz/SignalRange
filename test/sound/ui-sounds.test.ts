import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sfx } from '../../src/sound/sfx-enum';
import SoundManager from '../../src/sound/sound-manager';
import { initializeUiSounds } from '../../src/sound/ui-sounds';

const play = vi.fn();
beforeEach(() => {
  play.mockClear();
  vi.spyOn(SoundManager, 'getInstance').mockReturnValue({ play } as unknown as SoundManager);
  initializeUiSounds();
  document.body.innerHTML =
    '<div class="game-menu"><button id="choice">Choice</button><button data-action="back">Back</button><button data-action="confirm">Confirm</button><button disabled>Locked</button></div><button id="equipment">Equipment</button>';
});
describe('menu sounds', () => {
  it('sounds sidebar links and draggable close controls, and honors Resume semantics', () => {
    document.body.innerHTML =
      '<aside class="asset-tree-sidebar"><a class="list-group-item-action">Checklist</a></aside><div class="draggable-box__title-bar"><span class="draggable-box__close-btn"></span></div><div class="selection-page"><button id="campaign-continue" data-sound="back">Resume mission</button></div>';
    for (const selector of ['a', '.draggable-box__close-btn', '#campaign-continue']) document.querySelector<HTMLElement>(selector)!.click();
    expect(play.mock.calls.map(([sound]) => sound)).toEqual([Sfx.UI_CLICK, Sfx.UI_BACK, Sfx.UI_BACK]);
  });
  it('plays selection, back, and confirm once without duplicating equipment sounds', () => {
    for (const selector of ['#choice', '[data-action="back"]', '[data-action="confirm"]', '#equipment']) document.querySelector<HTMLButtonElement>(selector)!.click();
    expect(play.mock.calls.map(([sound]) => sound)).toEqual([Sfx.UI_CLICK, Sfx.UI_BACK, Sfx.UI_CONFIRM]);
  });
  it('provides unavailable-action feedback without enabling the control', () => {
    const button = document.querySelector<HTMLButtonElement>('[disabled]')!;
    button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(play).toHaveBeenCalledWith(Sfx.UI_ERROR);
    expect(button.disabled).toBe(true);
  });
});
