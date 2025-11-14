import { html } from "@app/engine/utils/development/formatter";

// Help text aimed at learners of satellite communications.
export const gpsdoModuleHelp = html`
  <div class="gpsdo-help">
    <h2>What this module does</h2>
    <p>
      The GPSDO (GPS Disciplined Oscillator) is the frequency reference heart of your entire
      RF system. It provides an ultra-stable 10 MHz reference signal that all other equipment
      (BUC, LNB, modems) lock to for frequency accuracy. Think of it as the "master clock"
      that ensures all your transmit and receive frequencies are precisely where they should be.
      Without a stable reference, your signals would drift off-frequency and become unusable.
    </p>
    <p>
      The GPSDO works by disciplining (controlling) a high-quality oven-controlled crystal
      oscillator (OCXO) using GPS satellite timing signals. GPS satellites carry atomic clocks
      accurate to nanoseconds, and by comparing the local oscillator to GPS time, the GPSDO
      achieves frequency accuracy better than 1 part per billion - far beyond what any
      free-running crystal could achieve.
    </p>

    <h3>Key controls</h3>
    <ul>
      <li>
        <strong>POWER</strong> - enables or disables the GPSDO. When powered on, the unit begins
        a warmup sequence (typically 10 minutes) where the oven heats the crystal to its stable
        operating temperature (~70°C). During warmup, frequency accuracy is poor and gradually
        improves. Once warmed up and GPS-locked, the reference is ready for use.
      </li>
      <li>
        <strong>GNSS</strong> - a switch to enable or disable GPS satellite reception. When up
        (enabled), the GPSDO attempts to acquire GPS signals and lock. When down (disabled),
        the unit enters "holdover mode" where it maintains accuracy using only the OCXO, with
        gradual degradation over time. Use GNSS disable only for testing or troubleshooting -
        normal operation requires GPS lock.
      </li>
    </ul>

    <h3>Readouts you will see</h3>
    <ul>
      <li>
        <strong>FREQ ACCURACY (×10⁻¹¹)</strong> - frequency accuracy in parts per 10 billion.
        Lower is better. When GPS-locked and warmed up, expect 0.5–5 ×10⁻¹¹ (5–50 parts per
        trillion). For reference, 5 ×10⁻¹¹ at 10 MHz means the frequency is accurate to within
        0.0005 Hz - incredibly precise. During warmup or in holdover, this value increases.
      </li>
      <li>
        <strong>STABILITY (×10⁻¹¹)</strong> - short-term stability measured by Allan deviation
        at 1 second. This indicates how much the frequency varies over short time periods. Like
        frequency accuracy, lower is better, and GPS-locked operation gives 0.5–5 ×10⁻¹¹.
      </li>
      <li>
        <strong>PHASE NOISE (dBc/Hz)</strong> - phase noise at 10 Hz offset from the carrier,
        measured in dBc/Hz (decibels relative to carrier per Hz bandwidth). More negative is
        better (less noise). GPS-locked: -125 to -130 dBc/Hz (excellent). Holdover: -100 to
        -120 dBc/Hz (good). Unlocked/warming up: -80 dBc/Hz (poor).
      </li>
      <li>
        <strong>SATELLITES</strong> - number of GPS satellites currently being tracked. Minimum
        4 satellites required for 3D position fix and accurate timing. Typical range: 4–12.
        More satellites generally means better accuracy and reliability. If satellite count
        drops below 4, timing accuracy degrades and lock may be lost.
      </li>
      <li>
        <strong>UTC (ns)</strong> - UTC (Coordinated Universal Time) accuracy in nanoseconds.
        This measures how accurately the GPSDO knows the absolute time. GPS-locked: 20–100 ns
        (excellent for timing applications). When GPS is lost, UTC accuracy becomes meaningless
        (displays 0) - the oscillator maintains frequency but has no absolute time reference.
      </li>
      <li>
        <strong>TEMP (°C)</strong> - oven temperature in degrees Celsius. The OCXO uses an oven
        to maintain the crystal at a precise temperature (~70°C) regardless of ambient conditions.
        This thermal stability is critical for frequency stability. Normal range: 65–75°C.
        Outside this range indicates oven malfunction.
      </li>
      <li>
        <strong>WARMUP</strong> - time remaining until the oven reaches stable operating temperature.
        Displays as MM:SS countdown during warmup, "READY" when complete. Warmup typically takes
        10 minutes from cold start. During this time, frequency specs are degraded and the unit
        should not be used as a reference.
      </li>
      <li>
        <strong>OUTPUTS</strong> - number of active 10 MHz outputs versus total available (e.g.,
        "2/5" means 2 of 5 outputs are currently in use). The GPSDO distributes its reference
        to multiple pieces of equipment. Each output is buffered and impedance-matched.
      </li>
      <li>
        <strong>HOLDOVER (μs)</strong> - accumulated timing error in microseconds since entering
        holdover mode. When GPS is lost, the GPSDO maintains accuracy using only the OCXO, which
        slowly drifts. Specification: &lt;40 μs over 24 hours. Color-coded: green when GPS-locked
        (0 μs), yellow in holdover (&lt;30 μs), red when approaching limit (&gt;30 μs).
      </li>
    </ul>

    <h3>LED indicators</h3>
    <ul>
      <li>
        <strong>LOCK</strong> - overall system lock status.
        <ul>
          <li><strong class="green">Green</strong> - GPS-locked, warmed up, frequency reference stable and accurate.</li>
          <li><strong class="amber">Amber</strong> - acquiring lock. GPS signals present, attempting to lock.</li>
          <li><strong class="red">Red</strong> - not locked. Either no GPS, still warming up, or in holdover with degraded accuracy.</li>
        </ul>
      </li>
      <li>
        <strong>GNSS</strong> - GPS/GNSS satellite reception status.
        <ul>
          <li><strong class="green">Green</strong> - good satellite reception (4+ satellites tracked).</li>
          <li><strong class="amber">Amber</strong> - marginal reception (&lt;4 satellites). Lock unstable or degraded.</li>
          <li><strong class="red">Red</strong> - no GPS signal. Check antenna, cable, or sky visibility.</li>
        </ul>
      </li>
      <li>
        <strong>WARM</strong> - warmup status of the oven-controlled oscillator.
        <ul>
          <li><strong class="green">Green</strong> - warmup complete, oven at operating temperature (70°C).</li>
          <li><strong class="amber">Amber</strong> - warming up. Wait until green before using as reference.</li>
        </ul>
      </li>
    </ul>

    <h3>What is GPS disciplining and why does it matter?</h3>
    <p>
      A crystal oscillator, even a high-quality oven-controlled one, will drift over time due
      to aging, temperature changes, and other factors. Free-running accuracy might be 1–10 ppm
      (parts per million), which translates to kilohertz of error at gigahertz frequencies - far
      too much for satellite communications.
    </p>
    <p>
      GPS satellites broadcast signals from atomic clocks accurate to ~1 part per trillion. The
      GPSDO receives these GPS signals, measures the difference between the local oscillator and
      GPS time, and generates a correction signal that "disciplines" (adjusts) the oscillator
      to match GPS frequency. This closed-loop control achieves accuracy of 5 ×10⁻¹¹ or better -
      a million times more accurate than the free-running crystal.
    </p>
    <p>
      The result: your 10 MHz reference is locked to atomic time, ensuring all downstream
      equipment (BUC, LNB, modems) has the same frequency reference as the rest of the world's
      communications infrastructure.
    </p>

    <h3>Warmup process and thermal stability</h3>
    <p>
      Crystal oscillators are temperature-sensitive - their frequency changes with temperature.
      The OCXO solves this by enclosing the crystal in an electronically-controlled oven that
      maintains constant temperature (~70°C) regardless of ambient conditions.
    </p>
    <p>
      When you first power on the GPSDO, the oven is cold (room temperature, ~25°C). It takes
      approximately 10 minutes to heat up to operating temperature. During this warmup period:
    </p>
    <ul>
      <li>The WARM LED is amber, showing warmup in progress</li>
      <li>The WARMUP display counts down minutes:seconds remaining</li>
      <li>Frequency accuracy is poor (hundreds of parts per billion) and gradually improves</li>
      <li>The LOCK LED is red - the unit cannot achieve GPS lock while warming up</li>
      <li>Temperature reading climbs from ~25°C toward 70°C</li>
    </ul>
    <p>
      Once warmup completes (WARMUP shows "READY", WARM LED is green), the oven has reached
      thermal equilibrium and frequency stability is achieved. Only then can the GPS disciplining
      loop lock and provide the specified accuracy.
    </p>
    <p>
      <strong>Important:</strong> Do not use the GPSDO as a reference during warmup. Wait until
      WARM LED is green and LOCK LED is green before connecting downstream equipment or transmitting.
    </p>

    <h3>Holdover mode - maintaining accuracy when GPS is lost</h3>
    <p>
      Holdover is the ability to maintain frequency accuracy for some time after losing GPS
      signal. When the GNSS switch is disabled or GPS reception is lost (antenna disconnected,
      jammed, indoors, etc.), the GPSDO enters holdover mode:
    </p>
    <ul>
      <li>The GNSS LED turns red (no GPS signals)</li>
      <li>The GPSDO continues operating using only the OCXO</li>
      <li>Frequency accuracy is maintained, but gradually degrades over time</li>
      <li>Holdover error accumulates at ~1.67 μs per hour</li>
      <li>Specification: &lt;40 μs drift over 24 hours</li>
    </ul>
    <p>
      During holdover, the 10 MHz frequency remains very stable (the OCXO is still temperature-controlled),
      but there's no GPS correction, so slow drift occurs due to crystal aging. This is acceptable
      for short-term GPS outages (minutes to hours) but not for extended operation.
    </p>
    <p>
      The HOLDOVER readout shows accumulated error. When it exceeds 30 μs, an alarm is raised.
      At 40 μs (24 hours), the holdover specification is exceeded and frequency accuracy may no
      longer meet requirements for satellite communications.
    </p>
    <p>
      <strong>Best practice:</strong> Holdover is an emergency backup, not a normal operating mode.
      If GPS is lost, investigate and restore GPS reception as soon as possible. Do not rely on
      holdover for more than a few hours.
    </p>

    <h3>Understanding Allan deviation (stability metric)</h3>
    <p>
      Allan deviation is a statistical measure of frequency stability over time. Unlike simple
      "accuracy" (how close to the correct frequency), stability describes how much the frequency
      varies from moment to moment. It's measured at specific time intervals (in this case, 1 second).
    </p>
    <p>
      For example, an Allan deviation of 2 ×10⁻¹¹ at 1 second means that if you measure the
      frequency twice, one second apart, the difference will typically be 2 parts in 10 billion.
      Lower Allan deviation means more stable, predictable frequency.
    </p>
    <p>
      Why it matters: High-order modulation schemes and precise Doppler tracking require not just
      accurate average frequency, but also low short-term variations. A frequency source with
      good long-term accuracy but poor short-term stability will still degrade signal quality.
      The GPSDO's excellent Allan deviation (sub-5 ×10⁻¹¹) ensures both accuracy and stability.
    </p>

    <h3>Phase noise and its impact</h3>
    <p>
      Phase noise represents random phase fluctuations in the oscillator output. These fluctuations
      appear as noise sidebands around the reference frequency and propagate through all equipment
      locked to the reference (BUC, LNB, modems). High phase noise degrades:
    </p>
    <ul>
      <li>Receiver sensitivity (noise floor increases)</li>
      <li>Modulation quality (phase errors in digital modulation)</li>
      <li>Adjacent channel interference (spectral spreading)</li>
      <li>Phase-locked loop performance (harder to maintain lock)</li>
    </ul>
    <p>
      The GPSDO's phase noise specification (-125 to -130 dBc/Hz at 10 Hz offset when GPS-locked)
      is excellent and ensures that the reference contributes negligible phase noise to the overall
      system. For comparison, a typical free-running crystal might have -90 to -100 dBc/Hz, and
      a low-cost oscillator might be -70 to -80 dBc/Hz.
    </p>

    <h3>Alarms and warning conditions</h3>
    <p>The system will raise alarms for several conditions:</p>
    <ul>
      <li>
        <strong>GPSDO not locked</strong> - Warmup is complete but GPS lock has not been achieved.
        Check GNSS switch is enabled, antenna is connected, and GPS reception is adequate (4+
        satellites). Verify no RF interference or jamming.
      </li>
      <li>
        <strong>GNSS signal lost</strong> - GPS reception has failed. Check antenna cable
        connection, verify antenna has clear sky view (not obstructed by buildings, trees, or
        indoors), and ensure GNSS switch is enabled. If indoors, you may need an external antenna
        with cable to a window or roof.
      </li>
      <li>
        <strong>GPSDO in holdover (X μs error)</strong> - GPS is lost and the unit is operating
        in holdover mode. Accuracy is degrading. Shows accumulated holdover error. Restore GPS
        reception to exit holdover and re-lock.
      </li>
      <li>
        <strong>GPSDO holdover approaching limit (&gt;30 μs)</strong> - Holdover error exceeds
        30 μs. The 24-hour specification (40 μs) is approaching. Frequency accuracy is marginal.
        GPS must be restored immediately or frequency reference will become unreliable.
      </li>
      <li>
        <strong>GPSDO oven temperature out of range (X °C)</strong> - Oven temperature is outside
        the normal 65–75°C range. This indicates oven control malfunction. Frequency stability
        is compromised. Power cycle the unit; if alarm persists, hardware service is required.
      </li>
      <li>
        <strong>GPSDO self-test failed</strong> - Internal diagnostics detected a fault. The
        reference may not be trustworthy. Power cycle and retry. If failure persists, contact
        technical support - the unit may require calibration or repair.
      </li>
    </ul>

    <h3>Simple troubleshooting steps</h3>
    <ol>
      <li>
        <strong>LOCK LED is red, WARM LED is amber</strong> - Unit is still warming up. This is
        normal on power-on. Wait 10 minutes for warmup to complete (WARMUP shows "READY", WARM
        LED turns green). Then GPS lock will be attempted.
      </li>
      <li>
        <strong>LOCK LED is red, WARM LED is green, GNSS LED is red</strong> - Warmup complete
        but no GPS signal. Check GNSS switch is enabled (up position). Verify GPS antenna is
        connected and has clear sky view. If indoors, GPS reception is usually impossible - move
        antenna to window or outside.
      </li>
      <li>
        <strong>LOCK LED is amber (acquiring lock)</strong> - GPS signals present, attempting to
        lock. This can take 30 seconds to several minutes depending on satellite geometry and
        signal strength. Wait for LOCK LED to turn green. If stuck in acquiring for &gt;5 minutes,
        power cycle the GPSDO.
      </li>
      <li>
        <strong>GNSS LED is amber (low satellite count)</strong> - Fewer than 4 satellites tracked.
        GPS lock is marginal or impossible. Improve antenna location for better sky visibility.
        Ensure antenna has unobstructed view of horizon in all directions. Nearby buildings or
        terrain can block satellites.
      </li>
      <li>
        <strong>HOLDOVER error is increasing</strong> - GPS reception was lost and the unit is in
        holdover mode. Check GNSS switch (should be up/enabled). Inspect antenna cable for damage
        or disconnection. Verify antenna has not been moved or blocked. Once GPS is restored,
        holdover error will reset to 0 and the unit will re-lock.
      </li>
      <li>
        <strong>Frequency accuracy or stability is poor despite green LEDs</strong> - If all LEDs
        are green but frequency metrics are degraded (accuracy &gt;10 ×10⁻¹¹ or phase noise worse
        than -120 dBc/Hz), the unit may have a calibration issue. Allow several hours for long-term
        averaging to settle. If poor performance persists, contact technical support.
      </li>
      <li>
        <strong>Downstream equipment (BUC, LNB) won't lock to reference</strong> - Verify GPSDO
        is powered, warmed up (WARM LED green), and locked (LOCK LED green). Check 10 MHz output
        cables are connected and not damaged. Confirm OUTPUTS readout shows the expected number
        of active outputs. Verify downstream equipment is powered and configured to lock to
        external reference.
      </li>
    </ol>

    <h3>Short examples</h3>
    <ul>
      <li>
        <strong>Example A - Normal operation:</strong> Power ON, GNSS enabled, LOCK LED = Green,
        GNSS LED = Green, WARM LED = Green, Freq Accuracy = 2.341 ×10⁻¹¹, Stability = 1.892 ×10⁻¹¹,
        Phase Noise = -128.3 dBc/Hz, Satellites = 9, UTC = 45 ns, Temp = 70.1°C, Warmup = READY,
        Outputs = 2/5, Holdover = 0.000 μs (green).
        GPSDO is fully operational with excellent performance. Ready to provide reference to all
        equipment.
      </li>
      <li>
        <strong>Example B - Just powered on (warmup):</strong> Power ON, LOCK LED = Red, GNSS LED = Red,
        WARM LED = Amber, Freq Accuracy = 234.567 ×10⁻¹¹, Stability = 45.123 ×10⁻¹¹,
        Phase Noise = -85.2 dBc/Hz, Satellites = 0, Temp = 32.4°C, Warmup = 7:23 (7 min 23 sec remaining).
        Oven is heating, GPS receiver not yet active. All specs are poor during warmup. Wait for
        WARMUP to reach "READY" before using.
      </li>
      <li>
        <strong>Example C - Warmup complete, acquiring GPS lock:</strong> Power ON, LOCK LED = Amber,
        GNSS LED = Green, WARM LED = Green, Satellites = 6, Temp = 70.0°C, Warmup = READY.
        Oven is at operating temperature, GPS satellites are being tracked, disciplining loop is
        converging to lock. Expect LOCK LED to turn green within 1–2 minutes.
      </li>
      <li>
        <strong>Example D - In holdover (GPS lost):</strong> Power ON, GNSS disabled, LOCK LED = Red,
        GNSS LED = Red, WARM LED = Green, Freq Accuracy = 3.2 ×10⁻¹¹, Stability = 2.8 ×10⁻¹¹,
        Phase Noise = -122.1 dBc/Hz, Satellites = 0, UTC = 0 ns, Temp = 70.0°C,
        Holdover = 12.3 μs (yellow).
        GPS reception lost (GNSS switch disabled or antenna problem). Operating on OCXO alone.
        Specs are still good but degrading. Holdover error is accumulating (~12 μs, about 7 hours
        of holdover). Enable GNSS and restore GPS reception to exit holdover.
      </li>
      <li>
        <strong>Example E - Holdover approaching limit:</strong> Holdover = 34.8 μs (red), alarm raised.
        Unit has been in holdover for ~20 hours. Approaching 24-hour spec (40 μs). Frequency accuracy
        is degraded but still usable. GPS must be restored immediately - beyond 40 μs, reference is
        out of specification and may cause frequency errors in satellite links.
      </li>
      <li>
        <strong>Example F - GPS antenna problem:</strong> Power ON, GNSS enabled, LOCK LED = Red,
        GNSS LED = Amber, WARM LED = Green, Satellites = 2, Temp = 70.0°C, Warmup = READY.
        Oven warmed up, GPS receiver active, but only 2 satellites tracked (need 4 minimum). GPS
        lock cannot be achieved. Likely causes: antenna has poor sky view (obstructed), antenna
        cable damaged, or antenna is indoors. Relocate antenna for better visibility or check cable.
      </li>
    </ul>

    <h3>Advanced: How GPS disciplining works (PLL control)</h3>
    <p>
      The GPS disciplining circuit is a phase-locked loop (PLL) that compares the local 10 MHz
      oscillator to GPS time signals. GPS satellites transmit a precise 1PPS (one pulse per second)
      timing signal synchronized to atomic clocks. The GPSDO's receiver generates a local 1PPS
      derived from the 10 MHz oscillator (by dividing 10,000,000 Hz by 10,000,000 to get 1 Hz).
    </p>
    <p>
      The PLL compares the phase (timing) of these two 1PPS signals:
    </p>
    <ul>
      <li>If the local 1PPS arrives early compared to GPS 1PPS, the oscillator is running fast</li>
      <li>If the local 1PPS arrives late, the oscillator is running slow</li>
    </ul>
    <p>
      The PLL generates a control voltage that adjusts the oscillator's frequency to bring the
      phases into alignment. Over time (minutes to hours), this feedback loop "disciplines" the
      oscillator to match GPS frequency exactly. The loop has a long time constant (slow response)
      because it's averaging over many measurements to filter out noise and short-term variations.
    </p>
    <p>
      Once locked, the PLL continuously monitors and corrects for any drift, aging, or temperature
      effects, keeping the oscillator accurate to GPS even as conditions change.
    </p>

    <h3>Advanced: Why 10 MHz and not other frequencies?</h3>
    <p>
      10 MHz is a standard reference frequency in RF and test equipment for several reasons:
    </p>
    <ul>
      <li>
        <strong>Convenient scaling:</strong> It's easy to multiply (for microwave frequencies) or
        divide (for timing and digital clocks). Many frequencies are simple integer ratios of 10 MHz.
      </li>
      <li>
        <strong>Crystal availability:</strong> High-quality quartz crystals at 10 MHz are mature,
        well-characterized, and readily available from multiple manufacturers.
      </li>
      <li>
        <strong>Cable distribution:</strong> 10 MHz is low enough that cable losses are minimal
        and phase shifts are manageable, yet high enough to carry timing information with good
        resolution.
      </li>
      <li>
        <strong>Industry standardization:</strong> Test equipment, synthesizers, and communication
        systems have standardized on 10 MHz for decades, creating an ecosystem of compatible gear.
      </li>
    </ul>
    <p>
      Your BUC, LNB, and modems all have internal PLLs that lock to this 10 MHz reference and
      multiply it up to the gigahertz frequencies used for satellite communications, maintaining
      the same fractional accuracy as the reference.
    </p>

    <h3>Final notes</h3>
    <p>
      The GPSDO is arguably the most critical single component in a professional satellite ground
      station. Without a stable, accurate frequency reference, every downstream system suffers:
      transmitted signals are off-frequency (missing the transponder or interfering with others),
      received signals cannot be properly tuned, and modulation quality degrades.
    </p>
    <p>
      Best practices for GPSDO operation:
    </p>
    <ul>
      <li>Install GPS antenna with clear view of the sky (ideally rooftop, minimum window location)</li>
      <li>Use quality low-loss coaxial cable for GPS antenna (LMR-400 or better, keep runs short)</li>
      <li>Allow full 10-minute warmup after power-on before using the reference</li>
      <li>Verify LOCK LED is green before transmitting or operating other equipment</li>
      <li>Monitor satellite count - if it drops below 6, investigate antenna positioning</li>
      <li>Never operate in holdover mode for more than a few hours - it's emergency backup only</li>
      <li>Keep the GPSDO powered continuously (24/7 operation) to avoid repeated warmup cycles</li>
      <li>Check frequency accuracy and phase noise periodically to verify performance</li>
    </ul>
    <p>
      If your GPSDO fails, the entire ground station becomes inoperable. Consider redundancy (dual
      GPSDOs with automatic failover) for critical operations, or maintain a spare unit for rapid
      replacement.
    </p>
    <p>
      Remember: GPS is a broadcast service that can be affected by solar weather, satellite
      maintenance, or RF interference. Monitor GNSS reception health and have a plan for GPS
      outages. In professional installations, consider a cesium or rubidium atomic clock as a
      backup reference with extended holdover capability (weeks to months instead of hours).
    </p>
  </div>
`;

export default gpsdoModuleHelp;
