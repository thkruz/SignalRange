import { Character } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import { sandstormGroundStation } from './ground-stations';
import { cobalt4Satellite } from './satellites';

/**
 * Campaign 4 (9th EWS / Counter Communications) - Scenario 2 "Failover"
 *
 * First scored mission of the arc; builds on the "Blackout" sandbox
 * (ccs-scenario1), which already walks the operator through aperture
 * coordination, the first denial, and a single failover. This one is the
 * contingency shift: the same SANDSTORM site, the same COBALT-4 target, but
 * the denial has to be HELD through two transmit-string trips while the
 * adversary tries to recover his link.
 *
 * Fault model (what the engine can and cannot do):
 * - `hardwareFaultEvents` trips a transmitter MODEM (the exciter): it faults,
 *   stops radiating, and stays latched until the operator runs the string's
 *   fault reset with the string un-keyed. The two jam strings share one
 *   BUC/HPA on rfFrontEnd 0, so an "HPA trip" cannot be represented - the
 *   scheduled faults are exciter trips and the diagnosis the operator must
 *   make is exactly that: exciter down, amplifier healthy, keep the HPA up
 *   and change strings.
 * - `fault-active` / `fault-cleared` read the payload FaultInjector, not the
 *   hardware-fault schedule, so the trips are detected through the string
 *   itself: `tx-modem-not-transmitting` on the string that just went down.
 *
 * Timeline (mission elapsed, HardwareFaultManager clock):
 * - T+0      tasking acknowledged, monitor aperture slewed on, JAM-A keyed
 * - ~T+4-6   first hold: 120 s of continuous denial on the primary
 * - T+480    JAM-A exciter trips -> fail over to JAM-B inside 180 s
 * - ~T+11    second hold: 120 s of continuous denial on the backup
 * - T+840    JAM-B exciter trips -> reset a cooled string and re-key inside 150 s
 * - then     hold 180 s to the recall, cease fire cleanly
 *
 * The scheduled trips fire on the mission clock regardless of objective
 * progress. Every objective after the first trip grades the EFFECT (any string
 * radiating in band with J/S at threshold), never a particular modem, so a
 * slow operator who meets a trip early is never dead-ended: any string can be
 * reset and re-keyed.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - S0582: Skill in troubleshooting RF systems
 *   - T0153: Monitor system performance
 * Supporting Codes:
 *   - K0645: Knowledge of standard operating procedures
 *   - K0737: Knowledge of RF spectrum characteristics
 *   - S0648: Skill in detecting anomalies
 *   - T0081: Analyze anomalies
 */
export const ccsScenario2Data: ScenarioData = {
  id: 'ccs-scenario2',
  url: 'ccs/scenarios/ccs-scenario2',
  imageUrl: 'nats/21/card.png',
  number: 1,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['ccs-scenario1'],
  title: 'Failover',
  subtitle: 'Hold the Blackout Through a String Trip',
  duration: '25-35 min',
  missionType: 'Contingency Operations',
  description: `Second night on COBALT-4. The tasking order wants the adversary's X-band service link denied for the full window, and the crew chief has left you a warning: the JAM-A exciter has a thermal history, the tent swapped its fan yesterday, and nobody trusts it yet. JAM-B is the spare. Both strings drive the same amplifier.
  <br/><br/>Bring the monitor aperture onto the bird, key the primary, and drive the link to DENIED. Then hold it. When a string trips, read the panel before you touch anything: work out which module actually failed, keep the amplifier up, change strings, and restore the effect before the adversary's link comes back. Expect more than one trip. The friendly MILSATCOM band at 8175-8225 MHz is protected the whole shift - radiate into it and the mission is over.`,
  equipment: [
    '5-metre X-band Jam Antenna',
    '3-metre X-band Look-through Monitor',
    'X-band RF Front End (7000 MHz BUC LO)',
    'Dual Jam Exciters (JAM-A primary, JAM-B backup) on a Shared HPA',
    'EA Assessment Console',
  ],
  settings: {
    isSync: true,
    groundStations: [sandstormGroundStation],
    satellites: [cobalt4Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-11-06',
    scenarioStartWallTime: '10:30:00',
    missionBriefUrl: 'https://docs.signalrange.space/campaign-4/scenario-2?content-only=true&dark=true',
    electronicAttack: {
      groundStationId: 'SS-01',
      targetNoradId: 90042,
      jamAntennaIndex: 0,
      victimCarrierPowerDbm: 6,
      targetUplinkLowHz: 8100e6,
      targetUplinkHighHz: 8150e6,
      targetPolarization: 'H',
      jamPathGainDb: -20,
      pointingToleranceDeg: 5,
      effectiveJtoSDb: 6,
    },
    protectedFrequencies: [
      {
        id: 'friendly-milsatcom',
        label: 'FRIENDLY MILSATCOM uplink (8175-8225 MHz)',
        minHz: 8175e6,
        maxHz: 8225e6,
      },
    ],
    hardwareFaultEvents: [
      {
        id: 'jam-a-trip',
        groundStationId: 'SS-01',
        transmitterIndex: 0,
        modemNumber: 1,
        startTime: 480,
        label: 'JAM-A exciter over-temperature trip',
      },
      {
        id: 'jam-b-trip',
        groundStationId: 'SS-01',
        transmitterIndex: 0,
        modemNumber: 2,
        startTime: 840,
        label: 'JAM-B exciter over-temperature trip',
      },
    ],
  },
  objectives: [
    {
      id: 'acknowledge-tasking',
      nice: ['K0645', 'K0737'],
      title: 'Acknowledge the Tasking Order',
      description: 'Open the shift package and confirm the rules of engagement for the window. The protected band is armed from the moment you radiate.',
      groundStation: 'SS-01',
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Shift Package Read',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Rules of Engagement',
          params: {
            question:
              'The tasking order denies the COBALT-4 service uplink at 8125 MHz. FRIENDLY MILSATCOM uplinks in 8175-8225 MHz through the same slot of sky. Which of these ends the mission immediately?',
            options: [
              'Any jam waveform overlapping 8175-8225 MHz, for any duration',
              'Letting J/S fall below 6 dB while a string is tripped, for any duration',
              'Changing exciters without disabling the HPA first, on either string',
              'Running the monitor aperture off the target, for more than a few seconds',
            ],
            correctIndex: 0,
            explanation:
              'Radiating into friendly SATCOM is fratricide. A lapse in J/S costs you the effect and points; a protected-band hit costs you the mission. Keep the jam on 8125 MHz at 5 MHz wide and it stays 48 MHz clear of the edge.',
            character: Character.SYSTEM,
            pointPenalty: 2,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'coordinate-apertures',
      nice: ['S0421', 'K1032'],
      title: 'Coordinate the Apertures',
      description:
        "The jam antenna is already trained on COBALT-4. The monitor aperture was stowed for last night's wind hold - slew it back onto the bird (azimuth 175, elevation 50) so you have look-through for the whole window.",
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['acknowledge-tasking'],
      conditions: [
        {
          type: 'antenna-position',
          description: 'Jam Antenna on Target',
          params: { equipmentIndex: 0, azimuth: 175, elevation: 50, tolerance: 3 },
          mustMaintain: true,
        },
        {
          type: 'antenna-position',
          description: 'Monitor Antenna on Target',
          params: { equipmentIndex: 1, azimuth: 175, elevation: 50, tolerance: 3 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'establish-denial',
      nice: ['S0421', 'K0737', 'K1032'],
      title: 'Establish the Denial Effect',
      description: 'Enable the jam HPA, key the primary string, and drive the target link to DENIED on the EA Assessment tab (J/S at or above 6 dB).',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['coordinate-apertures'],
      conditions: [
        {
          type: 'hpa-enabled',
          description: 'Jam HPA Enabled',
          params: { equipmentIndex: 0 },
          mustMaintain: false,
        },
        {
          type: 'tx-modem-transmitting',
          description: 'Primary String (JAM-A, Modem 1) Keyed',
          params: { modemNumber: 1 },
          mustMaintain: false,
        },
        {
          type: 'jamming-uplink-active',
          description: 'Jam Waveform in Target Band',
          params: { requiresObservation: true, observationTab: 'ea-assessment' },
          mustMaintain: false,
        },
        {
          type: 'jamming-effective',
          description: 'Target Link Denied (J/S >= 6 dB)',
          params: { requiresObservation: true, observationTab: 'ea-assessment' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'hold-primary',
      nice: ['T0153', 'K0740'],
      title: 'Hold the Blackout',
      description:
        'The adversary ground segment will step its carrier up to punch through. Keep the amplifier up and J/S at or above 6 dB for two continuous minutes - any lapse restarts the clock.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['establish-denial'],
      conditions: [
        {
          type: 'hpa-enabled',
          description: 'Jam HPA Held Enabled',
          params: { equipmentIndex: 0 },
          mustMaintain: true,
          maintainDuration: 120,
        },
        {
          type: 'jamming-effective',
          description: 'Denial Held 120 s (J/S >= 6 dB)',
          params: { requiresObservation: true, observationTab: 'ea-assessment' },
          mustMaintain: true,
          maintainDuration: 120,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'detect-first-trip',
      nice: ['S0648', 'T0153'],
      title: 'Recognise the Lapse',
      description: 'Watch the EA Assessment status and the transmitter panel. The moment the primary string (JAM-A, modem 1) stops radiating, the blackout is lapsing.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['hold-primary'],
      conditions: [
        {
          type: 'tx-modem-not-transmitting',
          description: 'JAM-A (Modem 1) Down',
          params: { modemNumber: 1 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'failover-backup',
      nice: ['T0081', 'S0582', 'S0421'],
      title: 'Diagnose and Fail Over',
      description:
        'Read the panel before you act: which module tripped? Keep the amplifier up, select the backup string (JAM-B, modem 2), key it, and restore DENIED before the adversary link recovers.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['detect-first-trip'],
      timeLimitSeconds: 180,
      timerStartTrigger: 'on-activate',
      timePenalty: {
        elapsedTimeThreshold: 90,
        pointsDeducted: 5,
        message: 'The adversary link was back up for over ninety seconds before you restored the effect.',
      },
      conditions: [
        {
          type: 'status-check',
          description: 'Fault Isolation',
          params: {
            question:
              'Transmitter panel: JAM-A shows FAULT. HPA reports enabled, output nominal, no overdrive. BUC unmuted and reference locked. Jam antenna still on target. What failed, and what is the recovery?',
            options: [
              'The JAM-A exciter tripped; the amplifier is healthy - leave the HPA enabled and switch to JAM-B',
              'The HPA tripped; the exciter is healthy - disable the HPA, wait for cool-down, then re-key JAM-A',
              'The BUC lost reference lock; the exciter is healthy - power-cycle the BUC and re-key JAM-A',
              'The jam antenna lost pointing; the chain is healthy - re-slew before touching the transmit chain',
            ],
            correctIndex: 0,
            explanation:
              'The FAULT indicator is on the exciter and every amplifier and BUC alarm is clear. Both strings drive the same HPA, so the fast recovery is to leave it enabled and bring the backup exciter up behind it. Disabling the HPA only extends the lapse.',
            character: Character.SYSTEM,
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
        {
          type: 'hpa-enabled',
          description: 'Jam HPA Still Enabled',
          params: { equipmentIndex: 0 },
          mustMaintain: false,
        },
        {
          type: 'tx-active-modem',
          description: 'Backup String (JAM-B, Modem 2) Selected',
          params: { modemNumber: 2 },
          mustMaintain: false,
        },
        {
          type: 'tx-modem-transmitting',
          description: 'JAM-B Keyed',
          params: { modemNumber: 2 },
          mustMaintain: false,
        },
        {
          type: 'jamming-effective',
          description: 'Blackout Restored (J/S >= 6 dB)',
          params: { requiresObservation: true, observationTab: 'ea-assessment' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'hold-backup',
      nice: ['T0153', 'K0740'],
      title: 'Hold on the Backup',
      description: 'JAM-B is carrying the effect on an amplifier that has been hot for ten minutes. Hold J/S at or above 6 dB for another two continuous minutes.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['failover-backup'],
      conditions: [
        {
          type: 'hpa-enabled',
          description: 'Jam HPA Held Enabled',
          params: { equipmentIndex: 0 },
          mustMaintain: true,
          maintainDuration: 120,
        },
        {
          type: 'jamming-effective',
          description: 'Denial Held 120 s (J/S >= 6 dB)',
          params: { requiresObservation: true, observationTab: 'ea-assessment' },
          mustMaintain: true,
          maintainDuration: 120,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'detect-second-trip',
      nice: ['S0648', 'T0081'],
      title: 'Second Trip',
      description: 'Stay on the assessment. If the backup string (JAM-B, modem 2) drops as well, you are out of spare exciters - and the window is not over.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['hold-backup'],
      conditions: [
        {
          type: 'tx-modem-not-transmitting',
          description: 'JAM-B (Modem 2) Down',
          params: { modemNumber: 2 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'recover-string',
      nice: ['S0582', 'S0421'],
      title: 'Reset a String and Recover',
      description:
        'Both exciters have tripped once. A tripped exciter stays latched until you run its FAULT RESET with the string un-keyed. Select a cooled string, clear its fault, key it, and restore DENIED.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['detect-second-trip'],
      timeLimitSeconds: 150,
      timerStartTrigger: 'on-activate',
      timePenalty: {
        elapsedTimeThreshold: 75,
        pointsDeducted: 5,
        message: 'The adversary link recovered for over seventy-five seconds during the second lapse.',
      },
      conditions: [
        {
          type: 'status-check',
          description: 'Recovery Procedure',
          params: {
            question:
              'JAM-B now shows FAULT as well; JAM-A has been sitting un-keyed since its own trip. The HPA is still enabled and nominal. What restores the effect fastest without damaging anything?',
            options: [
              'Select a cooled string, run FAULT RESET with it un-keyed, confirm FAULT clears, then key it with the HPA left enabled',
              'Power-cycle the HPA, wait for it to come back nominal, then key JAM-A - a fresh amplifier start clears latched exciter faults',
              'Key JAM-B again immediately, keep it keyed through the FAULT, then wait - the trip clears itself once the string is transmitting',
              'Select whichever string comes up, widen its jam bandwidth, then key it - the extra width makes up for the time already lost',
            ],
            correctIndex: 0,
            explanation:
              'The fault is on the exciter and it latches. Reset only takes with the string un-keyed and needs a few seconds to clear. The HPA never failed - leave it up. Widening the waveform toward 8175 MHz is the one thing that can end the mission outright.',
            character: Character.SYSTEM,
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
        {
          type: 'hpa-enabled',
          description: 'Jam HPA Still Enabled',
          params: { equipmentIndex: 0 },
          mustMaintain: false,
        },
        {
          type: 'tx-modem-transmitting',
          description: 'A Jam String Keyed',
          mustMaintain: false,
        },
        {
          type: 'jamming-effective',
          description: 'Blackout Restored (J/S >= 6 dB)',
          params: { requiresObservation: true, observationTab: 'ea-assessment' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'hold-to-recall',
      nice: ['T0153', 'K0740'],
      title: 'Hold to the Recall',
      description: 'Carry the effect to the end of the window: three continuous minutes at or above 6 dB J/S with the amplifier up.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['recover-string'],
      conditions: [
        {
          type: 'hpa-enabled',
          description: 'Jam HPA Held Enabled',
          params: { equipmentIndex: 0 },
          mustMaintain: true,
          maintainDuration: 180,
        },
        {
          type: 'jamming-effective',
          description: 'Denial Held 180 s (J/S >= 6 dB)',
          params: { requiresObservation: true, observationTab: 'ea-assessment' },
          mustMaintain: true,
          maintainDuration: 180,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'cease-fire',
      nice: ['K0645', 'S0421'],
      title: 'Cease Fire',
      description: 'Recall received. Stand the chain down in order: disable the HPA, then un-key the exciter, and confirm nothing is radiating.',
      groundStation: 'SS-01',
      isOptional: true,
      prerequisiteObjectiveIds: ['hold-to-recall'],
      conditions: [
        {
          type: 'hpa-disabled',
          description: 'Jam HPA Disabled',
          params: { equipmentIndex: 0 },
          mustMaintain: true,
        },
        {
          type: 'tx-modem-not-transmitting',
          description: 'Active Jam String Un-keyed',
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
  ],
};
