import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from "@app/equipment/antenna/antenna-config-keys";
import { Receiver } from '@app/equipment/receiver/receiver';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from '@app/signal-origin';
import type { dB, dBi, dBm, FECType, Hertz, IfFrequency, MHz, ModulationType, RfFrequency } from '@app/types';
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
  description: `Heavy snow is forecast for Vermont in 30 minutes. The link margin to TIDEMARK-1 will degrade below operational threshold during the storm. You need to hand traffic from VT-01 to the backup ground station in Maine (ME-02) before the weather window closes.<br><br>Catherine from Maine has been recalled to take over operations once the handover is complete. You'll configure the Maine site remotely, monitor both sites simultaneously during handover, and ensure graceful service continuity.<br><br>First time touching modem configuration panels. First time managing multiple ground stations. This is routine procedure - weather handovers happen regularly in the Northeast.`,
  equipment: [
    '2× 9-meter C-band Antennas (VT-01, ME-02)',
    '2× RF Front Ends',
    '2× Spectrum Analyzers',
    'RX/TX Modems',
    'Network Status Monitor',
  ],
  timeLimitSeconds: 30 * 60, // 30 minutes
  settings: {
    isSync: true,
    groundStations: [
      {
        ...vermontGroundStation,
        ...{
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
            lnb: { isPowered: false, noiseTemperature: 300, temperature: 25 },
            buc: { isMuted: true },
            hpa: { isHpaEnabled: false },
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
        transmitters: [{
          activeModem: 1,
          modems: [{
            isPowered: true,
            antenna_id: 1,
            modem_number: 1,
            isFaulted: false,
            isTransmitting: false,
            isTransmittingSwitchUp: false,
            isFaultSwitchUp: false,
            id: 1,
            isLoopback: false,
            ifSignal: {
              signalId: 'TIDEMARK-1-Teleport',
              serverId: 1,
              noradId: 61525, polarization: 'V',
              feed: '',
              isDegraded: false,
              origin: SignalOrigin.TRANSMITTER,
              noiseFloor: null,
              gainInPath: 0 as dBi,
              frequency: 1094e6 as IfFrequency,
              power: -7 as dBm,
              bandwidth: 36e6 as Hertz, // Match payload bandwidth
              modulation: 'QPSK' as ModulationType,
              fec: '3/4' as FECType,
            },
          }],
        }],
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
        startTime: 5, // 2 minutes into scenario
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
      title: 'Activate Weather Protection',
      description: 'Ice accumulation on the antenna feed can degrade signal quality and damage the waveguide. Enable the feed heater on VT-01 before the storm arrives - this prevents ice from forming on critical RF components.',
      groundStation: 'VT-01',
      timeLimitSeconds: 240, // 4 minutes
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
      title: 'Access Backup Site Controls',
      description: 'Use the asset menu on the left to switch to ME-02 (Maine). This gives you control of the backup site equipment while Vermont continues serving traffic.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['enable-vt01-heater'],
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'ME-02 Selected in assets menu',
          params: {
            groundStationId: 'ME-02',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
      timeLimitSeconds: 120, // 2 minutes
    },
    {
      id: 'verify-maine-equipment',
      title: 'Verify Reference Timing',
      description: 'Before configuring any RF equipment, verify the GPSDO is locked and providing stable reference timing. Without accurate frequency reference, the modem cannot maintain carrier lock.',
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
      timeLimitSeconds: 180, // 3 minutes
    },
    {
      id: 'configure-maine-antenna',
      title: 'Acquire TIDEMARK-1 from Maine',
      description: 'Point the Maine antenna at TIDEMARK-1. The look angles differ from Vermont due to the 150-mile separation between sites. Use program-track mode with Az: 164.2°, El: 23.1°.',
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
      timeLimitSeconds: 300, // 5 minutes
    },
    {
      id: 'configure-maine-lnb',
      title: 'Power Up Receive Chain',
      description: 'Power on the LNB and configure it to match Vermont settings: LO frequency 5,250 MHz, Gain 60 dB. Wait for thermal stabilization before proceeding - cold LNBs have unstable noise figures.',
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
      points: 15,
      timeLimitSeconds: 180, // 3 minutes
    },
    {
      id: 'configure-maine-modem',
      title: 'Configure Receiver Modem',
      description: 'Set the receiver modem parameters to match the TIDEMARK-1 carrier: Center Frequency 1,532 MHz (L-band IF), Bandwidth 36 MHz, QPSK modulation, FEC rate 3/4. These must match Vermont exactly for seamless handover.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['configure-maine-lnb'],
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'RX Frequency Set to 1,532 MHz',
          params: {
            frequency: 1532e6 as RfFrequency,
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
      timeLimitSeconds: 300, // 5 minutes
    },
    {
      id: 'verify-maine-lock',
      title: 'Confirm Signal Acquisition',
      description: 'Wait for the receiver modem to achieve carrier lock and verify C/N ratio meets operational threshold (≥10 dB). Lock without adequate C/N means marginal signal - handover would risk service interruption.',
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
      id: 'enable-me-02-transmitter',
      title: 'Enable ME-02 Transmitter',
      description: 'Power on the ME-02 transmitter and configure it to match the VT-01 settings for TIDEMARK-1: Frequency 1,094 MHz (IF), Power -7 dBm, Bandwidth 36 MHz, QPSK modulation, FEC 3/4. This prepares ME-02 to take over transmission after handover.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-maine-lock'],
      conditions: [
        {
          type: 'equipment-powered',
          description: 'Transmitter Powered',
          params: {
            equipment: 'transmitter',
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-frequency-set',
          description: 'TX Frequency Set to 1,094 MHz',
          params: {
            frequency: 1094e6 as IfFrequency,
            frequencyTolerance: 1e6 as Hertz, // 1 MHz tolerance
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-power-set',
          description: 'TX Power Set to -7 dBm',
          params: {
            power: -7 as dBm,
            powerTolerance: 1 as dB,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-bandwidth-set',
          description: 'Bandwidth Set to 36 MHz',
          params: {
            bandwidth: 36e6 as Hertz,
            bandwidthTolerance: 1e6 as Hertz,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-modulation-set',
          description: 'Modulation Set to QPSK',
          params: {
            modulation: 'QPSK' as ModulationType,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-fec-set',
          description: 'FEC Set to 3/4',
          params: {
            fec: '3/4' as FECType,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-transmitting',
          description: 'Transmitter Enabled and Transmitting',
          maintainUntilObjectiveComplete: true,
        }
      ],
      timeLimitSeconds: 300, // 5 minutes
    },
    {
      id: 'execute-handover',
      title: 'Execute Traffic Handover',
      description: 'Transfer active customer traffic from VT-01 to ME-02. Monitor the handover carefully - any packet loss during transition affects customer SLA.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['enable-me-02-transmitter'],
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
      timeLimitSeconds: 300, // 5 minutes
    },
    {
      id: 'stow-vermont-antenna',
      title: 'Protect Vermont Antenna',
      description: 'With traffic safely on Maine, stow the Vermont antenna to protect it from wind loading and ice accumulation during the blizzard. Stow position is Az: 0°, El: 90° (pointed straight up).',
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
      timeLimitSeconds: 300, // 5 minutes
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `<p>Have you been watching the weather? Heavy snow is hitting Vermont any minute - link margin could drop more than eight dB during the storm. That puts us well below operational threshold.</p>
<p>First priority: enable the feed heater on Vermont. Ice on the waveguide is bad news - degrades the signal and can physically damage the feed assembly.</p>
<p>ACU Control tab. Find the feed heater toggle and enable it.</p>`,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.CONCERNED,
      audioUrl: getAssetUrl('/assets/campaigns/nats/3/intro.mp3'),
    },
    objectives: {
      'enable-vt01-heater': {
        text: `<p>Heater's on. The feed assembly will stay clear of ice buildup now.</p>
<p>Next, we bring Maine online as the backup. Catherine's already on her way in - she'll take over once we complete the handover. We do weather handovers several times each winter up here.</p>
<p>Look at the asset menu on the left side of your screen. Click Maine Ground Station to switch control to ME-02.</p>`,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-heater.mp3'),
      },
      'switch-to-maine': {
        text: `<p>You're now looking at Maine's equipment. Notice Vermont's still running in the background - customers are still being served from there.</p>
<p>Before we configure anything else, we need to verify the frequency reference. Every piece of RF equipment in this chain depends on the GPSDO for timing stability. If it's not locked, nothing else will work right.</p>
<p>GPS Timing tab. Check the GPSDO lock status.</p>`,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-switch.mp3'),
      },
      'verify-maine-equipment': {
        text: `<p>GPSDO's locked. Good timing reference.</p>
<p>Now point Maine's antenna at TIDEMARK-1. We can't do much if we don't have the satellite in view.</p>
<p>ACU Control tab. Command the antenna to the satellite using the program-track mode.</p>`,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-equipment.mp3'),
      },
      'configure-maine-antenna': {
        text: `<p>Antenna's slewing to target. While it moves, let's get the LNB powered up.</p>
<p>Cold LNB means unstable noise figure - we need it thermally stable before we can trust the receive path. Same settings as Vermont: LO at 5,250 MHz, gain at 60 dB.</p>
<p>RX Analysis tab. Power on the LNB and configure those settings. Watch for the thermal indicator to stabilize.</p>`,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-antenna.mp3'),
      },
      'configure-maine-lnb': {
        text: `<p>LNB's powered and thermally stable.</p>
<p>Now configure the receiver modem. Same parameters as Vermont: 1,532 MHz center frequency, 36 MHz bandwidth, QPSK, FEC 3/4. These have to match exactly or you'll lose frames during the handover.</p>
<p>Stay on RX Analysis. Set those modem parameters.</p>`,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-lnb.mp3'),
      },
      'configure-maine-modem': {
        text: `<p>Modem's configured.</p>
<p>Now we wait for carrier lock. The modem needs to acquire the signal from TIDEMARK-1 and sync to the data stream. Watch the lock indicator and the C/N ratio - we need solid lock with at least 10 dB margin before we can safely hand over.</p>
<p>Stay on RX Analysis. Tell me when you see lock and confirm the C/N ratio.</p>`,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-modem.mp3'),
      },
      'verify-maine-lock': {
        text: `<p>Maine's got solid carrier lock. C/N ratio looks good - actually slightly better than Vermont right now. Clear skies up here.</p>
<p>Next: enable the transmitter. Same settings as Vermont: 1,094 MHz IF frequency, -7 dBm power, 36 MHz bandwidth, QPSK, FEC 3/4. Once it's transmitting, we're ready to hand over.</p>
<p>TX Chain tab. Configure and enable the transmitter.</p>`,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-lock.mp3'),
      },
      'enable-me-02-transmitter': {
        text: `<p>ME-02 transmitter's enabled and transmitting. All set on their end.</p>
<p>Time to hand over traffic. This is the critical moment - we're about to switch active customer sessions from Vermont to Maine. Any packet loss affects customer SLA, so watch both sites closely during the transition.</p>
<p>Dashboard tab. Execute the traffic handover command.</p>`,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-transmitter.mp3'),
      },
      'execute-handover': {
        text: `<p>Traffic's transferred. Zero packet loss during the handover - that's textbook execution.</p>
<p>Maine's now serving the customer. Last step: stow Vermont's antenna to protect it during the storm. Stow position points it straight up - minimizes wind loading and ice accumulation.</p>
<p>Switch back to Vermont Ground Station in the asset menu, then ACU Control tab. Set tracking mode to stow.</p>`,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/obj-handover.mp3'),
      },
      'stow-vermont-antenna': {
        text: `<p>Hey, it's Catherine. Just got in - we have a little snow up here, but nothing like you guys are getting. Charlie filled me in on the way over.</p>
<p>I see you got us locked up on TIDEMARK-1 with good margins, and the handover was clean. Zero packet loss - that's exactly how it should be done. Nice work.</p>
<p>I've got it from here. I'll keep an eye on the link and coordinate with you when the storm clears so we can bring Vermont back online. Stay safe out there.</p>`,
        character: Character.CATHERINE_VEGA,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/3/complete.mp3'),
      },
    },
  },
};