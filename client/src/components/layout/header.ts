import { html } from '../../utils';
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
          <button class="header-logo-button" title="Home">
            <img src="./patch.png" alt="IRIS Logo" height="80" />
          </button>
        </div>
        <div class="header-title-section">
          <div class="header-main-title">IRIS</div>
          <div class="header-subtitle">Space Electronic Warfare Sandbox</div>
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