/**
 * @file Loadout Modal - sandbox equipment picker
 * @description Draggable box that lets the operator swap each station's
 * antenna in a sandbox. Applying restarts the sandbox from a clean state.
 */
import { DraggableBox } from '@app/engine/ui/draggable-box';
import { html } from '@app/engine/utils/development/formatter';
import { getEl } from '@app/engine/utils/get-el';
import { AntennaRegistry, type AntennaRegistryEntry } from '@app/equipment/antenna/antenna-registry';
import { t7e } from '@app/locales/i18n';
import { Logger } from '@app/logging/logger';
import { Router } from '@app/router';
import { ScenarioManager } from '@app/scenario-manager';
import { clearPersistedStore } from '@app/sync/storage';
import { type SandboxLoadout, SandboxLoadoutService, type StationLoadout } from './sandbox-loadout';
import './loadout-modal.css';

const escapeHtml = (value: string): string => value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');

/**
 * Singleton box. Content is rebuilt on every show() from the active scenario's
 * authored stations and the registry, so a plugin antenna registered after the
 * box was first opened still appears.
 */
export class LoadoutModal extends DraggableBox {
  static readonly BOX_ID = 'loadout-modal';
  private static instance_: LoadoutModal | null = null;
  private domCreated_ = false;

  private constructor() {
    super(LoadoutModal.BOX_ID, { width: '420px', title: t7e('loadout.title'), skipDomCreation: true });
  }

  static getInstance(): LoadoutModal {
    LoadoutModal.instance_ ??= new LoadoutModal();

    return LoadoutModal.instance_;
  }

  static destroy(): void {
    LoadoutModal.instance_?.boxEl?.remove();
    LoadoutModal.instance_ = null;
  }

  show(): void {
    if (this.domCreated_) {
      this.refreshContent_();
    } else {
      this.createDom_();
    }
    this.open();
  }

  protected getBoxContentHtml(): string {
    const scenario = ScenarioManager.getInstance().data;
    // Authored stations (not the loadout-applied ones) so the "scenario
    // default" label always names what the scenario shipped with.
    const stations = scenario?.settings?.groundStations ?? [];
    const stored = scenario ? SandboxLoadoutService.getInstance().get(scenario.id) : null;

    if (stations.length === 0) {
      return html`<div class="loadout-modal"><div class="loadout-modal__empty">${t7e('loadout.noStations')}</div></div>`;
    }

    const entries = AntennaRegistry.getInstance().list();
    const rows = stations
      .map((station, index) => {
        const defaultId = station.antennaConfigKey ?? station.antennas[0];
        const chosen = stored?.stations[index]?.antenna ?? '';

        return html`
          <div class="loadout-modal__station">
            <div class="loadout-modal__station-label">${t7e('loadout.station')}: ${escapeHtml(station.name)} (${escapeHtml(station.id)})</div>
            <select class="form-select loadout-modal__select" data-station-index="${index}" aria-label="${t7e('loadout.antenna')}">
              ${LoadoutModal.renderOptions_(entries, defaultId, chosen)}
            </select>
          </div>
        `;
      })
      .join('');

    return html`
      <div class="loadout-modal">
        <div class="loadout-modal__intro">${t7e('loadout.intro')}</div>
        ${rows}
        <div class="loadout-modal__actions">
          <button id="loadout-reset" type="button" class="btn btn-secondary">${t7e('loadout.reset')}</button>
          <button id="loadout-cancel" type="button" class="btn btn-secondary">${t7e('loadout.cancel')}</button>
          <button id="loadout-apply" type="button" class="btn btn-primary">${t7e('loadout.apply')}</button>
        </div>
      </div>
    `;
  }

  private static renderOptions_(entries: AntennaRegistryEntry[], defaultId: string | undefined, chosen: string): string {
    const defaultEntry = entries.find((e) => e.id === defaultId);
    const defaultLabel = defaultEntry ? `${defaultEntry.config.name} (${t7e('loadout.scenarioDefault')})` : t7e('loadout.scenarioDefault');
    const option = (entry: AntennaRegistryEntry): string => {
      const source = entry.source === 'builtin' ? t7e('loadout.sourceBuiltin') : t7e('loadout.sourcePlugin', { name: entry.source.slice('plugin:'.length) });
      const selected = entry.id === chosen ? 'selected' : '';

      return html`<option value="${escapeHtml(entry.id)}" ${selected}>${escapeHtml(entry.config.name)} · ${escapeHtml(source)}</option>`;
    };
    const builtin = entries.filter((e) => e.source === 'builtin' && e.id !== defaultId);
    const plugins = entries.filter((e) => e.source !== 'builtin' && e.id !== defaultId);

    return html`
      <option value="" ${chosen === '' ? 'selected' : ''}>${escapeHtml(defaultLabel)}</option>
      ${plugins.length > 0 ? html`<optgroup label="Plugins">${plugins.map(option).join('')}</optgroup>` : ''}
      <optgroup label="Built-in">${builtin.map(option).join('')}</optgroup>
    `;
  }

  private createDom_(): void {
    if (this.domCreated_) {
      return;
    }

    document.body.insertAdjacentHTML(
      'beforeend',
      html`
        <div id="${this.boxId}" class="draggable-box loadout-box" style="pointer-events:auto; display:none;">
          <div class="draggable-box__title-bar">
            <div class="draggable-box__title">
              <span>${this.title}</span>
            </div>
            <span id="${this.boxId}-close" class="draggable-box__btn draggable-box__close-btn"></span>
          </div>
          <div class="draggable-box__content">${this.getBoxContentHtml()}</div>
        </div>
      `
    );

    this.domCreated_ = true;
    this.onOpen();
    this.bindActions_();
  }

  private refreshContent_(): void {
    const content = this.boxEl?.querySelector('.draggable-box__content');

    if (content) {
      content.innerHTML = this.getBoxContentHtml();
      this.bindActions_();
    }
  }

  private bindActions_(): void {
    const box = getEl(this.boxId);

    box.querySelector('#loadout-apply')?.addEventListener('click', () => {
      void this.apply_();
    });
    box.querySelector('#loadout-reset')?.addEventListener('click', () => {
      void this.reset_();
    });
    box.querySelector('#loadout-cancel')?.addEventListener('click', () => this.close());
  }

  /** Read the selects into a loadout; empty selections mean "scenario default". */
  private readSelection_(): SandboxLoadout {
    const stations: Record<number, StationLoadout> = {};
    const selects = getEl(this.boxId).querySelectorAll<HTMLSelectElement>('select[data-station-index]');

    selects.forEach((select) => {
      const index = Number.parseInt(select.dataset.stationIndex ?? '0', 10);

      if (select.value) {
        stations[index] = { antenna: select.value };
      }
    });

    return { stations };
  }

  private async apply_(): Promise<void> {
    const scenario = ScenarioManager.getInstance().data;

    if (!scenario) {
      return;
    }

    const loadout = this.readSelection_();

    if (Object.keys(loadout.stations).length === 0) {
      SandboxLoadoutService.getInstance().clear(scenario.id);
    } else {
      SandboxLoadoutService.getInstance().set(scenario.id, loadout);
    }

    await this.restart_();
  }

  private async reset_(): Promise<void> {
    const scenario = ScenarioManager.getInstance().data;

    if (scenario) {
      SandboxLoadoutService.getInstance().clear(scenario.id);
    }

    await this.restart_();
  }

  /**
   * Restart the sandbox from scratch: wipe the persisted equipment state
   * (which was authored against the old loadout) and re-enter the route.
   * forceReplay keeps Mission Control from restoring a checkpoint.
   */
  private async restart_(): Promise<void> {
    // The box's own ROUTE_CHANGED subscription may be on a bus the page
    // teardown already discarded, so close explicitly.
    this.close();

    try {
      await clearPersistedStore();
    } catch (error) {
      Logger.warn('[loadout] could not clear persisted equipment state before restart', error);
    }

    const router = Router.getInstance();

    router.navigate(router.getCurrentPath(), { forceReplay: true });
  }
}
