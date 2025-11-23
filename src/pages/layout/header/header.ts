import { BaseElement } from "@app/components/base-element";
import { qs } from "@app/engine/utils/query-selector";
import { Router } from "@app/router";
import { Sfx } from "@app/sound/sfx-enum";
import { Auth } from "@app/user-account/auth";
import { ModalLogin } from "@app/user-account/modal-login";
import { ModalProfile } from "@app/user-account/modal-profile";
import { isSupabaseApprovedDomain } from "@app/user-account/supabase-client";
import '@app/user-account/user-account.css';
import { html } from "../../../engine/utils/development/formatter";
import './header.css';
import SoundManager from "@app/sound/sound-manager";

/**
 * Header Component
 * Main application header with logo and navigation
 */
export class Header extends BaseElement {
  private static instance_: Header;
  private loginBtn: HTMLElement | null = null;
  private profileBtn: HTMLElement | null = null;

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
          <img src="/logo.png" alt="SignalRange Logo" height="80" />
        </div>
        <div class="header-title-section">
          <div class="header-main-title">SignalRange</div>
          <div class="header-subtitles">
            <div class="header-subtitle">|</div>
            <div class="header-subtitle">RF Communications Simulator</div>
          </div>
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
        const profile = await Auth.getUserProfile();
        this.updateProfileButton(profile?.full_name || profile?.name || user.email || '??');
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
      const profile = await Auth.getUserProfile();
      this.updateProfileButton(profile?.full_name || profile?.name || user.email || '??');
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

  private updateProfileButton(displayName: string): void {
    if (this.profileBtn) {
      const initials = displayName
        .split(' ')
        .map(word => word.charAt(0).toUpperCase())
        .join('')
        .slice(0, 2);
      this.profileBtn.textContent = initials || '??';
    }
  }

  makeSmall(isSmall: boolean): void {
    const header = qs('.header');

    if (header) {
      header.classList.toggle('small', isSmall);
    }
  }
}