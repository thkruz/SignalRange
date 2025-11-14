import { html } from "@app/engine/utils/development/formatter";

// Help text aimed at learners of satellite communications.
export const hpaModuleHelp = html`
  <div class="hpa-help">
    <h2>What this module does</h2>
    <p>
      The HPA (High Power Amplifier) is the final amplification stage before signals are transmitted
      to the satellite. Its job is to boost the transmit signal to high power levels (typically
      1–200 watts) so it can travel the enormous distance to orbit. The HPA sits after the BUC
      (Block Upconverter) in the transmit chain and provides the brute force needed to overcome
      the "free space path loss" - the natural weakening of signals as they spread out over
      hundreds or thousands of kilometers.
    </p>

    <h3>Key controls</h3>
    <ul>
      <li>
        <strong>POWER</strong> - enables or disables the HPA. When powered, the HPA can amplify
        signals. When off, no transmission occurs. Note: The HPA can only be powered on if the
        BUC is already powered (power sequencing requirement).
      </li>
      <li>
        <strong>HPA SWITCH</strong> - a secure toggle switch that enables or disables the actual
        RF output of the HPA. This is a safety feature - even when powered, the HPA won't transmit
        until this switch is enabled. This prevents accidental transmission.
      </li>
      <li>
        <strong>BACK-OFF (dB)</strong> - controls how far below the maximum output power (P1dB
        compression point) the HPA operates (0–30 dB). Higher back-off means lower output power
        but cleaner signals with less distortion. Lower back-off means higher output power but
        increased intermodulation distortion (IMD). Typical operation is 3–6 dB back-off.
      </li>
    </ul>

    <h3>Readouts you will see</h3>
    <ul>
      <li>
        <strong>OUTPUT (dBW)</strong> - the HPA's RF output power in dBW (decibels relative to
        1 watt). For reference: 0 dBW = 1W, 10 dBW = 10W, 20 dBW = 100W, 23 dBW = 200W. This
        value is calculated as P1dB minus the back-off setting.
      </li>
      <li>
        <strong>OUTPUT power meter</strong> - a visual LED bar showing output power level:
        <ul>
          <li><strong class="green">Green segments</strong> (0–60%) - normal operating range</li>
          <li><strong style="color: yellow;">Yellow segment</strong> (60–80%) - approaching maximum power</li>
          <li><strong class="red">Red segment</strong> (80–100%) - near or at maximum rated power</li>
        </ul>
      </li>
      <li>
        <strong>IMD (dBc)</strong> - Intermodulation Distortion level in dBc (decibels relative
        to carrier). This measures how much unwanted distortion products the HPA creates. More
        negative is better (e.g., -40 dBc is cleaner than -25 dBc). IMD degrades as back-off
        decreases.
      </li>
    </ul>

    <h3>LED indicators</h3>
    <ul>
      <li>
        <strong>IMD</strong> - shows orange when the HPA is in overdrive condition (back-off less
        than 3 dB). This warns that intermodulation distortion is degraded and may cause signal
        quality issues or interference to adjacent channels.
      </li>
    </ul>

    <h3>What is P1dB and why does it matter?</h3>
    <p>
      P1dB (the "1 dB compression point") is a critical specification for any power amplifier.
      It represents the output power level at which the amplifier's gain has been compressed
      (reduced) by 1 dB from its ideal linear value. In this HPA, P1dB is 50 dBm (100 watts).
    </p>
    <p>
      When an amplifier operates near or beyond P1dB, it enters compression - the gain drops
      and nonlinear distortion increases dramatically. This creates unwanted signals at new
      frequencies (intermodulation products) that can interfere with other communications or
      violate regulatory limits. Therefore, HPAs are typically operated with "back-off" - running
      at some power level below P1dB to maintain linearity and minimize distortion.
    </p>

    <h3>Understanding back-off</h3>
    <p>
      Back-off is the difference (in dB) between the amplifier's P1dB point and its actual
      operating point. For example:
    </p>
    <ul>
      <li>P1dB = 50 dBm (100W), Back-off = 6 dB → Output = 44 dBm (~25W)</li>
      <li>P1dB = 50 dBm (100W), Back-off = 3 dB → Output = 47 dBm (~50W)</li>
      <li>P1dB = 50 dBm (100W), Back-off = 0 dB → Output = 50 dBm (100W, at compression)</li>
    </ul>
    <p>
      The trade-off is simple: more back-off gives cleaner signals but less power; less back-off
      gives more power but dirtier signals. The right choice depends on your link budget and
      regulatory requirements. For multi-carrier or wideband signals, 6–10 dB back-off is common.
      For single-carrier narrowband signals, 3–6 dB may suffice.
    </p>

    <h3>What is intermodulation distortion (IMD)?</h3>
    <p>
      When a nonlinear amplifier (like an HPA near compression) amplifies multiple signals or
      a complex modulated signal, it creates new unwanted signals at frequencies that weren't
      present at the input. These are called intermodulation products. The level of these
      unwanted products relative to the desired signal is the IMD, measured in dBc (decibels
      below carrier).
    </p>
    <p>
      For example, IMD = -30 dBc means the distortion products are 30 dB weaker than the main
      signal. As the HPA operates closer to P1dB (lower back-off), IMD worsens. In this
      simulation, IMD degrades approximately 2 dB for every dB reduction in back-off:
    </p>
    <ul>
      <li>Back-off = 6 dB → IMD ≈ -42 dBc (good)</li>
      <li>Back-off = 3 dB → IMD ≈ -36 dBc (acceptable)</li>
      <li>Back-off = 1 dB → IMD ≈ -32 dBc (marginal)</li>
      <li>Back-off = 0 dB → IMD ≈ -30 dBc (poor - compression)</li>
    </ul>
    <p>
      When IMD is too high, adjacent channel interference increases, and signal quality (as
      measured by metrics like Error Vector Magnitude or Bit Error Rate) degrades.
    </p>

    <h3>Thermal management</h3>
    <p>
      HPAs generate significant heat. Efficiency is typically around 50% for solid-state power
      amplifiers (SSPA) - meaning half the input power is converted to RF output and half becomes
      heat. At 100W output, the HPA dissipates ~100W as heat. The module monitors temperature,
      and if it exceeds 85°C, an over-temperature alarm is raised. In real systems, forced air
      cooling or liquid cooling is required for high-power operation.
    </p>

    <h3>Power sequencing</h3>
    <p>
      The HPA has a critical dependency: it can only be powered on if the BUC (Block Upconverter)
      is already powered. This is a safety interlock to ensure proper signal flow and prevent
      damage. If you try to enable the HPA without the BUC being on, it will automatically disable
      and raise an alarm. Always power up in sequence: BUC first, then HPA.
    </p>

    <h3>Alarms and warning conditions</h3>
    <p>The system will raise alarms for several conditions:</p>
    <ul>
      <li>
        <strong>HPA overdrive - IMD degradation</strong> - Back-off is less than 3 dB. The HPA
        is operating too close to compression, creating excessive intermodulation distortion.
        Increase back-off to improve signal quality.
      </li>
      <li>
        <strong>HPA over-temperature</strong> - Physical temperature exceeds 85°C. The amplifier
        is overheating. This can occur at high output power levels. Reduce power or improve
        cooling. Prolonged operation at high temperature can damage components.
      </li>
      <li>
        <strong>HPA enabled without BUC power</strong> - Power sequencing violation. The HPA
        cannot operate without the BUC being powered first. This is automatically enforced, but
        if you see this alarm, check the BUC status.
      </li>
    </ul>

    <h3>Simple troubleshooting steps</h3>
    <ol>
      <li>
        <strong>No RF output</strong> - Check that both the power switch and the HPA switch are
        enabled. Verify the BUC is powered on (power sequencing requirement). Check that back-off
        isn't set to maximum (30 dB would give very low output).
      </li>
      <li>
        <strong>IMD LED is orange</strong> - Back-off is less than 3 dB. You're in overdrive.
        Increase the back-off setting to at least 3–6 dB to reduce distortion.
      </li>
      <li>
        <strong>Output power too low</strong> - Reduce the back-off setting. Remember: output
        power = P1dB (50 dBm) minus back-off. To get maximum power, set back-off to 0 dB, but
        expect high IMD.
      </li>
      <li>
        <strong>Output power too high (interference concerns)</strong> - Increase the back-off
        setting. Each 3 dB of back-off reduces output power by half (in watts).
      </li>
      <li>
        <strong>Over-temperature alarm</strong> - Reduce output power by increasing back-off.
        In a real system, check cooling fans, heat sinks, and ambient temperature. High-power
        operation requires adequate thermal management.
      </li>
      <li>
        <strong>Can't enable HPA</strong> - Verify the BUC is powered on first. The HPA has a
        power sequencing interlock and won't enable without the BUC.
      </li>
    </ol>

    <h3>Short examples</h3>
    <ul>
      <li>
        <strong>Example A - Conservative operation:</strong> Power ON, HPA Switch ON, Back-off = 10 dB,
        Output = 40 dBm (10W), IMD = -50 dBc, Temp = 55°C, IMD LED = Off.
        Very clean operation with low distortion. Good for multi-carrier or wideband signals.
        Lower output power requires better receive sensitivity or larger antenna.
      </li>
      <li>
        <strong>Example B - Typical operation:</strong> Power ON, HPA Switch ON, Back-off = 6 dB,
        Output = 44 dBm (25W), IMD = -42 dBc, Temp = 65°C, IMD LED = Off.
        Balanced trade-off between power and linearity. Suitable for most applications. Good
        link margin with acceptable distortion.
      </li>
      <li>
        <strong>Example C - Aggressive operation:</strong> Power ON, HPA Switch ON, Back-off = 3 dB,
        Output = 47 dBm (50W), IMD = -36 dBc, Temp = 75°C, IMD LED = Off (borderline).
        High power but IMD is marginal. Suitable for single-carrier signals with good modulation
        tolerance. Monitor for adjacent channel interference.
      </li>
      <li>
        <strong>Example D - Overdrive (not recommended):</strong> Power ON, HPA Switch ON,
        Back-off = 1 dB, Output = 49 dBm (79W), IMD = -32 dBc, Temp = 85°C, IMD LED = Orange.
        Operating in compression with poor IMD and high temperature. Signal quality will be
        degraded. Increase back-off immediately to avoid equipment damage or regulatory violations.
      </li>
      <li>
        <strong>Example E - Maximum power (emergency/special use only):</strong> Power ON, HPA Switch ON,
        Back-off = 0 dB, Output = 50 dBm (100W), IMD = -30 dBc, Temp = 95°C (alarm), IMD LED = Orange.
        Operating at P1dB compression point. Very poor IMD, over-temperature alarm. Only acceptable
        for brief periods or very robust modulation schemes. Not suitable for most regulatory
        environments.
      </li>
    </ul>

    <h3>Advanced: Understanding compression and linearity</h3>
    <p>
      An ideal amplifier has constant gain regardless of input level: doubling the input power
      doubles the output power (a 3 dB increase in input gives a 3 dB increase in output). Real
      amplifiers behave this way at low power levels, but as they approach their maximum capability,
      gain begins to drop - this is called gain compression.
    </p>
    <p>
      Compression is inherently nonlinear: the amplifier responds differently to different input
      levels. Nonlinearity creates harmonic distortion (at multiples of the input frequency) and
      intermodulation distortion (at sum and difference frequencies when multiple signals are present).
      These distortion products waste power, create interference, and degrade signal quality.
    </p>
    <p>
      The P1dB point is industry standard for specifying where compression becomes significant
      (gain has dropped by 1 dB). Operating beyond P1dB gives diminishing returns: you're increasing
      input power but not getting proportional output power, and distortion is increasing rapidly.
      Back-off keeps you in the linear region where gain is constant and distortion is minimized.
    </p>

    <h3>Advanced: Calculating link budget impact</h3>
    <p>
      The HPA's output power is a critical parameter in your link budget - the calculation that
      determines if your signal will successfully reach the satellite. Every 3 dB of back-off
      reduces output power by half (in watts), which directly reduces the EIRP (Effective Isotropic
      Radiated Power) by 3 dB. This must be compensated by:
    </p>
    <ul>
      <li>Larger antenna (increased gain)</li>
      <li>Better receiver sensitivity (lower noise temperature)</li>
      <li>More robust modulation (lower data rate or coding rate)</li>
      <li>Reduced link margin (less tolerance for fading or interference)</li>
    </ul>
    <p>
      The choice of back-off is therefore a system-level trade-off balancing power, distortion,
      cost, and link reliability.
    </p>

    <h3>Final notes</h3>
    <p>
      The HPA is the "muscle" of your transmit chain, but it must be used wisely. More power
      isn't always better - operating in compression creates distortion that can render your
      signal unusable or violate regulations. The back-off control gives you direct control over
      this trade-off.
    </p>
    <p>
      Best practices include: always power the BUC before the HPA, start with conservative back-off
      (6–10 dB) and only reduce if needed, monitor the IMD LED and temperature readouts, and never
      operate continuously with the over-temperature alarm active. Remember that satellite
      communications is licensed and regulated - excessive IMD can cause interference to other
      users and result in fines or license revocation.
    </p>
    <p>
      In professional systems, HPAs are often the most expensive single component in the ground
      station (costing tens of thousands of dollars for high-power units). Treat them with care,
      allow adequate warm-up time before applying full power, and ensure proper cooling at all times.
    </p>
  </div>
`;

export default hpaModuleHelp;
