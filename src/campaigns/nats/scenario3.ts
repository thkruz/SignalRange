import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from "@app/equipment/antenna/antenna-config-keys";
import { Receiver } from '@app/equipment/receiver/receiver';
import { Satellite } from '@app/equipment/satellite/satellite';
import { Transmitter } from '@app/equipment/transmitter/transmitter';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from "@app/SignalOrigin";
import type { dB, dBi, dBm, FECType, Hertz, MHz, ModulationType, RfFrequency } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { createRfFrontEnd } from '../rf-front-end-factory';
import { vermontGroundStation } from './ground-stations';

/**
 * NATS Level 3: "Weather Emergency Handover"
 *
 * Phase: Tutorial (final tutorial level)
 * Time Pressure: Mild (30 minutes before weather degrades link)
 * Calculation Required: None (values provided)
 * New UI Elements: Ground station switcher, RX/TX modem panels, network status
 *
 * Premise: A blizzard is approaching Vermont. Hand TIDEMARK-1 traffic from VT-01
 * to the backup site in Maine (ME-02) before weather degrades the link. First
 * exposure to multi-site operations and modem configuration.
 */

export const scenario3Data: ScenarioData = {
  id: 'scenario3',
  prerequisiteScenarioIds: [],
  url: 'nats/scenarios/scenario3',
  imageUrl: 'nats/3/card.png',
  number: 3,
  title: 'Level 3: "Weather Emergency Handover"',
  subtitle: 'Multi-Site Operations',
  duration: '25-30 min',
  difficulty: 'beginner',
  missionType: 'Tutorial',
  description: `Heavy snow is forecast for Vermont in 30 minutes. The link margin to TIDEMARK-1 will degrade below operational threshold during the storm. You need to hand traffic from VT-01 to the backup ground station in Maine (ME-02) before the weather window closes.<br><br>Catherine from network operations has coordinated with the NOC. You'll configure the Maine site remotely, monitor both sites simultaneously during handover, and ensure graceful service continuity.<br><br>First time touching modem configuration panels. First time managing multiple ground stations. This is routine procedure - weather handovers happen regularly in the Northeast.`,
  equipment: [
    '2× 9-meter C-band Antennas (VT-01, ME-02)',
    '2× RF Front Ends',
    '2× Spectrum Analyzers',
    'RX/TX Modems',
    'Network Status Monitor',
  ],
  settings: {
    isSync: true,
    missionTimeLimitSeconds: 1800, // 30 minutes
    groundStations: [
      {
        id: 'VT-01',
        name: 'Vermont Ground Station',
        location: {
          latitude: 44.5588,
          longitude: -72.5778,
          elevation: 350,
        },
        antennas: [ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK],
        antennasState: [
          {
            // Currently serving TIDEMARK-1
            isPowered: true,
            azimuth: 214.2 as Degrees,
            elevation: 24.8 as Degrees,
            polarization: 0 as Degrees,
            isTracking: true,
            trackingMode: 'step-track',
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            buc: { loFrequency: 2225 as MHz, outputPower: 10 as dBm },
            hpa: { isHpaEnabled: true, outputPower: 100 as dBm },
            filter: { bandwidthIndex: 3 },
            lnb: { noiseTemperature: 65, temperature: 45 },
            gpsdo: {
              temperature: 65,
              satelliteCount: 12,
              utcAccuracy: 15,
              lockDuration: 43200,
              frequencyAccuracy: 1e-12,
              allanDeviation: 5e-13,
              phaseNoise: -140,
              active10MHzOutputs: 5,
              operatingHours: 43200,
            },
          }),
        ],
        spectrumAnalyzers: [
          {
            referenceLevel: -50,
            centerFrequency: 3947.8e6 as Hertz,
            span: 10e6 as Hertz,
            rbw: 10e3 as Hertz,
            minAmplitude: -170,
            maxAmplitude: 0,
            scaleDbPerDiv: 12 as dB,
            screenMode: 'both',
            inputUnit: 'MHz',
            inputValue: '',
            traces: [
              { isVisible: true, isUpdating: true, mode: 'clearwrite' },
              { isVisible: false, isUpdating: false, mode: 'clearwrite' },
              { isVisible: false, isUpdating: false, mode: 'clearwrite' },
            ],
            selectedTrace: 1,
          }
        ],
        transmitters: [Transmitter.getDefaultState()],
        receivers: [Receiver.getDefaultState()],
      },
      {
        id: 'ME-02',
        name: 'Maine Backup Station',
        location: {
          latitude: 45.2538,
          longitude: -69.7657,
          elevation: 180,
        },
        antennas: [ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK],
        antennasState: [
          {
            // Stowed, needs to be configured
            isPowered: true,
            azimuth: 0 as Degrees,
            elevation: 90 as Degrees,
            polarization: 0 as Degrees,
            isTracking: false,
            trackingMode: 'manual',
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            buc: { isPowered: false, loFrequency: 2225 as MHz, outputPower: 0 as dBm, isMuted: true, isExtRefLocked: false },
            hpa: { isPowered: false, outputPower: 0 as dBm },
            filter: { isPowered: false, bandwidthIndex: 0 },
            lnb: {
              isPowered: false,
              gain: 0 as dB,
              noiseTemperature: 25,
              noiseTemperatureStabilizationTime: 180,
              isExtRefLocked: false,
              temperature: 15,
              thermalStabilizationTime: 180,
            },
            gpsdo: {
              temperature: 60,
              satelliteCount: 10,
              utcAccuracy: 20,
              lockDuration: 86400,
              frequencyAccuracy: 1e-12,
              allanDeviation: 6e-13,
              phaseNoise: -138,
              active10MHzOutputs: 0,
              operatingHours: 86400,
              agingRate: 1.2e-10,
            },
          }),
        ],
        spectrumAnalyzers: [
          {
            referenceLevel: 0,
            centerFrequency: 1e9 as Hertz,
            span: 100e6 as Hertz,
            rbw: 1e6 as Hertz,
            minAmplitude: -170,
            maxAmplitude: 0,
            scaleDbPerDiv: 17 as dB,
            screenMode: 'both',
            inputUnit: 'MHz',
            inputValue: '',
            traces: [
              { isVisible: true, isUpdating: true, mode: 'clearwrite' },
              { isVisible: false, isUpdating: false, mode: 'clearwrite' },
              { isVisible: false, isUpdating: false, mode: 'clearwrite' },
            ],
            selectedTrace: 1,
          }
        ],
        transmitters: [Transmitter.getDefaultState()],
        receivers: [Receiver.getDefaultState()],
      },
    ],
    satellites: [
      new Satellite(
        1,
        [
          {
            signalId: 'tidemark-1-beacon',
            serverId: 1,
            noradId: 1,
            frequency: 3947.8e6 as RfFrequency,
            polarization: 'H',
            power: -95 as dBm,
            bandwidth: 1e3 as Hertz,
            modulation: 'CW' as ModulationType,
            fec: 'none' as FECType,
            feed: null,
            isDegraded: false,
            origin: SignalOrigin.SATELLITE_TX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          },
          {
            signalId: 'tidemark-1-carrier',
            serverId: 1,
            noradId: 1,
            frequency: 3952.5e6 as RfFrequency,
            polarization: 'H',
            power: -87 as dBm,
            bandwidth: 5e6 as Hertz,
            modulation: '16APSK' as ModulationType,
            fec: '3/4' as FECType,
            feed: 'maritime-data.mp4',
            isDegraded: false,
            origin: SignalOrigin.SATELLITE_TX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          }
        ],
        [],
        {
          az: 214.2 as Degrees,
          el: 24.8 as Degrees,
          frequencyOffset: 2.225e9 as Hertz,
        }
      ),
    ],
    weatherEvents: [
      {
        id: 'vermont-blizzard',
        groundStationId: 'VT-01',
        type: 'snow',
        severity: 'severe',
        startTime: 1800, // 30 minutes
        duration: 7200, // 2 hours
        linkMarginDegradation: 8, // dB - exceeds acceptable threshold
      }
    ],
  },
  objectives: [
    {
      id: 'switch-to-maine',
      title: 'Phase 1: Select Maine Ground Station',
      description: 'Switch to ME-02 in the ground station selector.',
      groundStation: 'ME-02',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'ME-02 Selected in Switcher',
          params: {
            groundStationId: 'ME-02',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'verify-maine-equipment',
      title: 'Phase 2: Verify ME-02 Equipment Status',
      description: 'Check that GPSDO is locked and ready for operations.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['switch-to-maine'],
      conditions: [
        {
          type: 'gpsdo-locked',
          description: 'ME-02 GPSDO Verified Locked',
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'configure-maine-antenna',
      title: 'Phase 3: Point ME-02 Antenna at TIDEMARK-1',
      description: 'Command antenna to Az: 215.8°, El: 23.1° (TIDEMARK-1 from Maine location).',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-maine-equipment'],
      conditions: [
        {
          type: 'antenna-position-command',
          description: 'TIDEMARK-1 Position Commanded from Maine',
          params: {
            azimuth: 215.8 as Degrees,
            elevation: 23.1 as Degrees,
            tolerance: 1.0 as Degrees,
          },
          mustMaintain: false,
        },
        {
          type: 'antenna-position-reached',
          description: 'Antenna On Target',
          params: {
            azimuth: 215.8 as Degrees,
            elevation: 23.1 as Degrees,
            tolerance: 0.5 as Degrees,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'configure-maine-lnb',
      title: 'Phase 4: Configure ME-02 LNB',
      description: 'Power and configure LNB to match VT-01 settings (LO: 5,150 MHz, Gain: 55 dB).',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['configure-maine-antenna'],
      conditions: [
        {
          type: 'equipment-powered',
          description: 'LNB Powered',
          params: {
            equipment: 'lnb',
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-lo-set',
          description: 'LNB LO Set to 5,150 MHz',
          params: {
            loFrequency: 5150 as MHz,
            loFrequencyTolerance: 0,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-gain-set',
          description: 'LNB Gain Set to 55 dB',
          params: {
            gain: 55,
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
      points: 15,
    },
    {
      id: 'configure-maine-modem',
      title: 'Phase 5: Configure ME-02 Receiver Modem',
      description: 'Set modem to receive TIDEMARK-1 carrier (Freq: 3,952.5 MHz, SR: 5 Msps, FEC: 3/4).',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['configure-maine-lnb'],
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'RX Frequency Set to 3,952.5 MHz',
          params: {
            frequency: 3952.5e6 as RfFrequency,
            tolerance: 1e3 as Hertz,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'rx-modem-symbol-rate-set',
          description: 'Symbol Rate Set to 5 Msps',
          params: {
            symbolRate: 5e6 as Hertz,
            tolerance: 1e3 as Hertz,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'rx-modem-fec-set',
          description: 'FEC Set to 3/4',
          params: {
            fec: '3/4' as FECType,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'verify-maine-lock',
      title: 'Phase 6: Verify ME-02 Receiver Lock',
      description: 'Confirm modem has achieved carrier lock with acceptable C/N ratio.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['configure-maine-modem'],
      conditions: [
        {
          type: 'rx-modem-locked',
          description: 'Receiver Modem Locked',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'rx-modem-cn-ratio',
          description: 'C/N Ratio ≥ 10 dB',
          params: {
            minCnRatio: 10 as dB,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'coordinate-handover',
      title: 'Phase 7: Coordinate Traffic Handover with NOC',
      description: 'Notify network operations center that ME-02 is ready for traffic.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-maine-lock'],
      conditions: [
        {
          type: 'handover-coordinated',
          description: 'NOC Coordination Complete',
          params: {
            targetGroundStation: 'ME-02',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'execute-handover',
      title: 'Phase 8: Execute Traffic Handover',
      description: 'Transfer active traffic from VT-01 to ME-02. Monitor for service continuity.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['coordinate-handover'],
      conditions: [
        {
          type: 'traffic-transferred',
          description: 'Traffic Successfully Transferred to ME-02',
          params: {
            sourceStation: 'VT-01',
            targetStation: 'ME-02',
          },
          mustMaintain: false,
        },
        {
          type: 'service-continuity',
          description: 'No Packet Loss During Handover',
          params: {
            maxPacketLoss: 0.1, // Percent
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'verify-handover-complete',
      title: 'Phase 9: Verify Handover Success',
      description: 'Confirm ME-02 is serving traffic and VT-01 link margin is safe before weather.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['execute-handover'],
      conditions: [
        {
          type: 'ground-station-active',
          description: 'ME-02 Serving Traffic',
          params: {
            groundStationId: 'ME-02',
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'time-remaining',
          description: 'Handover Completed Before Weather Window',
          params: {
            minTimeRemaining: 300, // 5 minutes buffer
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
        Weather forecast shows heavy snow arriving in thirty minutes. Link margin's going to drop eight dB during the storm - well below operational threshold.
      </p>
      <p>
        Catherine's already coordinating with the network ops center. We just need to configure Maine before the weather hits.
      </p>
      <p>
        Switch to ME-02 in the ground station selector. See it? Good. Now let's verify their equipment status before we hand over the traffic.
      </p>
      <p>
        This happens regularly up here. Standard procedure - nothing to stress about. Just work through it methodically.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/3/intro.mp3'),
    },
    objectives: {
      'verify-maine-equipment': {
        text: `
        <p>
          GPSDO's locked at Maine. Good. Point their antenna at TIDEMARK-1.
        </p>
        <p>
          From their location, that's azimuth 215.8, elevation 23.1. Slightly different geometry than from Vermont.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-equipment.mp3'),
      },
      'configure-maine-lnb': {
        text: `
        <p>
          LNB's up. Temperature's climbing from 15 celsius - it's colder in Maine. Wait for stabilization.
        </p>
        <p>
          While that's warming, configure the receiver modem to match Vermont's settings.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-lnb.mp3'),
      },
      'verify-maine-lock': {
        text: `
        <p>
          Maine's got carrier lock. C/N ratio is 11.2 dB - actually slightly better than Vermont right now. Good baseline.
        </p>
        <p>
          Now notify the NOC that we're ready for handover. They'll coordinate the network routing.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-lock.mp3'),
      },
      'execute-handover': {
        text: `
        <p>
          Traffic's transferred. Zero packet loss during the handover - textbook execution.
        </p>
        <p>
          Maine's now serving the customer. Vermont can ride out the storm without impacting service.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-handover.mp3'),
      },
      'verify-handover-complete': {
        text: `
        <p>
          Handover complete with twelve minutes to spare. Well done.
        </p>
        <p>
          That's the tutorial phase finished. You've seen all the equipment panels, you understand the procedures, you can coordinate between sites.
        </p>
        <p>
          Next mission, I'm not giving you the frequency values. You'll need to calculate them yourself. Time to see if you've been paying attention.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/complete.mp3'),
      },
    },
  },
};
