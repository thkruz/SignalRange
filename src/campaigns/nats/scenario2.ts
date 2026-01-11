import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, Hertz, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { createRfFrontEnd } from '../rf-front-end-factory';
import { maineGroundStation, vermontGroundStation } from './ground-stations';
import { ses10Satellite, tidemark1Satellite } from './satellites';

/**
 * NATS Level 2: "Scheduled Maintenance" - Power Down and Recovery Procedures
 *
 * Phase: Introduction (Phase 1, Scenario 2 of 8)
 * Time Pressure: Moderate (maintenance window constraint)
 * Calculation Required: NO - all values provided by Charlie
 * New UI Elements: Equipment power controls, modem transmit controls, antenna positioning
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T1567: Configure system hardware, software, and peripheral equipment
 *   - K0770: Knowledge of system administration principles and practices
 *   - S0421: Skill in operating network equipment
 *
 * Supporting Codes:
 *   - K0645: Knowledge of standard operating procedures (SOPs)
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - K1032: Knowledge of satellite-based communication systems and software
 *   - K0740: Knowledge of system performance indicators
 *   - K0741: Knowledge of system availability measures
 *   - T0153: Monitor network capacity and performance
 *   - T0431: Check system hardware availability, functionality, integrity, and efficiency
 *   - S0077: Skill in securing network communications (RF safety)
 *
 * Premise: The maintenance crew needs to perform work on the TIDEMARK-1 antenna
 * feed assembly. You'll execute proper power-down sequencing to ensure RF safety,
 * move the antenna to maintenance position, then restore full service afterward.
 *
 * Key Learning Objectives:
 * 1. Understand RF safety protocols and why sequence matters
 * 2. Execute proper HPA → BUC → LNB power-down sequence
 * 3. Command antenna to maintenance position
 * 4. Execute proper LNB → BUC → HPA power-up sequence (reverse order)
 * 5. Verify link restoration via beacon signal
 *
 * Character Notes:
 *   - Charlie Brooks: More hands-off this time. You touched controls yesterday,
 *     now prove you can execute procedures correctly. He'll provide values but
 *     expects you to know which controls to use.
 */

export const scenario2Data: ScenarioData = {
  id: 'nats-scenario2',
  url: 'nats/scenarios/nats-scenario2',
  prerequisiteScenarioIds: ['nats-scenario1'],
  imageUrl: 'nats/2/card.png',
  number: 2,
  title: 'Scheduled Maintenance',
  subtitle: 'Power Down and Recovery Procedures',
  duration: '25-35 min',
  difficulty: 'beginner',
  missionType: 'Routine Operations',
  description: `The maintenance crew needs to perform work on the TIDEMARK-1 antenna feed assembly. You'll power down the transmit chain in the proper sequence to ensure safety (don't radiate the maintenance crew), move the antenna to maintenance position for access, then restore service after the maintenance window.<br><br>This is your first time actually controlling the equipment. Charlie will provide all frequency values and configuration settings - you just need to execute the procedures in the correct order.<br><br>Key lesson: Sequence matters. RF safety protocols exist for a reason.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
    'Receiver Modem (pre-configured)',
    'Transmitter Modem (pre-configured)',
  ],
  timeLimitSeconds: 35 * 60, // 35 minutes
  settings: {
    isSync: true,
    groundStations: [
      {
        ...vermontGroundStation,
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            hpa: { isHpaEnabled: true, isHpaSwitchEnabled: true },
          }),
        ],
        spectrumAnalyzers: [
          {
            ...vermontGroundStation.spectrumAnalyzers[0],
            centerFrequency: 1074.50125e6 as Hertz,
          },
        ],
      },
      { ...maineGroundStation, isOperational: false },
    ],
    missionBriefUrl: 'https://docs.signalrange.space/scenarios/scenario-2?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
    satellites: [
      tidemark1Satellite,
      ses10Satellite,
    ],
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      // K0645: Knowledge of standard operating procedures (SOPs) - reviewing the mission brief
      // establishes the procedural framework and RF safety requirements for maintenance
      nice: ['K0645'],
      title: 'Review Mission Brief',
      description: 'Open and read the mission brief document including RF safety procedures, then acknowledge you are ready to proceed.',
      groundStation: 'VT-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Mission Brief Document Opened',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Ready to Proceed',
          params: {
            question: 'Have you reviewed the mission brief and RF safety procedures?',
            options: [
              'Yes, I have read the mission brief and I am ready to proceed.',
            ],
            correctIndex: 0,
            explanation: 'The mission timer has started. Good luck!',
            pointPenalty: 0,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'safety-briefing',
      // K0645: Knowledge of standard operating procedures (SOPs) - acknowledging
      // RF safety procedures is a mandatory pre-task requirement
      // S0077: Skill in securing network communications - understanding RF safety
      // protocols protects personnel from radiation hazards
      nice: ['K0645', 'S0077'],
      title: 'Acknowledge RF Safety Briefing',
      description: 'Confirm you understand the RF safety procedures for maintenance operations.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'RF Safety Briefing Acknowledged',
          params: {
            question: 'I need you to confirm you understand the RF safety briefing for today\'s maintenance work. Company policy requires verbal acknowledgment before we proceed. Lawyers and such...',
            options: [
              'I have received and understood the RF safety briefing for today\'s maintenance work.',
            ],
            correctIndex: 0,
            explanation: 'Acknowledging the RF safety briefing ensures all personnel understand the hazards and procedures before maintenance work begins. The HPA outputs several hundred watts - enough to cause serious RF burns.',
            pointPenalty: 0,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // STATION ACCESS - TRANSMIT CHAIN
    // ============================================================
    {
      id: 'select-vermont-station',
      // S0421: Skill in operating network equipment - accessing the ground station
      // control interface is the fundamental skill for all subsequent operations
      nice: ['S0421'],
      title: 'Access Vermont Ground Station',
      description: 'Select the Vermont Ground Station in the asset tree to access its equipment panels.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['safety-briefing'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'Vermont Ground Station Selected',
          params: { groundStationId: 'VT-01' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'navigate-tx-chain-shutdown',
      // S0421: Skill in operating network equipment - navigating to the transmit
      // chain panel to begin the power-down sequence
      nice: ['S0421'],
      title: 'Open TX Chain Tab',
      description: 'Click the TX Chain tab to access the transmit equipment controls.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['select-vermont-station'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'Vermont Station Active',
          params: { groundStationId: 'VT-01' },
          mustMaintain: true,
        },
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // POWER-DOWN SEQUENCE: HPA
    // ============================================================
    {
      id: 'verify-hpa-initial-state',
      // T0431: Check system hardware availability, functionality, integrity, and efficiency -
      // verifying current HPA state before making changes
      // K0740: Knowledge of system performance indicators - understanding HPA
      // operating state indicators (enabled, backoff level, output power)
      nice: ['T0431', 'K0740'],
      title: 'Verify Current HPA State',
      description: 'Confirm the HPA is currently transmitting before beginning shutdown.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-tx-chain-shutdown'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Verify Current HPA State',
          params: {
            question: 'Before we shut down, confirm the current HPA state. What does the HPA panel show?',
            options: [
              'HPA is enabled and transmitting with 10 dB backoff',
              'HPA is powered on but output is disabled',
              'HPA is powered off completely',
              'HPA shows fault condition - red alarm',
            ],
            correctIndex: 0,
            explanation: 'The HPA is currently enabled and transmitting at 10 dB backoff. This confirms there is active RF output that we need to safely shut down before maintenance personnel approach the antenna.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'disable-hpa-output',
      // T1567: Configure system hardware, software, and peripheral equipment -
      // disabling HPA output is the first step in safe shutdown sequence
      // S0421: Skill in operating network equipment - executing the HPA disable control
      // K0770: Knowledge of system administration principles and practices -
      // understanding proper shutdown sequencing (high-power first)
      nice: ['T1567', 'S0421', 'K0770'],
      title: 'Disable HPA Output',
      description: 'Disable the High Power Amplifier output by toggling the HPA enable switch to OFF.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-hpa-initial-state'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'hpa-disabled',
          description: 'HPA Output Disabled',
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-hpa-disabled-quiz',
      // K0741: Knowledge of system availability measures - understanding HPA
      // disabled state as a safety prerequisite for maintenance
      // S0077: Skill in securing network communications - confirming RF output
      // is stopped before proceeding with shutdown
      nice: ['K0741', 'S0077'],
      title: 'Confirm HPA Output Disabled',
      description: 'Verify the HPA output indicator shows disabled state.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['disable-hpa-output'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Confirm HPA Disabled',
          params: {
            question: 'The HPA output is now disabled. What should you observe on the HPA panel?',
            options: [
              'HPA Enable indicator shows OFF - no RF output, but amplifier still energized',
              'HPA completely powered down - all indicators off',
              'HPA still transmitting at reduced power',
              'HPA showing warning alarm',
            ],
            correctIndex: 0,
            explanation: 'The HPA Enable indicator shows OFF, meaning no RF is being transmitted. However, the amplifier is still powered and components are hot - we need to power it off completely before it\'s safe.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'power-off-hpa',
      // T1567: Configure system hardware, software, and peripheral equipment -
      // completely powering off the HPA for maintenance safety
      // S0421: Skill in operating network equipment - executing the HPA power control
      nice: ['T1567', 'S0421'],
      title: 'Power Off HPA',
      description: 'Power off the High Power Amplifier completely. The amplifier needs to cool before anyone touches anything upstream.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-hpa-disabled-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'equipment-not-powered',
          description: 'HPA Powered Off',
          params: { equipment: 'hpa' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // POWER-DOWN SEQUENCE: BUC
    // ============================================================
    {
      id: 'power-off-buc',
      // T1567: Configure system hardware, software, and peripheral equipment -
      // powering off BUC as part of safe shutdown sequence
      // S0421: Skill in operating network equipment - executing the BUC power control
      // K0770: Knowledge of system administration principles and practices -
      // understanding complete power-down for maintenance safety
      nice: ['T1567', 'S0421', 'K0770'],
      title: 'Power Off BUC',
      description: 'Power off the Block Upconverter completely. Even without the HPA, the BUC still outputs a few milliwatts - we want it completely cold.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-off-hpa'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'equipment-not-powered',
          description: 'BUC Powered Off',
          params: { equipment: 'buc' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-buc-powered-off-quiz',
      // K0741: Knowledge of system availability measures - understanding BUC power
      // state as confirmation of complete transmit chain shutdown
      nice: ['K0741'],
      title: 'Confirm BUC Powered Off',
      description: 'Verify the BUC is now completely powered down.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-off-buc'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Confirm BUC Powered Off',
          params: {
            question: 'The BUC is now powered off. What does the BUC status show?',
            options: [
              'BUC power indicator is OFF - completely de-energized',
              'BUC is muted but still powered',
              'BUC still outputting at low power',
              'BUC reference unlocked',
            ],
            correctIndex: 0,
            explanation: 'The BUC power indicator is OFF - the upconverter is completely de-energized. No RF energy can be generated from this equipment.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'stop-modem-transmitting',
      // T1567: Configure system hardware, software, and peripheral equipment -
      // stopping modem transmission as part of shutdown sequence
      // S0421: Skill in operating network equipment - executing modem transmit control
      nice: ['T1567', 'S0421'],
      title: 'Stop Modem Transmission',
      description: 'Stop the transmitter modem from transmitting. The modem should remain powered but not actively transmitting.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-buc-powered-off-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'tx-modem-not-transmitting',
          description: 'Modem Transmission Stopped',
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // POWER-DOWN SEQUENCE: LNB
    // ============================================================
    {
      id: 'navigate-rx-analysis-shutdown',
      // S0421: Skill in operating network equipment - navigating to the receive
      // chain panel to power down the LNB
      nice: ['S0421'],
      title: 'Open RX Analysis Tab',
      description: 'Click the RX Analysis tab to access the LNB power controls.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['stop-modem-transmitting'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'Vermont Station Active',
          params: { groundStationId: 'VT-01' },
          mustMaintain: true,
        },
        {
          type: 'tab-active',
          description: 'RX Analysis Tab Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'power-down-lnb',
      // T1567: Configure system hardware, software, and peripheral equipment -
      // powering down the LNB to complete RF chain shutdown
      // S0421: Skill in operating network equipment - executing the LNB power control
      nice: ['T1567', 'S0421'],
      title: 'Power Down LNB',
      description: 'Power off the Low Noise Block to complete RF chain shutdown. No point leaving equipment energized when the antenna is not pointed at anything useful.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-rx-analysis-shutdown'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Tab Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'equipment-not-powered',
          description: 'LNB Powered Off',
          params: { equipment: 'lnb' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-rf-chain-shutdown-quiz',
      // K0741: Knowledge of system availability measures - understanding complete
      // RF chain shutdown status before antenna movement
      // K0770: Knowledge of system administration principles and practices -
      // confirming all RF equipment is de-energized
      nice: ['K0741', 'K0770'],
      title: 'Confirm RF Chain Shutdown',
      description: 'Verify the complete RF chain is now powered down and safe for maintenance.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-down-lnb'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Confirm RF Chain Status',
          params: {
            question: 'The RF chain should now be completely cold. Which equipment is still powered?',
            options: [
              'GPSDO and control systems only - all RF equipment is off',
              'LNB is still receiving signals passively',
              'BUC is still energized but muted',
              'HPA is still warming up',
            ],
            correctIndex: 0,
            explanation: 'Correct. The GPSDO and control systems remain powered for timing and monitoring, but all RF equipment (LNB, BUC, HPA) is completely de-energized. The antenna is safe for maintenance personnel to approach.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // ANTENNA POSITIONING
    // ============================================================
    {
      id: 'navigate-acu-control-maintenance',
      // S0421: Skill in operating network equipment - navigating to the antenna
      // control unit panel for maintenance positioning
      nice: ['S0421'],
      title: 'Open ACU Control Tab',
      description: 'Click the ACU Control tab to command the antenna to maintenance position.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-rf-chain-shutdown-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'Vermont Station Active',
          params: { groundStationId: 'VT-01' },
          mustMaintain: true,
        },
        {
          type: 'tab-active',
          description: 'ACU Control Tab Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'antenna-to-maintenance',
      // T1567: Configure system hardware, software, and peripheral equipment -
      // commanding antenna to maintenance position
      // S0421: Skill in operating network equipment - executing antenna position commands
      // K1032: Knowledge of satellite-based communication systems and software -
      // understanding antenna positioning for maintenance access
      nice: ['T1567', 'S0421', 'K1032'],
      title: 'Move Antenna to Maintenance Position',
      description: 'Set tracking mode to MAINTENANCE to command antenna to azimuth 0°, elevation 5°.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-acu-control-maintenance'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      timePenalty: {
        elapsedTimeThreshold: 12 * 60, // 12 minutes
        pointsDeducted: 30,
        message: "You delayed maintenance getting started on time. Don't let it happen again.",
      },
      conditions: [
        {
          type: 'tab-active',
          description: 'ACU Control Tab Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
        {
          type: 'antenna-tracking-mode-set',
          description: 'Tracking Mode Set to Maintenance',
          params: { trackingMode: 'maintenance' },
          mustMaintain: true,
        },
        {
          type: 'antenna-position',
          description: 'Antenna at Maintenance Position',
          params: {
            elevation: 5 as Degrees,
            tolerance: 0.5,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'verify-maintenance-position-quiz',
      // K1032: Knowledge of satellite-based communication systems and software -
      // understanding why maintenance position uses specific elevation
      // K0770: Knowledge of system administration principles and practices -
      // confirming safe antenna position before releasing to maintenance crew
      nice: ['K1032', 'K0770'],
      title: 'Confirm Maintenance Position',
      description: 'Verify the antenna has reached the correct maintenance position.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['antenna-to-maintenance'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'ACU Control Tab Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Verify Maintenance Position',
          params: {
            question: 'The antenna is now at maintenance position. Why do we use 5° elevation instead of 0°?',
            options: [
              'Low enough for crew access, high enough to clear obstructions',
              'Antenna cannot physically reach 0° elevation',
              'To maintain satellite lock during maintenance',
              'Required by FCC regulations',
            ],
            correctIndex: 0,
            explanation: '5° elevation gives maintenance personnel access to the feed assembly while keeping the antenna clear of any ground-level obstructions. This is the standard maintenance position for this facility.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // MAINTENANCE WINDOW (SIMULATED)
    // ============================================================
    {
      id: 'maintenance-complete',
      // K0645: Knowledge of standard operating procedures (SOPs) - understanding
      // documentation requirements during maintenance windows
      nice: ['K0645'],
      title: 'Maintenance Window Complete',
      description: 'The maintenance crew has completed their work. Acknowledge to begin service restoration.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-maintenance-position-quiz'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Acknowledge Maintenance Complete',
          params: {
            question: 'The maintenance crew reports work complete - waveguide flange gasket replaced. What should you verify before beginning restoration?',
            options: [
              'Confirm all personnel are clear of the antenna and feed assembly',
              'Begin powering up equipment immediately to minimize downtime',
              'Check if the gasket part number matches the work order',
              'Request a second maintenance crew for inspection',
            ],
            correctIndex: 0,
            explanation: 'Before restoring RF power, you must confirm all personnel are clear of the antenna. Never re-energize equipment while people could be in the RF radiation zone.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // SERVICE RESTORATION: ANTENNA
    // ============================================================
    {
      id: 'repoint-antenna',
      // T1567: Configure system hardware, software, and peripheral equipment -
      // commanding antenna back to operational pointing
      // S0421: Skill in operating network equipment - executing antenna position commands
      // K1032: Knowledge of satellite-based communication systems and software -
      // understanding program-track mode for GEO satellites
      nice: ['T1567', 'S0421', 'K1032'],
      title: 'Repoint Antenna at TIDEMARK-1',
      description: 'Set tracking mode to PROGRAM TRACK and command antenna to Az 161.8°, El 34.2°.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['maintenance-complete'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'ACU Control Tab Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
        {
          type: 'antenna-tracking-mode-set',
          description: 'Tracking Mode Set to Program Track',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-position',
          description: 'Antenna Pointed at TIDEMARK-1',
          params: {
            azimuth: 161.8 as Degrees,
            elevation: 34.2 as Degrees,
            tolerance: 0.1,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // SERVICE RESTORATION: LNB
    // ============================================================
    {
      id: 'navigate-rx-analysis-restore',
      // S0421: Skill in operating network equipment - navigating to the receive
      // chain panel to restore LNB
      nice: ['S0421'],
      title: 'Open RX Analysis Tab',
      description: 'Click the RX Analysis tab to restore the receive chain.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['repoint-antenna'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'Vermont Station Active',
          params: { groundStationId: 'VT-01' },
          mustMaintain: true,
        },
        {
          type: 'tab-active',
          description: 'RX Analysis Tab Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'power-up-lnb',
      // T1567: Configure system hardware, software, and peripheral equipment -
      // restoring LNB with proper configuration settings
      // S0421: Skill in operating network equipment - executing LNB power and config controls
      // K0792: Knowledge of network configurations - setting correct LO frequency and gain
      nice: ['T1567', 'S0421', 'K0792'],
      title: 'Restore LNB',
      description: 'Power on LNB and configure: LO 5,250 MHz, Gain 60 dB. Wait for thermal stabilization.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-rx-analysis-restore'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Tab Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'equipment-powered',
          description: 'LNB Powered On',
          params: { equipment: 'lnb' },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-lo-set',
          description: 'LNB LO Set to 5,250 MHz',
          params: {
            loFrequency: 5250 as MHz,
            loFrequencyTolerance: 0,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-gain-set',
          description: 'LNB Gain Set to 60 dB',
          params: {
            gain: 60,
            gainTolerance: 0,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-thermally-stable',
          description: 'LNB Thermally Stabilized',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-lnb-restored-quiz',
      // K0740: Knowledge of system performance indicators - confirming LNB
      // performance metrics after restoration
      // K0773: Knowledge of telecommunications principles and practices -
      // understanding LO frequency and its role in downconversion
      nice: ['K0740', 'K0773'],
      title: 'Verify LNB Restoration',
      description: 'Confirm the LNB is operating correctly after power-up.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-up-lnb'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Tab Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Verify LNB Status',
          params: {
            question: 'The LNB is now powered and configured. What key indicator confirms it\'s ready for operation?',
            options: [
              'Thermal stability indicator shows green - temperature stabilized',
              'LO frequency shows exactly 5250.000 MHz - no drift',
              'Reference lock indicator shows locked to GPSDO',
              'All of the above should be confirmed',
            ],
            correctIndex: 3,
            explanation: 'All three indicators should be confirmed: thermal stability ensures consistent gain and noise performance, LO frequency accuracy ensures correct downconversion, and reference lock ensures frequency stability from the GPSDO.',
            pointPenalty: 10,
            preserveOptionOrder: true,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // SERVICE RESTORATION: VERIFY BEACON
    // ============================================================
    {
      id: 'verify-beacon',
      // T0153: Monitor network capacity and performance - confirming beacon
      // reception as proof of successful antenna pointing and receive chain
      // K0773: Knowledge of telecommunications principles and practices -
      // understanding IF frequency after downconversion
      nice: ['T0153', 'K0773'],
      title: 'Verify Beacon Reception',
      description: 'Confirm TIDEMARK-1 beacon is visible at 1,074.5 MHz IF on the spectrum analyzer.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-lnb-restored-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Tab Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'signal-detected',
          description: 'Beacon Signal Detected',
          params: {
            signalId: 'TIDEMARK-1-Beacon',
            minPower: -100 as dBm,
          },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'Spectrum Analyzer at Beacon IF Frequency',
          params: {
            centerFrequency: 1074.5e6 as Hertz,
            centerFrequencyTolerance: 0.5e6,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-beacon-quiz',
      // K1032: Knowledge of satellite-based communication systems and software -
      // understanding what beacon reception confirms about the link
      // K0773: Knowledge of telecommunications principles and practices -
      // calculating IF frequency from RF and LO
      nice: ['K1032', 'K0773'],
      title: 'Confirm Beacon Analysis',
      description: 'Understand what the beacon reception tells you about link status.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-beacon'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Tab Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Understand Beacon Reception',
          params: {
            question: 'You see the TIDEMARK-1 beacon at 1,074.5 MHz IF. The RF beacon frequency is 4,175.5 MHz. Which calculation confirms the LNB is set correctly?',
            options: [
              'LO (5,250 MHz) - RF (4,175.5 MHz) = IF (1,074.5 MHz)',
              'RF (4,175.5 MHz) + IF (1,074.5 MHz) = LO (5,250 MHz)',
              'IF (1,074.5 MHz) × 4 = RF (4,298 MHz)',
              'The frequencies are coincidentally correct',
            ],
            correctIndex: 0,
            explanation: 'The LNB performs downconversion by mixing the incoming RF signal with its Local Oscillator. LO (5,250 MHz) minus RF (4,175.5 MHz) equals IF (1,074.5 MHz). This confirms the LO is set correctly and the receive path is working.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // SERVICE RESTORATION: BUC
    // ============================================================
    {
      id: 'navigate-tx-chain-restore',
      // S0421: Skill in operating network equipment - navigating to the transmit
      // chain panel to restore transmission
      nice: ['S0421'],
      title: 'Open TX Chain Tab',
      description: 'Click the TX Chain tab to restore the transmit equipment.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-beacon-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'Vermont Station Active',
          params: { groundStationId: 'VT-01' },
          mustMaintain: true,
        },
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'start-modem-transmitting',
      // T1567: Configure system hardware, software, and peripheral equipment -
      // restarting modem transmission as first step in transmit restoration
      // S0421: Skill in operating network equipment - executing modem transmit control
      nice: ['T1567', 'S0421'],
      title: 'Start Modem Transmission',
      description: 'Enable transmission on the transmitter modem. We start the modem before bringing up the RF chain.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-tx-chain-restore'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'tx-modem-transmitting',
          description: 'Modem Transmitting',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'power-on-buc',
      // T1567: Configure system hardware, software, and peripheral equipment -
      // restoring BUC power as part of transmit chain restoration
      // S0421: Skill in operating network equipment - executing BUC power control
      // K0770: Knowledge of system administration principles and practices -
      // understanding proper startup sequencing (low-power before high-power)
      nice: ['T1567', 'S0421', 'K0770'],
      title: 'Power On BUC',
      description: 'Power on the Block Upconverter. We bring up low-power stages before high-power ones.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['start-modem-transmitting'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'equipment-powered',
          description: 'BUC Powered On',
          params: { equipment: 'buc' },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // SERVICE RESTORATION: HPA
    // ============================================================
    {
      id: 'power-on-hpa',
      // T1567: Configure system hardware, software, and peripheral equipment -
      // restoring HPA power before enabling output
      // S0421: Skill in operating network equipment - executing HPA power control
      nice: ['T1567', 'S0421'],
      title: 'Power On HPA',
      description: 'Power on the High Power Amplifier.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-on-buc'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'equipment-powered',
          description: 'HPA Powered On',
          params: { equipment: 'hpa' },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'enable-hpa-output',
      // T1567: Configure system hardware, software, and peripheral equipment -
      // enabling HPA output to restore full transmission capability
      // S0421: Skill in operating network equipment - executing HPA enable control
      nice: ['T1567', 'S0421'],
      title: 'Enable HPA Output',
      description: 'Enable the High Power Amplifier output to restore full service.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-on-hpa'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Tab Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'hpa-enabled',
          description: 'HPA Output Enabled',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // FINAL VERIFICATION
    // ============================================================
    {
      id: 'final-verification',
      // T0153: Monitor network capacity and performance - final verification
      // that all systems are restored and operating correctly
      // K0741: Knowledge of system availability measures - confirming full
      // service restoration
      nice: ['T0153', 'K0741'],
      title: 'Confirm Service Restored',
      description: 'Verify TIDEMARK-1 link is fully operational.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['enable-hpa-output'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Confirm Service Restoration',
          params: {
            question: 'TIDEMARK-1 should now be back in full service. What\'s the correct sequence for future scheduled maintenance?',
            options: [
              'Shutdown: HPA → BUC → Modem TX → LNB → Antenna. Restore: Antenna → LNB → Modem TX → BUC → HPA',
              'Shutdown: Antenna → LNB → BUC → HPA. Restore: HPA → BUC → LNB → Antenna',
              'Shutdown: LNB → BUC → HPA → Antenna. Restore: Antenna → HPA → BUC → LNB',
              'Sequence doesn\'t matter as long as all equipment is powered down',
            ],
            correctIndex: 0,
            explanation: 'Correct! Shutdown sequence is HPA (high-power) → BUC (low-power) → Modem TX → LNB → Antenna. Restoration is the reverse: Antenna → LNB → Modem TX → BUC → HPA. Always shut down high-power equipment first for safety, and restore low-power equipment first to verify signal before applying high power.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `
      <p>
        Maintenance crew needs access to the antenna feed assembly in fifteen minutes. We're taking TIDEMARK-1 offline for the window.
      </p>
      <p>
        First things first - you need to acknowledge the RF safety briefing. Someone forgot that step once. Maintenance tech caught about fifty watts to the face. He's fine now, but the paperwork wasn't.
      </p>
      <p>
        After that, we shut down in sequence: HPA first, then BUC, then stop the modem, then LNB, then stow the antenna. Never skip steps, never reverse order. Go.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.CONFIDENT,
      audioUrl: getAssetUrl('/assets/campaigns/nats/2/intro.mp3'),
    },
    objectives: {
      // ============================================================
      // MISSION PREPARATION
      // ============================================================
      'review-mission-brief': {
        text: `
        <p>
          Good. You've reviewed the procedures. Now I need you to acknowledge the RF safety briefing - it's a company requirement before any maintenance work.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-review-mission-brief.mp3'),
      },
      'safety-briefing': {
        text: `
        <p>
          Good. Now we start the shutdown sequence.
        </p>
        <p>
          The HPA is pushing several hundred watts through that feed horn. We disable it first - that's the big one. Click on Vermont Ground Station in the asset tree, then go to the TX Chain tab.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-safety-briefing.mp3'),
      },

      // ============================================================
      // STATION ACCESS
      // ============================================================
      'select-vermont-station': {
        text: `
        <p>
          Good. You've got Vermont selected. Now click the TX Chain tab - that's where the HPA controls are.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-select-vermont-station.mp3'),
      },
      'navigate-tx-chain-shutdown': {
        text: `
        <p>
          This is the transmit chain. HPA at the top, BUC below it. Before you touch anything, tell me what state the HPA is in right now.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-navigate-tx-chain-shutdown.mp3'),
      },

      // ============================================================
      // HPA SHUTDOWN
      // ============================================================
      'verify-hpa-initial-state': {
        text: `
        <p>
          Right. HPA is enabled and transmitting. That's several hundred watts of RF power going through the feed assembly where the maintenance crew needs to work.
        </p>
        <p>
          First step: disable the HPA output. Find the HPA panel and toggle the enable switch to OFF. Don't power it off completely yet - just disable the output.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-verify-hpa-initial-state.mp3'),
      },
      'disable-hpa-output': {
        text: `
        <p>
          Output's disabled. No more RF coming out of the amplifier. But here's the thing - it's still powered on and the tubes are still hot.
        </p>
        <p>
          Check the panel. What should you see now that the output is disabled?
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-disable-hpa-output.mp3'),
      },
      'verify-hpa-disabled-quiz': {
        text: `
        <p>
          Right. The enable indicator is off but the power indicator is still on. Amplifier's still hot. If you touched the waveguide right now, you'd burn yourself.
        </p>
        <p>
          Power it off completely. Same panel, hit the power switch.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-verify-hpa-disabled-quiz.mp3'),
      },
      'power-off-hpa': {
        text: `
        <p>
          HPA's down. Now the BUC.
        </p>
        <p>
          Even without the HPA, the BUC still outputs a few milliwatts. Not enough to hurt anyone, but enough to cause interference if we're moving the antenna around. Power it off completely. Same tab, find the BUC panel.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-power-off-hpa.mp3'),
      },

      // ============================================================
      // BUC SHUTDOWN
      // ============================================================
      'power-off-buc': {
        text: `
        <p>
          Good. BUC's powered down. Now verify it's actually off - what does the status show?
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-power-off-buc.mp3'),
      },
      'verify-buc-powered-off-quiz': {
        text: `
        <p>
          BUC's completely off. No power, no RF output possible.
        </p>
        <p>
          Now stop the modem from transmitting. Even though nothing's getting through the RF chain right now, we want to make sure the modem isn't trying to send data when we power back up.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-verify-buc-powered-off-quiz.mp3'),
      },
      'stop-modem-transmitting': {
        text: `
        <p>
          Modem's stopped transmitting. Good. Transmit chain is completely silent now.
        </p>
        <p>
          Power down the LNB next. We don't need it during maintenance, and there's no point leaving equipment energized when the antenna's not pointed at anything useful. Click the RX Analysis tab.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-stop-modem-transmitting.mp3'),
      },

      // ============================================================
      // LNB SHUTDOWN
      // ============================================================
      'navigate-rx-analysis-shutdown': {
        text: `
        <p>
          This is the receive chain. LNB is at the top. Power it off.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-navigate-rx-analysis-shutdown.mp3'),
      },
      'power-down-lnb': {
        text: `
        <p>
          LNB's off. RF chain is completely cold now.
        </p>
        <p>
          Before we move the antenna, confirm the RF chain status. What equipment is still powered?
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-power-down-lnb.mp3'),
      },
      'verify-rf-chain-shutdown-quiz': {
        text: `
        <p>
          Good. Control systems and GPSDO stay on - we need them for timing and to command the antenna. But all RF equipment is de-energized.
        </p>
        <p>
          Now stow the antenna. Click the ACU Control tab.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-verify-rf-chain-shutdown-quiz.mp3'),
      },

      // ============================================================
      // ANTENNA POSITIONING
      // ============================================================
      'navigate-acu-control-maintenance': {
        text: `
        <p>
          Set tracking mode to MAINTENANCE. That'll command it to azimuth zero, elevation five degrees. Low enough for the crew to access the feed, high enough to clear any obstructions.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-navigate-acu-control-maintenance.mp3'),
      },
      'antenna-to-maintenance': {
        text: `
        <p>
          Antenna's moving. Watch the position indicators. When it reaches 5 degrees elevation, we're good.
        </p>
        <p>
          Quick question while we wait - why 5 degrees instead of parking it at zero?
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-antenna-to-maintenance.mp3'),
      },
      'verify-maintenance-position-quiz': {
        text: `
        <p>
          Right. Ground clearance. Different facilities have different maintenance positions based on their terrain and equipment.
        </p>
        <p>
          Antenna's at maintenance position. Crew has the all-clear.
        </p>
        <p>
          They're replacing a waveguide flange gasket - routine work, takes about fifteen minutes.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-verify-maintenance-position-quiz.mp3'),
      },

      // ============================================================
      // MAINTENANCE WINDOW
      // ============================================================
      'maintenance-complete': {
        text: `
        <p>
          Maintenance is complete. Crew's clear of the tower. Time to bring the link back up.
        </p>
        <p>
          We restore in reverse order: antenna first, then receive chain, then transmit chain. Set tracking mode back to PROGRAM TRACK and command the antenna to azimuth 161.8, elevation 34.2. That's where TIDEMARK-1 sits.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-maintenance-complete.mp3'),
      },

      // ============================================================
      // SERVICE RESTORATION: ANTENNA
      // ============================================================
      'repoint-antenna': {
        text: `
        <p>
          Antenna's back on target. Now we restore the receive path first.
        </p>
        <p>
          Click the RX Analysis tab. Power up the LNB - set the local oscillator to 5,250 megahertz, gain to 60 dB. Wait for thermal stabilization.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-repoint-antenna.mp3'),
      },

      // ============================================================
      // SERVICE RESTORATION: LNB
      // ============================================================
      'navigate-rx-analysis-restore': {
        text: `
        <p>
          Find the LNB panel. Power it on and set the configuration - 5,250 MHz LO, 60 dB gain.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-navigate-rx-analysis-restore.mp3'),
      },
      'power-up-lnb': {
        text: `
        <p>
          LNB's powering up. Watch for the thermal stability indicator - it needs to settle before we can trust the readings.
        </p>
        <p>
          What should you be looking for to confirm it's ready?
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-power-up-lnb.mp3'),
      },
      'verify-lnb-restored-quiz': {
        text: `
        <p>
          LNB's stable. Now verify we're actually seeing the satellite.
        </p>
        <p>
          Check the spectrum analyzer. TIDEMARK-1's beacon should be visible at 1,074.5 MHz on the IF side. That's 4,175.5 MHz RF minus our 5,250 MHz LO. If you see a clean carrier there, we're pointed correctly.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-verify-lnb-restored-quiz.mp3'),
      },

      // ============================================================
      // SERVICE RESTORATION: VERIFY BEACON
      // ============================================================
      'verify-beacon': {
        text: `
        <p>
          There's the beacon. Good acquisition.
        </p>
        <p>
          Quick question - you're seeing 1,074.5 MHz on the spectrum analyzer. The satellite transmits at 4,175.5 MHz. How does the math work?
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-verify-beacon.mp3'),
      },
      'verify-beacon-quiz': {
        text: `
        <p>
          Right. LO minus RF equals IF. Basic downconversion. You'll be doing that calculation a lot.
        </p>
        <p>
          Now we can restore transmit. Click the TX Chain tab. Start the modem transmitting first, then power on the BUC - we bring up low-power stages before high-power ones.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-verify-beacon-quiz.mp3'),
      },

      // ============================================================
      // SERVICE RESTORATION: MODEM AND BUC
      // ============================================================
      'navigate-tx-chain-restore': {
        text: `
        <p>
          Find the transmitter modem panel. Enable transmission first.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-navigate-tx-chain-restore.mp3'),
      },
      'start-modem-transmitting': {
        text: `
        <p>
          Modem's transmitting. Now power on the BUC. Same tab, BUC panel.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-start-modem-transmitting.mp3'),
      },
      'power-on-buc': {
        text: `
        <p>
          BUC's live. Now power on the HPA. Same tab, HPA panel.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-power-on-buc.mp3'),
      },

      // ============================================================
      // SERVICE RESTORATION: HPA
      // ============================================================
      'power-on-hpa': {
        text: `
        <p>
          HPA's powered. Last step - enable the output.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-power-on-hpa.mp3'),
      },
      'enable-hpa-output': {
        text: `
        <p>
          Link's restored. TIDEMARK-1 back in service.
        </p>
        <p>
          One more thing - tell me the correct sequence for next time. This is the kind of thing that gets asked in reviews.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-enable-hpa-output.mp3'),
      },

      // ============================================================
      // FINAL VERIFICATION
      // ============================================================
      'final-verification': {
        text: `
        <p>
          That's scheduled maintenance. Power down in sequence, stow safely, restore in reverse order. You did it correctly - no one got hurt, no equipment got damaged, all within our Authorized Service Interruption window.
        </p>
        <p>
          Tomorrow we'll look at what happens when things don't go according to plan. Weather events, unexpected faults, that kind of thing. For now, go get some coffee or whatever it is you do here when not training.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-final-verification.mp3'),
      },
    },
  },
};