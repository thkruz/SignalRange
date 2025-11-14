import { html } from "@app/engine/utils/development/formatter";

// Help text aimed at learners of satellite communications.
export const antennaHelp = html`
  <div class="antenna-help">
    <h2>What this equipment does</h2>
    <p>
      The Antenna Control Unit (ACU) manages a parabolic dish antenna - the fundamental interface
      between your ground station and satellites in space. The antenna performs two critical
      functions: it focuses and amplifies weak signals received from satellites (like a giant
      light collector for radio waves), and it concentrates and directs your transmitted signals
      toward the satellite (like a searchlight beam).
    </p>
    <p>
      A satellite dish works on the same principle as a reflecting telescope or satellite TV dish,
      but at much larger scale and with precision pointing requirements. Signals from geostationary
      satellites travel ~38,000 km and arrive incredibly weak (often -100 dBm or less - a millionth
      of a millionth of a watt). The large parabolic reflector collects this energy over its entire
      surface area and focuses it to a single point (the feed horn), providing 40–60 dB of gain -
      amplifying the signal by a factor of 10,000 to 1,000,000 times.
    </p>

    <h3>Key controls</h3>
    <ul>
      <li>
        <strong>POWER</strong> - enables or disables the antenna control unit. When powered off,
        the antenna cannot be moved and all control is disabled. Power-on takes ~3 seconds to
        initialize the servo systems.
      </li>
      <li>
        <strong>Azimuth (Az)</strong> - horizontal pointing angle in degrees, measured clockwise
        from north. Range: -270° to +270° (or 0° to 360° when normalized). Adjustable in 0.1°
        increments. For example, 0° = North, 90° = East, 180° = South, 270° = West. Moving the
        azimuth knob breaks satellite lock and disables auto-tracking.
      </li>
      <li>
        <strong>Elevation (El)</strong> - vertical pointing angle in degrees above the horizon.
        Range: -5° to 90°. 0° = horizontal (looking at the horizon), 90° = zenith (straight up).
        Adjustable in 0.1° increments. Typical geostationary satellites are at 30–50° elevation
        depending on your latitude. Moving the elevation knob breaks satellite lock and disables
        auto-tracking.
      </li>
      <li>
        <strong>Skew</strong> - rotates the feed horn to align polarization with the satellite
        signal. Range: -90° to +90° in 1° increments. When a satellite's signal polarization is
        rotated relative to your antenna (due to the satellite's orbital position and your ground
        location), skew adjustment recovers the signal. 0° = no rotation, ±45° = significant
        rotation typically needed at extreme orbital positions.
      </li>
      <li>
        <strong>Loopback to OMT</strong> - a test mode switch that routes transmitted signals
        directly to the receive path instead of radiating them. When enabled, your BUC/HPA output
        goes to the LNB input, creating a local RF loop for testing modems, signal processing,
        and troubleshooting without transmitting to the satellite. The blue indicator light turns
        on when loopback is active.
      </li>
      <li>
        <strong>Auto Track</strong> - enables automatic satellite tracking. When switched on, the
        ACU scans for the strongest satellite signal at the current pointing position and locks
        onto it, then continuously adjusts azimuth and elevation to maintain lock (compensating
        for satellite orbital drift, thermal expansion of the structure, wind loading, etc.).
        The blue indicator light shows auto-track status. If auto-track fails to acquire lock,
        the indicator shows a fault condition (red).
      </li>
    </ul>

    <h3>Status indicators</h3>
    <ul>
      <li>
        <strong>Power LED (top right)</strong> - shows overall system status:
        <ul>
          <li><strong class="green">Green</strong> - powered on and operational</li>
          <li><strong class="amber">Amber</strong> - powered off or fault condition</li>
          <li><strong class="red">Red</strong> - critical error (antenna not operational)</li>
        </ul>
      </li>
      <li>
        <strong>Loopback indicator (blue light)</strong> - illuminates when loopback mode is active.
        Signals are being routed internally for testing instead of transmitted/received via satellite.
      </li>
      <li>
        <strong>Auto Track indicator (blue light)</strong> - illuminates when auto-tracking switch
        is enabled. If the light is on but auto-track failed to acquire lock, a fault indication
        appears (red border). This means the signal is too weak or no satellite is present at the
        pointing position.
      </li>
      <li>
        <strong>Bottom status bar</strong> - displays operational status and alarms:
        <ul>
          <li><strong class="green">LOCKED ON SATELLITE</strong> (green) - successfully tracking a satellite</li>
          <li><strong style="color: #00f;">Manual Tracking Enabled</strong> (blue) - operating in manual pointing mode</li>
          <li><strong style="color: #ff0;">ACQUIRING LOCK...</strong> (yellow) - auto-track is attempting to lock</li>
          <li><strong style="color: #ff0;">X SIGNAL(S) DEGRADED</strong> (yellow) - received signals have interference or poor C/I</li>
          <li><strong style="color: #ff0;">HIGH SKEW (X°)</strong> (yellow) - skew exceeds 45°, check alignment</li>
          <li><strong class="red">ANTENNA NOT OPERATIONAL</strong> (red) - hardware fault, antenna disabled</li>
          <li><strong class="red">AUTO TRACK FAILED</strong> (red) - could not acquire satellite lock</li>
        </ul>
      </li>
    </ul>

    <h3>Polar plot display</h3>
    <p>
      The circular plot on the right side shows the antenna's current pointing position in a
      polar coordinate system. Azimuth is shown as angle around the circle (0° at top = North,
      rotating clockwise), and elevation is shown as radius (center = 90° zenith, edge = 0° horizon).
      A marker indicates where the antenna is currently pointed. This provides a quick visual
      reference for antenna orientation.
    </p>

    <h3>What is antenna gain and why does it matter?</h3>
    <p>
      Antenna gain (measured in dBi - decibels relative to an isotropic radiator) quantifies how
      well the antenna focuses energy in a specific direction compared to radiating it equally in
      all directions. A larger dish with better surface accuracy provides higher gain:
    </p>
    <ul>
      <li>3-meter dish at 4 GHz: ~40 dBi (10,000× power concentration)</li>
      <li>9-meter dish at 4 GHz: ~50 dBi (100,000× power concentration)</li>
      <li>13-meter dish at 4 GHz: ~54 dBi (250,000× power concentration)</li>
    </ul>
    <p>
      Gain is frequency-dependent - it increases with frequency (shorter wavelengths allow tighter
      focusing). The formula is: G = η(πD/λ)² where D is diameter, λ is wavelength, and η is
      aperture efficiency (typically 0.55–0.70). Every time you double the diameter, gain increases
      by 6 dB (4×). Every time you double the frequency, gain increases by 6 dB (4×).
    </p>
    <p>
      On receive, higher gain means you can detect weaker signals - crucial for satellite links
      where signals arrive at -90 to -110 dBm. On transmit, higher gain means your signal arrives
      stronger at the satellite, allowing lower transmit power or higher data rates. Gain is the
      single most important parameter in link budget calculations.
    </p>

    <h3>Understanding beamwidth and pointing accuracy</h3>
    <p>
      Beamwidth (measured in degrees) describes how narrow the antenna's beam is - the angular
      range over which the antenna effectively radiates or receives. The half-power beamwidth (HPBW)
      is the angle between points where gain drops by 3 dB (half power). For a parabolic dish:
    </p>
    <p style="text-align: center; font-style: italic;">
      HPBW ≈ 70λ/D degrees
    </p>
    <ul>
      <li>9-meter dish at 4 GHz (λ = 7.5 cm): HPBW ≈ 0.58°</li>
      <li>9-meter dish at 12 GHz (λ = 2.5 cm): HPBW ≈ 0.19°</li>
    </ul>
    <p>
      Narrower beamwidth means tighter focus and higher gain, but also more stringent pointing
      requirements. A 9-meter C-band dish with 0.5° beamwidth must be pointed to within ~0.1–0.2°
      for optimal performance. Pointing error of even 0.5° (one beamwidth) causes 3 dB gain loss -
      half your signal strength.
    </p>
    <p>
      This is why large antennas need motorized pointing and tracking systems. Geostationary
      satellites appear stationary but actually drift slightly due to orbital perturbations,
      and ground structures expand/contract with temperature, requiring continuous tracking
      corrections. Auto-track systems use signal strength or phase measurements to maintain
      peak pointing accuracy.
    </p>

    <h3>What is G/T and why is it important?</h3>
    <p>
      G/T (pronounced "gee over tee") is the receive system figure of merit, measured in dB/K
      (decibels per Kelvin). It combines antenna gain (G) and system noise temperature (T):
    </p>
    <p style="text-align: center; font-style: italic;">
      G/T = G_antenna (dBi) - 10×log₁₀(T_system in Kelvin)
    </p>
    <p>
      Higher G/T means better receive performance. System noise temperature includes contributions
      from:
    </p>
    <ul>
      <li>Sky temperature (~8–12 K at zenith in C-band, higher at low elevation)</li>
      <li>Atmospheric absorption noise (~5–15 K depending on elevation and frequency)</li>
      <li>Feed horn and waveguide losses (contributes 10–30 K)</li>
      <li>LNA noise figure (contributes 15–80 K depending on LNA quality)</li>
    </ul>
    <p>
      Typical values: 9-meter C-band antenna with good LNA achieves G/T ≈ 30–35 dB/K. Every 3 dB
      improvement in G/T allows you to receive 3 dB weaker signals or use 3 dB less transmit power
      from the satellite - directly impacting link budget and cost.
    </p>

    <h3>Polarization and skew alignment</h3>
    <p>
      Satellite signals use polarization to allow frequency reuse - two signals at the same frequency
      can coexist if they use orthogonal polarizations (Horizontal/Vertical or Left/Right circular).
      Your antenna must align its polarization with the satellite signal to receive it.
    </p>
    <p>
      For linear polarization (H/V), the satellite's polarization plane appears rotated when viewed
      from different ground locations due to the geometry of the satellite arc. A satellite at your
      meridian (directly south in northern hemisphere) requires 0° skew, but satellites far east or
      west require significant skew adjustment (±30–60°).
    </p>
    <p>
      Polarization mismatch causes loss:
    </p>
    <ul>
      <li>0° skew error: 0 dB loss (perfect alignment)</li>
      <li>10° skew error: 0.15 dB loss (negligible)</li>
      <li>30° skew error: 1.25 dB loss (noticeable)</li>
      <li>45° skew error: 3 dB loss (half power - significant)</li>
      <li>90° skew error: ∞ dB loss (cross-polarized - no reception)</li>
    </ul>
    <p>
      The skew knob compensates for this geometric rotation. When tracking a satellite, optimize
      skew by adjusting for maximum signal strength or minimum cross-polarization interference.
    </p>

    <h3>Auto-tracking vs manual pointing</h3>
    <p>
      <strong>Manual pointing mode:</strong> You directly control azimuth and elevation with the
      knobs. This is used for initial satellite acquisition, testing, or when tracking is not
      needed (very short sessions, star tracking for calibration, etc.). Manual mode requires
      you to maintain pointing as satellites drift and the structure moves.
    </p>
    <p>
      <strong>Auto-track mode:</strong> The ACU takes over pointing control. When you enable
      auto-track:
    </p>
    <ol>
      <li>The system scans the current pointing position for satellite signals</li>
      <li>It identifies the strongest signal (assuming it's the desired satellite)</li>
      <li>It performs a lock sequence: pointing is adjusted to maximize signal strength</li>
      <li>Status changes to "LOCKED ON SATELLITE" (green status bar)</li>
      <li>The ACU continuously monitors signal level and makes small corrections to maintain peak</li>
    </ol>
    <p>
      Auto-track requires a strong signal (typically &gt;-100 dBm) to acquire lock. If the signal
      is too weak or absent, auto-track will fail and show "AUTO TRACK FAILED" alarm.
    </p>
    <p>
      <strong>Breaking lock:</strong> If you manually adjust azimuth or elevation while auto-tracking,
      the system breaks lock and disables auto-track. This prevents fighting between manual control
      and automatic tracking. You must re-enable auto-track to resume tracking.
    </p>

    <h3>Loopback test mode</h3>
    <p>
      Loopback mode creates a local RF path from transmit to receive, bypassing the antenna's
      radiating elements. When enabled:
    </p>
    <ul>
      <li>Your transmitted signal (from BUC/HPA) is routed to the LNB input</li>
      <li>No RF is actually transmitted to space (prevents interference and conserves power)</li>
      <li>You can test modems, signal processing, encoding, modulation, etc. end-to-end</li>
      <li>Link budget is drastically different - signal doesn't travel to satellite and back</li>
      <li>Useful for validating configurations before live transmission</li>
    </ul>
    <p>
      Loopback is a development and troubleshooting tool. Never operate in loopback during live
      satellite operations - you won't be transmitting or receiving real satellite signals.
    </p>

    <h3>RF performance metrics (when displayed)</h3>
    <p>
      The antenna can display detailed RF performance metrics computed from the current configuration
      and operating frequency:
    </p>
    <ul>
      <li>
        <strong>Gain (dBi)</strong> - antenna gain accounting for aperture efficiency, surface
        accuracy (Ruze formula), and blockage from the feed/subreflector
      </li>
      <li>
        <strong>HPBW (degrees)</strong> - half-power beamwidth, indicating pointing precision
        requirements
      </li>
      <li>
        <strong>G/T (dB/K)</strong> - receive figure of merit combining gain and system noise
        temperature
      </li>
      <li>
        <strong>Pol Loss (dB)</strong> - polarization mismatch loss due to current skew setting
      </li>
      <li>
        <strong>Atmos Loss (dB)</strong> - atmospheric absorption loss at current elevation and
        frequency
      </li>
      <li>
        <strong>Sky Temp (K)</strong> - sky noise temperature contribution (elevation-dependent)
      </li>
    </ul>
    <p>
      These metrics use realistic RF physics models and update based on antenna configuration,
      frequency, elevation, and skew. They're valuable for link budget analysis and performance
      optimization.
    </p>

    <h3>Alarms and warning conditions</h3>
    <p>The ACU monitors for several alarm conditions:</p>
    <ul>
      <li>
        <strong>ANTENNA NOT OPERATIONAL</strong> (critical) - Hardware fault or power sequencing
        error. The antenna is disabled. Check power, servo systems, and control cables.
      </li>
      <li>
        <strong>ACQUIRING LOCK...</strong> (warning) - Auto-track is enabled and attempting to
        lock onto a satellite. This is normal during initial acquisition and typically resolves
        within 3–10 seconds. If it persists for &gt;30 seconds, the signal may be too weak or
        no satellite is present.
      </li>
      <li>
        <strong>AUTO TRACK FAILED</strong> (warning) - Auto-track switch is enabled but lock could
        not be acquired. Signal is too weak (&lt;-100 dBm) or antenna is not pointed at a satellite.
        Manually adjust pointing or verify satellite is transmitting.
      </li>
      <li>
        <strong>DISCONNECTED</strong> (warning) - No signals are being received and the system is
        not in loopback or auto-track mode. Check antenna pointing, verify satellite is transmitting,
        and ensure LNB is powered and connected.
      </li>
      <li>
        <strong>X SIGNAL(S) DEGRADED</strong> (warning) - Received signals have poor carrier-to-
        interference ratio (C/I &lt; 10–15 dB) or significant overlap with stronger signals. This
        causes increased bit errors and reduced throughput. Investigate frequency coordination,
        pointing accuracy, and adjacent satellite interference.
      </li>
      <li>
        <strong>HIGH SKEW (X°)</strong> (warning) - Skew exceeds ±45°, which is unusual for most
        satellite locations. Verify you're tracking the correct satellite and that skew is properly
        set. Extreme skew (&gt;45°) causes &gt;3 dB polarization loss.
      </li>
      <li>
        <strong>NO SIGNALS RECEIVED</strong> (warning) - Antenna is locked but no signals detected.
        Satellite may not be transmitting, frequency may be wrong, or there's an equipment failure
        in the receive chain (LNB, OMT, cabling).
      </li>
      <li>
        <strong>LOOPBACK ENABLED</strong> (info) - Loopback mode is active. Signals are routed
        locally for testing, not transmitted/received via satellite. This is normal for testing
        but should not be active during live operations.
      </li>
    </ul>

    <h3>Simple troubleshooting steps</h3>
    <ol>
      <li>
        <strong>No signals received</strong> - Verify power is on (green LED). Check azimuth and
        elevation are pointed at a known satellite (use satellite position calculator or known
        good coordinates). Enable auto-track to automatically acquire the satellite. If auto-track
        fails, the satellite may not be transmitting or antenna may have a hardware fault.
      </li>
      <li>
        <strong>Auto-track won't lock</strong> - Signal is too weak. Manually point the antenna
        closer to the satellite's expected position using azimuth and elevation knobs. Verify the
        satellite is above the horizon (elevation &gt; 0°). Check that RF front-end is powered
        and LNB is operational. Ensure no obstructions block the antenna's view (buildings, trees).
      </li>
      <li>
        <strong>Signal is weak (low power)</strong> - Check skew alignment - incorrect skew causes
        polarization loss. Verify antenna is at peak pointing (use auto-track or maximize signal
        manually). Check for atmospheric attenuation (rain, snow, fog degrade signals especially
        at Ku/Ka-band). Inspect antenna surface for debris, ice, or damage affecting gain.
      </li>
      <li>
        <strong>Lost lock during operation</strong> - Check for obstructions that moved into the
        beam (crane, vehicle, etc.). Verify antenna structure hasn't shifted due to wind, thermal
        expansion, or foundation settling. Check power to servo motors - loss of power causes
        tracking to fail. Re-enable auto-track to re-acquire.
      </li>
      <li>
        <strong>Cross-polarization interference</strong> - Adjust skew to maximize wanted signal
        and minimize cross-polarized signal. Use a spectrum analyzer or signal quality meter to
        monitor cross-pol rejection (should be &gt;25 dB for good performance). If skew adjustment
        doesn't help, feed alignment may be incorrect - this requires professional service.
      </li>
      <li>
        <strong>Loopback doesn't work</strong> - Verify loopback switch is enabled (blue indicator
        on). Check that BUC/HPA is transmitting (output power &gt; 0 dBm). Ensure LNB is powered
        and locked to reference. Verify OMT is properly routing loopback signals. Check modem
        frequencies match (BUC upconverted frequency should be in LNB downconversion range).
      </li>
    </ol>

    <h3>Short examples</h3>
    <ul>
      <li>
        <strong>Example A - Normal tracking operation:</strong> Power ON, Az = 195.3°, El = 42.7°,
        Skew = -12°, Auto-Track ON (blue light), Status = "LOCKED ON SATELLITE" (green).
        Antenna is locked onto a satellite at 195° azimuth (south-southwest), 42.7° elevation,
        with -12° skew compensation for polarization alignment. Auto-track is maintaining lock.
        Signal quality is good.
      </li>
      <li>
        <strong>Example B - Manual pointing:</strong> Power ON, Az = 180.0°, El = 45.0°, Skew = 0°,
        Auto-Track OFF, Status = "Manual Tracking Enabled" (blue), receiving 3 signals.
        Operating in manual mode. Antenna pointed due south at 45° elevation. No auto-track,
        operator must maintain pointing manually. Three signals are being received from satellites
        in this direction.
      </li>
      <li>
        <strong>Example C - Acquiring lock:</strong> Power ON, Az = 203.5°, El = 38.2°, Auto-Track ON,
        Status = "ACQUIRING LOCK..." (yellow).
        Auto-track enabled and searching for satellite. Antenna is scanning and adjusting pointing
        to maximize signal. Expect lock within a few seconds. If this persists &gt;30 seconds,
        signal may be too weak or no satellite present.
      </li>
      <li>
        <strong>Example D - Auto-track failed:</strong> Power ON, Az = 270.0°, El = 10.0°,
        Auto-Track switch ON, Auto-Track indicator ON with fault (red border),
        Status = "AUTO TRACK FAILED" (red).
        Auto-track switch enabled but lock acquisition failed. Pointing may be wrong (270° west
        at 10° elevation may not have a satellite), or signal is too weak. Adjust pointing manually
        or verify satellite is transmitting.
      </li>
      <li>
        <strong>Example E - High skew warning:</strong> Power ON, Az = 240.0°, El = 35.0°, Skew = 58°,
        Auto-Track ON, Status = "LOCKED ON SATELLITE" (green) + "HIGH SKEW (58°)" (yellow).
        Antenna is locked but skew is extreme (58°). This causes ~4 dB polarization loss. Verify
        you're tracking the correct satellite and that skew is properly calibrated. Such high skew
        is unusual unless tracking a satellite at extreme orbital position.
      </li>
      <li>
        <strong>Example F - Loopback test:</strong> Power ON, Az = 0.0°, El = 0.0°, Loopback ON (blue),
        Status = "LOOPBACK ENABLED" (blue).
        Testing configuration. Loopback routes transmitted signals directly to receiver without
        going through space. Azimuth/elevation don't matter in loopback mode. Use this to validate
        modems and signal processing before live operation.
      </li>
      <li>
        <strong>Example G - Degraded signals:</strong> Power ON, Az = 198.2°, El = 41.5°, Auto-Track ON,
        Status = "LOCKED ON SATELLITE" (green) + "2 SIGNAL(S) DEGRADED" (yellow).
        Tracking normally but two received signals have interference or poor C/I ratio. Adjacent
        satellite may be transmitting on overlapping frequencies. Check frequency coordination,
        or adjust pointing to minimize adjacent satellite pickup (may need to sacrifice some signal
        strength to reduce interference).
      </li>
    </ul>

    <h3>Advanced: How parabolic reflectors work</h3>
    <p>
      A parabolic reflector has a special mathematical property: all rays parallel to the axis
      (coming from a distant source like a satellite) reflect to a single point called the focus.
      Conversely, a source at the focus produces a parallel beam. This is the same principle used
      in flashlights, car headlights, and telescope mirrors.
    </p>
    <p>
      For satellite dishes, the feed horn is placed at the focus. On receive, incoming plane waves
      from the satellite reflect off the parabolic surface and converge at the feed horn, where
      they're collected and sent to the LNB. On transmit, the feed horn radiates outward from the
      focus, the reflector converts this into a parallel beam aimed at the satellite.
    </p>
    <p>
      The larger the reflector, the more energy collected (higher gain). But there are practical
      limits: larger dishes are heavier, more expensive, more affected by wind, and require higher
      surface accuracy (the Ruze formula shows that surface errors of λ/16 RMS cause ~1 dB gain
      loss).
    </p>

    <h3>Advanced: Link budget and the antenna's role</h3>
    <p>
      A satellite link budget is an accounting of all gains and losses from transmitter to receiver.
      The antenna contributes to both transmit and receive budgets:
    </p>
    <p>
      <strong>Transmit (uplink):</strong>
    </p>
    <ul>
      <li>Transmit power (HPA output): +50 dBm (100W)</li>
      <li>Feed loss: -1 dB</li>
      <li>Antenna gain: +50 dBi</li>
      <li><strong>EIRP</strong> (Effective Isotropic Radiated Power): +99 dBW</li>
    </ul>
    <p>
      <strong>Receive (downlink):</strong>
    </p>
    <ul>
      <li>Satellite EIRP: +50 dBW</li>
      <li>Free-space path loss (38,000 km at 4 GHz): -196 dB</li>
      <li>Atmospheric loss: -0.5 dB</li>
      <li>Polarization loss: -0.5 dB</li>
      <li>Antenna gain: +50 dBi</li>
      <li>System noise temperature: 50 K (G/T = +33 dB/K)</li>
    </ul>
    <p>
      The antenna's gain appears on both sides - higher gain allows lower transmit power or better
      receive sensitivity. This is why large ground antennas are cost-effective: one expensive
      antenna can save on satellite power, which is extremely expensive (limited solar panel area,
      battery capacity, and thermal management in space).
    </p>

    <h3>Final notes</h3>
    <p>
      The antenna is often the most visible and expensive component of a satellite ground station,
      but it's a passive device - it's fundamentally just a precisely-shaped metal reflector. The
      sophistication lies in the mechanical design (pointing accuracy, wind resistance, thermal
      stability) and the RF design (feed illumination, polarization purity, sidelobe suppression).
    </p>
    <p>
      Best practices for antenna operation:
    </p>
    <ul>
      <li>Always use auto-track for continuous operations to compensate for drift and structural movement</li>
      <li>Optimize skew for each satellite - don't assume 0° is correct</li>
      <li>Monitor signal quality metrics (C/I, signal strength) to detect degradation early</li>
      <li>Keep the reflector surface clean - dirt, ice, water, or debris degrades gain</li>
      <li>Protect the feed horn and waveguide from moisture, insects, and corrosion</li>
      <li>Verify pointing periodically using beacon signals or known satellites</li>
      <li>In adverse weather (high wind), reduce power or cease operation to prevent damage</li>
      <li>Use loopback mode to test system configurations before live transmission</li>
    </ul>
    <p>
      Remember: the antenna is the "front door" to space. Everything downstream (LNB, receiver,
      demodulator) depends on the antenna capturing the signal in the first place. Poor antenna
      performance cannot be recovered by better electronics - invest in quality antennas, maintain
      them properly, and operate them within specifications.
    </p>
  </div>
`;

export default antennaHelp;
