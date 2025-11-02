import { html } from "../../engine/ui/utils/development/formatter";
import { Component } from '../component';
import './Header.css';

/**
 * Header Component
 * Main application header with logo and navigation
 */
export class Header extends Component {
  protected readonly html = html`
    <header class="header">
      <div class="header-toolbar">
        <div class="header-logo-section">
          <img src="./logo.png" alt="IRIS Logo" height="80" />
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
}