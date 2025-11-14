import { html } from "@app/engine/utils/development/formatter";

// Help text aimed at learners of satellite communications.
export const rtsaHelp = html`
  <div class="rtsa-help">
    <h2>What this equipment does</h2>
    <p>
      The Real-Time Spectrum Analyzer (RTSA) is one of the most essential diagnostic tools in RF
      engineering. It displays the frequency content of signals - showing you "what frequencies are
      present and how strong they are" at any point in your signal chain. Think of it as an
      oscilloscope for the frequency domain: where an oscilloscope shows voltage vs time, a spectrum
      analyzer shows power vs frequency.
    </p>
    <p>
      In satellite communications, you're working with signals at gigahertz frequencies that are
      invisible to oscilloscopes. The spectrum analyzer lets you see these signals, measure their
      power and bandwidth, verify frequencies are correct, identify interference, troubleshoot
      problems, and optimize system performance. Without a spectrum analyzer, you're essentially
      working blind - you can't see what signals are actually present or how your equipment is
      performing.
    </p>

    <h3>Display modes</h3>
    <p>The RTSA provides three visualization modes:</p>
    <ul>
      <li>
        <strong>Spectral Density</strong> - Traditional frequency domain display. Horizontal axis is
        frequency, vertical axis is power (dBm). Signals appear as peaks. This is the primary mode
        for analyzing signal characteristics, measuring power levels, and identifying specific
        frequencies. Updates in real-time showing the current spectrum.
      </li>
      <li>
        <strong>Waterfall</strong> - Time-frequency display. Horizontal axis is frequency, vertical
        axis is time (newest at top, scrolling down). Power is shown as color: dark blue = low power,
        bright red = high power. This mode reveals how signals change over time, making it easy to
        spot intermittent signals, frequency hopping, drift, or transient events that would be missed
        in spectral density mode.
      </li>
      <li>
        <strong>Both</strong> - Split screen showing spectral density on top and waterfall on bottom
        simultaneously. Combines the detailed amplitude measurement of spectral density with the
        time-history visibility of waterfall. Best for comprehensive signal analysis.
      </li>
    </ul>

    <h3>Key controls and settings</h3>
    <ul>
      <li>
        <strong>Center Frequency (CF)</strong> - The frequency at the horizontal center of the display.
        For example, if CF = 4.2 GHz, the display is centered on 4.2 GHz. Adjust this to move the
        viewing window to different parts of the spectrum. Range: 5 kHz to 25.5 GHz.
      </li>
      <li>
        <strong>Span</strong> - The total frequency range displayed. If span = 100 MHz and CF = 4.2 GHz,
        you're viewing from 4.15 GHz to 4.25 GHz (CF ± span/2). Narrower span gives more frequency
        resolution and detail. Wider span shows more of the spectrum at once but less detail.
      </li>
      <li>
        <strong>Reference Level</strong> - The power level (in dBm) at the top of the amplitude scale.
        Signals above this are clipped. Signals well below it are hard to see. Adjust to optimize
        display for your signal levels.
      </li>
      <li>
        <strong>Amplitude Range (Min/Max)</strong> - The vertical scale in dBm. For example, max = -40 dBm,
        min = -100 dBm gives a 60 dB dynamic range. Signals between -40 and -100 dBm are visible.
        Signals below -100 dBm disappear into the noise floor. Signals above -40 dBm clip at the top.
      </li>
      <li>
        <strong>RBW (Resolution Bandwidth)</strong> - The bandwidth of the analyzer's internal filter.
        Narrower RBW provides better frequency resolution (can separate closely-spaced signals) but
        slower sweep speed. Wider RBW is faster but lower resolution. Typical: 1 kHz to 10 MHz.
      </li>
      <li>
        <strong>Tap Points (A and B)</strong> - Where in the signal chain the analyzer is connected.
        You can monitor multiple tap points simultaneously to see signals at different stages (e.g.,
        before and after amplification, before and after filtering). Tap A and Tap B buttons enable/disable
        each tap.
      </li>
    </ul>

    <h3>Understanding the display</h3>
    <p><strong>Spectral Density Plot:</strong></p>
    <ul>
      <li>
        <strong>X-axis (horizontal)</strong> - Frequency in Hz, kHz, MHz, or GHz. Labels show frequencies
        across the span. Left edge = CF - span/2, right edge = CF + span/2, center = CF.
      </li>
      <li>
        <strong>Y-axis (vertical)</strong> - Power in dBm (decibels relative to 1 milliwatt). Labels on
        left show power levels from minAmplitude (bottom) to maxAmplitude (top).
      </li>
      <li>
        <strong>Yellow trace</strong> - Noise floor. This is the baseline power level from thermal noise
        and system noise. Signals must be above this to be detectable. Typically around -100 to -110 dBm
        depending on bandwidth and system noise temperature.
      </li>
      <li>
        <strong>Colored peaks</strong> - Actual signals. Height indicates power, width indicates bandwidth.
        In developer mode, different signals are colored differently for identification.
      </li>
      <li>
        <strong>Green trace (if enabled)</strong> - Max hold or min hold. Shows the maximum or minimum
        value seen at each frequency over time. Useful for capturing transient signals or finding worst-case
        noise.
      </li>
      <li>
        <strong>Red diamond marker (if enabled)</strong> - Indicates a peak signal. Shows frequency and
        power level. Use marker controls to move between different peaks.
      </li>
    </ul>

    <p><strong>Waterfall Display:</strong></p>
    <ul>
      <li>
        <strong>X-axis (horizontal)</strong> - Frequency, same as spectral density.
      </li>
      <li>
        <strong>Y-axis (vertical)</strong> - Time, with newest data at top, oldest at bottom. The display
        scrolls down continuously as new data arrives. Each horizontal line represents one "sweep" or
        snapshot of the spectrum.
      </li>
      <li>
        <strong>Color scale</strong> - Represents power:
        <ul>
          <li>Dark blue/black: low power (near noise floor)</li>
          <li>Cyan/light blue: moderate power</li>
          <li>Green: medium-high power</li>
          <li>Yellow: high power</li>
          <li>Red/bright red: very high power (strongest signals)</li>
        </ul>
      </li>
      <li>
        <strong>Vertical streaks</strong> - Continuous signals at a fixed frequency. A vertical cyan line
        means a steady signal at that frequency.
      </li>
      <li>
        <strong>Horizontal streaks</strong> - Wideband signals or interference across many frequencies.
      </li>
      <li>
        <strong>Diagonal lines</strong> - Frequency drift or sweeping signals. The angle shows the rate
        of frequency change.
      </li>
      <li>
        <strong>Intermittent spots</strong> - On-off signals, bursts, or transients. Visible in waterfall
        but might be missed in spectral density.
      </li>
    </ul>

    <h3>What are tap points?</h3>
    <p>
      Your RF signal chain has multiple stages: antenna → OMT → LNA → LNB (downconversion to IF) →
      filter → receiver, and on transmit: modem → BUC (upconversion to RF) → HPA → OMT → antenna.
      The spectrum analyzer can "tap" into this chain at different points to see signals at each stage.
    </p>
    <p>Available tap points include:</p>
    <ul>
      <li><strong>TX IF</strong> - Transmit IF signals from modems before upconversion</li>
      <li><strong>Post-BUC Pre-HPA</strong> - RF signals after BUC, before final amplification</li>
      <li><strong>Post-HPA</strong> - Final transmit signals after high power amplification</li>
      <li><strong>Pre-OMT Post-Antenna (RX)</strong> - Received RF from antenna before any processing</li>
      <li><strong>Post-OMT Pre-LNA (RX)</strong> - After polarization separation, before amplification</li>
      <li><strong>Post-LNA</strong> - After low noise amplification, still at RF</li>
      <li><strong>RX IF</strong> - Final receive IF after downconversion and filtering</li>
    </ul>
    <p>
      <strong>Why monitor multiple tap points?</strong> You can compare before/after stages to verify
      gain, check for distortion, identify where problems occur, and measure filter performance. For
      example, comparing Pre-LNA and Post-LNA shows the LNA's gain. Comparing Post-BUC and Post-HPA
      shows HPA amplification.
    </p>

    <h3>Control panel operation</h3>
    <p>
      The spectrum analyzer uses a physical-style control panel (opened with the gear button). Unlike
      typing numbers, you press buttons to enter values - mimicking real spectrum analyzer equipment.
    </p>
    <p><strong>Main control buttons (top rows):</strong></p>
    <ul>
      <li><strong>FREQ</strong> - Select to adjust center frequency</li>
      <li><strong>SPAN</strong> - Select to adjust frequency span</li>
      <li><strong>AMPT</strong> - Select to adjust amplitude/reference level</li>
      <li><strong>MKR / MKR2</strong> - Marker controls for identifying peaks</li>
      <li><strong>BW</strong> - Resolution bandwidth settings</li>
      <li><strong>SWEEP</strong> - Sweep time and mode</li>
      <li><strong>TRACE</strong> - Trace settings (max hold, min hold, averaging)</li>
      <li><strong>MODE</strong> - Display mode (spectral, waterfall, both)</li>
    </ul>

    <p><strong>Number pad and units:</strong></p>
    <ul>
      <li>Press <strong>0-9</strong> to enter digits</li>
      <li>Press <strong>.</strong> for decimal point</li>
      <li>Press <strong>GHz, MHz, kHz, or Hz</strong> to select units and submit the value</li>
      <li>Press <strong>Backspace</strong> to delete last digit</li>
      <li>Press <strong>Esc</strong> to clear input</li>
      <li>Press <strong>✓ (Enter)</strong> to confirm</li>
    </ul>

    <p><strong>Example: Setting center frequency to 4.25 GHz</strong></p>
    <ol>
      <li>Click <strong>FREQ</strong> button (selects center frequency control)</li>
      <li>Press <strong>4</strong>, <strong>.</strong>, <strong>2</strong>, <strong>5</strong></li>
      <li>Press <strong>GHz</strong> button (sets units and submits)</li>
      <li>Display now centered on 4.25 GHz</li>
    </ol>

    <p><strong>Rotary knobs:</strong></p>
    <ul>
      <li><strong>Minor Tick</strong> - Fine adjustment (small increments)</li>
      <li><strong>Major Tick</strong> - Coarse adjustment (large increments)</li>
      <li>Select a control (FREQ, SPAN, AMPT, etc.) then turn knobs to adjust without entering numbers</li>
    </ul>

    <h3>Marker functionality</h3>
    <p>
      Markers identify and measure specific signals or frequencies. When markers are enabled, the
      analyzer automatically finds peaks (local maxima) in the spectrum and places markers on them.
    </p>
    <ul>
      <li>
        <strong>Enabling markers:</strong> Use MKR button in control panel. A red diamond appears on
        the strongest signal.
      </li>
      <li>
        <strong>Marker readout:</strong> Shows frequency (in MHz) and power (in dBm) of the marked signal.
        Displayed above the marker on the plot.
      </li>
      <li>
        <strong>Multiple markers:</strong> The analyzer tracks up to 10 peaks. Use MKR2 or marker
        navigation to cycle between them.
      </li>
      <li>
        <strong>Peak tracking:</strong> Markers automatically update as signals move or change power.
        If a signal drifts in frequency, the marker follows it.
      </li>
    </ul>

    <h3>Max hold and min hold</h3>
    <p><strong>Max Hold:</strong></p>
    <ul>
      <li>Captures and displays the maximum power seen at each frequency over time</li>
      <li>Useful for finding intermittent signals, measuring peak power, or capturing transients</li>
      <li>Green trace shows the highest value reached at each frequency point</li>
      <li>Keeps rising as higher peaks occur, never decreases unless reset</li>
      <li>Enable with TRACE button in control panel</li>
    </ul>

    <p><strong>Min Hold:</strong></p>
    <ul>
      <li>Captures and displays the minimum power seen at each frequency over time</li>
      <li>Useful for finding noise floor variations or gaps in signals</li>
      <li>Green trace shows the lowest value reached at each frequency point</li>
      <li>Keeps falling as lower values occur, never increases unless reset</li>
      <li>Enable with TRACE button (select min hold option)</li>
    </ul>

    <p>
      <strong>When to use max/min hold:</strong> Max hold is valuable when troubleshooting - you can
      leave it running while manipulating equipment, and any signal that briefly appears will be
      captured. Min hold helps characterize noise floor stability or verify signals don't have
      unexpected dropouts.
    </p>

    <h3>Auto-tune functionality</h3>
    <p>
      Auto-tune automatically adjusts the spectrum analyzer settings to optimally display the strongest
      signal within the current span. When activated:
    </p>
    <ol>
      <li>Finds the strongest signal in the current frequency range</li>
      <li>Centers the display on that signal's frequency</li>
      <li>Adjusts span to 1.1× the signal's bandwidth (giving 10% margin)</li>
      <li>Sets amplitude range to fit the signal:
        <ul>
          <li>Max amplitude = signal power rounded up to nearest 10 dB</li>
          <li>Min amplitude = noise floor minus 6 dB</li>
        </ul>
      </li>
    </ol>
    <p>
      <strong>Use auto-tune when:</strong> You're searching for a signal but don't know its exact
      frequency, you want to quickly optimize display for best visibility, or you need to verify a
      signal is present without manual adjustments.
    </p>
    <p>
      <strong>Limitation:</strong> If no signal is above the noise floor, auto-tune picks a random
      frequency within the span. Always verify you're looking at a real signal, not just noise.
    </p>

    <h3>Understanding noise floor</h3>
    <p>
      The noise floor is the baseline power level you see even when no signals are present. It comes
      from thermal noise (kTB, where k is Boltzmann's constant, T is temperature, B is bandwidth) and
      system noise (LNA noise figure, cable losses, etc.).
    </p>
    <p>
      <strong>Noise floor formula:</strong> Noise power (dBm) = -174 dBm/Hz + 10×log₁₀(T/290) +
      10×log₁₀(B) + NF, where T is system noise temperature in Kelvin, B is bandwidth in Hz, and NF
      is noise figure in dB.
    </p>
    <p>
      <strong>Why it matters:</strong> Your signal must be above the noise floor to be detected. The
      difference between signal power and noise floor is your signal-to-noise ratio (SNR). If SNR is
      too low (&lt;10 dB typically), the signal is unusable.
    </p>
    <p>
      <strong>Noise floor varies with:</strong>
    </p>
    <ul>
      <li><strong>Bandwidth:</strong> Doubling bandwidth increases noise floor by 3 dB</li>
      <li><strong>System temperature:</strong> Higher temperature = higher noise floor</li>
      <li><strong>Gain:</strong> Noise floor rises with LNA/amplifier gain</li>
      <li><strong>Tap point:</strong> Later in the receive chain typically has higher noise floor due to accumulated noise figure</li>
    </ul>
    <p>
      The analyzer automatically calculates and displays the correct noise floor (yellow trace) based
      on the tap point, bandwidth, and system parameters. This is essential for accurate signal
      analysis.
    </p>

    <h3>Common usage scenarios</h3>
    <p><strong>1. Verifying transmit signal</strong></p>
    <ul>
      <li>Set tap to "Post-BUC Pre-HPA" or "RX IF" (if using loopback)</li>
      <li>Center frequency on expected transmit frequency</li>
      <li>Set span to 2-3× signal bandwidth</li>
      <li>Check signal appears at correct frequency with expected power and bandwidth</li>
      <li>Look for spurious emissions (unwanted signals at other frequencies)</li>
    </ul>

    <p><strong>2. Checking received signal quality</strong></p>
    <ul>
      <li>Set tap to "RX IF" (final receive output)</li>
      <li>Auto-tune to find signal</li>
      <li>Verify signal power is at least 10 dB above noise floor</li>
      <li>Check signal shape is smooth (no distortion or ripple)</li>
      <li>Enable max hold to check for dropouts or fading</li>
    </ul>

    <p><strong>3. Measuring gain</strong></p>
    <ul>
      <li>Enable both tap A and tap B, placing them before and after the amplifier</li>
      <li>Use markers to measure signal power at each tap point</li>
      <li>Gain (dB) = Power_after - Power_before</li>
      <li>For example, -70 dBm after and -120 dBm before = 50 dB gain</li>
    </ul>

    <p><strong>4. Finding interference</strong></p>
    <ul>
      <li>Set wide span (several hundred MHz) to survey large frequency range</li>
      <li>Use waterfall mode to see intermittent interference over time</li>
      <li>Narrow span around interfering signal to analyze in detail</li>
      <li>Enable max hold to capture brief interference bursts</li>
    </ul>

    <p><strong>5. Verifying filter performance</strong></p>
    <ul>
      <li>Use wideband signal (or multiple signals across filter passband)</li>
      <li>Compare spectrum before and after filter using two tap points</li>
      <li>Verify signals within passband are unaffected (minimal insertion loss)</li>
      <li>Verify signals outside passband are attenuated (filter rejection working)</li>
    </ul>

    <h3>Interpreting common signal characteristics</h3>
    <ul>
      <li>
        <strong>Narrow peak (few kHz wide)</strong> - CW carrier, narrowband voice, or telemetry.
        Typical: FM voice ~25 kHz, telemetry 10-100 kHz.
      </li>
      <li>
        <strong>Wide peak (MHz to tens of MHz)</strong> - Modulated digital signal. Width approximates
        symbol rate × 1.2. For example, 10 MHz wide ≈ 8 Msym/s QPSK.
      </li>
      <li>
        <strong>Flat-top peak</strong> - Signal bandwidth fills analyzer's resolution bandwidth. Increase
        RBW or decrease span to see true signal shape.
      </li>
      <li>
        <strong>Multiple peaks closely spaced</strong> - Multi-carrier signal, adjacent channels, or
        frequency division multiplexed (FDM) signals.
      </li>
      <li>
        <strong>Peak with side lobes</strong> - Digital modulation with rectangular pulse shaping.
        Side lobes indicate spectral regrowth or insufficient filtering.
      </li>
      <li>
        <strong>Noisy, irregular peak</strong> - Low SNR signal, interference, or distortion. If SNR
        &lt; 10 dB, signal quality is poor.
      </li>
      <li>
        <strong>Signal at wrong frequency</strong> - Oscillator error, unlocked LO, or misconfigured
        equipment. Check BUC/LNB lock status and frequency settings.
      </li>
      <li>
        <strong>Unexpected signals (spurs)</strong> - Harmonics, intermodulation products, or spurious
        mixer outputs. Usually indicate nonlinearity or poor filtering somewhere in the chain.
      </li>
    </ul>

    <h3>Waterfall patterns and what they mean</h3>
    <ul>
      <li>
        <strong>Vertical line (constant frequency)</strong> - Continuous carrier. Steady signal at
        fixed frequency. Color indicates power - red/yellow is strong, cyan is moderate.
      </li>
      <li>
        <strong>Vertical line that disappears</strong> - Intermittent signal or burst transmission.
        On-off pattern. Useful for identifying TDMA or packet-based transmissions.
      </li>
      <li>
        <strong>Diagonal line (sloping up or down)</strong> - Frequency drift. Slope indicates rate
        of drift in Hz/second. Common during oscillator warm-up or when unlocked. Steep slope = fast
        drift, shallow slope = slow drift.
      </li>
      <li>
        <strong>Sawtooth pattern (diagonal lines repeating)</strong> - Frequency sweep or chirp. Could
        be deliberate (spread spectrum) or unintended (unstable oscillator cycling).
      </li>
      <li>
        <strong>Horizontal band</strong> - Wideband noise or interference. Covers many frequencies
        simultaneously. Could be adjacent satellite, jammers, or RFI from local equipment.
      </li>
      <li>
        <strong>Random speckles</strong> - Thermal noise or low-level interference. Normal background
        when no signals present. Color should be blue/dark - if it's bright, noise floor is too high.
      </li>
      <li>
        <strong>Regularly spaced vertical lines</strong> - Harmonically related signals. Could be
        harmonics of a fundamental, or multiple carriers in an FDM system.
      </li>
      <li>
        <strong>Pulsing (brightness changing)</strong> - Amplitude modulation or fading. Signal power
        varies over time. Common with mobile terminals or due to atmospheric effects.
      </li>
    </ul>

    <h3>Troubleshooting with the spectrum analyzer</h3>
    <p><strong>Problem: No signals visible</strong></p>
    <ul>
      <li>Check tap points are enabled (A and/or B buttons active)</li>
      <li>Verify center frequency is correct (are you looking at the right part of spectrum?)</li>
      <li>Increase span to survey wider range</li>
      <li>Adjust amplitude range - signals might be present but outside vertical scale</li>
      <li>Use auto-tune to automatically find and display strongest signal</li>
      <li>Check upstream equipment is powered and transmitting</li>
    </ul>

    <p><strong>Problem: Signal too weak (barely above noise)</strong></p>
    <ul>
      <li>Verify antenna is pointed correctly and locked on satellite</li>
      <li>Check LNA is powered and locked to reference</li>
      <li>Measure noise floor - if it's abnormally high, there's excessive system noise</li>
      <li>Compare tap points before/after amplifiers to verify gain is applied</li>
      <li>Check for cable losses, connector issues, or filter insertion loss</li>
    </ul>

    <p><strong>Problem: Signal at wrong frequency</strong></p>
    <ul>
      <li>Verify BUC/LNB local oscillator (LO) frequency settings</li>
      <li>Check if LO is locked to 10 MHz reference (unlocked = frequency drift)</li>
      <li>Measure frequency error on GPSDO, BUC, LNB modules</li>
      <li>If signal drifts over time (visible in waterfall), oscillator is unlocked or warming up</li>
    </ul>

    <p><strong>Problem: Distorted signal (unexpected shape)</strong></p>
    <ul>
      <li>Check for saturation - if signal power too high, amplifiers compress (distortion)</li>
      <li>Verify HPA back-off is adequate (&gt;3 dB to avoid IMD)</li>
      <li>Look for intermodulation products (new signals at f1±f2 frequencies)</li>
      <li>Check filter bandwidth matches signal - too narrow clips the signal</li>
      <li>Compare multiple tap points to identify which stage introduces distortion</li>
    </ul>

    <p><strong>Problem: Interference visible</strong></p>
    <ul>
      <li>Use waterfall to determine if interference is continuous or intermittent</li>
      <li>Check if interference frequency matches harmonics of known signals (2f, 3f, etc.)</li>
      <li>Verify no adjacent satellite signals are bleeding in (polarization isolation issue?)</li>
      <li>Test by powering off equipment one by one to isolate source</li>
      <li>Check if interference moves with center frequency (image frequency, LO spur) or stays fixed (external RFI)</li>
    </ul>

    <h3>Best practices</h3>
    <ul>
      <li><strong>Always verify noise floor:</strong> If noise floor seems wrong, check system noise temperature and tap point selection</li>
      <li><strong>Use appropriate span:</strong> Too wide and you lose resolution, too narrow and you miss context. Typical: 2-5× signal bandwidth</li>
      <li><strong>Optimize amplitude range:</strong> Signal should occupy middle 60-80% of vertical scale for best visibility</li>
      <li><strong>Enable max hold when troubleshooting:</strong> Captures intermittent problems you might otherwise miss</li>
      <li><strong>Use waterfall for time-varying signals:</strong> If signals appear/disappear or drift, waterfall reveals patterns</li>
      <li><strong>Compare multiple tap points:</strong> Seeing before/after helps isolate problems to specific equipment</li>
      <li><strong>Check markers for precise measurements:</strong> Visual estimation is ±5 dB at best, markers give exact values</li>
      <li><strong>Document baseline "good" spectrum:</strong> Compare current vs baseline to detect changes</li>
      <li><strong>Understand your noise floor:</strong> Any signal within 10 dB of noise floor is marginal - you need better SNR</li>
    </ul>

    <h3>Advanced: How spectrum analyzers work</h3>
    <p>
      A spectrum analyzer is fundamentally a swept-tuned receiver. It uses a local oscillator (LO)
      that sweeps across the frequency range, mixing with the input signal to produce an intermediate
      frequency (IF). The IF is filtered (by the RBW filter) and detected to measure power at each
      frequency. The sweep repeats continuously to update the display.
    </p>
    <p>
      <strong>Key internal components:</strong>
    </p>
    <ul>
      <li><strong>Input attenuator:</strong> Adjusts input level to prevent mixer saturation</li>
      <li><strong>Mixer:</strong> Combines input signal with swept LO to produce IF</li>
      <li><strong>RBW filter:</strong> Bandpass filter that defines frequency resolution</li>
      <li><strong>Detector:</strong> Converts IF power to DC voltage proportional to signal amplitude</li>
      <li><strong>Display:</strong> Plots detected voltage (power) vs LO frequency</li>
    </ul>
    <p>
      <strong>Real-time vs swept analyzers:</strong> Traditional spectrum analyzers sweep through
      frequencies sequentially, missing signals that appear only briefly. Real-time spectrum analyzers
      (RTSA) capture the entire span simultaneously, showing all signals all the time. This makes them
      essential for analyzing intermittent signals, bursts, or transient events.
    </p>

    <h3>Final notes</h3>
    <p>
      The spectrum analyzer is your window into the invisible world of RF signals. Master its use and
      you gain the ability to diagnose problems that would otherwise be impossible to solve, optimize
      system performance with precision, and verify your satellite link is operating correctly.
    </p>
    <p>
      Key skills to develop:
    </p>
    <ul>
      <li>Recognizing signal characteristics (CW vs modulated, digital vs analog, clean vs distorted)</li>
      <li>Correlating spectrum analyzer readings with link performance (SNR, BER, signal quality)</li>
      <li>Using markers efficiently to measure power, frequency, and bandwidth</li>
      <li>Interpreting waterfall patterns to understand signal behavior over time</li>
      <li>Troubleshooting systematically using multiple tap points to isolate problems</li>
      <li>Understanding noise floor and how it limits sensitivity</li>
    </ul>
    <p>
      Remember: The spectrum analyzer shows you objective truth - what signals are really there and
      how they really look. If the analyzer says your signal is weak, distorted, or at the wrong
      frequency, it is. Don't fight the measurement, investigate and fix the underlying problem.
    </p>
  </div>
`;

export default rtsaHelp;
