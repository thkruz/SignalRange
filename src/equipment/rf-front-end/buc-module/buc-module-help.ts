import { html } from "@app/engine/utils/development/formatter";

// Help text aimed at learners of satellite communications.
export const bucModuleHelp = html`
  <div class="buc-help">
    <h2>What this module does</h2>
    <p>
      The BUC (Block Upconverter) is a critical component in the transmit chain that converts
      low-frequency IF (Intermediate Frequency) signals to high-frequency RF (Radio Frequency)
      signals suitable for satellite transmission. Think of it as the transmit counterpart to
      the LNB: while the LNB downconverts received RF to IF, the BUC upconverts transmitted IF
      to RF. The BUC sits between your modems (which generate IF signals) and the HPA (High
      Power Amplifier), performing frequency translation and providing gain to bring signals
      up to the power level needed for final amplification.
    </p>

    <h3>Key controls</h3>
    <ul>
      <li>
        <strong>POWER</strong> - enables or disables the BUC. When powered, the BUC upconverts
        and amplifies signals. When off, no signal processing occurs. The BUC is a prerequisite
        for the HPA - the HPA cannot operate without the BUC being powered first.
      </li>
      <li>
        <strong>MUTE</strong> - a safety feature that stops RF output without powering down
        the entire BUC. When muted, the BUC remains powered and locked but produces no output
        signal. Use this to temporarily silence transmission without losing lock or thermal
        stability.
      </li>
      <li>
        <strong>LO (MHz)</strong> - sets the Local Oscillator frequency (typically 3700–4200 MHz
        for C-band). This determines the frequency translation: RF_out = IF_in + LO. For example,
        if your modem generates a 70 MHz IF signal and LO is 4200 MHz, the BUC outputs 4270 MHz RF.
      </li>
      <li>
        <strong>GAIN (dB)</strong> - controls amplification (0–70 dB). Higher gain means stronger
        output signals. Typical BUC gain is 55–65 dB. Be careful not to overdrive into saturation
        (P1dB), which causes compression and distortion.
      </li>
      <li>
        <strong>LOOPBACK TO LNB</strong> - a test mode that routes the BUC's output back to the
        LNB input instead of to the antenna. This creates a local RF loop for testing without
        transmitting to the satellite. Useful for validating the signal path without radiating.
      </li>
    </ul>

    <h3>Readouts you will see</h3>
    <ul>
      <li>
        <strong>LO (MHz)</strong> - displays the current Local Oscillator frequency. This directly
        determines what RF frequencies you'll transmit.
      </li>
      <li>
        <strong>TEMP (°C)</strong> - operating temperature. The BUC warms up during operation due
        to power dissipation. Starts at ambient (~25°C) and rises based on output power and gain.
        Alarm threshold is 70°C.
      </li>
      <li>
        <strong>CURRENT (A)</strong> - current draw from the power supply. Increases with gain
        and output power. Typical range is 0.5–4.5 A. High current draw (&gt;4.5 A) may indicate
        a fault or over-temperature condition.
      </li>
      <li>
        <strong>FREQ ERR (kHz)</strong> - frequency error of the Local Oscillator in kHz. When
        locked to the external 10 MHz reference (from GPSDO), this should be near zero (displayed
        in green). When unlocked, it shows drift (displayed in red), typically 10–100 ppm of the
        LO frequency.
      </li>
      <li>
        <strong>OUT PWR (dBm)</strong> - the BUC's RF output power in dBm. This is calculated
        from input power plus gain, with compression applied when approaching saturation (P1dB).
        Displayed in green normally, yellow when approaching saturation (within 2 dB of P1dB).
      </li>
    </ul>

    <h3>LED indicators</h3>
    <ul>
      <li>
        <strong>LOCK</strong> - shows whether the BUC's Local Oscillator is locked to the external
        10 MHz reference from the GPSDO.
        <ul>
          <li><strong class="green">Green</strong> - locked to reference. Frequency is stable and accurate.</li>
          <li><strong class="amber">Amber</strong> - acquiring lock or degraded reference.</li>
          <li><strong class="red">Red</strong> - not locked. BUC is free-running with frequency drift.</li>
        </ul>
      </li>
      <li>
        <strong>LOOPBACK</strong> - indicates loopback mode status.
        <ul>
          <li><strong style="color: #00f;">Blue</strong> - loopback enabled. Output routed to LNB, not antenna.</li>
          <li><strong>Off</strong> - normal mode. Output goes to antenna via HPA.</li>
        </ul>
      </li>
    </ul>

    <h3>How frequency translation works</h3>
    <p>
      The BUC performs upconversion by mixing (multiplying) the IF input signal with the Local
      Oscillator. The mathematical result is sum and difference frequencies: RF = IF + LO and
      RF = IF - LO. The BUC uses filtering to select the sum product (IF + LO) and reject the
      difference product.
    </p>
    <p>
      <strong>Example:</strong> Your modem transmits at 70 MHz IF. You set the BUC LO to 4200 MHz.
      The mixer produces:
    </p>
    <ul>
      <li>Sum: 70 MHz + 4200 MHz = 4270 MHz (desired RF output)</li>
      <li>Difference: 4200 MHz - 70 MHz = 4130 MHz (filtered out)</li>
    </ul>
    <p>
      The BUC's output filter passes 4270 MHz and blocks 4130 MHz. This is how you can transmit
      multiple carriers at different IF frequencies and have them appear at the correct RF frequencies
      for the satellite.
    </p>

    <h3>Understanding lock and frequency stability</h3>
    <p>
      The BUC's Local Oscillator must be extremely stable - even small frequency errors translate
      directly to the RF output and can cause signals to miss the satellite transponder's bandwidth
      or drift off the receiver's tuning. There are two operating modes:
    </p>
    <ul>
      <li>
        <strong>Locked mode (LOCK LED green):</strong> The LO is phase-locked to the 10 MHz reference
        from the GPSDO. The GPSDO itself is locked to GPS satellites, providing accuracy better than
        1 part per billion. Frequency error is essentially zero. This is required for professional
        satellite communications.
      </li>
      <li>
        <strong>Unlocked mode (LOCK LED red):</strong> The LO is free-running with only its internal
        crystal oscillator for stability. Drift is 10–100 ppm (parts per million), meaning at 4200 MHz,
        frequency error could be ±42–420 kHz. This drift is too large for most satellite operations
        and will cause signal degradation or loss.
      </li>
    </ul>
    <p>
      Always verify the LOCK LED is green before transmission. If unlocked, check that the GPSDO
      is powered, warmed up (typically 10–30 minutes), and locked to GPS satellites.
    </p>

    <h3>Saturation and compression (P1dB)</h3>
    <p>
      The BUC has a maximum linear output power called P1dB (the 1 dB compression point), which
      in this module is 15 dBm. Below P1dB, the BUC behaves linearly: increase input by X dB,
      output increases by X dB. At and above P1dB, the amplifier compresses - gain drops and
      distortion increases.
    </p>
    <p>
      <strong>Example:</strong> BUC gain = 60 dB, P1dB = 15 dBm, IF input = -50 dBm.
    </p>
    <ul>
      <li>Linear output would be: -50 dBm + 60 dB = 10 dBm (below P1dB, no compression)</li>
      <li>If input increases to -45 dBm: linear output = 15 dBm (at P1dB, minimal compression)</li>
      <li>If input increases to -40 dBm: linear output = 20 dBm, but BUC compresses to ~18.5 dBm</li>
    </ul>
    <p>
      The OUT PWR readout turns yellow when within 2 dB of P1dB to warn you of approaching saturation.
      Operating in compression creates unwanted distortion (intermodulation products) and wastes power.
      If you see yellow, reduce gain or input power.
    </p>

    <h3>Phase noise and signal quality</h3>
    <p>
      Phase noise is random fluctuations in the phase of the Local Oscillator. These fluctuations
      are translated to the RF output and appear as noise sidebands around your carrier, degrading
      signal quality and potentially interfering with adjacent channels. Phase noise is measured in
      dBc/Hz (decibels relative to carrier per Hz of bandwidth) at a specific frequency offset from
      the carrier.
    </p>
    <ul>
      <li>
        <strong>Locked (good):</strong> -100 to -105 dBc/Hz @ 10 kHz offset. The external reference
        provides excellent stability.
      </li>
      <li>
        <strong>Unlocked (poor):</strong> -70 to -80 dBc/Hz @ 10 kHz offset. Free-running oscillator
        has much worse phase noise, degrading modulation quality and effective SNR.
      </li>
    </ul>
    <p>
      High-order modulation schemes (16-APSK, 32-APSK, etc.) are very sensitive to phase noise.
      If your link quality degrades despite good power levels, check that the BUC is locked and
      phase noise is nominal.
    </p>

    <h3>Group delay and bandwidth</h3>
    <p>
      Group delay is the time it takes for different frequency components of your signal to pass
      through the BUC. Ideally, all frequencies experience the same delay (flat group delay). In
      reality, there's variation (typically 2–10 nanoseconds across the bandwidth), which causes
      phase distortion - different parts of your signal arrive at slightly different times.
    </p>
    <p>
      Group delay increases with temperature and at the edges of the BUC's bandwidth. For wideband
      signals, excessive group delay variation degrades modulation quality. If you see group delay
      &gt;10 ns with high temperature, consider improving cooling.
    </p>

    <h3>Spurious outputs</h3>
    <p>
      Mixing is inherently nonlinear and produces unwanted outputs at harmonic frequencies: N×LO ± M×IF.
      The primary desired output is 1×LO + 1×IF, but you also get:
    </p>
    <ul>
      <li>2×LO - IF (second harmonic mixing): typically -30 to -40 dBc</li>
      <li>2×LO + IF (second harmonic mixing): typically -35 to -45 dBc</li>
      <li>3×LO - IF (third harmonic): typically -40 to -55 dBc</li>
    </ul>
    <p>
      These spurious outputs are unwanted signals at frequencies you didn't intend to transmit.
      The BUC's output filter suppresses them, but some residual spurious energy may remain. In
      a well-designed BUC, spurious outputs are &lt;-30 dBc and meet regulatory limits. If spurious
      outputs are excessive, they can cause interference to other services or violate licensing terms.
    </p>

    <h3>Loopback mode</h3>
    <p>
      The LOOPBACK TO LNB switch routes the BUC's RF output back to the LNB input, creating a local
      test loop. This allows you to:
    </p>
    <ul>
      <li>Test the entire signal path (modem → BUC → LNB → modem) without radiating</li>
      <li>Verify frequency translation, gain, and signal quality</li>
      <li>Calibrate or align equipment in the lab before deployment</li>
      <li>Troubleshoot issues without interfering with live satellite operations</li>
    </ul>
    <p>
      When loopback is enabled, the LOOPBACK LED turns blue. Your transmitted signals will appear
      on the receive side if the LNB and receiver are configured correctly. This is a powerful
      diagnostic tool but should not be used during live transmission - it bypasses the HPA and
      antenna entirely.
    </p>

    <h3>Alarms and warning conditions</h3>
    <p>The system will raise alarms for several conditions:</p>
    <ul>
      <li>
        <strong>BUC not locked to reference</strong> - The LO cannot lock to the 10 MHz external
        reference. Check that the GPSDO is powered, warmed up, and GPS-locked. Frequency stability
        will be poor (10–100 ppm drift).
      </li>
      <li>
        <strong>BUC frequency error: X kHz</strong> - When unlocked, frequency drift exceeds 50 kHz.
        Transmitted signals may be off-frequency and miss the satellite transponder. Lock to external
        reference immediately.
      </li>
      <li>
        <strong>BUC approaching saturation (X dBm)</strong> - Output power is within 2 dB of P1dB
        (15 dBm). Operating in compression creates distortion. Reduce gain or input power to bring
        output below 13 dBm for linear operation.
      </li>
      <li>
        <strong>BUC over-temperature (X °C)</strong> - Temperature exceeds 70°C. This can occur at
        high gain/power levels or in hot ambient conditions. Reduce power, improve cooling, or allow
        cool-down time. Prolonged over-temperature operation may damage components.
      </li>
      <li>
        <strong>BUC high current draw (X A)</strong> - Current exceeds 4.5 A, indicating possible
        fault, saturation, or thermal runaway. Check output power, temperature, and gain settings.
      </li>
      <li>
        <strong>BUC phase noise degraded (unlocked)</strong> - Phase noise is worse than -85 dBc/Hz
        due to unlocked operation. This degrades modulation quality, especially for high-order
        modulations. Lock to external reference.
      </li>
    </ul>

    <h3>Simple troubleshooting steps</h3>
    <ol>
      <li>
        <strong>No output signal</strong> - Check power switch is on. Verify MUTE is off (switch
        down). Check that modem is transmitting IF signals. Verify gain is not zero.
      </li>
      <li>
        <strong>LOCK LED is red</strong> - The BUC cannot lock to external reference. Verify GPSDO
        is powered and GPS-locked. Check reference cable connection. Wait for GPSDO warm-up
        (typically 10–30 minutes from cold start).
      </li>
      <li>
        <strong>Frequency error is large (&gt;50 kHz)</strong> - BUC is unlocked. Follow steps
        above to achieve lock. Do not transmit with large frequency errors - signals may be
        off-frequency and unusable.
      </li>
      <li>
        <strong>Output power too low</strong> - Increase gain. Check that modem is transmitting
        at proper IF level (typically -10 to 0 dBm). Verify MUTE is off.
      </li>
      <li>
        <strong>Output power display is yellow (approaching saturation)</strong> - Reduce gain
        by 3–6 dB to operate in linear region. Saturation causes distortion and wastes power.
      </li>
      <li>
        <strong>High temperature or current draw</strong> - Reduce gain or output power. Improve
        cooling or reduce ambient temperature. Allow BUC to cool before resuming high-power operation.
      </li>
      <li>
        <strong>Poor modulation quality despite good power</strong> - Check LOCK status (should be
        green). Verify phase noise is nominal (&lt;-95 dBc/Hz when locked). Check for saturation
        (output power should be &lt;13 dBm). Verify group delay is &lt;10 ns.
      </li>
      <li>
        <strong>Testing signal path without transmitting</strong> - Enable LOOPBACK TO LNB switch.
        The LOOPBACK LED turns blue. Configure LNB and receiver to receive the looped-back signal.
        This validates the chain without radiating.
      </li>
    </ol>

    <h3>Short examples</h3>
    <ul>
      <li>
        <strong>Example A - Normal operation:</strong> Power ON, Mute OFF, LO = 4200 MHz, Gain = 60 dB,
        Loopback OFF, LOCK LED = Green, LOOPBACK LED = Off, Temp = 45°C, Current = 2.5 A,
        Freq Err = 0.0 kHz (green), Out Pwr = 10 dBm (green).
        BUC is locked, operating in linear region, all parameters nominal. Ready for transmission.
      </li>
      <li>
        <strong>Example B - Unlocked (degraded):</strong> Power ON, Mute OFF, LO = 4200 MHz,
        Gain = 60 dB, LOCK LED = Red, Freq Err = 84.3 kHz (red), Phase Noise = -78 dBc/Hz.
        GPSDO is not providing reference or not warmed up. Frequency drift is ~20 ppm (84 kHz / 4200 MHz).
        Signal quality will be poor. Check GPSDO status and wait for lock before transmitting.
      </li>
      <li>
        <strong>Example C - Approaching saturation:</strong> Power ON, Mute OFF, Gain = 65 dB,
        Out Pwr = 13.5 dBm (yellow), LOCK LED = Green.
        Output is within 1.5 dB of P1dB (15 dBm). Operating near compression - reduce gain to 60–62 dB
        to maintain linearity and avoid distortion.
      </li>
      <li>
        <strong>Example D - Muted (safe):</strong> Power ON, Mute ON, LOCK LED = Green, Out Pwr = -∞ dBm,
        Temp = 30°C, Current = 0.8 A.
        BUC is powered and locked but producing no output. Useful for maintaining lock and thermal
        stability during transmission pauses without powering down.
      </li>
      <li>
        <strong>Example E - Loopback test mode:</strong> Power ON, Mute OFF, Loopback ON,
        LOOPBACK LED = Blue, LOCK LED = Green, Out Pwr = 10 dBm.
        BUC output is routed to LNB input for local testing. No RF transmitted to antenna/HPA.
        Check that receive side sees the looped-back signal at expected frequency (IF_modem + LO_BUC).
      </li>
      <li>
        <strong>Example F - Over-temperature alarm:</strong> Power ON, Gain = 70 dB, Out Pwr = 14 dBm,
        Temp = 75°C (alarm), Current = 4.8 A (alarm).
        Operating at maximum gain near saturation. High power dissipation caused over-temperature.
        Immediately reduce gain to 55–60 dB and allow cooling. Check ambient temperature and airflow.
      </li>
    </ul>

    <h3>Advanced: Understanding mixer theory</h3>
    <p>
      The BUC's core function is frequency translation, performed by a mixer. Mathematically,
      mixing is multiplication in the time domain, which corresponds to convolution (sum and
      difference) in the frequency domain. An ideal mixer with inputs at f_IF and f_LO produces
      outputs at f_IF + f_LO and |f_IF - f_LO|.
    </p>
    <p>
      Real mixers are nonlinear and produce additional products at N×f_LO ± M×f_IF for various
      integer values of N and M. These are spurious outputs. The BUC uses filtering to select
      only the desired f_IF + f_LO product and suppress all others by 30+ dB.
    </p>
    <p>
      The mixer's conversion loss (typically 5–8 dB) is compensated by the BUC's built-in
      amplification. Overall, the BUC provides net gain (typically 55–65 dB) from IF input to
      RF output.
    </p>

    <h3>Advanced: Phase-locked loop (PLL) operation</h3>
    <p>
      The BUC's Local Oscillator uses a Phase-Locked Loop (PLL) to achieve lock to the external
      10 MHz reference. The PLL compares the phase of the LO (divided down by N) with the reference,
      and generates an error signal that adjusts the LO frequency until phase alignment is achieved.
    </p>
    <p>
      Lock acquisition takes 2–5 seconds as the PLL's feedback loop converges. During this time,
      the LOCK LED shows amber. Once locked (LOCK LED green), frequency error drops to near zero
      and the LO tracks the reference within the tracking range (typically ±10 kHz). If frequency
      disturbances exceed the tracking range, the PLL loses lock and must re-acquire.
    </p>
    <p>
      The external reference must be clean, stable, and within the PLL's capture range. A noisy
      or drifting reference can prevent lock or cause frequent lock/unlock cycling.
    </p>

    <h3>Final notes</h3>
    <p>
      The BUC is the "translator" in your transmit chain, converting low-frequency IF from your
      modems to high-frequency RF for satellite uplink. Its performance directly affects signal
      quality, frequency accuracy, and transmission reliability.
    </p>
    <p>
      Best practices include: always verify lock before transmission (LOCK LED green, Freq Err near zero),
      operate in the linear region (output power at least 2–3 dB below P1dB), monitor temperature and
      current draw, use MUTE instead of power cycling to pause transmission, and use loopback mode
      for testing without radiating. Remember that the BUC must be powered before the HPA can operate -
      this is a safety interlock to ensure proper signal flow.
    </p>
    <p>
      Frequency stability is paramount in satellite communications. Even small errors (a few kHz)
      can cause signals to fall outside the transponder bandwidth or miss the receiver's tuning.
      The external reference from the GPSDO is essential - do not attempt to operate unlocked for
      production traffic. During initial setup or troubleshooting, unlocked operation can help
      verify signal flow, but always achieve lock before live transmission.
    </p>
  </div>
`;

export default bucModuleHelp;
