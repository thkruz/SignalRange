import { SimClock } from '@app/simulation/sim-clock';
import SoundManager from '@app/sound/sound-manager';

const owners = new Set<string>();

/** Each overlay releases only its own hold; brief/quiz/hidden holds remain intact. */
export function setMenuPause(owner: string, paused: boolean): void {
  if (paused) owners.add(owner);
  else owners.delete(owner);
  const held = owners.size > 0;
  if (held) SimClock.pause('menu');
  else SimClock.resume('menu');
  SoundManager.getInstance().setMenuPaused(held);
}
