/**
 * Campaign 3 bench objects: the bench with a device close-up, and the transceiver front panel.
 * The real HamStationTab runs on a standalone manager; states are reached by the same clicks a player makes.
 */
import { HamStationTab } from '@app/pages/mission-control/tabs/ham-station-tab';
import { createGalleryBench } from './fixtures/ham-bench';
import type { GalleryEntry } from './gallery-types';

const HOST_ID = 'gallery-ham-host';

const byId = (id: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

function bench(steps: string[], opts: { packet?: boolean } = {}): () => void {
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.className = 'gallery-ham-host';
  document.body.append(host);
  const manager = createGalleryBench(opts);
  const tab = new HamStationTab(manager, HOST_ID);
  for (const id of steps) {
    const el = byId(id);
    if (!el) throw new Error(`gallery step target missing: ${id}`);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

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
  { entry: 'instrument', state: 'meter', title: 'Held multimeter', mount: () => bench(['ham-bench-dev-dmm1', 'ham-inst-meter-operate']) },
  { entry: 'instrument', state: 'swr', title: 'Held SWR meter', mount: () => bench(['ham-bench-dev-swr1', 'ham-inst-swr-operate']) },
  { entry: 'instrument', state: 'analyzer', title: 'Held antenna analyzer', mount: () => bench(['ham-bench-dev-an1', 'ham-inst-analyzer-operate']) },
  { entry: 'instrument', state: 'antenna', title: 'Held adjustable dipole', mount: () => bench(['ham-bench-dev-dp1', 'ham-inst-antenna-operate']) },
  { entry: 'instrument', state: 'board', title: 'Held practice board', mount: () => bench(['ham-bench-dev-board', 'ham-inst-board-operate']) },
  { entry: 'instrument', state: 'dc', title: 'Held power supply', mount: () => bench(['ham-bench-dev-psu', 'ham-inst-dc-operate']) },
  { entry: 'instrument', state: 'packet', title: 'Laptop packet terminal', mount: () => bench(['ham-bench-dev-laptop', 'ham-inst-packet-operate'], { packet: true }) },
];
