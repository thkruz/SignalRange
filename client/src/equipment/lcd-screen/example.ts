import { html } from "../../engine/ui/utils/development/formatter";

html`
<div class="analyzer-control-lcd-outer">
  <div class="analyzer-control-lcd-screen lcd-retro">
    <div class="lcd-column">
      <div class="lcd-row">
        <span class="lcd-label" id="lcd-system-label">SYSTEM:</span>
        <span class="lcd-value" id="lcd-system-value">ONLINE</span>
      </div>
      <div class="lcd-row">
        <span class="lcd-label" id="lcd-center-freq-label">CENTER FREQUENCY:</span>
        <span class="lcd-value" id="lcd-center-freq-value">1406MHz</span>
      </div>
      <div class="lcd-row">
        <span class="lcd-label" id="lcd-span-label">FREQUENCY SPAN:</span>
        <span class="lcd-value" id="lcd-span-value">100MHz</span>
      </div>
    </div>
    <div class="lcd-column">
      <div class="lcd-row">
        <span class="lcd-label" id="lcd-mode-label">MODE:</span>
        <span class="lcd-value" id="lcd-mode-value">AUTO</span>
      </div>
      <div class="lcd-row">
        <span class="lcd-label" id="lcd-max-amp-label">MAX AMPLITUDE:</span>
        <span class="lcd-value" id="lcd-max-amp-value">-80dB</span>
      </div>
      <div class="lcd-row">
        <span class="lcd-label" id="lcd-min-amp-label">MIN AMPLITUDE:</span>
        <span class="lcd-value" id="lcd-min-amp-value">-110dB</span>
      </div>
    </div>
  </div>
</div>
`;