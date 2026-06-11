import type { AntennaState } from '@app/equipment/antenna';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, FECType, Hertz, IfFrequency, MHz, ModulationType } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { createRfFrontEnd } from '../rf-front-end-factory';
import { vermontGroundStation } from './ground-stations';
import { ses10Satellite, tidemark1Satellite, tidemark2Satellite, tidemark3Satellite } from './satellites';

/**
 * NATS Level 15: "Frequency Coordination"
 *
 * Phase: Qualified Operations (Phase 2, Scenario 7 of 8)
 * Time Pressure: Moderate (RedSky's uplink window opens in 25 minutes)
 * Calculation Required: YES - guard-band arithmetic
 * New Mechanic Introduced: External-operator coordination (not present in S1-S14)
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0737: Knowledge of bandwidth management tools and techniques
 *   - T1143: Develop network backup and recovery procedures
 *   - S0648: Skill in detecting anomalies
 *
 * Supporting Codes:
 *   - K0792: Knowledge of network configurations
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - S0593: Skill in handling incidents
 *   - K0645: Knowledge of standard operating procedures (SOPs)
 *   - S0421: Skill in operating network equipment
 *   - K0721: Knowledge of risk management principles and practices
 *
 * Premise: A coordination notice has arrived from RedSky Teleport. Their next
 * scheduled uplink will sit on TIDEMARK-3's V-pol cross-pol slot at 5961 MHz
 * center, 8 MHz BW. Edge-to-edge guard band against our active SeaLink carrier
 * (5985 MHz center, 36 MHz BW H-pol on TP-1) is only 2 MHz.
 *
 * VT-01's HPA is currently running at 5 dB backoff - close enough to saturation
 * that third-order IMD products extend well into RedSky's planned slot. Polarization
 * isolation alone won't save us at this distance. The player must verify the guard
 * band, recognize the IMD risk, raise HPA backoff to 10 dB, confirm the customer
 * carrier is still nominal, and send a clean coordination confirmation back to RedSky.
 *
 * S5 was "someone else interfered with us." S15 reverses the perspective: make sure
 * we are not interfering with them. The mitigation is the HPA backoff lever - the
 * same control surface used in S2 and S9, but exercised for a coordination reason
 * rather than amplifier protection.
 *
 * Tone: Qualified-operator. Dana opens with a text-message notice, checks in at the
 * mitigation point, and signs off when the confirmation goes back to RedSky. Every
 * status-check uses Character.SYSTEM. RedSky's coordinator is rendered through
 * SYSTEM quizzes and objective descriptions, not as a new character.
 *
 * Story Continuity:
 *   - Charlie is in Europe; not involved.
 *   - Dana is the only named voice.
 *   - RedSky is a partner teleport, not part of the NATS roster.
 *   - TIDEMARK-3 is the customer-traffic bird here (carrying SeaLink).
 */

export const scenario15Data: ScenarioData = {
  id: 'nats-scenario15',
  prerequisiteScenarioIds: ['nats-scenario14'],
  url: 'nats/scenarios/nats-scenario15',
  imageUrl: 'nats/15/card.png',
  number: 15,
  title: 'Frequency Coordination',
  subtitle: 'Inter-Operator Spectrum Etiquette',
  duration: '25-30 min',
  difficulty: 'intermediate',
  missionType: 'Spectrum Coordination',
  description: `A coordination notice from RedSky Teleport hit your inbox at 09:08. Their next scheduled uplink sits just 2 MHz from the edge of the SeaLink carrier currently riding TIDEMARK-3 TP-1. They want acknowledgment that our spectrum won't bleed into their slot when they light up in 25 minutes.<br><br>Standard inter-operator etiquette: verify the guard band, check that our transmit chain isn't producing IMD products that would land in the neighbor's passband, document, and confirm back. If our skirts are dirty, clean them up before they go on the air.<br><br>This isn't combat. It's good neighbor work.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End (TX active)',
    'Spectrum Analyzer',
    'TX Modem (carrying SeaLink traffic on TIDEMARK-3)',
    'HPA (online)',
  ],
  timeLimitSeconds: 30 * 60,
  settings: {
    isSync: true,
    groundStations: [
      {
        ...vermontGroundStation,
        antennasState: [
          {
            ...vermontGroundStation.antennasState[0],
            azimuth: 140.5 as Degrees,
            elevation: 37.8 as Degrees,
            polarization: 8 as Degrees,
            targetSatelliteId: 61527, // TIDEMARK-3
            targetAzimuth: 140.5 as Degrees,
            targetElevation: 37.8 as Degrees,
            targetPolarization: 8 as Degrees,
            beaconFrequencyHz: 1078e6 as Hertz, // TM-3 beacon IF (5250 - 4172)
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // SeaLink customer traffic running on TIDEMARK-3 TP-1.
            // HPA at 5 dB backoff - close enough to compression that third-order
            // IMD products extend several MHz beyond the 36 MHz carrier edges.
            // This is the latent defect: clean carrier in isolation, dirty
            // adjacent-channel emissions that threaten RedSky's planned slot.
            hpa: {
              backOff: 5,
              isHpaEnabled: true,
              isHpaSwitchEnabled: true,
            },
            buc: {
              isMuted: false,
              loFrequency: 7000 as MHz,
            },
          }),
        ],
        transmitters: [
          {
            ...vermontGroundStation.transmitters[0],
            modems: [
              {
                ...vermontGroundStation.transmitters[0].modems[0],
                isTransmitting: true,
                isTransmittingSwitchUp: true,
                ifSignal: {
                  ...vermontGroundStation.transmitters[0].modems[0].ifSignal,
                  frequency: 1015e6 as IfFrequency, // TM-3 TX IF: 7000 - 5985
                  bandwidth: 36e6 as Hertz,
                  power: -7 as dBm,
                  modulation: 'QPSK' as ModulationType,
                  fec: '3/4' as FECType,
                  signalId: 'TIDEMARK-3-Teleport',
                  noradId: 61527,
                  polarization: 'H',
                },
              },
            ],
          },
        ],
        receivers: [
          {
            ...vermontGroundStation.receivers[0],
            modems: [
              {
                ...vermontGroundStation.receivers[0].modems[0],
                frequency: 1490 as MHz, // TIDEMARK-3 downlink IF (5250 - 3760)
                bandwidth: 36 as MHz,
                modulation: 'QPSK',
                fec: '3/4',
              },
            ],
          },
        ],
        spectrumAnalyzers: [
          {
            ...vermontGroundStation.spectrumAnalyzers[0],
            // Default state: tuned to TM-3 beacon for routine watch
            centerFrequency: 1078e6 as Hertz,
            span: 2e3 as Hertz,
          },
        ],
      },
    ],
    satellites: [
      tidemark3Satellite,
      tidemark1Satellite,
      tidemark2Satellite,
      ses10Satellite,
    ],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-15?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
  },
  objectives: [
    // ============================================================
    // PHASE 1: MISSION PREP
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review Coordination Notice',
      description: 'Open the shift brief and the inbound RedSky coordination request.',
      groundStation: 'VT-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Brief Opened',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Ready to Begin',
          params: {
            character: Character.SYSTEM,
            question: 'Have you reviewed the brief and the RedSky notice?',
            options: ['Brief reviewed. Notice acknowledged. Starting coordination check.'],
            correctIndex: 0,
            explanation: 'Coordination window opens in 25 minutes. Plenty of time for a clean check.',
            pointPenalty: 0,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'select-vermont-station',
      nice: ['S0421'],
      title: 'Open VT-01',
      description: 'Select the Vermont Ground Station.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'VT-01 Selected',
          params: { groundStationId: 'VT-01' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // PHASE 2: PROCESS COORDINATION NOTICE
    // ============================================================
    {
      id: 'identify-partner-band',
      nice: ['K0737', 'S0648'],
      title: 'Identify RedSky Occupied Band',
      description: 'Confirm the RF range RedSky will occupy when their carrier lights up.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['select-vermont-station'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Partner Band',
          params: {
            character: Character.SYSTEM,
            question: 'RedSky\'s notice: center 5961 MHz, bandwidth 8 MHz, V-pol on the TIDEMARK-3 cross-pol slot. What RF range will they occupy?',
            options: [
              '5957 - 5965 MHz',
              '5961 - 5969 MHz',
              '5953 - 5969 MHz',
              '5957 - 5961 MHz',
            ],
            correctIndex: 0,
            explanation: 'Center plus or minus half-bandwidth: 5961 plus or minus 4 MHz equals 5957 to 5965 MHz. Their upper edge is 5965.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'identify-our-band',
      nice: ['K0737', 'K0773'],
      title: 'Identify Our Occupied Band',
      description: 'Confirm the RF range our active TIDEMARK-3 TP-1 carrier currently occupies.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['identify-partner-band'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Our Band',
          params: {
            character: Character.SYSTEM,
            question: 'Our SeaLink carrier on TIDEMARK-3 TP-1 is center 5985 MHz, 36 MHz BW, H-pol. What RF range are we occupying?',
            options: [
              '5967 - 6003 MHz',
              '5949 - 6021 MHz',
              '5985 - 6021 MHz',
              '5967 - 5985 MHz',
            ],
            correctIndex: 0,
            explanation: '5985 plus or minus 18 MHz equals 5967 to 6003 MHz. Our lower edge is 5967.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'compute-guard-band',
      nice: ['K0737', 'S0648'],
      title: 'Compute Guard Band',
      description: 'Determine the edge-to-edge guard band between RedSky\'s upper edge and our lower edge.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['identify-our-band'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Guard Band',
          params: {
            character: Character.SYSTEM,
            question: 'RedSky upper edge: 5965 MHz. Our lower edge: 5967 MHz. What is the edge-to-edge guard band?',
            options: [
              '2 MHz',
              '4 MHz',
              '24 MHz',
              '0 MHz - we overlap',
            ],
            correctIndex: 0,
            explanation: '5967 minus 5965 equals 2 MHz. Cross-pol isolation buys us additional margin, but the frequency gap is tight.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'assess-guard-adequacy',
      nice: ['K0737', 'K0721'],
      title: 'Assess Guard Band Adequacy',
      description: 'Decide whether 2 MHz edge-to-edge with our current TX configuration is good enough.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['compute-guard-band'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Guard Adequacy',
          params: {
            character: Character.SYSTEM,
            question: 'A 2 MHz edge-to-edge guard with about 28 dB cross-pol isolation. What is the right next step?',
            options: [
              'Verify our TX chain is producing clean spectrum - no spurs or IMD landing in RedSky\'s band',
              'Demand RedSky retune their carrier',
              'Increase our TX power so RedSky\'s carrier is irrelevant to us',
              'Take no action - 2 MHz guard plus cross-pol isolation is always sufficient',
            ],
            correctIndex: 0,
            explanation: 'Guard-band math is necessary but not sufficient. Polarization isolation only buys margin if our own spectrum is clean. Inspect the TX chain.',
            pointPenalty: 5,
            preserveOptionOrder: true,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 3: INSPECT TX CONFIGURATION
    // ============================================================
    {
      id: 'open-tx-chain',
      nice: ['S0421'],
      title: 'Open TX Chain',
      description: 'Navigate to the TX Chain tab to inspect the current transmit configuration.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['assess-guard-adequacy'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'check-tx-modem-frequency',
      nice: ['K0792', 'K0773'],
      title: 'Verify TX Modem Configuration',
      description: 'Confirm the TX modem is on the expected TIDEMARK-3 uplink IF.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['open-tx-chain'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'tx-modem-frequency-set',
          description: 'TX Modem at 1015 MHz IF',
          params: {
            frequency: 1015e6,
            frequencyTolerance: 1e6,
          },
          mustMaintain: true,
        },
        {
          type: 'tx-modem-bandwidth-set',
          description: 'TX Modem at 36 MHz BW',
          params: {
            bandwidth: 36e6,
            bandwidthTolerance: 1e6,
          },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'TX IF Sanity Check',
          params: {
            character: Character.SYSTEM,
            question: 'BUC LO 7000 MHz, RF target 5985 MHz. Does the displayed TX IF match the expected value?',
            options: [
              'Yes - 1015 MHz IF matches 7000 minus 5985, carrier on the right slot',
              'No - TX IF should be at 5985 MHz',
              'No - TX IF should be at 1057 MHz',
              'Cannot determine without checking the receiver',
            ],
            correctIndex: 0,
            explanation: 'TX IF equals BUC LO minus uplink RF: 7000 minus 5985 equals 1015 MHz. The TX modem is on the right slot.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'observe-current-hpa-backoff',
      nice: ['K0773', 'S0648'],
      title: 'Observe HPA Backoff',
      description: 'Note the current HPA backoff and reason about its impact on spectral cleanliness.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['check-tx-modem-frequency'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Read Current Backoff',
          params: {
            character: Character.SYSTEM,
            question: 'The HPA is currently at 5 dB backoff. What does that imply for the transmit spectrum?',
            options: [
              'Operating close to saturation - third-order IMD products will be elevated and extend several MHz beyond the carrier edges',
              'Operating with comfortable margin - IMD will be well below the noise floor',
              'Operating in pure linear region - no IMD generated',
              'Backoff has no bearing on adjacent-channel emissions',
            ],
            correctIndex: 0,
            explanation: '5 dB is a marginal backoff for a modulated carrier. Third-order IMD scales aggressively as the HPA approaches compression - spectral skirts widen and adjacent-channel power rises.',
            pointPenalty: 5,
            preserveOptionOrder: true,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'understand-imd-mechanism',
      nice: ['K0773', 'K0737'],
      title: 'Understand IMD Mechanism',
      description: 'Confirm your understanding of how HPA compression generates adjacent-channel energy.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['observe-current-hpa-backoff'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'IMD Mechanism',
          params: {
            character: Character.SYSTEM,
            question: 'Why does a wideband modulated carrier driven near HPA saturation produce energy outside the nominal channel?',
            options: [
              'Nonlinearity in the amplifier mixes spectral components, generating intermodulation products that fall just outside the carrier edges',
              'The wideband carrier physically expands due to thermal effects in the waveguide',
              'The BUC LO drifts when the HPA heats up under heavy drive',
              'The antenna feed re-radiates energy into adjacent passbands',
            ],
            correctIndex: 0,
            explanation: 'Near saturation, the HPA stops behaving linearly. Spectral components mix and produce IMD - the dominant third-order products fall just outside the carrier edges and drop with frequency offset.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 4: MITIGATION DECISION
    // ============================================================
    {
      id: 'evaluate-mitigation-options',
      nice: ['S0593', 'K0721'],
      title: 'Choose Mitigation',
      description: 'Pick the right mitigation. Customer traffic must stay up; RedSky goes live in 25 minutes.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['understand-imd-mechanism'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Mitigation Choice',
          params: {
            character: Character.SYSTEM,
            question: 'SeaLink traffic must continue. Which mitigation is the right tool?',
            options: [
              'Increase HPA backoff to 10 dB - reduces IMD without dropping the carrier and without requiring customer coordination',
              'Cut TX modem power to zero - simplest fix',
              'Retune our TIDEMARK-3 carrier to avoid RedSky entirely - requires SeaLink SLA work',
              'Engage a notch filter on the RX side at 5961 MHz - protects our receiver',
            ],
            correctIndex: 0,
            explanation: 'Backoff is the correct lever: it linearizes the amplifier, suppresses IMD, and is reversible. Cutting power kills the customer. Retuning needs SLA renegotiation. An RX notch does nothing for the neighbor.',
            pointPenalty: 5,
            preserveOptionOrder: true,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // PHASE 5: APPLY MITIGATION
    // ============================================================
    {
      id: 'increase-hpa-backoff',
      nice: ['S0593', 'K0792'],
      title: 'Increase HPA Backoff to 10 dB',
      description: 'Raise the HPA backoff to 10 dB to clean up the spectral skirts.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['evaluate-mitigation-options'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'hpa-back-off-set',
          description: 'HPA Backoff at 10 dB',
          params: {
            backOff: 10,
            backOffTolerance: 1,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'verify-hpa-still-online',
      nice: ['T0431', 'K0740'],
      title: 'Verify HPA Still Online',
      description: 'Confirm the HPA is enabled, transmitting, and not overdriven after the backoff change.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['increase-hpa-backoff'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'hpa-enabled',
          description: 'HPA Enabled',
          mustMaintain: true,
        },
        {
          type: 'hpa-not-overdriven',
          description: 'HPA Operating Linearly',
          mustMaintain: true,
        },
        {
          type: 'tx-modem-transmitting',
          description: 'Customer Traffic Still Flowing',
          params: { isTransmitting: true },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 6: VERIFY ON SPECTRUM
    // ============================================================
    {
      id: 'open-rx-analysis',
      nice: ['S0421'],
      title: 'Open RX Analysis',
      description: 'Switch to the RX Analysis tab to use the spectrum analyzer.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-hpa-still-online'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'tune-speca-to-downlink',
      nice: ['K0737', 'S0421'],
      title: 'Tune Spectrum to TIDEMARK-3 Downlink',
      description: 'Reconfigure the spectrum analyzer to view the TIDEMARK-3 downlink IF region (1490 MHz with VT-01 LNB LO at 5250 and downlink RF 3760). Use a wide span so RedSky\'s adjacent slot is visible too.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['open-rx-analysis'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'Center 1490 MHz IF',
          params: {
            centerFrequency: 1490e6 as Hertz,
            centerFrequencyTolerance: 5e6,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-span-set',
          description: 'Span Wide Enough for Adjacent Slot',
          params: {
            span: 75e6,
            frequencyTolerance: 25e6,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-rbw-set',
          description: 'RBW Auto',
          params: { rbw: null as unknown as number },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-min-amplitude',
          description: 'Min Amplitude near -100 dBm',
          params: {
            minAmplitude: -100 as dBm,
            minAmplitudeTolerance: 15,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'speca-max-amplitude',
          description: 'Max Amplitude near -30 dBm',
          params: {
            maxAmplitude: -30 as dBm,
            maxAmplitudeTolerance: 15,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'confirm-carrier-still-nominal',
      nice: ['T0153', 'K0740'],
      title: 'Confirm Carrier Still Nominal',
      description: 'Verify the SeaLink TIDEMARK-3 downlink is still healthy after the backoff change.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['tune-speca-to-downlink'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Carrier Still Up',
          params: {
            character: Character.SYSTEM,
            question: 'With HPA backoff now at 10 dB, what should be true about the TIDEMARK-3 downlink at 1490 MHz IF?',
            options: [
              'Wideband carrier still present at slightly reduced power - customer link healthy, IMD skirts dropped well below the adjacent slot noise floor',
              'Carrier gone - the backoff change effectively muted the BUC',
              'Carrier doubled in width - backoff caused bandwidth expansion',
              'Beacon disappeared - HPA backoff affects beacon visibility',
            ],
            correctIndex: 0,
            explanation: 'Backing off the HPA reduces output power a few dB and dramatically suppresses IMD. Customer link remains operational with cleaner spectral skirts.',
            pointPenalty: 5,
            preserveOptionOrder: true,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-receiver-locked',
      nice: ['T0153', 'K0741'],
      title: 'Verify Receiver Locked',
      description: 'Confirm the customer-traffic receiver is still demodulating cleanly.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['confirm-carrier-still-nominal'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Locked',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 7: COORDINATE BACK
    // ============================================================
    {
      id: 'confirm-spectrum-clean-for-partner',
      nice: ['S0648', 'K0792'],
      title: 'Draft Confirmation to RedSky',
      description: 'Decide what to send back to RedSky\'s coordinator.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-receiver-locked'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Ready to Confirm',
          params: {
            character: Character.SYSTEM,
            question: 'After raising HPA backoff to 10 dB, what is the correct status to send back to RedSky?',
            options: [
              'Confirmed clear. TIDEMARK-3 TP-1 carrier holds 5967-6003 MHz H-pol with adjacent-channel emissions well below your planned slot. Proceed with your 5961 MHz V-pol uplink as scheduled.',
              'Confirmed clear. We have muted our carrier to give you the spectrum.',
              'Cannot confirm. Recommend RedSky delay their uplink until further notice.',
              'Confirmed clear, but we will be retuning to 5950 MHz to give wider margin.',
            ],
            correctIndex: 0,
            explanation: 'Factual coordination response: state your occupied band, confirm adjacent-channel emissions are below the neighbor\'s threshold, and clear them to proceed.',
            pointPenalty: 5,
            preserveOptionOrder: true,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 8: LOG
    // ============================================================
    {
      id: 'log-coordination-event',
      nice: ['K0645', 'T1143'],
      title: 'Log Coordination Event',
      description: 'Select the correct shift log entry for this coordination.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['confirm-spectrum-clean-for-partner'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Shift Log Entry',
          params: {
            character: Character.SYSTEM,
            question: 'Which entry correctly records this event for the next shift?',
            options: [
              '0937 - RedSky coordination notice received and confirmed. TIDEMARK-3 TP-1 HPA backoff raised from 5 to 10 dB to suppress adjacent-channel IMD. Cleared RedSky for 5961 MHz V-pol uplink. SeaLink carrier remains nominal.',
              '0937 - RedSky coordination request denied. Recommended they relocate to a different orbital slot.',
              '0937 - No action taken. RedSky\'s uplink does not affect us.',
              '0937 - TIDEMARK-3 SeaLink customer traffic dropped to accommodate RedSky.',
            ],
            correctIndex: 0,
            explanation: 'The log captures what we did, why, and what we cleared. Next shift picks up with full context if RedSky\'s uplink behaves unexpectedly.',
            pointPenalty: 5,
            preserveOptionOrder: true,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `
      <p>
        <em>[Text message from Dana at 09:12]</em>
      </p>
      <p>
        "Coordination notice in your inbox - RedSky Teleport. They're lighting up a V-pol carrier on TM-3 in 25 minutes, 2 MHz off our edge. Verify our spectrum is clean and send the confirmation back. Routine. Don't drop the SeaLink carrier."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/15/intro.mp3'),
    },
    objectives: {
      'compute-guard-band': {
        text: `
        <p>
          2 MHz edge-to-edge plus cross-pol. Tight but workable - if our skirts are clean. Check the TX chain.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/15/obj-compute-guard-band.mp3'),
      },
      'increase-hpa-backoff': {
        text: `
        <p>
          10 dB backoff is standard for shared-spectrum work. RedSky's coordinator will see the difference on their end before they ever key up.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/15/obj-increase-hpa-backoff.mp3'),
      },
      'log-coordination-event': {
        text: `
        <p>
          Confirmation sent to RedSky. Good neighbor work. Next coordination notice goes through the same process - they'll know to expect a clean response from this station.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/15/obj-log-coordination-event.mp3'),
      },
    },
  },
};
