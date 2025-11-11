import { html } from "./engine/utils/development/formatter";

export interface SimulationSettings {
  isSync: boolean;
  antennas: number;
  rfFrontEnds: number;
  spectrumAnalyzers: number;
  transmitters: number;
  receivers: number;
  /** Optional HTML override for complex layouts */
  layout?: string;
}

export class ScenarioManager {
  private static instance_: ScenarioManager;

  settings: SimulationSettings = ScenarioManager.getDefaultSettings();

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  static getInstance(): ScenarioManager {
    this.instance_ ??= new ScenarioManager();
    return this.instance_;
  }

  static getDefaultSettings(): SimulationSettings {
    return {
      isSync: false,
      antennas: 1,
      rfFrontEnds: 1,
      spectrumAnalyzers: 2,
      transmitters: 0,
      receivers: 0,
    };
  }

  static getScenarioSettings(scenarioId: string): SimulationSettings {
    switch (scenarioId) {
      case 'scenario1':
        return {
          isSync: false,
          antennas: 1,
          rfFrontEnds: 1,
          spectrumAnalyzers: 2,
          transmitters: 0,
          receivers: 0,
        };
      case 'scenario2':
        return {
          isSync: false,
          antennas: 1,
          rfFrontEnds: 1,
          spectrumAnalyzers: 2,
          transmitters: 0,
          receivers: 1,
        };
      case 'scenario3':
        return {
          isSync: false,
          antennas: 1,
          rfFrontEnds: 1,
          spectrumAnalyzers: 2,
          transmitters: 1,
          receivers: 1,
          layout: scenario3Layout,
        };
      default:
        return this.getDefaultSettings();
    }
  }
}

const scenario3Layout = html`
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
    `;