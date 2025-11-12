import { BaseElement } from "@app/components/base-element";
import { qs } from "@app/engine/utils/query-selector";
import { Router } from "@app/router";
import { html } from "../../../engine/utils/development/formatter";
import './header.css';

/**
 * Header Component
 * Main application header with logo and navigation
 */
export class Header extends BaseElement {
  private static instance_: Header;

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
      </div>
    </header>
  `;

  protected addEventListeners_(): void {
    // logo should route to home
    const logo = qs('.header-logo-section img');
    if (logo) {
      logo.addEventListener('click', () => {
        Router.getInstance().navigate('/');
      });
    }
  }

  makeSmall(isSmall: boolean): void {
    const header = qs('.header');

    if (header) {
      header.classList.toggle('small', isSmall);
    }
  }
}