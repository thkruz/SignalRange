import { html } from "@app/engine/utils/development/formatter";

// Help text aimed at learners of satellite communications.
export const omtModuleHelp = html`
  <div class="omt-help">
    <h2>What this module does</h2>
    <p>
      The OMT (Orthomode Transducer) or duplexer sits between the antenna and the rest of
      the radio front end. It directs transmit (TX) and receive (RX) signals to the
      correct polarization path and helps keep the two paths isolated from each other.
      In simple terms: it picks which polarization your transmitted signal uses and
      separates incoming signals by their polarization.
    </p>

    <h3>Key controls</h3>
    <ul>
      <li>
        <strong>TOGGLE</strong> - flips the OMT between two polarization configurations.
        When the toggle is in the <em>vertical</em> position the module uses the "V" setting;
        when toggled the other way it uses "H". This changes which way the TX signal is
        sent and which polarization the RX path expects.
      </li>
    </ul>

    <h3>Readouts you will see</h3>
    <ul>
      <li><strong>TX POL</strong> - the polarization the OMT will place on outgoing (transmit) signals (H or V).</li>
      <li><strong>RX POL</strong> - which polarization the OMT is routing the incoming (receive) path to expect.</li>
      <li>
        <strong>TX EFF POL / RX EFF POL</strong> - the effective polarization after accounting for the antenna's
        physical skew (rotation) and any reversal caused by the OMT. Even if the OMT is set to "H",
        the antenna's skew can make the signal behave like "V"; the effective fields show how a real signal
        will arrive or be transmitted.
      </li>
      <li>
        <strong>X-POL (dB)</strong> - cross-polarization isolation in decibels (dB). This number tells you how well
        the OMT is preventing energy in the unwanted polarization from leaking into the wanted path.
      </li>
    </ul>

    <h3>LED indicator (X-POL)</h3>
    <p>The module shows a simple colored LED to indicate cross-polar isolation quality:</p>
    <ul>
      <li><strong class="green">Green</strong> - good isolation (approximately &gt;= 30 dB). Normal operation.</li>
      <li><strong class="amber">Amber</strong> - reduced isolation (about 25–30 dB). Monitor the system; some loss may occur.</li>
      <li><strong class="red">Red</strong> - poor isolation (&lt; 25 dB). This is considered faulted and can cause significant
      signal degradation or cross-talk between TX and RX.</li>
    </ul>

    <h3>What degraded or misaligned polarization actually means</h3>
    <p>
      Polarization describes the orientation of the radio wave (for example, horizontal "H" or vertical "V").
      If the antenna and OMT expect different polarizations, the received signal power is reduced. The
      system expresses this loss as cross-polarization isolation in dB. For example, if a strong signal arrives
      but is in the wrong polarization and the X-POL is 20 dB, that signal will appear about 20 dB weaker on
      the expected path.
    </p>

    <h3>Alarms and the "faulted" status</h3>
    <p>
      The OMT is considered <em>faulted</em> when cross-polar isolation falls below the safe threshold (25 dB).
      A fault means incoming signals may be contaminated by the unwanted polarization, and received power
      can be reduced - this may show up as poor sensitivity or degraded data on the receiver.
    </p>

    <h3>Simple troubleshooting steps</h3>
    <ol>
      <li>Check the <strong>TOGGLE</strong> position: switching the OMT can restore the expected polarization.</li>
      <li>Look at <strong>TX EFF POL / RX EFF POL</strong>: if they differ from the configured TX/RX POL, the
          antenna has a significant skew. Consider adjusting antenna alignment if possible.</li>
      <li>If the LED is <strong>amber</strong> or <strong>red</strong>, suspect reduced isolation. Try changing the
          OMT toggle and re-check the X-POL value.</li>
      <li>When in doubt, compare the observed signal strength before and after the OMT - a large drop indicates
          cross-pol loss (equal to the X-POL dB value).</li>
    </ol>

    <h3>Short examples</h3>
    <ul>
      <li>
        Example A - Good alignment: TX POL = H, RX POL = V, Effective RX POL = V, X-POL = 33 dB (green).
        The OMT is isolating well and received signals arrive close to full strength.
      </li>
      <li>
        Example B - Misaligned: TX POL = H but Effective RX POL = V, incoming signal is H, X-POL = 20 dB (red).
        The incoming signal appears ~20 dB weaker on the expected path and is marked as degraded.
      </li>
    </ul>

    <h3>Final notes</h3>
    <p>
      The OMT is a passive but critical component that depends on both its own configuration and the antenna's
      physical alignment. Use the toggle and the effective polarization readouts together to understand how a
      real satellite signal will be routed. When you see the red LED or a large mismatch between configured and
      effective polarizations, treat that as a sign to inspect alignment or try alternate configurations.
    </p>
  </div>
`;

export default omtModuleHelp;
