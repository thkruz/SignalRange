import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import type { HamStationManager } from '@app/ham/ham-station-manager';
import { HamStationService } from '@app/ham/ham-station-service';
import { SdrApp } from '@app/ham/ui/bench/sdr-app';
import { button, h } from '@app/ham/ui/ui-kit';
import '@app/ham/ui/bench/bench.css';
import './sdr-console-tab.css';
import './ham-sdr-console-tab.css';

/** SkyWatcher workspace backed by the Technician station's actual USB receiver. */
export class HamSdrConsoleTab {
  readonly dom: HTMLElement;
  private readonly app_: SdrApp;
  private readonly sources_: HTMLElement;
  private readonly feedback_: HTMLElement;
  private laptopId_ = '';
  private sourceKey_ = '';
  private active_ = true;

  constructor(
    private readonly manager_: HamStationManager,
    containerId: string
  ) {
    this.feedback_ = h('div', { class: 'ham-console-feedback', role: 'status', hidden: true });
    this.sources_ = h('div', { class: 'ham-console-sources', role: 'toolbar', 'aria-label': 'SkyWatcher menu' });
    this.app_ = new SdrApp({
      manager: manager_,
      journal: [],
      act: (action) => {
        const result = manager_.act(action);
        this.feedback_.textContent = result.message;
        this.feedback_.hidden = !result.message;
        const service = HamStationService.getInstance();
        if (service?.manager === manager_) service.flush();
        this.refresh_();
        return result;
      },
      feedback: (message) => {
        this.feedback_.textContent = message;
        this.feedback_.hidden = !message;
      },
    });
    this.dom = h(
      'div',
      { class: 'sdr-console-tab ham-console', 'data-testid': 'ham-sdr-console' },
      h('div', { class: 'ham-console-window' }, this.sources_, this.app_.el),
      this.feedback_
    );
    document.getElementById(containerId)?.replaceChildren(this.dom);
    EventBus.getInstance().on(Events.HAM_STATION_UPDATED, this.refresh_);
    this.refresh_();
  }

  activate(): void {
    this.active_ = true;
    this.dom.style.display = '';
    this.refresh_();
  }

  deactivate(): void {
    this.active_ = false;
    this.dom.style.display = 'none';
  }

  dispose(): void {
    EventBus.getInstance().off(Events.HAM_STATION_UPDATED, this.refresh_);
    this.app_.dispose();
    this.dom.remove();
  }

  private readonly refresh_ = (): void => {
    if (!this.active_) return;
    const laptops = this.manager_.devices().filter((d) => d.kind === 'laptop' && !d.removed && !d.spare && d.location === this.manager_.location);
    if (!laptops.some((d) => d.id === this.laptopId_)) this.laptopId_ = laptops[0]?.id ?? '';
    const key = JSON.stringify(laptops.map((d) => [d.id, d.label]));
    if (key !== this.sourceKey_) {
      this.sourceKey_ = key;
      this.sources_.replaceChildren(h('span', { class: 'ham-console-menu-item', text: 'Receiver' }));
      if (laptops.length > 1) {
        const picker = h('select', { id: 'ham-console-source', 'data-testid': 'ham-console-source', class: 'ham-console-picker', 'aria-label': 'Receiver computer' });
        for (const laptop of laptops) picker.append(h('option', { value: laptop.id, text: laptop.label }));
        picker.value = this.laptopId_;
        picker.addEventListener('change', () => {
          this.laptopId_ = picker.value;
          this.refresh_();
        });
        this.sources_.append(picker);
      } else if (laptops[0]) {
        this.sources_.append(h('span', { class: 'ham-console-menu-item ham-console-menu-name', text: laptops[0].label }));
      }
      this.sources_.append(button('ham-console-bench', 'Station bench', () => EventBus.getInstance().emit(Events.SWITCH_TAB, { tabId: 'ham-station' }), 'ham-console-menu-btn'));
    }
    const picker = this.sources_.querySelector<HTMLSelectElement>('#ham-console-source');
    if (picker && picker.value !== this.laptopId_ && document.activeElement !== picker) picker.value = this.laptopId_;
    this.app_.show(this.laptopId_);
  };
}
