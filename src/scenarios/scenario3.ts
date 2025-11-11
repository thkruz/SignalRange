import { html } from "@app/engine/utils/development/formatter";
import { ScenarioData } from "../scenario-manager";

export const scenario3Data: ScenarioData = {
  id: 'first-light3',
  url: 'scenarios/3',
  imageUrl: 'scenario3.jpg',
  number: 3,
  title: '"Full Stack"',
  subtitle: 'Complete Link Budget Analysis',
  duration: '45-60 min',
  difficulty: 'advanced',
  missionType: 'Research & Development',
  description: `Conduct a comprehensive RF link analysis using the complete ground station suite. You'll establish both uplink and downlink connections, analyze signal quality, measure system performance parameters, and optimize the complete communications chain from transmitter to receiver.`,
  equipment: [
    '2× 9-meter C-band Antennas',
    '2× RF Front Ends',
    '4× Spectrum Analyzers',
    'Transmitter',
    'Receiver',
  ],
  settings: {
    isSync: false,
    antennas: 1,
    rfFrontEnds: 1,
    spectrumAnalyzers: 2,
    transmitters: 1,
    receivers: 1,
    layout: html`
      <div class="student-equipment">
        <!-- Antennas, Front Ends, and Spec Analyzers Grid -->
          <div id="antenna-spec-a-grid1" class="antenna-spec-a-grid">
            <div class="paired-equipment-container">
              <div id="antenna1-container" class="antenna-container"></div>
              <div id="antenna2-container" class="antenna-container"></div>
            </div>
            <div class="paired-equipment-container">
              <div id="rf-front-end1-container" class="rf-front-end-container"></div>
            </div>
            <div class="paired-equipment-container">
              <div id="rf-front-end2-container" class="rf-front-end-container"></div>
            </div>
            <div class="paired-equipment-container">
              <div id="specA1-container" class="spec-a-container"></div>
              <div id="specA2-container" class="spec-a-container"></div>
            </div>
          </div>

        <!-- Spectrum Analyzers Grid -->
          <div id="antenna-spec-a-grid2" class="antenna-spec-a-grid">
            <div class="paired-equipment-container">
              <div id="specA3-container" class="spec-a-container"></div>
              <div id="specA4-container" class="spec-a-container"></div>
            </div>
          </div>

        <!-- Transmitter And Receivers -->
          <div class="tx-grid">
            <div class="paired-equipment-container">
              <div id="tx1-container" class="tx-container"></div>
              <div id="rx1-container" class="rx-container"></div>
            </div>
          </div>
      </div>
    `,
  }
};
