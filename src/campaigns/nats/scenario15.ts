import { createRfFrontEnd } from '@app/campaigns/rf-front-end-factory';
import type { AntennaState } from '@app/equipment/antenna';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, FECType, Hertz, IfFrequency, MHz, ModulationType } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { vermontGroundStation } from './ground-stations';
import { ses10Satellite, tidemark1Satellite, tidemark2Satellite, tidemark3Satellite } from './satellites';

/**
 * NATS Level 15: "Frequency Coordination"
 *
 * Phase: Qualified Operations (Phase 2, Scenario 7 of 8)
 * Time Pressure: Moderate (RedSky's uplink window opens in 10 minutes)
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
  // Billed at what it takes (nats-r3-s15-F1, Phase 29 D14): 19 steps, one HPA
  // change, one analyzer retune; r4 played it in under 6 min. The 0920 confirm /
  // 0922 RedSky deadlines sit inside the 15 min limit (Phase 30 D22).
  duration: '5-10 min',
  difficulty: 'intermediate',
  missionType: 'Spectrum Coordination',
  description: `A coordination notice from RedSky Teleport reached your inbox at 09:08. Their next scheduled uplink sits just 2 MHz from the edge of the SeaLink carrier currently riding TIDEMARK-3 TP-1. They want confirmation that our spectrum won't bleed into their slot when they light up at 09:22, and they need our answer by 09:20.<br><br>Standard inter-operator etiquette is to verify the guard band, check that our transmit chain isn't producing IMD (intermodulation distortion) products that would fall in the neighbor's passband, document the result, and confirm back. If our spectrum is dirty, clean it up before they go on the air.<br><br>This is good neighbor work, not combat.`,
  equipment: ['9-meter C-band Antenna', 'RF Front End (TX active)', 'Spectrum Analyzer', 'TX Modem (carrying SeaLink traffic on TIDEMARK-3)', 'HPA (online)'],
  timeLimitSeconds: 15 * 60,
  settings: {
    isSync: true,
    groundStations: [
      {
        ...vermontGroundStation,
        antennasState: [
          {
            ...vermontGroundStation.antennasState[0],
            azimuth: 145.7 as Degrees,
            elevation: 32.7 as Degrees,
            // polarization: derived from geometry (Phase 29 D8)
            targetSatelliteId: 61527, // TIDEMARK-3
            targetAzimuth: 145.7 as Degrees,
            targetElevation: 32.7 as Degrees,
            beaconFrequencyHz: 4172e6 as Hertz, // TIDEMARK-3 beacon (RF)
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
    satellites: [tidemark3Satellite, tidemark1Satellite, tidemark2Satellite, ses10Satellite],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-15?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
    // Brief: Tuesday, 0912 Local (notice received 0908, confirm by 0920, RedSky live 0922)
    scenarioStartDate: '2026-02-17',
    scenarioStartWallTime: '09:12:00',
  },
  objectives: [
    // ============================================================
    // PHASE 1: MISSION PREP
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review Coordination Notice',
      description: 'Open the shift brief and read the inbound RedSky coordination request.',
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
            explanation: "RedSky's uplink window opens at 09:22, and they want our confirmation by 09:20. That's enough time for a clean check if you keep moving.",
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
      description: "Confirm the RF range RedSky's carrier will occupy when it lights up.",
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
            // Read off the coordination notice in the brief, not the stem (nats-r3-s15-F2)
            question: "Read RedSky's coordination notice in the brief. What RF range will their carrier occupy?",
            options: ['5957 - 5965 MHz', '5961 - 5969 MHz', '5953 - 5969 MHz', '5957 - 5961 MHz'],
            correctIndex: 0,
            explanation:
              'Their carrier is centered on 5961 MHz and is 8 MHz wide, so it spans 5961 plus or minus 4 MHz, which is 5957 to 5965 MHz. The upper edge, 5965, is the one that faces our carrier.',
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
            question: 'Read our SeaLink carrier on the TIDEMARK-3 frequency plan in the brief. What RF range does it occupy?',
            options: ['5967 - 6003 MHz', '5949 - 6021 MHz', '5985 - 6021 MHz', '5967 - 5985 MHz'],
            correctIndex: 0,
            explanation:
              'Our SeaLink carrier is centered on 5985 MHz and is 36 MHz wide, so it spans 5985 plus or minus 18 MHz, which is 5967 to 6003 MHz. The lower edge, 5967, is the one that faces RedSky.',
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
      description: "Determine the edge-to-edge guard band between RedSky's upper edge and our lower edge.",
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
            question: "From the two occupied ranges, what is the edge-to-edge guard band between RedSky's upper edge and our lower edge?",
            options: ['2 MHz', '4 MHz', '24 MHz', '0 MHz - we overlap'],
            correctIndex: 0,
            explanation:
              "5967 minus 5965 leaves a 2 MHz gap between RedSky's upper edge and our lower edge. Cross-pol isolation (V-pol against H-pol) adds margin on top of that, but the frequency gap itself is tight.",
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
      description: 'Decide whether a 2 MHz edge-to-edge guard is good enough with our current transmit configuration.',
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
            question: "The guard band is 2 MHz edge to edge, with about 28 dB of cross-pol isolation. What's the right next step?",
            options: [
              "Check that our TX chain has no spurs or IMD falling into RedSky's band",
              'Ask RedSky to retune their carrier - 2 MHz is below the minimum guard for a 36 MHz carrier',
              "Raise our TX power now - a stronger SeaLink carrier holds its margin against RedSky's V-pol",
              'Confirm clear as-is - 2 MHz guard plus 28 dB cross-pol isolation is sufficient at any drive',
            ],
            correctIndex: 0,
            explanation:
              "The guard-band math is necessary but not enough. Polarization isolation only buys margin if our own spectrum is clean, so the next step is to inspect the transmit chain for anything that spills into RedSky's slot.",
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
      description: 'Open the TX Chain tab to inspect the current transmit configuration.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['assess-guard-adequacy'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
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
      description:
        "Scroll down on the TX Chain tab to the Transmitter Modems card, below the BUC and HPA panels. Read TX modem 1's frequency and bandwidth, and confirm they put the carrier on the coordinated TP-1 slot.",
      groundStation: 'VT-01',
      intent: 'confirm',
      prerequisiteObjectiveIds: ['open-tx-chain'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'tx-modem-frequency-set',
          description: 'TX Modem at 1015 MHz IF',
          // The field sits below the fold (nats-r3-s15-F2): a 5 s read on TX
          // Chain before the quiz opens, and the quiz options differ by the
          // IF the modem shows, so it cannot be answered without reading it
          params: {
            frequency: 1015e6,
            frequencyTolerance: 1e6,
            requiresObservation: true,
            observationTab: 'tx-chain',
            observationDwellSeconds: 5,
          },
          // Read, not set: the customer carrier is already on this slot
          requiresChange: false,
          mustMaintain: true,
        },
        {
          type: 'tx-modem-bandwidth-set',
          description: 'TX Modem at 36 MHz BW',
          params: {
            bandwidth: 36e6,
            bandwidthTolerance: 1e6,
          },
          requiresChange: false,
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'TX IF Sanity Check',
          params: {
            character: Character.SYSTEM,
            question: "Read TX modem 1's frequency on the Transmitter Modems card. The BUC subtracts it from its 7000 MHz LO (RF = LO - IF), so where does that put our uplink?",
            options: [
              'Modem reads 1015 MHz: 7000 - 1015 = 5985 MHz, the coordinated TP-1 center - carrier on the right slot',
              'Modem reads 1057 MHz: 7000 - 1057 = 5943 MHz, the TIDEMARK-1 slot - modem still on the TIDEMARK-1 config',
              'Modem reads 1490 MHz: the TIDEMARK-3 downlink IF - the TX modem was set to the receive frequency',
              'Modem reads 983 MHz: 7000 - 983 = 6017 MHz, the TIDEMARK-2 slot - 32 MHz above the coordinated carrier',
            ],
            correctIndex: 0,
            explanation:
              'TX modem 1 reads 1015.0 MHz and is 36 MHz wide. On this chain RF = BUC LO - IF, so 7000 - 1015 = 5985 MHz, the TP-1 center on the coordination sheet. That puts the carrier at 5967 to 6003 MHz, exactly what the guard-band math assumed.',
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
      description: 'Read the current HPA backoff and think through what it does to the spectrum.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['check-tx-modem-frequency'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Read Current Backoff',
          params: {
            character: Character.SYSTEM,
            question: 'Read Back-off and IM3 (2-tone) on the HPA panel. What do they say about the transmit spectrum?',
            options: [
              'Operating near saturation - third-order IMD will be high and spill several MHz past the carrier edges',
              'Operating with comfortable margin - 5 dB keeps third-order IMD below the noise floor at the carrier edges',
              'Operating in the linear region - a modulated carrier at 5 dB backoff generates no third-order IMD',
              'Operating at the design point - backoff sets output power only and has no bearing on adjacent emissions',
            ],
            correctIndex: 0,
            explanation:
              'The panel reads 5 dB back-off and an IM3 of about -33 dBc, which is 10 dB worse than the -43 dBc you get at the standard 10 dB. Five dB is marginal for a modulated carrier, because third-order IMD grows quickly as the HPA nears compression, so more energy spills past the carrier edges and adjacent-channel power rises.',
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
      description: 'Confirm you understand how HPA compression puts energy next to the carrier.',
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
              'Amplifier nonlinearity mixes spectral components into intermodulation products just outside the carrier edges',
              'Waveguide heating under heavy drive widens the carrier, spreading modulation energy just outside the carrier edges',
              'BUC LO drift under heavy HPA drive smears the carrier, pushing modulation energy just outside the carrier edges',
              'Feed horn re-radiation under high drive couples energy into adjacent passbands just outside the carrier edges',
            ],
            correctIndex: 0,
            explanation:
              'Near saturation the HPA stops behaving linearly, so the spectral components of the carrier mix with each other and produce IMD. The dominant third-order products fall just outside the carrier edges and weaken as you move farther from the carrier.',
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
      description: 'Pick the right mitigation. Customer traffic must stay up, and RedSky goes live at 09:22.',
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
              'Increase HPA backoff to 10 dB - suppresses IMD and keeps SeaLink up with no customer coordination',
              'Cut TX modem power to zero - clears the IMD instantly and the carrier returns when RedSky is up',
              'Retune our TIDEMARK-3 carrier away from RedSky - widens the guard band past any IMD skirt we produce',
              'Engage a notch filter on the RX side at 5961 MHz - keeps their carrier out of our demodulator',
            ],
            correctIndex: 0,
            explanation:
              "Backoff is the right lever because it linearizes the amplifier, suppresses IMD, and can be reversed later. Cutting power would kill the customer's service. Retuning would mean renegotiating the SLA, the customer's service agreement. A notch filter on the receive side does nothing for the neighbor.",
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
      description: 'Raise the HPA backoff to 10 dB to clean up the spectrum on either side of the carrier.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['evaluate-mitigation-options'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
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
      description: 'After the change, read the HPA panel on the TX Chain tab: Output, Back-off, IM3 (2-tone) and Overdrive. The TX modem should still be transmitting.',
      groundStation: 'VT-01',
      intent: 'confirm',
      prerequisiteObjectiveIds: ['increase-hpa-backoff'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        // Keep it so (Q2): the change was the back-off, not these
        {
          type: 'hpa-enabled',
          description: 'HPA Enabled',
          requiresChange: false,
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
          requiresChange: false,
          mustMaintain: true,
        },
        {
          // Read quiz in place of the 5 s dwell (Phase 27 Q3, s15-F5).
          // Ledger (nats-scenario15.json) at 5 dB: 55.0 dBm out, IM3 -33.0
          // dBc. At 10 dB the ALC holds 50.0 dBm and IM3 reads about -43 dBc
          // (2 dB per dB of back-off), as in S14 at the same setting.
          type: 'status-check',
          description: 'HPA Panel Read',
          params: {
            character: Character.SYSTEM,
            question: 'What does the HPA panel read now that the back-off is 10 dB?',
            options: [
              'Output 50 dBm (100 W), back-off 10 dB, IM3 about -43 dBc, Overdrive Normal',
              'Output 55 dBm (316 W), back-off 5 dB, IM3 about -33 dBc - the change has not taken',
              'Output 50 dBm (100 W), back-off 10 dB, IM3 still about -33 dBc - back-off moves power, not IMD',
              'Output -- dBm, HPA disabled - raising the back-off took the amplifier offline',
            ],
            correctIndex: 0,
            explanation:
              "The ALC dropped the output 5 dB to 50 dBm, and the IM3 readout fell about 10 dB, from about -33 to -43 dBc, because third-order products fall about 2 dB for every dB of back-off. The HPA is still on and still carrying SeaLink. The other readings would mean the change didn't take, or that the amplifier went offline.",
            pointPenalty: 5,
          },
          mustMaintain: false,
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
      description: 'Open the RX Analysis tab to use the spectrum analyzer.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-hpa-still-online'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
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
      description:
        "Set the spectrum analyzer to look at the TIDEMARK-3 downlink IF: center 1490 MHz (the 5250 MHz LNB LO minus the 3760 MHz downlink RF), span about 75 MHz so RedSky's adjacent slot is visible too, and an amplitude scale of -100 to -30 dBm. Leave the RBW (resolution bandwidth) on Auto, as the beacon preset has it.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['open-rx-analysis'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
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
            spanTolerance: 25e6,
          },
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
            // The beacon preset tops out at -40: the player moves it up
            maxAmplitudeTolerance: 5,
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
      description: 'Check that the SeaLink TIDEMARK-3 downlink is still healthy after the backoff change.',
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
              'Wideband carrier still present at slightly lower power - link healthy and IMD skirts below the adjacent noise floor',
              'Wideband carrier gone from 1490 MHz - the backoff change dropped the drive below what the BUC passes through',
              'Wideband carrier now twice as wide - the backoff change spread the modulation energy across the whole 36 MHz transponder',
              'Beacon gone from the span - the HPA backoff change affects the beacon before it affects the carrier',
            ],
            correctIndex: 0,
            explanation:
              'Backing the HPA off from 5 to 10 dB drops its output 5 dB (55 to 50 dBm, 316 to 100 W) and pulls the IM3 (2-tone) readout down about 10 dB, from about -33 to -43 dBc. Nothing about that change removes the carrier or widens it, so the customer link stays up with cleaner edges.',
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
      description: 'Watch RX modem 1 on the RX Analysis tab for a few seconds. The customer-traffic receiver must still be locked.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['confirm-carrier-still-nominal'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Locked',
          // Locked from load, so a 5 s read is the action (nats-s15-F5)
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis', observationDwellSeconds: 5 },
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
      description: "Choose the confirmation to send back to RedSky's coordinator.",
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
            question: "Now that the HPA backoff is 10 dB, what's the correct status to send back to RedSky?",
            options: [
              'Confirmed clear. TP-1 carrier 5967-6003 MHz H-pol, adjacent-channel emissions below your slot. Proceed 5961 MHz V-pol as scheduled.',
              'Confirmed clear. TP-1 carrier 5967-6003 MHz H-pol muted for your window, spectrum released. Proceed 5961 MHz V-pol as scheduled.',
              'Cannot confirm. TP-1 carrier 5967-6003 MHz H-pol, adjacent-channel emissions still under review. Recommend delaying your 5961 MHz uplink.',
              'Confirmed clear. TP-1 carrier retuning to 5950 MHz H-pol for wider margin, adjacent emissions unchanged. Proceed 5961 MHz V-pol as scheduled.',
            ],
            correctIndex: 0,
            explanation:
              "A good coordination reply states your occupied band, confirms that adjacent-channel emissions are below the neighbor's threshold, and clears them to proceed. The other replies mute our carrier, withhold clearance, or claim a retune we haven't made.",
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
      description: 'Choose the shift log entry that correctly records this coordination.',
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
              'RedSky 0922 slot - notice confirmed. TP-1 HPA backoff raised 5 to 10 dB to suppress adjacent IMD. RedSky cleared for 5961 MHz V-pol, SeaLink nominal.',
              'RedSky 0922 slot - notice denied. TP-1 HPA backoff held at 5 dB, guard band judged too tight. RedSky advised to relocate slot, SeaLink nominal.',
              'RedSky 0922 slot - notice confirmed. TP-1 HPA backoff held at 5 dB, cross-pol isolation judged sufficient. RedSky cleared for 5961 MHz V-pol, SeaLink nominal.',
              'RedSky 0922 slot - notice confirmed. TP-1 carrier muted for the RedSky window to clear adjacent IMD. RedSky cleared for 5961 MHz V-pol, SeaLink down.',
            ],
            correctIndex: 0,
            explanation:
              "A good log entry records what we did, why we did it and what we cleared, so the next shift has the full context if RedSky's uplink behaves unexpectedly. The other entries record a decision we didn't make or an outage we didn't cause.",
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
        "RedSky Teleport sent a coordination notice, and it's in your inbox. They're lighting up a V-pol carrier on TIDEMARK-3 in 10 minutes, and it sits 2 MHz off the edge of our SeaLink carrier. Check that our spectrum is clean and send the confirmation back. It's routine, but don't drop the SeaLink carrier."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/15/intro.mp3'),
    },
    objectives: {
      // Keyed to the adequacy question's completion: played before it, "check
      // the TX chain" gave its answer away
      'assess-guard-adequacy': {
        text: `
        <p>
          A 2 MHz gap plus cross-pol isolation makes this tight but workable, as long as our own spectrum is clean. Open the TX Chain tab and look at how the transmit chain is set up.
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
          The confirmation has gone to RedSky, and the log gives the next shift the whole story. That's good neighbor work. The next coordination notice goes through the same process, so RedSky will know to expect a clean answer from this station.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/15/obj-log-coordination-event.mp3'),
      },
    },
  },
};
