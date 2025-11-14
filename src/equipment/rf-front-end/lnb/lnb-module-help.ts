import { html } from "@app/engine/utils/development/formatter";

// Help text aimed at learners of satellite communications.
export const lnbModuleHelp = html`
  <div class="lnb-help">
    <h2>What this module does</h2>
    <p>
      The LNB (Low Noise Block) converter is one of the most important components in satellite
      reception. It sits at the antenna and does two critical jobs: first, it amplifies extremely
      weak signals from space with minimal added noise; second, it downconverts the high-frequency
      RF signals (typically 3.7–4.2 GHz) to a lower intermediate frequency (IF) that can travel
      through coaxial cable without significant loss. The "low noise" part means it's designed to
      add as little extra noise as possible to the already-faint signals coming from satellites.
    </p>

    <h3>Key controls</h3>
    <ul>
      <li>
        <strong>POWER</strong> - turns the LNB on or off. When powered, the LNB amplifies and
        downconverts signals. When off, no signals pass through.
      </li>
      <li>
        <strong>LO (MHz)</strong> - sets the Local Oscillator frequency (typically 3700–4200 MHz).
        The LO is mixed with incoming RF signals to produce the IF output. For example, if you
        receive a 4000 MHz signal and the LO is set to 4200 MHz, the output IF will be 200 MHz.
      </li>
      <li>
        <strong>GAIN (dB)</strong> - controls how much the LNB amplifies the signal (0–70 dB).
        Higher gain means stronger output signals, but also affects noise temperature. Typical
        LNBs operate around 50–65 dB of gain.
      </li>
    </ul>

    <h3>Readouts you will see</h3>
    <ul>
      <li>
        <strong>LO (MHz)</strong> - displays the current Local Oscillator frequency. This value
        determines which RF frequency band gets downconverted to which IF frequency.
      </li>
      <li>
        <strong>NOISE TEMP (K)</strong> - the system noise temperature in Kelvin. This is a
        critical performance metric. Lower is better. Typical consumer LNBs range from 45–90K
        when fully warmed up. Professional LNBs can achieve 15–30K. When first powered on, the
        noise temperature starts higher (around 2x nominal) and gradually decreases as components
        warm up and stabilize.
      </li>
      <li>
        <strong>TEMP (°C)</strong> - the physical operating temperature of the LNB components.
        This affects oscillator stability. The LNB warms from ambient (~25°C) to operating
        temperature (~50°C) over about 2.5 minutes after power-on.
      </li>
      <li>
        <strong>FREQ ERR (MHz)</strong> - frequency error or drift of the Local Oscillator.
        When locked to an external reference (like a GPSDO) and fully warmed up, this should
        be near zero. When unlocked or still warming up, temperature-dependent drift occurs
        (typically 0.5 ppm/°C), which can shift your received signals off-frequency.
      </li>
    </ul>

    <h3>LED indicators</h3>
    <ul>
      <li>
        <strong>LOCK</strong> - shows whether the LNB's Local Oscillator is locked to an external
        reference source (typically a 10 MHz signal from a GPSDO).
        <ul>
          <li><strong class="green">Green</strong> - locked to external reference. Frequency is stable and accurate.</li>
          <li><strong class="amber">Amber</strong> - acquiring lock or reference signal quality degraded.</li>
          <li><strong class="red">Red</strong> - not locked. LNB is free-running and will experience frequency drift.</li>
        </ul>
      </li>
      <li>
        <strong>NOISE TEMP</strong> - a blue LED whose brightness indicates noise temperature.
        Brighter means lower (better) noise temperature. Dimmer means higher (worse) noise
        temperature. This gives you a quick visual indication of LNB performance quality.
      </li>
    </ul>

    <h3>What noise temperature actually means</h3>
    <p>
      Noise temperature is a way to measure how much noise the LNB adds to the incoming signal.
      Every amplifier adds some noise, but LNBs are specially designed to add as little as possible.
      The noise temperature (in Kelvin) represents the "equivalent temperature" of a resistor that
      would produce the same amount of noise. Lower temperatures mean less noise, which means you
      can receive weaker signals successfully.
    </p>
    <p>
      The total noise temperature comes from both the Low Noise Amplifier (LNA) stage and the
      mixer stage, combined using Friis' formula. The LNA's noise figure dominates because it's
      first in the chain - this is why high-quality LNAs are so important.
    </p>

    <h3>Thermal stabilization and why it matters</h3>
    <p>
      When you first power on an LNB, the components are cold (ambient temperature). As current
      flows through them, they warm up to their normal operating temperature. This warming process
      takes about 2.5 minutes for typical consumer LNBs. During this time:
    </p>
    <ul>
      <li>
        <strong>Noise temperature</strong> starts at roughly double its nominal value and
        exponentially decays to the stable operating value. Cold components have worse noise
        performance.
      </li>
      <li>
        <strong>Frequency stability</strong> is poor. The oscillator's frequency drifts as
        temperature changes. Even when locked to an external reference, it takes time for the
        reference loop to compensate for rapid temperature changes.
      </li>
    </ul>
    <p>
      For best reception, wait a few minutes after powering on the LNB before attempting to
      receive weak signals. Professional installations often leave LNBs powered continuously
      to avoid this stabilization period.
    </p>

    <h3>Frequency conversion and spectrum inversion</h3>
    <p>
      The LNB uses a mixer to downconvert RF signals to IF. The formula is simple:
      <code>IF = |RF - LO|</code>. For example:
    </p>
    <ul>
      <li>RF signal at 4000 MHz, LO at 4200 MHz → IF output at 200 MHz</li>
      <li>RF signal at 4100 MHz, LO at 4200 MHz → IF output at 100 MHz</li>
    </ul>
    <p>
      Notice that when the LO is higher than the RF (high-side injection), the spectrum gets
      inverted: higher RF frequencies become lower IF frequencies. This is normal and expected.
      The downstream receiver needs to account for this inversion when tuning to specific signals.
    </p>

    <h3>Alarms and warning conditions</h3>
    <p>The system will raise alarms for several conditions:</p>
    <ul>
      <li>
        <strong>Not locked to reference</strong> - The LNB is powered but cannot lock to the
        external reference. This causes frequency drift and can make signals wander off-frequency.
        Check that the GPSDO is powered, warmed up, and connected.
      </li>
      <li>
        <strong>High noise temperature</strong> - Noise temperature above 100K indicates degraded
        performance. This can be normal during warm-up, but if it persists after stabilization,
        the LNB may be damaged or operating outside specifications.
      </li>
      <li>
        <strong>Degraded noise figure</strong> - The LNA noise figure exceeds 1.0 dB. Professional
        LNBs should be well below this. High noise figure directly increases system noise temperature
        and reduces sensitivity.
      </li>
    </ul>

    <h3>Simple troubleshooting steps</h3>
    <ol>
      <li>
        <strong>No signals received</strong> - Check that the LNB is powered on. Verify the LOCK
        LED is green (locked to reference). Wait 2–3 minutes after power-on for thermal stabilization.
      </li>
      <li>
        <strong>Signals at wrong frequency</strong> - Check the LO frequency setting. Verify the
        FREQ ERR display shows near zero. If frequency error is large, check the LOCK status and
        wait for thermal stabilization.
      </li>
      <li>
        <strong>Weak or noisy signals</strong> - Check the NOISE TEMP reading. If above 90–100K
        and stable, the LNB may have degraded performance. Try adjusting the GAIN setting - too
        little gain means weak signals, but excessive gain can cause other issues.
      </li>
      <li>
        <strong>LOCK LED is red</strong> - Verify the GPSDO module is powered and warmed up.
        Check that the 10 MHz reference signal is present. The LNB cannot lock without a valid
        reference.
      </li>
      <li>
        <strong>NOISE TEMP LED is dim</strong> - This indicates high noise temperature. If the
        LNB was just powered on, wait for stabilization. If it persists, check the LNA noise
        figure and gain settings.
      </li>
    </ol>

    <h3>Short examples</h3>
    <ul>
      <li>
        <strong>Example A - Normal operation:</strong> Power ON, LO = 4200 MHz, Gain = 55 dB,
        Noise Temp = 45K, Temp = 50°C, Freq Err = 0.000 MHz, LOCK = Green.
        The LNB is fully warmed up, locked to reference, and performing optimally.
      </li>
      <li>
        <strong>Example B - Just powered on:</strong> Power ON, Noise Temp = 90K, Temp = 28°C,
        Freq Err = -2.1 MHz, LOCK = Amber.
        The LNB is cold and stabilizing. Noise temperature is high, frequency is drifting, and
        lock is being acquired. Wait 2–3 minutes for stabilization.
      </li>
      <li>
        <strong>Example C - Unlocked operation:</strong> Power ON, LO = 4200 MHz, Noise Temp = 47K,
        Temp = 50°C, Freq Err = 8.4 MHz, LOCK = Red.
        The LNB is thermally stable with good noise performance, but not locked to reference.
        Signals will be off-frequency by 8.4 MHz. Check GPSDO reference.
      </li>
      <li>
        <strong>Example D - Degraded LNB:</strong> Power ON, Noise Temp = 120K, LNA NF = 1.5 dB,
        LOCK = Green.
        Even though locked, the noise performance is poor - likely component degradation or damage.
        Sensitivity will be reduced by several dB compared to a healthy LNB.
      </li>
    </ul>

    <h3>Advanced: Understanding gain and noise figure</h3>
    <p>
      The LNB has two main noise contributors: the LNA (Low Noise Amplifier) and the mixer.
      Because the LNA comes first, its noise figure dominates the overall system noise. This
      is described by Friis' formula:
    </p>
    <p style="text-align: center; font-style: italic;">
      F_total = F_LNA + (F_mixer - 1) / G_LNA
    </p>
    <p>
      This means the mixer's noise contribution is reduced by the LNA gain. Therefore, high LNA
      gain is beneficial for noise performance (up to a point - excessive gain can cause other
      issues like compression or oscillation). The noise temperature is then calculated as:
      T_noise = 290K × (F_total - 1).
    </p>

    <h3>Final notes</h3>
    <p>
      The LNB is the most critical component for receiving weak satellite signals. Its noise
      performance directly determines the minimum signal level you can successfully receive.
      Good practice includes: allowing adequate warm-up time, ensuring a stable frequency
      reference, monitoring noise temperature, and protecting the LNB from extreme weather
      conditions that might degrade components over time.
    </p>
    <p>
      Remember that the entire receive chain's noise performance is dominated by the first
      amplifier (the LNA inside the LNB). Even if downstream components are noisy, as long
      as the LNB provides enough gain and has low noise figure, overall system performance
      will be good. This is why satellite dishes mount the LNB directly at the antenna -
      minimizing any loss before the first amplification stage.
    </p>
  </div>
`;

export default lnbModuleHelp;
