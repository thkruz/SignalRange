/**
 * Campaign 3 bench objects: the bench with a device close-up, and the transceiver front panel.
 * The real HamStationTab runs on a standalone manager; states are reached by the same clicks a player makes.
 */
import { HamStationTab } from '@app/pages/mission-control/tabs/ham-station-tab';
import { createGalleryBench } from './fixtures/ham-bench';
import type { GalleryEntry } from './gallery-types';

const HOST_ID = 'gallery-ham-host';

const byId = (id: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

function bench(steps: string[]): () => void {
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.className = 'gallery-ham-host';
  document.body.append(host);
  const manager = createGalleryBench();
  const tab = new HamStationTab(manager, HOST_ID);
  for (const id of steps) byId(id)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  return () => {
    tab.dispose();
    host.remove();
  };
}

const PICK_MOBILE = ['ham-bench-dev-mobile', 'ham-radio-mobile-operate'];

export const HAM_ENTRIES: GalleryEntry[] = [
  { entry: 'bench', state: 'overview', title: 'C3 bench, nothing selected', mount: () => bench([]) },
  { entry: 'bench', state: 'closeup', title: 'C3 bench, SDR close-up with faceplate', mount: () => bench(['ham-bench-dev-sdr']) },
  { entry: 'transceiver', state: 'idle', title: 'Transceiver front panel, idle', mount: () => bench(PICK_MOBILE) },
  { entry: 'transceiver', state: 'tx', title: 'Transceiver front panel, keyed', mount: () => bench([...PICK_MOBILE, 'ham-ptt-mobile-transmit']) },
  { entry: 'transceiver', state: 'keypad', title: 'Transceiver front panel, keypad frequency entry', mount: () => bench([...PICK_MOBILE, 'ham-radio-mobile-finp']) },
];
