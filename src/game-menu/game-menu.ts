import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { HamStationService } from '@app/ham/ham-station-service';
import { setupFullscreenButton } from '@app/pages/layout/header/fullscreen-button';
import { selectionText } from '@app/pages/selection-browser';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { minimalHudShown } from '@app/presentation/minimal-hud/minimal-hud-policy';
import { Router } from '@app/router';
import { ScenarioManager } from '@app/scenario-manager';
import { SimClock } from '@app/simulation/sim-clock';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { AudioPreferences, type VolumeChannel } from '@app/sound/audio-preferences';
import { clearPersistedStore } from '@app/sync/storage';
import { achievementToast } from '@app/user-account/achievement-toast';
import { Auth } from '@app/user-account/auth';
import { getUserDataService } from '@app/user-account/user-data-service';
import { displayPreferences, type TextSize } from './display-preferences';
import { displayViewport, type GameResolution } from './display-viewport';
import { setMenuPause } from './menu-pause';
import './game-menu.css';

type Screen = 'pause' | 'settings' | 'restart' | 'return';
const CHANNELS: [VolumeChannel, string][] = [
  ['master', 'Master'],
  ['voice', 'Voice'],
  ['equipment', 'Equipment'],
  ['ambience', 'Ambience'],
  ['music', 'Music'],
  ['ui', 'Interface'],
];

/** Native modal dialog makes the underlying mission inert and contains keyboard focus. */
export class GameMenu {
  private static instance_: GameMenu;
  private dialog_: HTMLDialogElement | null = null;
  private screen_: Screen = 'pause';
  private settingsFromPause_ = false;
  private busy_ = false;
  private initialized_ = false;
  private returnFocus_: HTMLElement | null = null;
  private cleanup_: (() => void) | null = null;

  static getInstance(): GameMenu {
    return (this.instance_ ??= new GameMenu());
  }

  initialize(): void {
    if (this.initialized_) return;
    this.initialized_ = true;
    displayPreferences.apply();
    window.addEventListener('keydown', (event) => {
      // Window bubbling runs after the document's popover/brief handlers.
      if (event.key !== 'Escape' || event.repeat || event.defaultPrevented || this.dialog_?.open || (!this.inMission_() && !this.inSelection_())) return;
      if ([...document.querySelectorAll<HTMLElement>('.modal, dialog[open]')].some((el) => el.getClientRects().length > 0)) return;
      event.preventDefault();
      this.openMenu();
    });
    window.addEventListener('blur', () => {
      // Focusing an embedded brief can blur the window while the page still has focus.
      if (!document.hasFocus() && !this.dialog_?.open) this.openPause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !this.dialog_?.open) this.openPause();
    });
    const subscribe = (bus: EventBus): void => {
      bus.on(Events.ROUTE_CHANGED, () => this.close_());
    };
    subscribe(EventBus.getInstance());
    EventBus.onRecreate(subscribe);
  }

  private inMission_(): boolean {
    return /^\/campaigns\/[^/]+\/scenarios\/[^/]+$/u.test(location.pathname) && SimulationManager.hasInstance() && !SimClock.isPaused('loading');
  }

  private inSelection_(): boolean {
    return location.pathname === '/' || /^\/campaigns\/[^/]+$/u.test(location.pathname);
  }

  openMenu(): void {
    if (!this.inMission_() && !this.inSelection_()) return;
    this.settingsFromPause_ = true;
    this.open_('pause');
  }

  openPause(): void {
    if (!this.inMission_()) return;
    this.settingsFromPause_ = true;
    this.open_('pause');
  }

  openSettings(): void {
    this.settingsFromPause_ = !!this.dialog_?.open;
    this.open_('settings');
  }

  private open_(screen: Screen): void {
    if (!this.dialog_) {
      this.dialog_ = document.createElement('dialog');
      this.dialog_.id = 'game-menu';
      this.dialog_.className = 'game-menu';
      this.dialog_.setAttribute('aria-labelledby', 'game-menu-title');
      this.dialog_.addEventListener('keydown', (event) => event.stopPropagation());
      this.dialog_.addEventListener('cancel', (event) => {
        event.preventDefault();
        this.back_();
      });
      document.body.append(this.dialog_);
    }
    if (!this.dialog_.open) {
      this.returnFocus_ = document.activeElement as HTMLElement | null;
      setMenuPause('game-menu', true);
      this.dialog_.showModal();
    }
    this.render_(screen);
  }

  private close_(): void {
    this.cleanup_?.();
    this.cleanup_ = null;
    if (!this.dialog_?.open) return;
    this.dialog_.close();
    setMenuPause('game-menu', false);
    if (this.returnFocus_?.isConnected) this.returnFocus_.focus({ preventScroll: true });
  }

  private back_(): void {
    if (this.busy_) return;
    if (this.screen_ !== 'pause' && (this.screen_ !== 'settings' || this.settingsFromPause_)) this.render_('pause');
    else this.close_();
  }

  private render_(screen: Screen): void {
    this.cleanup_?.();
    this.cleanup_ = null;
    this.screen_ = screen;
    const mission = this.inMission_() ? ScenarioManager.getInstance().data : null;
    const selectionMenu = screen === 'pause' && !mission;
    const title =
      screen === 'pause' ? (mission ? 'Mission paused' : 'Game menu') : screen === 'settings' ? 'Settings' : screen === 'restart' ? 'Restart mission?' : 'Return to missions?';
    const body =
      screen === 'settings'
        ? this.settingsHtml_()
        : screen === 'pause'
          ? selectionMenu
            ? `<nav class="game-menu-actions" aria-label="Game menu"><button data-action="resume" class="game-menu-primary" autofocus>Continue browsing</button><button data-action="settings">Settings</button><a class="game-menu-quit" href="https://signalrange.space/" rel="noreferrer" referrerpolicy="no-referrer">Quit game</a></nav>`
            : `<p class="game-menu-mission">${selectionText(mission?.title ?? 'Mission')}</p><p class="game-menu-note">Simulation and dialogue paused.</p>
        <nav class="game-menu-actions" aria-label="Pause menu"><button data-action="resume" class="game-menu-primary" autofocus>Resume mission</button><button data-action="settings">Settings</button><button data-action="restart">Restart mission</button><button data-action="return">Return to missions</button></nav>${this.quickHtml_(mission !== null)}`
          : `<p class="game-menu-mission">${selectionText(mission?.title ?? 'Mission')}</p><p>${screen === 'restart' ? 'Start this mission from the beginning. This replaces its checkpoint and current run progress; completed mission status is preserved.' : 'Return to mission selection. Your last saved checkpoint will be available to continue.'}</p><p id="game-menu-save-note" class="game-menu-note"></p>
        <div class="game-menu-actions"><button data-action="confirm" class="game-menu-primary">${screen === 'restart' ? 'Restart mission' : 'Save and return'}</button><button data-action="back">Keep playing</button></div>`;
    this.dialog_!.innerHTML =
      `<header class="game-menu-heading"><div><span class="game-menu-eyebrow">SignalRange</span><h1 id="game-menu-title">${title}</h1></div><button data-action="back" class="game-menu-close" aria-label="${selectionMenu ? 'Continue browsing' : screen === 'pause' ? 'Resume mission' : 'Back'}">&#215;</button></header><div class="game-menu-body">${body}<p id="game-menu-status" role="status"></p></div><footer class="game-menu-footer"><span>${screen === 'settings' ? 'Changes saved on this device' : mission ? 'Mission control' : location.pathname === '/' ? 'Campaign selection' : 'Mission selection'}</span><button data-action="back">${selectionMenu ? 'Esc / Back' : screen === 'pause' ? 'Esc / Resume' : 'Back'}</button></footer>`;
    this.dialog_!.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
      button.onclick = () => {
        switch (button.dataset.action) {
          case 'resume':
            this.close_();
            break;
          case 'back':
            this.back_();
            break;
          case 'settings':
            this.openSettings();
            break;
          case 'restart':
            this.render_('restart');
            break;
          case 'return':
            this.render_('return');
            void this.describeReturn_();
            break;
          case 'confirm':
            void this.confirm_();
            break;
        }
      };
    });
    if (screen === 'settings') this.bindSettings_();
    if (screen === 'pause') this.bindQuick_();
    this.dialog_!.querySelector<HTMLElement>('[autofocus], .game-menu-body button, input')?.focus();
  }

  /**
   * The field HUD hides the site header, so its sound and fullscreen switches live here, on the pause screen.
   * Other campaigns keep them in the header.
   */
  private quickHtml_(inMission: boolean): string {
    if (!inMission || !minimalHudShown()) return '';
    const prefs = AudioPreferences.getInstance();

    return `<div class="game-menu-quick" role="group" aria-label="Sound and screen"><button type="button" data-quick="sfx" aria-pressed="${prefs.sfxEnabled}">Equipment sounds</button><button type="button" data-quick="ambience" aria-pressed="${prefs.ambienceEnabled}">Ambience</button><button type="button" id="game-menu-fullscreen">Fullscreen</button><span id="game-menu-fullscreen-status" class="visually-hidden" role="status"></span></div>`;
  }

  private bindQuick_(): void {
    const root = this.dialog_!;
    const fullscreen = root.querySelector<HTMLButtonElement>('#game-menu-fullscreen');
    if (!fullscreen) return;
    const audio = AudioPreferences.getInstance();
    root.querySelectorAll<HTMLButtonElement>('[data-quick]').forEach((button) => {
      button.onclick = () => {
        const sfx = button.dataset.quick === 'sfx';
        const on = !(sfx ? audio.sfxEnabled : audio.ambienceEnabled);
        audio.set(sfx ? { sfx: on } : { ambience: on });
        button.setAttribute('aria-pressed', String(on));
      };
    });
    this.cleanup_ = setupFullscreenButton(fullscreen, root.querySelector('#game-menu-fullscreen-status')!);
  }

  private settingsHtml_(): string {
    const prefs = AudioPreferences.getInstance().prefs;
    return `<section class="game-settings-section"><h2>Audio</h2>${CHANNELS.map(([channel, label]) => `<label class="game-setting" for="setting-${channel}"><span>${label}</span><input type="range" id="setting-${channel}" data-channel="${channel}" min="0" max="100" step="1" value="${Math.round(prefs[`${channel}Volume`] * 100)}"/><output for="setting-${channel}">${Math.round(prefs[`${channel}Volume`] * 100)}%</output></label>`).join('')}
      <label class="game-setting-toggle"><input id="setting-sfx" type="checkbox" ${prefs.sfx ? 'checked' : ''}/>Enable equipment and interface sounds</label><label class="game-setting-toggle"><input id="setting-ambience-enabled" type="checkbox" ${prefs.ambience ? 'checked' : ''}/>Enable room ambience</label></section>
      <section class="game-settings-section"><h2>Display & accessibility</h2><label class="game-setting-select" for="setting-resolution"><span>Game resolution</span><select id="setting-resolution" aria-describedby="setting-resolution-note"><option value="native">Native (automatic)</option><option value="1440p">2560 × 1440 (1440p)</option><option value="1080p">1920 × 1080 (1080p)</option></select></label><p id="setting-resolution-note" class="game-menu-note">Scales the interface to fill your window without changing your monitor resolution. Adapts to smaller windows; ultrawide screens keep their extra width.</p><p id="setting-resolution-status" class="game-menu-note" role="status"></p><label class="game-setting-select" for="setting-text"><span>Reading text</span><select id="setting-text"><option value="standard">Standard</option><option value="large">Large</option><option value="largest">Largest</option></select></label><p class="game-menu-note">Adjusts dialogue, objective text, and mission descriptions.</p><label class="game-setting-toggle"><input id="setting-motion" type="checkbox"/>Reduce motion</label><p class="game-menu-note">Your system's reduced motion preference is also respected.</p>
      <label class="game-setting-select" for="setting-achievements"><span>Achievement notifications</span><select id="setting-achievements"><option value="compact">Compact (Steam-style)</option><option value="card">Detailed card</option></select></label><button id="setting-fullscreen" type="button">Toggle fullscreen</button><span id="setting-fullscreen-status" role="status"></span></section>`;
  }

  private bindSettings_(): void {
    const root = this.dialog_!;
    const audio = AudioPreferences.getInstance();
    root.querySelectorAll<HTMLInputElement>('[data-channel]').forEach((input) => {
      input.oninput = () => {
        const channel = input.dataset.channel as VolumeChannel;
        audio.set({ [`${channel}Volume`]: Number(input.value) / 100 });
        input.nextElementSibling!.textContent = `${input.value}%`;
      };
    });
    root.querySelector<HTMLInputElement>('#setting-sfx')!.onchange = (e) => audio.set({ sfx: (e.target as HTMLInputElement).checked });
    root.querySelector<HTMLInputElement>('#setting-ambience-enabled')!.onchange = (e) => audio.set({ ambience: (e.target as HTMLInputElement).checked });
    const size = root.querySelector<HTMLSelectElement>('#setting-text')!;
    const resolution = root.querySelector<HTMLSelectElement>('#setting-resolution')!;
    resolution.value = displayPreferences.prefs.resolution;
    resolution.onchange = () => displayPreferences.set({ resolution: resolution.value as GameResolution });
    const syncResolution = (): void => {
      const viewport = displayViewport();
      root.querySelector('#setting-resolution-status')!.textContent = `Current layout: ${Math.round(viewport.width)} × ${Math.round(viewport.height)}`;
    };
    syncResolution();
    window.addEventListener('game-display-change', syncResolution);
    size.value = displayPreferences.prefs.textSize;
    size.onchange = () => displayPreferences.set({ textSize: size.value as TextSize });
    const motion = root.querySelector<HTMLInputElement>('#setting-motion')!;
    motion.checked = displayPreferences.prefs.reducedMotion;
    motion.onchange = () => displayPreferences.set({ reducedMotion: motion.checked });
    const style = root.querySelector<HTMLSelectElement>('#setting-achievements')!;
    style.value = achievementToast.style;
    style.onchange = () => achievementToast.setStyle(style.value === 'card' ? 'card' : 'compact');
    const button = root.querySelector<HTMLButtonElement>('#setting-fullscreen')!;
    const cleanupFullscreen = setupFullscreenButton(button, root.querySelector('#setting-fullscreen-status')!);
    this.cleanup_ = () => {
      cleanupFullscreen();
      window.removeEventListener('game-display-change', syncResolution);
    };
  }

  private async describeReturn_(): Promise<void> {
    const session = await Auth.getSession();
    if (this.screen_ !== 'return' || !this.dialog_?.open) return;
    this.dialog_.querySelector('#game-menu-save-note')!.textContent = session
      ? 'Your current position will be saved before leaving.'
      : 'Guest session: progress cannot be saved. Sign in from the header to keep this run.';
    this.dialog_.querySelector('[data-action="confirm"]')!.textContent = session ? 'Save and return' : 'Leave without saving';
  }

  private async confirm_(): Promise<void> {
    if (this.busy_) return;
    this.busy_ = true;
    this.dialog_!.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = true;
    });
    const status = this.dialog_!.querySelector<HTMLElement>('#game-menu-status')!;
    status.textContent = this.screen_ === 'restart' ? 'Preparing mission…' : 'Saving checkpoint…';
    try {
      const mission = ScenarioManager.getInstance().data;
      const campaignPath = location.pathname.split('/scenarios/')[0];
      const signedIn = !!(await Auth.getSession());
      if (this.screen_ === 'restart') {
        await SimulationManager.getInstance().progressSaveManager.waitForPendingSave();
        if (signedIn) {
          await getUserDataService().deleteCheckpoint(mission.id);
          await getUserDataService().resetScenarioForReplay(mission.id);
        }
        await clearPersistedStore();
        this.close_();
        // The old run's plant may still be outside the tent. Tear it down now so a stray tab or
        // asset event during the navigation cannot raise the "You are outside" confirm.
        PhysicalPlantService.destroy();
        HamStationService.destroy();
        Router.getInstance().navigate(`${campaignPath}/scenarios/${mission.id}`, { forceReplay: true });
      } else {
        if (signedIn) {
          await SimulationManager.getInstance().progressSaveManager.saveCheckpoint();
          await getUserDataService().updateScenarioProgress(mission.id, { lastPlayed: new Date().toISOString(), scenarioNumber: mission.number });
        }
        this.close_();
        Router.getInstance().navigate(campaignPath);
      }
    } catch {
      status.textContent = 'Could not finish this action. Your mission remains paused. Please try again.';
    } finally {
      this.busy_ = false;
      this.dialog_!.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
        button.disabled = false;
      });
    }
  }
}
