import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from "@app/equipment/antenna/antenna-config-keys";
import { Receiver } from '@app/equipment/receiver/receiver';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm, Hertz, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { createRfFrontEnd } from '../rf-front-end-factory';
import { vermontGroundStation } from './ground-stations';
import { tidemark1Satellite, ses10Satellite, tidemark2Satellite } from './satellites';

/**
 * NATS Level 5: "Inclined Orbit Operations"
 *
 * Phase: Mastery
 * Time Pressure: Mild (30-minute tracking window)
 * Calculation Required: Yes (as needed)
 * New UI Elements: TLE update notifications, real-time satellite position tracking
 *
 * Premise: TIDEMARK-1 is eight years old and running low on fuel. SeaLink stopped
 * north-south station-keeping to extend satellite life. The orbit is now inclined,
 * causing the satellite to trace a figure-8 pattern daily. Service continues, but
 * requires active tracking with frequent TLE updates.
 */

export const scenario6Data: ScenarioData = {
  id: 'scenario6',
  prerequisiteScenarioIds: ['scenario5'],
  isDisabled: true,
  url: 'nats/scenarios/nats-scenario6',
  imageUrl: 'nats/6/card.png',
  number: 6,
  title: 'Inclined Orbit Operations',
  subtitle: 'Tracking Aging Satellites',
  duration: '35-40 min',
  difficulty: 'intermediate',
  missionType: 'Mastery Phase',
  description: `TIDEMARK-1 launched eight years ago. Fuel is running low, so SeaLink Global Communications stopped north-south station-keeping last month to extend the satellite's operational life. This means the orbit is now inclined - the satellite appears to trace a figure-8 pattern in the sky relative to the ground.<br><br>The satellite still provides maritime communications service, but maintaining the link requires active antenna tracking. You'll need to apply TLE (Two-Line Element) updates every 15 minutes to keep the antenna pointed accurately as the satellite drifts north and south.<br><br>This is end-of-life operations for an aging bird - routine but requiring attention and precision. Maintain service quality throughout the 30-minute tracking window.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
    'Receiver Modem',
    'TLE Update System',
  ],
  settings: {
    isSync: true,
    missionTimeLimitSeconds: 1800, // 30 minutes tracking window
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
            // Already pointed at TIDEMARK-1, but needs tracking updates
            isPowered: true,
            azimuth: 214.2 as Degrees,
            elevation: 24.8 as Degrees,
            polarization: 0 as Degrees,
            isTracking: true,
            trackingMode: 'program-track', // Using program track for inclined orbit
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            buc: { isPowered: false, loFrequency: 2225 as MHz, outputPower: 0 as dBm, isMuted: true, isExtRefLocked: false },
            hpa: { isPowered: false, outputPower: 0 as dBm },
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
        transmitters: [],
        receivers: [Receiver.getDefaultState()],
      },
    ],
    satellites: [
      tidemark1Satellite,
      ses10Satellite,
      tidemark2Satellite
    ],
    // tleUpdateInterval: 900, // TLE updates available every 15 minutes (900 seconds)
    // tleAutoNotify: true, // Automatically notify when updates available
  },
  objectives: [
    {
      id: 'initial-acquisition',
      title: 'Phase 1: Initial Lock Verification',
      description: 'Verify antenna lock on TIDEMARK-1 and confirm signal quality.',
      groundStation: 'VT-01',
      conditions: [
        {
          type: 'antenna-locked',
          description: 'Antenna Locked on TIDEMARK-1',
          params: {
            satelliteId: 1,
          },
          mustMaintain: false,
        },
        {
          type: 'signal-detected',
          description: 'Beacon Signal Present',
          params: {
            signalId: 'tidemark-1-beacon',
            minPower: -98 as dBm,
          },
          mustMaintain: false,
        },
        {
          type: 'rx-modem-locked',
          description: 'Receiver Modem Locked on Carrier',
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'understand-inclined-orbit',
      title: 'Phase 2: Inclined Orbit Briefing',
      description: 'Review the orbital elements and understand the tracking requirements.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['initial-acquisition'],
      conditions: [
        {
          type: 'briefing-acknowledged',
          description: 'Inclined Orbit Briefing Reviewed',
          params: {
            briefingId: 'inclined-orbit-operations',
          },
          mustMaintain: false,
        },
        {
          type: 'tracking-mode-verified',
          description: 'Program Track Mode Confirmed',
          params: {
            trackingMode: 'program-track',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'first-tle-update',
      title: 'Phase 3: First TLE Update',
      description: 'Apply first TLE update when notification arrives (~15 minutes).',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['understand-inclined-orbit'],
      conditions: [
        {
          type: 'tle-update-available',
          description: 'TLE Update Notification Received',
          mustMaintain: false,
        },
        {
          type: 'tle-update-applied',
          description: 'TLE Update Applied to ACU',
          params: {
            satelliteId: 1,
            updateNumber: 1,
          },
          mustMaintain: false,
        },
        {
          type: 'antenna-pointing-corrected',
          description: 'Antenna Pointing Adjusted Based on New TLE',
          params: {
            maxPointingError: 0.1 as Degrees,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'maintain-lock-first-period',
      title: 'Phase 4: Maintain Lock During Drift',
      description: 'Keep antenna locked on satellite as it drifts. Monitor pointing error.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['first-tle-update'],
      conditions: [
        {
          type: 'antenna-locked',
          description: 'Antenna Lock Maintained',
          params: {
            satelliteId: 1,
          },
          mustMaintain: true,
          maintainDuration: 300, // 5 minutes
        },
        {
          type: 'pointing-error-acceptable',
          description: 'Pointing Error < 0.1°',
          params: {
            maxPointingError: 0.1 as Degrees,
          },
          mustMaintain: true,
          maintainDuration: 300,
        },
        {
          type: 'cn-ratio-maintained',
          description: 'C/N Ratio Maintained > 10 dB',
          params: {
            minCnRatio: 10 as dB,
          },
          mustMaintain: true,
          maintainDuration: 300,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'second-tle-update',
      title: 'Phase 5: Second TLE Update',
      description: 'Apply second TLE update to maintain accurate tracking.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['maintain-lock-first-period'],
      conditions: [
        {
          type: 'tle-update-available',
          description: 'Second TLE Update Received',
          mustMaintain: false,
        },
        {
          type: 'tle-update-applied',
          description: 'Second TLE Update Applied',
          params: {
            satelliteId: 1,
            updateNumber: 2,
          },
          mustMaintain: false,
        },
        {
          type: 'antenna-pointing-corrected',
          description: 'Pointing Corrected',
          params: {
            maxPointingError: 0.1 as Degrees,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'maintain-lock-second-period',
      title: 'Phase 6: Continue Tracking',
      description: 'Maintain tracking through second update period.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['second-tle-update'],
      conditions: [
        {
          type: 'antenna-locked',
          description: 'Antenna Lock Maintained',
          params: {
            satelliteId: 1,
          },
          mustMaintain: true,
          maintainDuration: 300, // Another 5 minutes
        },
        {
          type: 'pointing-error-acceptable',
          description: 'Pointing Error < 0.1°',
          params: {
            maxPointingError: 0.1 as Degrees,
          },
          mustMaintain: true,
          maintainDuration: 300,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'complete-tracking-window',
      title: 'Phase 7: Complete 30-Minute Tracking Window',
      description: 'Successfully maintain service through entire tracking session.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['maintain-lock-second-period'],
      conditions: [
        {
          type: 'service-continuity',
          description: 'No Loss of Lock During Window',
          params: {
            maxLockLossEvents: 0,
          },
          mustMaintain: false,
        },
        {
          type: 'tle-updates-completed',
          description: 'All Required TLE Updates Applied (3-4 total)',
          params: {
            minUpdatesApplied: 3,
          },
          mustMaintain: false,
        },
        {
          type: 'time-elapsed',
          description: '30-Minute Window Completed',
          params: {
            requiredDuration: 1800, // 30 minutes
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `
      <p>
        TIDEMARK-1 launched eight years ago. Fuel's running low, so SeaLink stopped doing north-south station-keeping last month.
      </p>
      <p>
        Means the orbit's inclined now - satellite traces a figure-8 pattern relative to the ground. Still provides service, but you need to update the ACU pointing every fifteen minutes or so.
      </p>
      <p>
        TLEs will come in automatically. You just need to apply them and verify lock. We're going to track for thirty minutes - you'll see three or four updates come through.
      </p>
      <p>
        This is routine end-of-life operations. Nothing difficult, just requires attention. Don't let the pointing error exceed point-one degrees or you'll lose the link.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/5/intro.mp3'),
    },
    objectives: {
      'initial-acquisition': {
        text: `
        <p>
          Link's up. Beacon's there, modem's locked, C/N ratio looks good.
        </p>
        <p>
          The antenna's in program track mode - it's following the orbital elements we loaded earlier. But those elements get stale every fifteen minutes because the satellite's drifting.
        </p>
        <p>
          Watch the pointing error indicator. When it starts creeping up toward point-one degrees, you know it's time for a TLE update.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/5/obj-initial.mp3'),
      },
      'first-tle-update': {
        text: `
        <p>
          First TLE update applied. See how the antenna adjusted? Pointing error dropped back down to near zero.
        </p>
        <p>
          That's the pattern - satellite drifts, pointing error increases, you apply fresh orbital elements, antenna corrects.
        </p>
        <p>
          Keep monitoring. Next update will be in about fifteen minutes.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/5/obj-first-tle.mp3'),
      },
      'maintain-lock-first-period': {
        text: `
        <p>
          Lock's stable. Pointing error's staying below threshold. Good.
        </p>
        <p>
          This is what aging satellite operations looks like - just steady monitoring and periodic corrections.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/5/obj-maintain1.mp3'),
      },
      'second-tle-update': {
        text: `
        <p>
          Second update applied. You're getting the rhythm of this now.
        </p>
        <p>
          SeaLink will keep running TIDEMARK-1 like this for another year or two until the fuel's completely gone. Then it'll drift into a graveyard orbit.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/5/obj-second-tle.mp3'),
      },
      'complete-tracking-window': {
        text: `
        <p>
          Thirty-minute window complete. No loss of lock, all TLE updates applied correctly, service continuity maintained.
        </p>
        <p>
          That's exactly how inclined orbit operations work. Routine, but you can't walk away from it.
        </p>
        <p>
          Next mission, you're going solo on a real problem - interference hunting with a ticking SLA clock. No more practice scenarios.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/5/complete.mp3'),
      },
    },
  },
};
