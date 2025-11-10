import { BaseElement } from "@app/components/base-element";
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

  public static create(rootElementId?: string): Header {
    if (Header.instance_) {
      throw new Error("Header instance already exists.");
    }

    Header.instance_ = new Header(rootElementId);

    return Header.instance_;
  }

  public static getInstance(): Header {
    if (!Header.instance_) {
      throw new Error("Header instance does not exist.");
    }

    return Header.instance_;
  }

  protected readonly html_ = html`
    <header class="header">
      <div class="header-toolbar">
        <div class="header-logo-section">
          <img src="./logo.png" alt="SignalRange Logo" height="80" />
        </div>
        <div class="header-title-section">
          <div class="header-main-title">SignalRange</div>
          <div class="header-subtitle">Space Electronic Warfare Lab</div>
        </div>
        <div class="header-actions">
          <button class="header-icon-button" title="View Code on Github">
            <span class="icon">⚙</span>
          </button>
          <button class="header-icon-button" title="Help">
            <span class="icon">?</span>
          </button>
        </div>
      </div>
    </header>
  `;

  protected addEventListeners_(): void {
    // No event listeners for now
  }
}