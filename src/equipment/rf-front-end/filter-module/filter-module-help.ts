import { html } from "@app/engine/utils/development/formatter";

// Help text aimed at learners of satellite communications.
export const filterModuleHelp = html`
  <div class="filter-help">
    <h2>What this module does</h2>
    <p>
      The IF Filter Bank is a selectable bandpass filter that sits between the LNB (which
      downconverts RF to IF) and your receiver/demodulator. Its job is to select only the
      desired signal bandwidth while rejecting everything else - adjacent channel interference,
      out-of-band noise, and unwanted signals. Think of it as a "bandwidth gatekeeper" that
      controls what signals reach your receiver.
    </p>
    <p>
      Satellite transponders carry multiple signals at different frequencies, often separated
      by just a few MHz. Without filtering, your receiver would see everything - wanted signals,
      unwanted signals, noise, and interference all mixed together. The filter bank lets you
      select just the bandwidth you need, improving signal-to-noise ratio and reducing processing
      load on downstream equipment.
    </p>

    <h3>Key controls</h3>
    <ul>
      <li>
        <strong>BANDWIDTH</strong> - a rotary knob that selects the filter bandwidth from 13
        preset values ranging from 30 kHz (very narrow) to 320 MHz (very wide). The selected
        bandwidth determines what frequency range of signals will pass through with minimal
        attenuation. Signals outside this bandwidth are heavily attenuated or blocked entirely.
      </li>
    </ul>

    <h3>Available bandwidth settings</h3>
    <p>The filter bank provides 13 selectable bandwidths, each optimized for different applications:</p>
    <ul>
      <li><strong>30 kHz</strong> - Insertion Loss: 3.5 dB, Noise Floor: -129 dBm (narrowband voice, telemetry)</li>
      <li><strong>100 kHz</strong> - Insertion Loss: 3.2 dB, Noise Floor: -124 dBm (SCPC voice channels)</li>
      <li><strong>200 kHz</strong> - Insertion Loss: 3.0 dB, Noise Floor: -121 dBm (narrow data links)</li>
      <li><strong>500 kHz</strong> - Insertion Loss: 2.9 dB, Noise Floor: -117 dBm (medium data links)</li>
      <li><strong>1 MHz</strong> - Insertion Loss: 2.8 dB, Noise Floor: -114 dBm (standard data channels)</li>
      <li><strong>2 MHz</strong> - Insertion Loss: 2.6 dB, Noise Floor: -111 dBm (broadcast TV, wide data)</li>
      <li><strong>5 MHz</strong> - Insertion Loss: 2.4 dB, Noise Floor: -107 dBm (HDTV, high-speed data)</li>
      <li><strong>10 MHz</strong> - Insertion Loss: 2.2 dB, Noise Floor: -104 dBm (multiple carriers)</li>
      <li><strong>20 MHz</strong> - Insertion Loss: 2.0 dB, Noise Floor: -101 dBm (wideband links, default)</li>
      <li><strong>40 MHz</strong> - Insertion Loss: 1.8 dB, Noise Floor: -98 dBm (very wideband)</li>
      <li><strong>80 MHz</strong> - Insertion Loss: 1.6 dB, Noise Floor: -95 dBm (multi-carrier reception)</li>
      <li><strong>160 MHz</strong> - Insertion Loss: 1.5 dB, Noise Floor: -92 dBm (transponder monitoring)</li>
      <li><strong>320 MHz</strong> - Insertion Loss: 1.5 dB, Noise Floor: -89 dBm (full transponder, wide scan)</li>
    </ul>

    <h3>Readouts and indicators</h3>
    <ul>
      <li>
        <strong>BANDWIDTH</strong> - displays the currently selected filter bandwidth (e.g., "20 MHz").
        This is the filter's passband - signals within this bandwidth pass with minimal loss, signals
        outside are attenuated.
      </li>
      <li>
        <strong>INSERTION LOSS (dB)</strong> - the signal power loss introduced by the filter itself,
        measured in dB. Even signals within the passband experience some loss due to the filter's
        physical components (capacitors, inductors, dielectrics). Narrower filters have higher
        insertion loss (3.5 dB for 30 kHz) because they require sharper cutoffs and more filter
        stages. Wider filters have lower insertion loss (1.5 dB for 320 MHz).
      </li>
      <li>
        <strong>NOISE FLOOR (dBm)</strong> - the total noise power at the filter output, measured
        in dBm. This includes thermal noise from the filter components themselves and noise passed
        through from upstream (antenna, LNB). Narrower filters have lower noise floor (better)
        because they pass less total noise power: noise power = noise density × bandwidth. A 30 kHz
        filter passes only 30 kHz worth of noise (-129 dBm), while a 320 MHz filter passes
        320 MHz worth of noise (-89 dBm) - a 40 dB difference.
      </li>
      <li>
        <strong>INSERTION LOSS LED (orange)</strong> - brightness indicates insertion loss magnitude.
        Brighter = higher loss. This gives a quick visual indication of the filter's impact on
        signal power.
      </li>
      <li>
        <strong>NOISE FLOOR LED (color-coded)</strong> - indicates external noise floor quality:
        <ul>
          <li><strong class="green">Green</strong> - excellent noise floor (≤ -100 dBm)</li>
          <li><strong style="color: #f80;">Orange</strong> - moderate noise floor (-70 to -100 dBm)</li>
          <li><strong class="red">Red</strong> - high noise floor (&gt; -70 dBm, problematic)</li>
        </ul>
      </li>
    </ul>

    <h3>Understanding the bandwidth/noise trade-off</h3>
    <p>
      The fundamental trade-off in filter selection is between bandwidth and noise. Thermal noise
      power is proportional to bandwidth - wider filters pass more noise. This is described by
      the formula:
    </p>
    <p style="text-align: center; font-style: italic;">
      Noise Power (watts) = k × T × B
    </p>
    <p>
      where k is Boltzmann's constant, T is temperature in Kelvin, and B is bandwidth in Hz.
      In decibels:
    </p>
    <p style="text-align: center; font-style: italic;">
      Noise Floor (dBm) = -174 dBm/Hz + 10×log₁₀(T/290) + 10×log₁₀(B)
    </p>
    <p>
      Every time you double the bandwidth, noise power increases by 3 dB. This is why the 320 MHz
      filter has a noise floor 40 dB worse than the 30 kHz filter - it's passing 10,000× more bandwidth.
    </p>
    <p>
      <strong>The key principle:</strong> Use the narrowest filter that accommodates your signal.
      If your signal is 1 MHz wide, using a 20 MHz filter means you're passing 13 dB more noise
      than necessary (20 MHz / 1 MHz = 20×, which is 13 dB). This degrades your signal-to-noise
      ratio by 13 dB - potentially making the difference between successful reception and failure.
    </p>

    <h3>Insertion loss and filter sharpness</h3>
    <p>
      Insertion loss is the price you pay for filtering. All filters introduce some loss due to
      resistive elements, dielectric losses, and impedance mismatches. Narrower filters have higher
      insertion loss because:
    </p>
    <ul>
      <li>They require more filter stages (more components) to achieve sharp cutoff</li>
      <li>Sharp transitions from passband to stopband demand higher quality factor (Q) resonators</li>
      <li>Tighter tolerances and better components mean more loss mechanisms</li>
    </ul>
    <p>
      The insertion loss values range from 3.5 dB (30 kHz filter) down to 1.5 dB (160–320 MHz filters).
      This loss directly reduces signal power - a -90 dBm signal passing through the 30 kHz filter
      emerges at -93.5 dBm.
    </p>
    <p>
      <strong>When does insertion loss matter?</strong> For strong signals (e.g., -60 dBm), a few dB
      of loss is insignificant. But for weak signals near the noise floor (-100 to -110 dBm), every
      dB counts. If your signal is -105 dBm and noise floor is -100 dBm, you have 5 dB SNR. Losing
      3.5 dB to insertion loss reduces your signal to -108.5 dBm, giving 8.5 dB SNR - but you also
      improved noise floor by using a narrow filter, so the net effect is usually positive.
    </p>

    <h3>How to select the right filter bandwidth</h3>
    <p>
      Choosing the correct filter bandwidth depends on your signal's characteristics:
    </p>
    <ol>
      <li>
        <strong>Know your signal bandwidth.</strong> A QPSK signal at 1 Msym/s occupies ~1.2 MHz
        (symbol rate × 1.2 for typical roll-off). An HDTV signal at 30 Msym/s occupies ~36 MHz.
        FM voice might be 30 kHz. Check your modem or signal specifications.
      </li>
      <li>
        <strong>Add margin.</strong> Select a filter 1.5–2× wider than your signal to avoid clipping
        the signal edges, which causes distortion and increases bit errors. For a 1 MHz signal, use
        a 2 MHz filter. For a 30 MHz signal, use a 40 MHz filter.
      </li>
      <li>
        <strong>Consider adjacent signals.</strong> If there are strong signals near yours, use a
        narrower filter to reject them. If the transponder is lightly loaded with no nearby signals,
        you can use a wider filter for convenience.
      </li>
      <li>
        <strong>Balance SNR vs convenience.</strong> Narrower is better for SNR, but if you're
        receiving multiple signals simultaneously (e.g., a 50 MHz wide transponder with many carriers),
        use a wider filter (80 or 160 MHz) to capture everything.
      </li>
    </ol>
    <p>
      <strong>Rule of thumb:</strong> Start with a filter 2× your signal bandwidth. If SNR is poor,
      try narrowing the filter. If signal quality degrades (distortion, errors), widen the filter.
    </p>

    <h3>What happens to signals wider than the filter?</h3>
    <p>
      If your signal is wider than the selected filter bandwidth, the filter clips the signal's edges.
      The module applies additional attenuation based on the bandwidth ratio - essentially, the parts
      of the signal outside the filter passband are lost.
    </p>
    <p>
      For example: You receive a 10 MHz wide signal but select a 5 MHz filter. The filter passes
      5 MHz and blocks 5 MHz. The signal power is reduced by ~3 dB (half the energy is lost), and
      more importantly, the signal is distorted because its spectral shape is truncated. This causes:
    </p>
    <ul>
      <li>Intersymbol interference (ISI) - symbols overlap in time domain</li>
      <li>Increased bit error rate (BER)</li>
      <li>Demodulator may lose lock or fail to acquire carrier</li>
    </ul>
    <p>
      <strong>Avoid this situation!</strong> Always use a filter wider than your signal. If you're
      unsure of signal bandwidth, start with a wide filter (20–40 MHz) and narrow it down while
      monitoring signal quality.
    </p>

    <h3>When to use narrow vs wide filters</h3>
    <p><strong>Use narrow filters (30 kHz – 2 MHz) when:</strong></p>
    <ul>
      <li>Receiving single narrowband carriers (voice, telemetry, low-rate data)</li>
      <li>Signal is weak and close to noise floor - every dB of SNR matters</li>
      <li>Adjacent channel interference is present - need sharp rejection</li>
      <li>Spectrum is crowded and you want to isolate one specific carrier</li>
    </ul>
    <p><strong>Use medium filters (5 MHz – 20 MHz) when:</strong></p>
    <ul>
      <li>Receiving standard data signals (video, high-speed data)</li>
      <li>Typical single-carrier reception with moderate bandwidth</li>
      <li>General-purpose operation with reasonable SNR</li>
    </ul>
    <p><strong>Use wide filters (40 MHz – 320 MHz) when:</strong></p>
    <ul>
      <li>Receiving multiple carriers simultaneously from a transponder</li>
      <li>Monitoring or scanning a wide frequency range</li>
      <li>Signal bandwidth is very large (high symbol rate, wideband modulation)</li>
      <li>Using spectrum analyzer or monitoring equipment</li>
      <li>Signal is very strong and noise is not a concern</li>
    </ul>

    <h3>Alarms and warning conditions</h3>
    <ul>
      <li>
        <strong>Filter insertion loss high (&gt; 3.0 dB)</strong> - You're using a very narrow filter
        (typically 30–200 kHz). This is normal for those settings, but be aware that 3+ dB of loss
        is being applied to your signal. If signal is weak, this might impact link margin. Consider
        whether you really need such a narrow filter or if a slightly wider one (lower loss) would
        suffice.
      </li>
    </ul>

    <h3>Short examples</h3>
    <ul>
      <li>
        <strong>Example A - Narrowband voice reception:</strong> Bandwidth = 30 kHz, Insertion Loss = 3.5 dB,
        Noise Floor = -129 dBm, Noise LED = Green.
        Receiving a single narrowband FM voice channel (~25 kHz wide). Filter is well-matched to
        signal, providing excellent noise rejection. Noise floor is very low (-129 dBm), giving
        maximum SNR for weak signals. The 3.5 dB insertion loss is acceptable trade-off for the
        40 dB improvement in noise floor compared to a wide filter.
      </li>
      <li>
        <strong>Example B - Standard data link:</strong> Bandwidth = 2 MHz, Insertion Loss = 2.6 dB,
        Noise Floor = -111 dBm, Noise LED = Green.
        Receiving a 1.5 MHz wide data signal (e.g., 1 Msym/s QPSK). Filter provides adequate margin
        (2 MHz vs 1.5 MHz signal) without clipping. Noise floor is low, insertion loss is moderate,
        and SNR is optimized for this signal bandwidth.
      </li>
      <li>
        <strong>Example C - Default wideband setting:</strong> Bandwidth = 20 MHz, Insertion Loss = 2.0 dB,
        Noise Floor = -101 dBm, Noise LED = Green.
        General-purpose setting (default). Accommodates most single carriers up to ~15 MHz wide.
        Good balance between flexibility and noise performance. Suitable for HD video, high-speed
        data, and most typical satellite signals.
      </li>
      <li>
        <strong>Example D - Full transponder monitoring:</strong> Bandwidth = 160 MHz,
        Insertion Loss = 1.5 dB, Noise Floor = -92 dBm, Noise LED = Orange.
        Receiving or monitoring an entire transponder with multiple carriers spanning 100+ MHz.
        Low insertion loss (1.5 dB) but high noise floor (-92 dBm) because 160 MHz of noise is
        being passed. Acceptable when signals are strong or when monitoring many carriers simultaneously.
      </li>
      <li>
        <strong>Example E - Filter too narrow (problem):</strong> Bandwidth = 1 MHz, signal is 5 MHz wide.
        The filter clips 4 MHz of the 5 MHz signal, passing only the center 1 MHz. Signal is distorted,
        power is reduced by ~7 dB (5 MHz / 1 MHz = 5×, or 7 dB), and demodulator will likely fail.
        <strong>Solution:</strong> Increase bandwidth to at least 5 MHz, preferably 10 MHz to provide margin.
      </li>
      <li>
        <strong>Example F - Filter too wide (suboptimal SNR):</strong> Bandwidth = 320 MHz,
        signal is 2 MHz wide, Noise Floor = -89 dBm.
        Receiving a narrow 2 MHz signal with a very wide filter. Noise floor is -89 dBm (poor),
        whereas using a 2 MHz filter would give -111 dBm - a 22 dB improvement in SNR. If the signal
        is weak or link margin is tight, this 22 dB matters.
        <strong>Solution:</strong> Narrow filter to 2 or 5 MHz for better SNR.
      </li>
    </ul>

    <h3>Advanced: Filter types and characteristics</h3>
    <p>
      RF and IF filters come in various types - Butterworth, Chebyshev, Elliptic, etc. - each with
      different trade-offs between passband flatness, stopband rejection, and phase linearity. This
      filter bank likely uses Chebyshev or Elliptic designs for sharp cutoffs:
    </p>
    <ul>
      <li>
        <strong>Passband:</strong> The frequency range where signals pass with minimal attenuation
        (within 1-3 dB of the insertion loss). Ideally flat across the entire passband.
      </li>
      <li>
        <strong>Stopband:</strong> The frequency range where signals are heavily attenuated (30+ dB).
        Sharp filters transition from passband to stopband quickly (steep "skirts").
      </li>
      <li>
        <strong>Transition region:</strong> The region between passband and stopband. Narrower
        transition requires more filter stages and higher insertion loss.
      </li>
      <li>
        <strong>Shape factor:</strong> Ratio of 60 dB bandwidth to 3 dB bandwidth. Lower is better
        (sharper filter). Typical values are 2:1 to 5:1.
      </li>
    </ul>

    <h3>Advanced: Link budget impact</h3>
    <p>
      The filter affects your link budget in two ways:
    </p>
    <ul>
      <li>
        <strong>Signal power:</strong> Reduced by insertion loss. For a -100 dBm signal through a
        3 dB filter, output is -103 dBm.
      </li>
      <li>
        <strong>Noise power:</strong> Determined by filter bandwidth and system noise temperature.
        A 1 MHz filter with 100 K system temperature has noise floor of -174 + 10×log₁₀(100/290) +
        10×log₁₀(1×10⁶) ≈ -114 dBm.
      </li>
    </ul>
    <p>
      The signal-to-noise ratio (SNR) at the filter output is:
    </p>
    <p style="text-align: center; font-style: italic;">
      SNR = (Signal - Insertion Loss) - Noise Floor
    </p>
    <p>
      For weak signals, reducing filter bandwidth improves noise floor more than insertion loss hurts,
      resulting in net SNR improvement. For strong signals, insertion loss dominates and wide filters
      are preferable.
    </p>

    <h3>Final notes</h3>
    <p>
      The IF Filter Bank is a critical but often overlooked component in receive systems. Proper
      filter selection can mean the difference between successful reception and complete failure,
      especially for weak signals or crowded spectrum.
    </p>
    <p>
      Best practices for filter operation:
    </p>
    <ul>
      <li>Match filter bandwidth to signal bandwidth - use 1.5–2× signal BW for margin</li>
      <li>When in doubt, start wide and narrow down while monitoring signal quality</li>
      <li>For weak signals, prioritize narrow filters to maximize SNR</li>
      <li>For strong signals or multi-carrier reception, use wider filters</li>
      <li>Monitor the noise floor LED - green is good, orange is marginal, red needs attention</li>
      <li>Don't use filters narrower than your signal - causes distortion and errors</li>
      <li>Remember: noise floor improvements from narrower filters often outweigh insertion loss penalties</li>
    </ul>
    <p>
      In modern SDR (Software Defined Radio) systems, filtering can be done digitally after sampling.
      However, analog IF filtering before the ADC (Analog-to-Digital Converter) is still valuable to:
      prevent aliasing, reduce ADC dynamic range requirements, reject strong out-of-band signals that
      could cause intermodulation, and lower noise floor for weak signal reception. The IF filter bank
      serves as the first line of defense against unwanted signals and noise.
    </p>
  </div>
`;

export default filterModuleHelp;
