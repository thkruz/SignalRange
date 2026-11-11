/**
 * @file instrument-face - A bench instrument picked up and held: the chassis around a panel
 * @description Meter, SWR meter, analyzer, antenna, circuit board, power supply, packet terminal and
 * satellite tracker keep their panel classes (they own the controls and the test ids). In the close-up
 * each shows only an "Operate" key; operating one lifts its panel into an ImmersiveView of kind
 * `instrument`, set in a painted chassis: bezel, nameplate with the device label, power lamp, screws.
 * Escape or "Step back" puts it down. Nothing here changes what a control does.
 */

import { ImmersiveView } from '@app/presentation/immersive-view';
import { type LaptopApp, type LaptopIcon, LaptopShell } from '@app/presentation/laptop-shell';
import type { HamStationManager } from '../../ham-station-manager';
import { h } from '../ui-kit';
import './instrument-face.css';

export interface InstrumentSpec {
  /** Short label on the Operate key */
  verb: string;
  /** Maker-style line under the device name on the nameplate */
  model: string;
  /** Accent for the chassis (CSS colour) */
  accent: string;
  /** Chassis body (CSS colour) */
  body: string;
}

export const INSTRUMENTS: Record<string, InstrumentSpec> = {
  meter: { verb: 'Pick up', model: 'Digital multimeter', accent: '#f2c230', body: '#d6a516' },
  swr: { verb: 'Read', model: 'SWR and power meter', accent: '#e8b45a', body: '#3b3f46' },
  analyzer: { verb: 'Use', model: 'Antenna analyzer', accent: '#6cc4f0', body: '#2f4a5e' },
  antenna: { verb: 'Adjust', model: 'Antenna rig', accent: '#9bd37a', body: '#3d5030' },
  board: { verb: 'Work on', model: 'Circuit board', accent: '#7ee0a0', body: '#1e5b3a' },
  dc: { verb: 'Check', model: 'Power supply', accent: '#ff9d4d', body: '#4a4d52' },
};

/** Programs that run on the bench laptop: they open in the laptop shell, like the SDR app, not as hardware */
export const PROGRAMS: Record<string, { label: string; icon: LaptopIcon }> = {
  packet: { label: 'Packet terminal', icon: 'terminal' },
  satellite: { label: 'Satellite tracker', icon: 'dish' },
};

export interface ProgramOptions {
  /** Panel ids to offer as laptop programs, in taskbar order */
  offered: string[];
  /** Switch to another program (the held one is put down first) */
  openProgram: (panelId: string) => void;
  /** Leave for the receiver program */
  openSdr: () => void;
}

export class InstrumentFace {
  private readonly view_ = new ImmersiveView();
  private lamp_: HTMLElement | null = null;
  private panelId_: string | null = null;

  get isOpen(): boolean {
    return this.view_.isOpen();
  }

  /** Lift `host` (the panel's element) up fullscreen as the instrument named `panelId` */
  open(panelId: string, host: HTMLElement, deviceLabel: string, powered: boolean | null, onClose: () => void): void {
    const spec = INSTRUMENTS[panelId];
    if (!spec) return;
    this.panelId_ = panelId;
    const leave = (): void => {
      this.close();
      onClose();
    };
    this.view_.open(host, `${deviceLabel} ${spec.model.toLowerCase()}`, 'instrument', leave, undefined, (content, back) => {
      this.lamp_ = h('span', {
        class: 'inst-lamp',
        'data-on': powered === null ? 'na' : String(powered),
        role: 'img',
        'aria-label': powered === null ? 'No power lamp' : powered ? 'Power on' : 'Power off',
      });
      const plate = h('header', { class: 'inst-plate' }, h('div', { class: 'inst-name' }, h('strong', { text: deviceLabel }), h('span', { text: spec.model })), this.lamp_);
      const face = h('div', { class: 'inst-face' }, content);
      const chassis = h(
        'section',
        { class: 'inst-chassis', 'data-panel': panelId, style: `--inst-accent:${spec.accent};--inst-body:${spec.body}` },
        h('i', { class: 'inst-screw tl', 'aria-hidden': 'true' }),
        h('i', { class: 'inst-screw tr', 'aria-hidden': 'true' }),
        h('i', { class: 'inst-screw bl', 'aria-hidden': 'true' }),
        h('i', { class: 'inst-screw br', 'aria-hidden': 'true' }),
        plate,
        face
      );
      const room = h('div', { class: 'inst-room' }, chassis, back);

      return { element: room, dispose: () => (this.lamp_ = null) };
    });
  }

  /** Open `host` as a program in the bench laptop's shell */
  openProgram(panelId: string, host: HTMLElement, opts: ProgramOptions, onClose: () => void): void {
    const prog = PROGRAMS[panelId];
    if (!prog) return;
    this.panelId_ = panelId;
    this.lamp_ = null;
    const leave = (): void => {
      this.close();
      onClose();
    };
    const switchTo = (fn: () => void) => (): void => {
      this.close();
      onClose();
      fn();
    };
    const apps: LaptopApp[] = [{ id: 'sdr-console', label: 'SkyWatcher SDR', icon: 'probe', open: switchTo(opts.openSdr) }];
    for (const id of opts.offered) {
      const p = PROGRAMS[id];
      if (p) apps.push({ id, label: p.label, icon: p.icon, open: switchTo(() => opts.openProgram(id)) });
    }
    host.classList.add('inst-face', 'inst-program');
    this.view_.open(host, `Laptop ${prog.label.toLowerCase()}`, 'laptop', leave, undefined, (content, back) => {
      const shell = new LaptopShell(content, back, { apps, activeId: panelId, showDesktop: false, brand: 'BENCHMATE 14' });

      return {
        element: shell.element,
        dispose: () => {
          shell.dispose();
          host.classList.remove('inst-face', 'inst-program');
        },
      };
    });
  }

  /** Keep the power lamp true while the instrument is held */
  sync(m: HamStationManager, deviceId: string | null): void {
    if (!this.lamp_ || this.lamp_.dataset.on === 'na') return;
    const d = deviceId ? m.device(deviceId) : undefined;
    const on = d ? m.energized(d.id) : null;
    const v = on === null ? 'na' : String(on);
    if (this.lamp_.dataset.on !== v) this.lamp_.dataset.on = v;
  }

  get panel(): string | null {
    return this.isOpen ? this.panelId_ : null;
  }

  close(): void {
    this.view_.close();
  }
}
