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
      <!-- Hero Section -->
      <section class="hero-section">
        <div class="hero-content">
          <h1 class="hero-title">Master Electronic Warfare &amp; Satellite Communications</h1>
          <p class="hero-tagline">Experience hands-on training in a sophisticated web-based EW lab</p>
          <div class="hero-actions">
            <button class="btn-primary btn-large">Start Training</button>
            <button class="btn-secondary btn-large">Try Sandbox</button>
          </div>
          <div class="hero-badge">100% Free • Web-Based • No Installation Required</div>
        </div>
        <div class="hero-visual">
          <div class="screenshot-placeholder">
            <img src="/screenshots/2.png" alt="SignalRange EW Lab Screenshot" class="hero-image" />
          </div>
        </div>
      </section>

      <!-- Features Section -->
      <section class="features-section">
        <h2 class="section-title">Professional-Grade Equipment Simulation</h2>
        <p class="section-subtitle">Experience realistic RF signal chain operations with authentic equipment interfaces</p>

        <div class="features-grid">
          <!-- Feature 1: Equipment -->
          <div class="feature-card">
            <div class="feature-icon">📡</div>
            <h3 class="feature-title">Comprehensive RF Equipment</h3>
            <p class="feature-description">
              Control satellite tracking antennas, RF front-ends with LNB/BUC/HPA modules,
              transmitters and receivers with multi-modem capability, and real-time spectrum analyzers
              with WebGL-accelerated rendering.
            </p>
            <ul class="feature-list">
              <li>Satellite Tracking Antennas (2x)</li>
              <li>RF Front-Ends with Signal Chain (2x)</li>
              <li>4-Modem Transmitters (4x)</li>
              <li>4-Modem Receivers (4x)</li>
              <li>Real-Time Spectrum Analyzers (4x)</li>
            </ul>
          </div>

          <!-- Feature 2: Simulation -->
          <div class="feature-card">
            <div class="feature-icon">⚡</div>
            <h3 class="feature-title">Real-Time Signal Simulation</h3>
            <p class="feature-description">
              Experience authentic signal propagation, noise calculations, and C/N ratio analysis.
              Track and acquire signals with realistic modulation schemes including BPSK, QPSK, 8QAM, and 16QAM.
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
              Experiment freely with all equipment in an unrestricted environment.
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

      <!-- Screenshots Section -->
      <section class="screenshots-section">
        <h2 class="section-title">See It In Action</h2>
        <p class="section-subtitle">Explore the interface and equipment in detail</p>

        <div class="screenshots-grid">
          <div class="screenshot-card">
            <div class="screenshot-placeholder large">
              <img src="/screenshots/1.png" alt="SignalRange EW Lab Screenshot" />
            </div>
            <p class="screenshot-caption">Real-time spectrum analysis with WebGL rendering</p>
          </div>

          <div class="screenshot-card">
            <div class="screenshot-placeholder large">
              <img src="/screenshots/1.png" alt="SignalRange EW Lab Screenshot" />
            </div>
            <p class="screenshot-caption">Multi-modem transmitter and receiver configuration</p>
          </div>

          <div class="screenshot-card">
            <div class="screenshot-placeholder large">
              <img src="/screenshots/1.png" alt="SignalRange EW Lab Screenshot" />
            </div>
            <p class="screenshot-caption">Complete RF signal chain with LNB, BUC, HPA, and filters</p>
          </div>
        </div>
      </section>

      <!-- CTA Section -->
      <section class="cta-section">
        <h2 class="cta-title">Ready to Begin?</h2>
        <p class="cta-description">
          Start your journey into electronic warfare and satellite communications.
          No registration required.
        </p>
        <div class="cta-actions">
          <button class="btn-primary btn-large">Launch Training Scenarios</button>
          <button class="btn-secondary btn-large">Open Sandbox Mode</button>
        </div>
      </section>

      <!-- Footer Info -->
      <section class="info-section">
        <div class="info-grid">
          <div class="info-card">
            <h4>What is SignalRange?</h4>
            <p>
              SignalRange is a sophisticated web-based educational simulator for electronic warfare
              and satellite communications. Built with TypeScript and WebGL, it provides authentic
              equipment interfaces and realistic signal simulation for hands-on learning.
            </p>
          </div>

          <div class="info-card">
            <h4>Who is it for?</h4>
            <p>
              Students, educators, and professionals interested in RF communications, satellite operations,
              and electronic warfare. Perfect for self-paced learning or classroom instruction.
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