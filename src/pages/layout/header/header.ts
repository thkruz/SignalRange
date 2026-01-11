import { BaseElement } from "@app/components/base-element";
import { DevMenuBox } from "@app/dev-menu/dev-menu-box";
import { DevMenuService } from "@app/dev-menu/dev-menu-service";
import { EventBus } from "@app/events/event-bus";
import { qs } from "@app/engine/utils/query-selector";
import { EngineeringModeService } from "@app/engineering-mode/engineering-mode-service";
import { Events } from "@app/events/events";
import { Router } from "@app/router";
import { ScenarioManager } from "@app/scenario-manager";
import { Sfx } from "@app/sound/sfx-enum";
import SoundManager from "@app/sound/sound-manager";
import { Auth } from "@app/user-account/auth";
import { ModalLogin } from "@app/user-account/modal-login";
import { ModalProfile } from "@app/user-account/modal-profile";
import { isSupabaseApprovedDomain } from "@app/user-account/supabase-client";
import '@app/user-account/user-account.css';
import type { User } from "@supabase/supabase-js";
import { html } from "../../../engine/utils/development/formatter";
import './header.css';

/**
 * Header Component
 * Main application header with logo and navigation
 */
export class Header extends BaseElement {
  private static instance_: Header;
  private loginBtn: HTMLElement | null = null;
  private profileBtn: HTMLElement | null = null;
  private devMenuBtn: HTMLElement | null = null;
  private engModeBtn: HTMLElement | null = null;

  private constructor(rootElementId?: string) {
    super();
    this.init_(rootElementId, 'add');
  }

  static create(rootElementId?: string): Header {
    if (Header.instance_) {
      throw new Error("Header instance already exists.");
    }

    Header.instance_ = new Header(rootElementId);

    return Header.instance_;
  }

  static getInstance(): Header {
    if (!Header.instance_) {
      throw new Error("Header instance does not exist.");
    }

    return Header.instance_;
  }

  protected readonly html_ = html`
    <header class="header">
      <div class="header-toolbar">
        <div class="header-logo-section">
          <img src="/images/logo.png" alt="SignalRange Logo" height="80" />
        </div>
        <div class="header-title-section">
          <div class="header-main-title">SignalRange</div>
          <div class="header-subtitles">
            <div class="header-subtitle">|</div>
            <div class="header-subtitle">RF Communications Simulator</div>
          </div>
        </div>
        <div class="header-actions">
          <a href="https://discord.gg/hr6jUHEgPB" target="_blank" rel="noopener noreferrer"
             class="header-icon-button" title="Get help on Discord">
            <svg class="icon" viewBox="0 -28.5 256 256" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
              <path d="M216.856 16.597A208.502 208.502 0 0 0 164.042 0c-2.275 4.113-4.933 9.645-6.766 14.046-19.692-2.961-39.203-2.961-58.533 0-1.832-4.4-4.55-9.933-6.846-14.046a207.809 207.809 0 0 0-52.855 16.638C5.618 67.147-3.443 116.4 1.087 164.956c22.169 16.555 43.653 26.612 64.775 33.193A161.094 161.094 0 0 0 79.735 175.3a136.413 136.413 0 0 1-21.846-10.632 108.636 108.636 0 0 0 5.356-4.237c42.122 19.702 87.89 19.702 129.51 0a131.66 131.66 0 0 0 5.355 4.237 136.07 136.07 0 0 1-21.886 10.653c4.006 8.02 8.638 15.67 13.873 22.848 21.142-6.58 42.646-16.637 64.815-33.213 5.316-56.288-9.08-105.09-38.056-148.36ZM85.474 135.095c-12.645 0-23.015-11.805-23.015-26.18s10.149-26.2 23.015-26.2c12.867 0 23.236 11.804 23.015 26.2.02 14.375-10.148 26.18-23.015 26.18Zm85.051 0c-12.645 0-23.014-11.805-23.014-26.18s10.148-26.2 23.014-26.2c12.867 0 23.236 11.804 23.015 26.2 0 14.375-10.148 26.18-23.015 26.18Z"/>
            </svg>
          </a>
          <a href="https://github.com/thkruz/SignalRange/" target="_blank" rel="noopener noreferrer"
             class="header-icon-button" title="View on GitHub">
            <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
              <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
          <a id="eng-mode-btn" class="header-icon-button" title="Engineering Mode" style="display:none;">
            <span style="font-size:11px;font-weight:bold;">ENG</span>
          </a>
          <a id="dev-menu-btn" class="header-icon-button" title="Developer Menu" style="display:none;">
            <span style="font-size:11px;font-weight:bold;">DEV</span>
          </a>
        </div>
        ${isSupabaseApprovedDomain ? this.getUserAccountButtonHtml() : ''}
      </div>
    </header>
  `;

  private getUserAccountButtonHtml(): string {
    return html`
      <div class="user-account__menu-item">
        <a id="user-account__login-btn" class="user-account__login-btn user-account__btn--hover" title="Login / Signup">
          <img src="/images/person-gray.png" class="user-account__avatar user-account__avatar--default" alt="Login" />
        </a>
        <div id="user-account__profile-btn"
          class="user-account__profile-btn user-account__btn--hover user-account__profile-btn--hidden"
          title="View Profile"
        >
          ??
        </div>
      </div>
    `;
  }

  protected addEventListeners_(): void {
    // logo should route to home
    const logo = qs('.header-logo-section img');
    if (logo) {
      logo.addEventListener('click', () => {
        Router.getInstance().navigate('/');
      });
    }

    if (isSupabaseApprovedDomain) {
      this.setupUserAccountListeners();
    }

    this.setupEngModeListeners_();
    this.setupDevMenuListeners_();
  }

  private setupUserAccountListeners(): void {
    // Get button elements
    this.loginBtn = qs('#user-account__login-btn');
    this.profileBtn = qs('#user-account__profile-btn');

    // Login button click
    if (this.loginBtn) {
      this.loginBtn.addEventListener('click', () => {
        SoundManager.getInstance().play(Sfx.TOGGLE_ON);
        ModalLogin.getInstance().open();
      });
    }

    // Profile button click
    if (this.profileBtn) {
      this.profileBtn.addEventListener('click', () => {
        SoundManager.getInstance().play(Sfx.TOGGLE_ON);
        ModalProfile.getInstance().open();
      });
    }

    // Listen for auth state changes
    Auth.onAuthStateChange(async (_event, user) => {
      if (user) {
        this.showProfileButton();
        this.updateProfileButton(user);
      } else {
        this.showLoginButton();
      }
    });

    // Check initial auth state
    this.checkInitialAuthState();
  }

  private async checkInitialAuthState(): Promise<void> {
    const user = await Auth.getCurrentUser();
    if (user) {
      this.showProfileButton();
      this.updateProfileButton(user);
    }
  }

  private setupEngModeListeners_(): void {
    this.engModeBtn = qs('#eng-mode-btn');

    if (this.engModeBtn) {
      const engService = EngineeringModeService.getInstance();

      // Click handler to toggle engineering mode
      this.engModeBtn.addEventListener('click', () => {
        SoundManager.getInstance().play(Sfx.TOGGLE_ON);
        engService.toggle();
      });

      // Listen for engineering mode changes
      engService.onChange((enabled) => {
        this.updateEngModeActiveState_(enabled);
      });

      // Listen for scenario changes to update button visibility
      EventBus.getInstance().on(Events.SCENARIO_CHANGED, () => {
        this.updateEngModeButtonVisibility_();
      });

      // Set initial state
      this.updateEngModeActiveState_(engService.isEnabled());
      this.updateEngModeButtonVisibility_();
    }
  }

  private updateEngModeActiveState_(enabled: boolean): void {
    if (this.engModeBtn) {
      this.engModeBtn.classList.toggle('header-icon-button--active', enabled);
    }
  }

  private updateEngModeButtonVisibility_(): void {
    if (!this.engModeBtn) return;

    // Show if scenario is advanced OR if force flag is enabled
    const isForced = window.FORCE_ENGINEERING_BUTTON === true;
    let isAdvancedScenario = false;

    try {
      const scenarioData = ScenarioManager.getInstance().data;
      isAdvancedScenario = scenarioData?.difficulty === 'advanced';
    } catch {
      // ScenarioManager not initialized yet
    }

    const shouldShow = isAdvancedScenario || isForced;
    this.engModeBtn.style.display = shouldShow ? 'flex' : 'none';

    // If hiding the button, also disable engineering mode
    if (!shouldShow) {
      EngineeringModeService.getInstance().setEnabled(false);
    }
  }

  private setupDevMenuListeners_(): void {
    this.devMenuBtn = qs('#dev-menu-btn');

    if (this.devMenuBtn) {
      // Click handler to toggle dev menu
      this.devMenuBtn.addEventListener('click', () => {
        SoundManager.getInstance().play(Sfx.TOGGLE_ON);
        DevMenuBox.toggle();
      });

      // Listen for dev status changes
      const devService = DevMenuService.getInstance();
      devService.onChange((isDev) => {
        this.updateDevMenuVisibility_(isDev);
      });

      // Check initial dev status
      this.updateDevMenuVisibility_(devService.isDev());
    }
  }

  private updateDevMenuVisibility_(isDev: boolean): void {
    if (this.devMenuBtn) {
      // Show if user is on whitelist OR if DEVELOPER_MODE is enabled
      const shouldShow = isDev || window.DEVELOPER_MODE === true;
      this.devMenuBtn.style.display = shouldShow ? 'flex' : 'none';
    }
  }

  private showLoginButton(): void {
    if (this.loginBtn && this.profileBtn) {
      this.loginBtn.style.display = 'flex';
      this.profileBtn.style.display = 'none';
      this.profileBtn.classList.add('user-account__profile-btn--hidden');
    }
  }

  private showProfileButton(): void {
    if (this.loginBtn && this.profileBtn) {
      this.loginBtn.style.display = 'none';
      this.profileBtn.style.display = 'flex';
      this.profileBtn.classList.remove('user-account__profile-btn--hidden');
    }
  }

  private updateProfileButton(user: User): void {
    if (!this.profileBtn) {
      return;
    }

    // Get profile image URL from OAuth provider metadata
    // Different providers use different fields:
    // - Google uses 'picture'
    // - GitHub uses 'avatar_url'
    // - LinkedIn uses 'picture'
    // - Facebook uses 'picture'
    const metadata = user.user_metadata as Record<string, any>;
    const profileImageUrl = metadata?.picture || metadata?.avatar_url;

    // Clear existing content
    this.profileBtn.innerHTML = '';

    if (profileImageUrl) {
      // Create and display profile image
      const img = document.createElement('img');
      img.src = profileImageUrl;
      img.alt = 'Profile';
      img.className = 'user-account__avatar user-account__avatar--profile';

      // Fallback to initials if image fails to load
      img.onerror = () => {
        this.profileBtn!.innerHTML = '';
        this.displayInitials(user);
      };

      this.profileBtn.appendChild(img);
    } else {
      // No profile image - display initials
      this.displayInitials(user);
    }
  }

  private displayInitials(user: User): void {
    if (!this.profileBtn) {
      return;
    }

    const metadata = user.user_metadata as Record<string, any>;
    const displayName = metadata?.full_name || metadata?.name || user.email || '??';
    const initials = displayName
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .join('')
      .slice(0, 2);

    this.profileBtn.textContent = initials || '??';
  }

  makeSmall(isSmall: boolean): void {
    const header = qs('.header');

    if (header) {
      header.classList.toggle('small', isSmall);
    }
  }

  /**
   * Refresh the ENG button visibility based on scenario difficulty and force flag.
   * Call this when FORCE_ENGINEERING_BUTTON changes.
   */
  refreshEngButtonVisibility(): void {
    this.updateEngModeButtonVisibility_();
  }
}