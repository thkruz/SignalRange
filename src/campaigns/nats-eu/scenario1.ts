import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import { galwayGroundStation } from './ground-stations';
import { meridianSar1Satellite, meridianSar2Satellite } from './satellites';

/**
 * NATS Europe - Scenario 1: "First Light Over Galway"
 *
 * Charlie's first shift at the Galway LEO downlink station. Validates the
 * Campaign 2 feature set end to end:
 * - SGP4-propagated LEO satellites (real az/el/range from TLEs)
 * - Pass Schedule tab (multi-contact mission planning)
 * - Program-track of a fast-moving LEO pass on the Ku-band 4m tracker
 * - Ku-band RF chain (13.1 GHz LNB LO, 12.6 GHz BUC LO)
 * - Video feed decoding of the SAR imagery downlink during the pass
 *
 * Pass timeline (scenario clock starts 2027-03-15 14:00:00 UTC):
 * - MERIDIAN-SAR-1: AOS T+2.0 min, max el 88 deg T+8, LOS T+14.5 min
 * - MERIDIAN-SAR-2: AOS T+17.5 min, max el 84 deg T+24, LOS T+31.5 min
 */
export const natsEuScenario1Data: ScenarioData = {
  id: 'nats-eu-scenario1',
  url: 'nats-eu/scenarios/nats-eu-scenario1',
  imageUrl: 'nats/8/card.png',
  number: 1,
  isDisabled: false,
  difficulty: 'intermediate',
  title: 'First Light Over Galway',
  subtitle: 'LEO Pass Operations',
  duration: '35 min',
  missionType: 'LEO Downlink',
  description: `Welcome to Galway, Ireland - NATS Europe's newest LEO downlink site. Charlie Brooks has transferred from Vermont to stand up GW-01, a Ku-band station tasked with capturing SAR imagery from the MERIDIAN constellation.
  <br/><br/>Unlike the geostationary TIDEMARK fleet you trained on, MERIDIAN satellites scream overhead in minutes. Check the pass schedule, configure the tracker before AOS, ride the pass with program-track, and decode the imagery downlink before the bird drops below the horizon. A second contact follows shortly after - plan accordingly.`,
  equipment: [
    '4-meter Ku-band LEO Tracking Antenna',
    'Ku-band RF Front End (13.1 GHz LNB / 12.6 GHz BUC)',
    'Pass Schedule Planner',
    'Spectrum Analyzer',
    'RX/TX Modems with Video Decoder',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayGroundStation],
    satellites: [meridianSar1Satellite, meridianSar2Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-15',
    scenarioStartWallTime: '14:00:00',
  },
  objectives: [
    {
      id: 'review-pass-schedule',
      title: 'Review the Contact Schedule',
      description: 'Open the Pass Schedule tab and review the upcoming MERIDIAN contacts. Note the AOS time and azimuth for MERIDIAN-SAR-1.',
      groundStation: 'GW-01',
      conditions: [
        {
          type: 'tab-active',
          description: 'Pass Schedule Tab Open',
          params: { tab: 'pass-schedule' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'track-meridian-1',
      title: 'Track MERIDIAN-SAR-1',
      description: 'Set the antenna to program-track so it follows MERIDIAN-SAR-1 through the pass. The 4m pedestal slews at up to 5 deg/s - it will need it near zenith.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-pass-schedule'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'signal-detected',
          description: 'MERIDIAN-SAR-1 Beacon Detected',
          params: {
            signalId: 'MERIDIAN-SAR-1-Beacon',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'decode-sar-video',
      title: 'Decode the SAR Imagery Downlink',
      description: 'With the receiver tuned to 1414 MHz (11686 MHz RF), lock the QPSK 3/4 downlink and confirm the imagery feed decodes on the monitor before LOS.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['track-meridian-1'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on Downlink',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'second-contact',
      title: 'Capture the Second Contact',
      description: 'MERIDIAN-SAR-2 rises at T+17.5 min. Retarget the tracker, retune the receiver to 1370 MHz (11730 MHz RF), and decode its downlink.',
      groundStation: 'GW-01',
      isOptional: true,
      prerequisiteObjectiveIds: ['decode-sar-video'],
      conditions: [
        {
          type: 'signal-detected',
          description: 'MERIDIAN-SAR-2 Downlink Detected',
          params: {
            signalId: 'MERIDIAN-SAR-2-VIDEO',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on SAR-2',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
  ],
};
