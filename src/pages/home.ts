import { qs } from "@app/engine/utils/query-selector";
import { Router } from "@app/router";
import { html } from "../engine/utils/development/formatter";
import { BasePage } from "./base-page";
import "./home.css";

/**
 * Home page - Landing page for SignalRange
 */
export class HomePage extends BasePage {
  id = 'home-page';
  private static instance_: HomePage;

  private constructor() {
    super();
    this.init_('body-content-container', 'add');
  }

  static getInstance(): HomePage {
    this.instance_ ??= new HomePage();

    return this.instance_;
  }

  protected html_ = html`
    <div id="${this.id}" class="home-page">
      <!-- WIP Notice -->
      <div class="wip-banner">
        <div class="wip-banner-content">
          <span class="wip-icon">⚠️</span>
          <div class="wip-text">
            <strong>Work in Progress</strong>
            <span class="wip-description">This application is under active development. Features may be incomplete or subject to change.</span>
          </div>
        </div>
      </div>

      <!-- Hero Section -->
      <section class="hero-section">
        <div class="hero-content">
          <h1 class="hero-title">Learn Electronic Warfare &amp; Satellite Communications</h1>
          <p class="hero-tagline">A web-based EW training simulator in active development</p>
          <div class="hero-actions">
            <button class="btn-primary btn-large">Explore Training</button>
            <button class="btn-secondary btn-large">View Sandbox</button>
          </div>
          <div class="hero-badge">100% Free • Web-Based • No Installation Required</div>
        </div>
        <div class="hero-visual">
          <div class="screenshot-container">
            <img src="/images/screenshots/2.png" alt="SignalRange EW Lab Screenshot" class="hero-image" />
          </div>
        </div>
      </section>

      <!-- Features Section -->
      <section class="features-section">
        <h2 class="section-title">Planned Features &amp; Capabilities</h2>
        <p class="section-subtitle">Building a professional-grade RF training environment with realistic equipment simulation</p>

        <div class="features-grid">
          <!-- Feature 1: Equipment -->
          <div class="feature-card">
            <div class="feature-icon">📡</div>
            <h3 class="feature-title">Comprehensive RF Equipment</h3>
            <p class="feature-description">
              Planned equipment includes satellite tracking antennas, RF front-ends with LNB/BUC/HPA modules,
              transmitters and receivers with multi-modem capability, and real-time spectrum analyzers
              with WebGL-accelerated rendering.
            </p>
            <ul class="feature-list">
              <li>Satellite Tracking Antennas (2x)</li>
              <li>RF Front-Ends with Signal Chain (2x)</li>
              <li>Modem Transmitters (16x)</li>
              <li>Modem Receivers (16x)</li>
              <li>Spectrum Analyzers (4x)</li>
            </ul>
          </div>

          <!-- Feature 2: Simulation -->
          <div class="feature-card">
            <div class="feature-icon">⚡</div>
            <h3 class="feature-title">Real-Time Signal Simulation</h3>
            <p class="feature-description">
              Planned simulation features include authentic signal propagation, noise calculations, and C/N ratio analysis.
              Learn to track and acquire signals with realistic modulation schemes including BPSK, QPSK, 8QAM, and 16QAM.
            </p>
            <ul class="feature-list">
              <li>Realistic RF signal propagation</li>
              <li>Dynamic noise floor calculations</li>
              <li>Carrier-to-Noise (C/N) analysis</li>
              <li>Multiple modulation schemes</li>
              <li>Forward Error Correction (FEC)</li>
            </ul>
          </div>

          <!-- Feature 3: Training -->
          <div class="feature-card">
            <div class="feature-icon">🎯</div>
            <h3 class="feature-title">Guided Training Scenarios</h3>
            <p class="feature-description">
              Learn through structured scenarios designed to build your skills progressively.
              Start with fundamentals and advance to complex EW operations, with more scenarios coming soon.
            </p>
            <ul class="feature-list">
              <li>Step-by-step guided missions</li>
              <li>Progressive difficulty levels</li>
              <li>Equipment familiarization</li>
              <li>Signal acquisition techniques</li>
              <li>More scenarios in development</li>
            </ul>
          </div>

          <!-- Feature 4: Sandbox -->
          <div class="feature-card">
            <div class="feature-icon">🔬</div>
            <h3 class="feature-title">Free-Play Sandbox Mode</h3>
            <p class="feature-description">
              Planned sandbox mode will allow experimentation with all equipment in an unrestricted environment.
              Configure complex signal chains, test different frequencies, and explore RF principles
              without constraints.
            </p>
            <ul class="feature-list">
              <li>Unrestricted equipment access</li>
              <li>Custom signal configurations</li>
              <li>Experiment with RF chains</li>
              <li>Save and load configurations</li>
              <li>Real-time visualization</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Satellite Data Section -->
      <section class="satellite-data-section">
        <h2 class="section-title">Live Satellite Data Integration</h2>
        <p class="section-subtitle">
          SignalRange will integrate with <a href="https://keeptrack.space" target="_blank" rel="noopener">KeepTrack</a> to provide live satellite data directly in the simulator.
        </p>
        <div class="satellite-info">
          <div class="satellite-half">
            <h3>How It Works</h3>
            <p>
              SignalRange will use KeepTrack's public API to load real-time orbital data for thousands of satellites. This enables users to select actual satellites, view their current positions, and simulate RF links using authentic Two-Line Element (TLE) sets.
            </p>
            <ul>
              <li>Live satellite tracking and visualization</li>
              <li>Access to up-to-date TLE data for accurate simulation</li>
              <li>Ability to select satellites for training scenarios and sandbox experiments</li>
              <li>Realistic antenna pointing and link budget calculations based on live orbital parameters</li>
            </ul>
          </div>
          <div class="satellite-half">
            <h3>Why Live Data Matters</h3>
            <p>
              By leveraging KeepTrack's API, SignalRange provides a hands-on experience with real-world satellite operations. Users can learn how to acquire, track, and communicate with satellites as they move in orbit, making training more relevant and engaging.
            </p>
            <ul>
              <li>Practice with actual satellite passes and visibility windows</li>
              <li>Understand the impact of orbital mechanics on RF communications</li>
              <li>Stay up-to-date with the latest satellite launches and maneuvers</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Screenshots Section -->
      <section class="screenshots-section">
        <h2 class="section-title">Development Progress</h2>
        <p class="section-subtitle">Preview the interface and equipment design</p>

        <div class="screenshots-grid">
          <div class="screenshot-card">
            <div class="screenshot-container large">
              <img src="/images/screenshots/5.png" alt="SignalRange EW Lab Screenshot" />
            </div>
            <p class="screenshot-caption">Real-time spectrum analysis with WebGL rendering</p>
          </div>

          <div class="screenshot-card">
            <div class="screenshot-container large">
              <img src="/images/screenshots/4.png" alt="SignalRange EW Lab Screenshot" />
            </div>
            <p class="screenshot-caption">Multi-modem transmitter and receiver configuration</p>
          </div>

          <div class="screenshot-card">
            <div class="screenshot-container large">
              <img src="/images/screenshots/3.png" alt="SignalRange EW Lab Screenshot" />
            </div>
            <p class="screenshot-caption">Complete RF signal chain with LNB, BUC, HPA, and filters</p>
          </div>
        </div>
      </section>

      <!-- CTA Section -->
      <section class="cta-section">
        <h2 class="cta-title">Interested in Learning?</h2>
        <p class="cta-description">
          Explore what's currently available and see the development progress.
          No registration required.
        </p>
        <div class="cta-actions">
          <button class="btn-primary btn-large">View Training Scenarios</button>
          <button class="btn-secondary btn-large">Check Out Sandbox</button>
        </div>
      </section>

      <!-- Footer Info -->
      <section class="info-section">
        <div class="info-grid">
          <div class="info-card">
            <h4>What is SignalRange?</h4>
            <p>
              SignalRange is being developed as a sophisticated web-based educational simulator for electronic warfare
              and satellite communications. Built with TypeScript and WebGL, it will provide authentic
              equipment interfaces and realistic signal simulation for hands-on learning.
            </p>
          </div>

          <div class="info-card">
            <h4>Who is it for?</h4>
            <p>
              Designed for students, educators, and professionals interested in RF communications, satellite operations,
              and electronic warfare. When complete, it will be perfect for self-paced learning or classroom instruction.
            </p>
          </div>

          <div class="info-card">
            <h4>System Requirements</h4>
            <p>
              Modern web browser with WebGL support (Chrome, Firefox, Edge, Safari).
              No installation required. Runs entirely in your browser.
            </p>
          </div>
        </div>
      </section>
    </div>
  `;

  protected initDom_(parentId: string, type: 'add' | 'replace' = 'replace'): HTMLElement {
    const parentDom = super.initDom_(parentId, type);
    this.dom_ = qs(`#${this.id}`, parentDom);

    return parentDom;
  }

  protected addEventListeners_(): void {
    // Get all CTA buttons
    const trainingButtons = this.dom_.querySelectorAll('.btn-primary');
    const sandboxButtons = this.dom_.querySelectorAll('.btn-secondary');

    // Training scenario buttons
    trainingButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        Router.getInstance().navigate('/scenarios');
      });
    });

    // Sandbox mode buttons
    sandboxButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        Router.getInstance().navigate('/sandbox');
      });
    });
  }
}