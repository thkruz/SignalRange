import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from "@app/equipment/antenna/antenna-config-keys";
import { Receiver } from '@app/equipment/receiver/receiver';
import { Transmitter } from '@app/equipment/transmitter/transmitter';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm, FECType, Hertz, MHz, ModulationType, RfFrequency } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { createRfFrontEnd } from '../rf-front-end-factory';
import { vermontGroundStation } from './ground-stations';
import { natsHtmlLayout } from './html-layout';
import { ses10Satellite, tidemark1Satellite } from './satellites';

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
        ...vermontGroundStation,
        ...{
          antennasState: [
            {
              // Antenna already tracking TIDEMARK-1 in program-track mode
              isPowered: true,
              azimuth: 161.8 as Degrees, // Locked on TIDEMARK-1
              elevation: 34.2 as Degrees,
              polarization: 14 as Degrees,
              trackingMode: 'program-track',
              isBeaconLocked: true,
              targetSatelliteId: 61525,
              targetAzimuth: 161.8 as Degrees,
              targetElevation: 34.2 as Degrees,
              targetPolarization: 14 as Degrees,
              slewing: false,
              beaconCN: 10.5 as dB,
              beaconFrequencyHz: 3902.5e6 as Hertz,
              isLocked: true,
            } as Partial<AntennaState>,
          ],
          rfFrontEnds: [
            createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
              buc: { loFrequency: 2225 as MHz, outputPower: 10 as dBm },
              hpa: { isHpaEnabled: true, backOff: 10 as dBm },
              filter: { bandwidthIndex: 3 },
              lnb: { noiseTemperature: 65, temperature: 45 },
              gpsdo: {
                temperature: 70,
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
        }
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
            gpsdo: {
              gnssSignalPresent: false,
              isGnssSwitchUp: false,
              isLocked: false,
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
      tidemark1Satellite,
      ses10Satellite,
    ],
    weatherEvents: [
      {
        id: 'vermont-blizzard',
        groundStationId: 'VT-01',
        type: 'snow',
        severity: 'severe',
        startTime: 120, // 2 minutes into scenario
        duration: 7200, // 2 hours
        linkMarginDegradation: 8, // dB - exceeds acceptable threshold
      }
    ],
    trafficOwnership: [
      {
        satelliteNoradId: 61525, // TIDEMARK-1
        initialOwnerId: 'VT-01', // Vermont initially owns traffic
      }
    ],
    layout: natsHtmlLayout,
    missionBriefUrl: 'https://docs.signalrange.space/scenarios/scenario-3?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
  },
  objectives: [
    {
      id: 'enable-vt01-heater',
      title: 'Phase 1: Enable VT-01 Feed Heater',
      description: 'The blizzard is approaching. Enable the feed heater on VT-01 to prevent ice buildup on the antenna feed.',
      groundStation: 'VT-01',
      timeLimitSeconds: 120, // 2 minutes
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'feed-heater-enabled',
          description: 'VT-01 Feed Heater Enabled',
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'switch-to-maine',
      title: 'Phase 2: Select Maine Ground Station',
      description: 'Switch to ME-02 in the ground station selector.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['enable-vt01-heater'],
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
      title: 'Phase 3: Verify ME-02 Equipment Status',
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
      title: 'Phase 4: Point ME-02 Antenna at TIDEMARK-1',
      description: 'Command antenna to Az: 215.8°, El: 23.1° (TIDEMARK-1 from Maine location).',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-maine-equipment'],
      conditions: [
        {
          type: 'antenna-position',
          description: 'TIDEMARK-1 Position Commanded from Maine',
          params: {
            azimuth: 161.8 as Degrees,
            elevation: 34.2 as Degrees,
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
      title: 'Phase 5: Configure ME-02 LNB',
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
      title: 'Phase 6: Configure ME-02 Receiver Modem',
      description: 'Set modem to receive TIDEMARK-1 carrier (Freq: 1,432 MHz, BW: 36 MHz, QPSK, FEC: 3/4).',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['configure-maine-lnb'],
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'RX Frequency Set to 1,432 MHz',
          params: {
            frequency: 1432e6 as RfFrequency,
            frequencyTolerance: 1e6 as Hertz, // 1 MHz tolerance
          },
          mustMaintain: false,
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'rx-modem-bandwidth-set',
          description: 'Bandwidth Set to 36 MHz',
          params: {
            bandwidth: 36e6 as Hertz,
            bandwidthTolerance: 1e6 as Hertz,
          },
          mustMaintain: false,
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'rx-modem-modulation-set',
          description: 'Modulation Set to QPSK',
          params: {
            modulation: 'QPSK' as ModulationType,
          },
          mustMaintain: false,
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'rx-modem-fec-set',
          description: 'FEC Set to 3/4',
          params: {
            fec: '3/4' as FECType,
          },
          mustMaintain: false,
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'verify-maine-lock',
      title: 'Phase 7: Verify ME-02 Receiver Lock',
      description: 'Confirm modem has achieved carrier lock with acceptable C/N ratio.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['configure-maine-modem'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Modem Locked',
          mustMaintain: false,
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Ratio ≥ 10 dB',
          params: {
            minCNRatio: 10,
          },
          mustMaintain: false,
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'execute-handover',
      title: 'Phase 8: Execute Traffic Handover',
      description: 'Transfer active traffic from VT-01 to ME-02. Monitor for service continuity.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-maine-lock'],
      conditions: [
        {
          type: 'traffic-transferred',
          description: 'Traffic Successfully Transferred to ME-02',
          params: {
            sourceStation: 'VT-01',
            targetStation: 'ME-02',
            satelliteId: 61525, // TIDEMARK-1
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
      id: 'stow-vermont-antenna',
      title: 'Phase 9: Stow VT-01 Antenna',
      description: 'Set VT-01 antenna to stow mode to protect it during the blizzard.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['execute-handover'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'VT-01 Antenna Set to Stow Mode',
          params: {
            trackingMode: 'stow',
          },
          mustMaintain: false,
        },
        {
          type: 'antenna-position',
          description: 'VT-01 Antenna in Stow Position',
          params: {
            azimuth: 0 as Degrees,
            elevation: 90 as Degrees,
            tolerance: 1 as Degrees,
          },
          mustMaintain: false,
        }
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
      'stow-vermont-antenna': {
        text: `
        <p>
          Vermont antenna stowed safely. That's the procedure complete.
        </p>
        <p>
          Maine's serving the customer, Vermont's protected from the weather. Textbook handover.
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
