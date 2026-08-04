import type { ScenarioData } from '@app/ScenarioData';
import { Character } from '@app/modal/character-enum';
import { sandstormGroundStation } from './ground-stations';
import { cobalt4Satellite } from './satellites';

/**
 * Campaign 4 (9th EWS / Counter Communications) - "Blackout" sandbox
 *
 * Validation level for the electronic-attack feature set:
 * - X-band electronic-attack station (jam + look-through monitor apertures),
 * - multi-antenna coordination (each aperture targeted by equipmentIndex),
 * - player-driven SATCOM denial: raise J/S at the target transponder until the
 *   adversary downlink is denied (EA Assessment tab),
 * - redundant transmit strings: a scheduled fault trips the primary string and
 *   the operator fails over to the backup,
 * - own-force deconfliction: jamming the protected friendly band is an instant
 *   mission fail (armed via settings.protectedFrequencies).
 *
 * The RF chain is pre-tuned to the COBALT-4 uplink (8125 MHz); the operator
 * coordinates the apertures, keys up the jam, drives the target link down, then
 * fails over to the backup string when the primary trips.
 */
export const ccsScenario1Data: ScenarioData = {
  id: 'ccs-scenario1',
  url: 'ccs/scenarios/ccs-scenario1',
  imageUrl: 'nats/21/card.png',
  number: 0,
  isDisabled: false,
  difficulty: 'advanced',
  title: 'Blackout',
  subtitle: 'X-band SATCOM Denial Trainer',
  duration: 'Unlimited',
  missionType: 'Sandbox',
  description: `COBALT-4 is an adversary X-band SATCOM relay running a service carrier at 8125 MHz. Your transportable EA site, SANDSTORM, has two apertures: a 5-metre jammer already trained on the target and a 3-metre look-through monitor for battle-damage assessment.
  <br/><br/>Coordinate both apertures onto COBALT-4, key up the jam waveform into the target transponder, and drive the jam-to-signal ratio high enough to deny the downlink. Watch the EA Assessment tab for effect. When the primary transmit string trips, fail over to the backup string to hold the blackout - and keep your jam off the protected friendly band at all times.`,
  equipment: [
    '5-metre X-band Jam Antenna',
    '3-metre X-band Look-through Monitor',
    'X-band RF Front End (7000 MHz BUC LO)',
    'Dual Jam Transmit Strings (primary + backup)',
    'EA Assessment Console',
  ],
  settings: {
    isSync: true,
    groundStations: [sandstormGroundStation],
    satellites: [cobalt4Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-11-05',
    scenarioStartWallTime: '02:00:00',
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
        startTime: 150,
        label: 'JAM-A exciter thermal trip',
      },
    ],
  },
  objectives: [
    {
      id: 'confirm-roe',
      title: 'Confirm Rules of Engagement',
      description: 'X-band (7.9-8.4 GHz uplink) is a restricted military band. Confirm the deconfliction rule before you radiate.',
      groundStation: 'SS-01',
      conditions: [
        {
          type: 'status-check',
          description: 'Deconfliction Rule',
          params: {
            question: 'A friendly MILSATCOM terminal uplinks in 8175-8225 MHz. Your target COBALT-4 uses 8125 MHz. What must you never do?',
            options: [
              'Let the jam waveform overlap the friendly 8175-8225 MHz band',
              'Transmit below the target power to save the HPA',
              'Point the monitor antenna away from the target',
              'Use the backup transmit string first',
            ],
            correctIndex: 0,
            explanation: 'Radiating over friendly SATCOM is fratricide and an instant mission fail. Keep the jam on the target uplink (8125 MHz) and clear of the protected band.',
            character: Character.SYSTEM,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'coordinate-apertures',
      title: 'Coordinate the Apertures',
      description: 'The jam antenna is already trained on COBALT-4. Slew the look-through monitor (antenna 2) onto the target as well - azimuth 175, elevation 50.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['confirm-roe'],
      // COBALT-4 sits at 115.1W and is seen from SANDSTORM at az 174.9 / el
      // 50.4, held to within 0.05 deg for the scenario (see ccs/satellites.ts).
      // The angles were az 175 / el 30 while the bird had no ephemeris; that
      // pair is not realizable for a GEO satellite from 34 deg N.
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
      title: 'Establish the Denial Effect',
      description: 'Enable the jam HPA and key up the primary string, then open the EA Assessment tab and drive the target link to DENIED (J/S at or above 6 dB).',
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
      points: 20,
    },
    {
      id: 'deconfliction-check',
      title: 'Verify Deconfliction',
      description: 'Confirm your jam frequency is clear of the protected friendly band.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['establish-denial'],
      conditions: [
        {
          type: 'status-check',
          description: 'Frequency Deconfliction',
          params: {
            question: 'Your jam sits at 8125 MHz with 5 MHz of bandwidth (8122.5-8127.5 MHz). Is it deconflicted from the protected 8175-8225 MHz friendly band?',
            options: [
              'Yes - the jam is well clear of the protected band',
              'No - the jam overlaps the protected band',
              'Only if the HPA back-off is increased',
              'Only if the monitor antenna is stowed',
            ],
            correctIndex: 0,
            explanation: 'At 8125 MHz ±2.5 MHz the jam is ~48 MHz clear of the 8175 MHz protected edge - deconflicted. Widening the barrage toward 8175 MHz would risk fratricide.',
            character: Character.SYSTEM,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'failover-backup',
      title: 'Fail Over to the Backup String',
      description: 'The primary jam string (modem 1) has tripped and the blackout is lapsing. Select the backup string (modem 2), key it up, and restore the denial effect.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['deconfliction-check'],
      timeLimitSeconds: 180,
      timerStartTrigger: 'on-activate',
      timePenalty: {
        elapsedTimeThreshold: 90,
        pointsDeducted: 5,
        message: 'The adversary link recovered during the failover gap.',
      },
      conditions: [
        {
          type: 'tx-active-modem',
          description: 'Backup String (Modem 2) Selected',
          params: { modemNumber: 2 },
          mustMaintain: false,
        },
        {
          type: 'tx-modem-transmitting',
          description: 'Backup String Transmitting',
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
      id: 'cease-fire',
      title: 'Cease Fire',
      description: 'On the recall order, stop the jam cleanly: disable the HPA before you stop the exciter, then confirm transmission has ceased.',
      groundStation: 'SS-01',
      isOptional: true,
      prerequisiteObjectiveIds: ['failover-backup'],
      conditions: [
        {
          type: 'tx-modem-not-transmitting',
          description: 'Jam String Stopped',
          params: { modemNumber: 2 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
  ],
};
