import { html } from "@app/engine/utils/development/formatter";

export const scenario1Brief = html`
  <h1>SignalRange Training Scenarios</h1>
  <h2>Scenario 1: "First Light" - HELIOS-7 Initial Contact</h2>
  <p><strong>Duration:</strong> 25-30 minutes<br>
     <strong>Difficulty:</strong> Beginner<br>
     <strong>Mission Type:</strong> Commercial Communications</p>

  <div class="section">
    <h3>Mission Briefing</h3>
    <p>
      You are a Ground Station Operator at Pacific Rim Communications facility in Guam. Your company has just launched HELIOS-7, a new C-band communications satellite positioned at 145°E geostationary orbit to provide broadband services across Southeast Asia and the Pacific islands.<br>
      The satellite launched 14 days ago, completed its orbit-raising maneuvers yesterday, and is now station-keeping at its operational slot. The spacecraft operations team has completed initial checkout and has handed the payload over to ground operations. You are conducting the first ground station link test.<br>
      This is a critical milestone - until this link is established and verified, the satellite cannot begin commercial operations. The CEO, board members, and Pacific Telecom (your anchor customer) are monitoring this test.
    </p>
  </div>

  <div class="section equipment">
    <h3>Equipment Configuration</h3>
    <strong>Ground Station: Guam Primary (GUMP-1)</strong>
    <ul>
      <li>Antenna: 9-meter C-band Earth Station</li>
      <li>Antenna Pointing: Az: 247.3°, El: 78.2° (pre-calculated for HELIOS-7)</li>
      <li>Polarization: Linear Vertical</li>
    </ul>
    <strong>Satellite HELIOS-7:</strong>
    <ul>
      <li>Orbital Position: 145°E GEO</li>
      <li>Downlink Beacon: 3,985.5 MHz (C-band)</li>
      <li>Transponder 4C (Test):
        <ul>
          <li>Uplink: 6,180.0 MHz</li>
          <li>Downlink: 3,920.0 MHz</li>
          <li>Bandwidth: 36 MHz</li>
          <li>Polarization: Vertical</li>
        </ul>
      </li>
    </ul>
  </div>

  <div class="section checklist">
    <h3>Pre-Operational Checklist</h3>
    <ul>
      <li>Weather Conditions: Clear, 28°C, humidity 72%, wind 8 kts - <strong>APPROVED FOR OPS</strong></li>
      <li>Satellite Status: On-station, solar arrays deployed, batteries charged - <strong>HEALTHY</strong></li>
      <li>Frequency Coordination: Filed with ITU, domestic approvals received - <strong>CLEARED</strong></li>
      <li>Insurance Observer: Standing by via video link - <strong>PRESENT</strong></li>
    </ul>
  </div>

  <div class="section procedure">
    <h3>Detailed Step-by-Step Procedure</h3>
    <ol>
      <li><strong>Phase 1: Power-Up Sequence (5 minutes)</strong>
        <ol>
          <li>GPS Disciplined Oscillator (GPSDO)
            <ul>
              <li>Verify GPSDO unit is powered on</li>
              <li>Verify GPSDO unit is warm (the OCXO will alarm if not at operating temp)</li>
              <li>Verify GPS antenna has satellite lock (green LED)</li>
              <li>Wait for frequency lock (30-60 seconds)</li>
              <li>Success: "LOCKED" status, &lt;5×10⁻¹¹ stability</li>
              <li><strong>Critical:</strong> ALL other equipment depends on this reference!</li>
            </ul>
          </li>
          <li>Low Noise Block (LNB)
            <ul>
              <li>Verify C-band feedhorn is properly installed</li>
              <li>Power on LNB (converts 3.7-4.2 GHz down to 950-1450 MHz IF)</li>
              <li>Set gain: 55 dB</li>
              <li>Wait for temperature stabilization: 2-3 minutes</li>
              <li>Success: "TEMP STABLE" - no frequency drift</li>
            </ul>
          </li>
          <li>Block Upconverter (BUC)
            <ul>
              <li><strong>DO NOT TRANSMIT YET</strong> - antenna must be pointed first</li>
              <li>Power on BUC (standby mode)</li>
              <li>Set to C-band mode (5.925-6.425 GHz)</li>
              <li>Keep RF output MUTED</li>
              <li>Success: Ready state, but no RF output</li>
            </ul>
          </li>
          <li>Spectrum Analyzer
            <ul>
              <li>Power on unit</li>
              <li>Select RF mode (direct C-band input)</li>
              <li>Set center frequency: 3,985.5 MHz</li>
              <li>Set span: 10 MHz</li>
              <li>Set RBW: 10 kHz</li>
              <li>Set reference level: -40 dBm</li>
              <li>Success: Clean baseline noise floor visible</li>
            </ul>
          </li>
        </ol>
      </li>
      <li><strong>Phase 2: Antenna Pointing & Beacon Acquisition (8-10 minutes)</strong>
        <ol>
          <li>Antenna Control Unit (ACU)
            <ul>
              <li>Enter satellite parameters: Name: HELIOS-7, Longitude: 145.0°E, Latitude: 0.0° (GEO)</li>
              <li>Calculated look angles: Azimuth: 247.3° ± 0.5°, Elevation: 78.2° ± 0.5°</li>
            </ul>
          </li>
          <li>Initial Pointing
            <ul>
              <li>Command antenna to calculated position</li>
              <li>Watch for: Antenna begins moving (10-15 seconds transit time)</li>
              <li>Verify: Azimuth and elevation encoders show correct angles</li>
              <li>Wait for "ON TARGET" indication</li>
            </ul>
          </li>
          <li>Beacon Search
            <ul>
              <li>Look at spectrum analyzer: You should see a carrier!</li>
              <li>Expected beacon: Strong CW carrier at 3,985.5 MHz</li>
              <li>Typical level: -65 to -75 dBm</li>
              <li>If beacon is weak or offset:
                <ul>
                  <li>Use antenna fine-pointing (±0.2° adjustments)</li>
                  <li>Peak the signal by maximizing amplitude</li>
                  <li>Goal: Achieve at least -70 dBm beacon level</li>
                </ul>
              </li>
            </ul>
          </li>
          <li>Lock Status Verification
            <ul>
              <li>Beacon should be stable (not drifting)</li>
              <li>Frequency should be within ±1 kHz of 3,985.5 MHz</li>
              <li>Carrier-to-Noise (C/N): Should show &gt;15 dB</li>
              <li>Log beacon parameters for operations report</li>
            </ul>
          </li>
        </ol>
      </li>
      <li><strong>Phase 3: Transmit Path Checkout (5 minutes)</strong>
        <ol>
          <li>Transmitter Configuration
            <ul>
              <li>Power on Transmitter Modem #1</li>
              <li>Configure modem: Modulation: QPSK, Symbol Rate: 5.0 Msps, FEC: 3/4, Scrambling: ON</li>
              <li>Set IF output: 140.0 MHz (will be upconverted to 6,180.0 MHz)</li>
            </ul>
          </li>
          <li>BUC Configuration for Transmit
            <ul>
              <li>Set uplink frequency: 6,180.0 MHz</li>
              <li>Set transmit power: -10 dBm</li>
              <li>Double-check antenna pointing</li>
              <li>Coordinate with satellite ops: "GUMP-1 ready to transmit"</li>
              <li><strong>CRITICAL:</strong> Get explicit permission before unmuting</li>
            </ul>
          </li>
          <li>Low-Power RF Test
            <ul>
              <li>Unmute BUC RF output</li>
              <li>Verify on spectrum analyzer: Clean QPSK signal at correct frequency</li>
              <li>Listen for satellite ops confirmation: "GUMP-1, we see your carrier on Transponder 4C"</li>
              <li>If no confirmation: MUTE immediately, troubleshoot</li>
            </ul>
          </li>
        </ol>
      </li>
      <li><strong>Phase 4: Receive Path Verification (5 minutes)</strong>
        <ol>
          <li>Downlink Monitoring
            <ul>
              <li>Change spectrum analyzer to monitor downlink: Center frequency: 3,920.0 MHz, Span: 50 MHz</li>
              <li>You should see: Your uplink signal transponded back</li>
              <li>Expected level: -55 to -65 dBm</li>
              <li>Verify: Signal is in correct location in transponder</li>
            </ul>
          </li>
          <li>Receiver Configuration
            <ul>
              <li>Power on Receiver Modem #1</li>
              <li>Set to monitor Transponder 4C downlink</li>
              <li>Configure demodulator: Modulation: QPSK, Symbol Rate: 5.0 Msps, FEC: 3/4, Carrier frequency: 3,920.0 MHz</li>
              <li>Wait for modem lock: 5-10 seconds</li>
              <li>Success indicators: "CARRIER LOCK" LED, "FRAME LOCK" LED, Eb/No: &gt;8 dB</li>
            </ul>
          </li>
          <li>Loopback Test
            <ul>
              <li>Transmit a test pattern from modem TX port</li>
              <li>Verify receipt at modem RX port</li>
              <li>Bit Error Rate (BER): Should be &lt;1×10⁻⁹</li>
              <li>This confirms: Full duplex link is operational!</li>
            </ul>
          </li>
        </ol>
      </li>
      <li><strong>Phase 5: Power Ramp & Link Optimization (5 minutes)</strong>
        <ol>
          <li>Gradual Power Increase
            <ul>
              <li>Increase BUC power in 3 dB steps: -10 dBm → -7 dBm → -4 dBm → -1 dBm → +2 dBm</li>
              <li>Monitor at each step: Satellite ops confirms no saturation, Downlink power increases, No adjacent channel interference</li>
              <li>Target transmit power: +2 dBm (28.5 dBm EIRP)</li>
            </ul>
          </li>
          <li>Link Margin Verification
            <ul>
              <li>Record final link parameters: Uplink C/N: _____ dB, Downlink C/N: _____ dB, Combined Eb/No: _____ dB</li>
              <li>Target: &gt;2 dB margin above threshold</li>
              <li>Check spectrum: Clean signal, no distortion</li>
            </ul>
          </li>
          <li>Final Documentation
            <ul>
              <li>Screenshot spectrum analyzer showing transponder</li>
              <li>Log all equipment serial numbers</li>
              <li>Record link parameters in operations database</li>
              <li>Notify Satellite Ops: "GUMP-1 declares HELIOS-7 link OPERATIONAL"</li>
            </ul>
          </li>
        </ol>
      </li>
    </ol>
  </div>

  <div class="section">
    <h3>Success Criteria</h3>
    <ul>
      <li class="success">✅ GPSDO locked and providing stable reference</li>
      <li class="success">✅ Beacon acquired at &gt;-75 dBm</li>
      <li class="success">✅ Antenna pointing optimized (peaking completed)</li>
      <li class="success">✅ Transmit carrier visible on satellite (confirmed by sat ops)</li>
      <li class="success">✅ Downlink signal received and demodulated</li>
      <li class="success">✅ BER &lt; 1×10⁻⁹ on loopback test</li>
      <li class="success">✅ Link margin &gt;2 dB at operational power</li>
      <li class="success">✅ No interference to adjacent satellites/transponders</li>
    </ul>
  </div>

  <div class="section">
    <h3>Common New Operator Mistakes to Avoid</h3>
    <ul>
      <li class="mistake">❌ Transmitting before antenna is pointed (radiating in wrong direction!)</li>
      <li class="mistake">❌ Forgetting to lock GPSDO first (everything will drift)</li>
      <li class="mistake">❌ Using too much transmit power initially (can damage satellite)</li>
      <li class="mistake">❌ Not monitoring spectrum during transmit (blind operation)</li>
      <li class="mistake">❌ Forgetting to coordinate with satellite operations team</li>
    </ul>
  </div>
`;