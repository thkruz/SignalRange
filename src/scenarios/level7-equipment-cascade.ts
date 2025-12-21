import { html } from '@app/engine/utils/development/formatter';
import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-configs';
import { BUCModuleCore } from '@app/equipment/rf-front-end/buc-module';
import { CouplerState, TapPoint } from '@app/equipment/rf-front-end/coupler-module/coupler-module';
import { IfFilterBankModuleCore } from '@app/equipment/rf-front-end/filter-module';
import { HPAModuleCore } from '@app/equipment/rf-front-end/hpa-module';
import { OMTModule } from '@app/equipment/rf-front-end/omt-module/omt-module';
import { Satellite } from '@app/equipment/satellite/satellite';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from "@app/SignalOrigin";
import type { dB, dBi, dBm, FECType, Hertz, MHz, ModulationType, RfFrequency } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';

/**
 * NATS Level 7: "Equipment Cascade"
 * 
 * Phase: Pressure
 * Time Pressure: High (20 minutes before frequency drift causes service loss)
 * Calculation Required: As needed
 * New UI Elements: Fault isolation tools, backup system controls, holdover monitoring
 * 
 * Premise: 10 PM shift. GPSDO has lost GNSS lock and entered holdover mode. Charlie 
 * is at dinner but reachable by phone. You're solo on console and need to maintain 
 * TIDEMARK-1 service while troubleshooting. 5 minutes in, LNB temperature alarm appears. 
 * Cascade failure scenario - manage multiple simultaneous faults.
 */

export const level7EquipmentCascade: ScenarioData = {
  id: 'nats-level-7-equipment-cascade',
  prerequisiteScenarioIds: ['nats-level-6-interference-hunt'],
  url: 'nats/level-7/equipment-cascade',
  imageUrl: 'nats/7/card.png',
  number: 7,
  title: 'Level 7: "Equipment Cascade"',
  subtitle: 'Multiple Fault Management',
  duration: '25-30 min (20 min deadline)',
  difficulty: 'advanced',
  missionType: 'Pressure Phase',
  description: `It's 10 PM. You're solo on the night shift. Charlie just left for dinner - he'll be back in 45 minutes.<br><br>The GPSDO alarm sounds. GNSS lock lost - the reference oscillator has entered holdover mode. It's still providing a 10 MHz reference, but the frequency accuracy is slowly degrading. You have approximately 20 minutes before accumulated drift causes loss of service on TIDEMARK-1.<br><br>5 minutes into troubleshooting the GPSDO issue, a second alarm: LNB temperature rising above operational limits. Now you're managing two simultaneous equipment faults while trying to keep the customer link online.<br><br>Charlie is reachable by phone for guidance, but he can't physically help. This is cascade failure management - prioritize, troubleshoot methodically, decide when to use backup systems. Keep the service running.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End (with backup GPSDO reference)',
    'Backup LNB (hot spare)',
    'Spectrum Analyzer',
    'Receiver Modem',
    'Fault Isolation Tools',
  ],
  settings: {
    isSync: true,
    missionTimeLimit: 1200, // 20 minutes before frequency drift kills service
    cascadeEventTimings: {
      primaryFault: 0, // GPSDO holdover at mission start
      secondaryFault: 300, // LNB temp alarm at 5 minutes
    },
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
          {
            // Primary RF front end
            omt: OMTModule.getDefaultState(),
            buc: {
              ...BUCModuleCore.getDefaultState(),
              isPowered: false,
              loFrequency: 2225 as MHz,
              outputPower: 0 as dBm,
              isMuted: true,
              isExtRefLocked: true, // Still locked, but to degrading reference
            },
            hpa: {
              ...HPAModuleCore.getDefaultState(),
              isPowered: false,
              isEnabled: false,
              outputPower: 0,
            },
            filter: {
              ...IfFilterBankModuleCore.getDefaultState(),
              isPowered: true,
              selectedFilter: 3,
            },
            lnb: {
              isPowered: true,
              loFrequency: 5150 as MHz,
              gain: 55 as dB,
              lnaNoiseFigure: 0.6,
              mixerNoiseFigure: 16.0,
              noiseTemperature: 65, // Will rise to 95 at 5-minute mark
              noiseTemperatureStabilizationTime: 0,
              isExtRefLocked: true,
              noiseFloor: -140,
              frequencyError: 0, // Will increase over time due to GPSDO drift
              temperature: 45, // Will rise to 85 at 5-minute mark (ALARM)
              thermalStabilizationTime: 0,
              temperatureAlarmThreshold: 75, // °C
            },
            coupler: {
              isPowered: true,
              tapPointA: TapPoint.TX_IF,
              tapPointB: TapPoint.RX_IF,
              availableTapPointsA: [TapPoint.TX_IF, TapPoint.TX_RF_POST_BUC],
              availableTapPointsB: [TapPoint.RX_IF],
              couplingFactorA: -40,
              couplingFactorB: -39,
              isActiveA: true,
              isActiveB: true,
            } as CouplerState,
            gpsdo: {
              isPowered: true,
              isLocked: false, // *** PRIMARY FAULT: GNSS lock lost ***
              warmupTimeRemaining: 0,
              temperature: 65,
              gnssSignalPresent: false, // GPS antenna cable disconnected
              isGnssSwitchUp: false,
              isGnssAcquiringLock: false,
              satelliteCount: 0,
              utcAccuracy: 0,
              constellation: 'GPS',
              lockDuration: 0,
              frequencyAccuracy: 1e-9, // Degrading in holdover
              allanDeviation: 5e-11, // Worse than locked
              phaseNoise: -130, // Worse than locked
              isInHoldover: true, // *** HOLDOVER MODE ***
              holdoverDuration: 0, // Just entered holdover
              holdoverError: 0, // Will accumulate over time
              holdoverStability: 1e-9, // Degrades at this rate
              maxHoldoverTime: 1200, // 20 minutes before unacceptable drift
              active10MHzOutputs: 5, // Still feeding equipment
              max10MHzOutputs: 5,
              output10MHzLevel: 0,
              ppsOutputsEnabled: true,
              operatingHours: 86400,
              selfTestPassed: true,
              agingRate: 1e-10,
            },
          },
          {
            // Backup RF front end (hot spare, can be switched to)
            omt: OMTModule.getDefaultState(),
            buc: {
              ...BUCModuleCore.getDefaultState(),
              isPowered: false,
              loFrequency: 2225 as MHz,
              outputPower: 0 as dBm,
              isMuted: true,
              isExtRefLocked: false,
            },
            hpa: {
              ...HPAModuleCore.getDefaultState(),
              isPowered: false,
              isEnabled: false,
              outputPower: 0,
            },
            filter: {
              ...IfFilterBankModuleCore.getDefaultState(),
              isPowered: false,
              selectedFilter: 0,
            },
            lnb: {
              // Backup LNB - cold spare, needs configuration
              isPowered: false,
              loFrequency: 5150 as MHz,
              gain: 55 as dB,
              lnaNoiseFigure: 0.6,
              mixerNoiseFigure: 16.0,
              noiseTemperature: 20, // Cold
              noiseTemperatureStabilizationTime: 180,
              isExtRefLocked: false,
              noiseFloor: -140,
              frequencyError: 0,
              temperature: 18, // Cold
              thermalStabilizationTime: 180,
              temperatureAlarmThreshold: 75,
            },
            coupler: {
              isPowered: false,
              tapPointA: TapPoint.TX_IF,
              tapPointB: TapPoint.RX_IF,
              availableTapPointsA: [TapPoint.TX_IF, TapPoint.TX_RF_POST_BUC],
              availableTapPointsB: [TapPoint.RX_IF],
              couplingFactorA: -40,
              couplingFactorB: -39,
              isActiveA: false,
              isActiveB: false,
            } as CouplerState,
            gpsdo: {
              // Backup GPSDO - available if needed
              isPowered: true,
              isLocked: true,
              warmupTimeRemaining: 0,
              temperature: 60,
              gnssSignalPresent: true,
              isGnssSwitchUp: true,
              isGnssAcquiringLock: false,
              satelliteCount: 9,
              utcAccuracy: 20,
              constellation: 'GPS',
              lockDuration: 86400,
              frequencyAccuracy: 1e-12,
              allanDeviation: 6e-13,
              phaseNoise: -138,
              isInHoldover: false,
              holdoverDuration: 0,
              holdoverError: 0,
              active10MHzOutputs: 0, // Not currently feeding anything
              max10MHzOutputs: 5,
              output10MHzLevel: 0,
              ppsOutputsEnabled: true,
              operatingHours: 86400,
              selfTestPassed: true,
              agingRate: 1.2e-10,
            },
          },
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
        transmitters: 0,
        receivers: 1,
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
            isDegraded: false, // Not degraded yet, but will be if faults not fixed
            origin: SignalOrigin.SATELLITE_TX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          }
        ],
        [],
        {
          name: 'TIDEMARK-1',
          az: 214.2 as Degrees,
          el: 24.8 as Degrees,
          frequencyOffset: 2.225e9 as Hertz,
        }
      ),
    ],
    maintenanceLogs: [
      {
        timestamp: 'Earlier Today',
        entry: 'Roof maintenance crew reported GPS antenna cable may have been disturbed during snow removal',
      }
    ],
  },
  objectives: [
    {
      id: 'recognize-gpsdo-alarm',
      title: 'Phase 1: Recognize GPSDO Holdover Alarm',
      description: 'Acknowledge the GPSDO alarm and assess the situation.',
      groundStation: 'VT-01',
      conditions: [
        {
          type: 'alarm-acknowledged',
          description: 'GPSDO Holdover Alarm Acknowledged',
          params: {
            alarmId: 'gpsdo-holdover',
          },
          mustMaintain: false,
        },
        {
          type: 'holdover-status-checked',
          description: 'Holdover Duration and Stability Checked',
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'diagnose-gpsdo-fault',
      title: 'Phase 2: Diagnose GPSDO GNSS Lock Loss',
      description: 'Investigate why GPSDO lost GNSS lock. Check maintenance logs and antenna status.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['recognize-gpsdo-alarm'],
      conditions: [
        {
          type: 'maintenance-log-reviewed',
          description: 'Maintenance Logs Reviewed',
          mustMaintain: false,
        },
        {
          type: 'gps-antenna-status-checked',
          description: 'GPS Antenna Cable Status Checked',
          mustMaintain: false,
        },
        {
          type: 'fault-cause-identified',
          description: 'Likely Cause Identified (GPS antenna cable disconnected)',
          params: {
            faultCause: 'gps-antenna-cable-disconnected',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'call-charlie-gpsdo',
      title: 'Phase 3: Contact Charlie for Guidance',
      description: 'Call Charlie (at dinner) to report situation and get guidance.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['diagnose-gpsdo-fault'],
      conditions: [
        {
          type: 'phone-call-initiated',
          description: 'Phone Call to Charlie Initiated',
          params: {
            contactId: 'charlie-brooks',
          },
          mustMaintain: false,
        },
        {
          type: 'situation-briefed',
          description: 'Situation Briefed to Charlie',
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'lnb-temperature-alarm',
      title: 'Phase 4: LNB Temperature Alarm (Secondary Fault)',
      description: 'LNB temperature alarm triggers. Now managing two simultaneous faults.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['call-charlie-gpsdo'],
      triggeredAt: 300, // 5 minutes into mission
      conditions: [
        {
          type: 'alarm-acknowledged',
          description: 'LNB Temperature Alarm Acknowledged',
          params: {
            alarmId: 'lnb-temperature',
          },
          mustMaintain: false,
        },
        {
          type: 'lnb-temperature-checked',
          description: 'LNB Temperature Reading Checked (85°C, rising)',
          params: {
            expectedTemperature: 85, // °C - above 75° threshold
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'prioritize-faults',
      title: 'Phase 5: Prioritize Fault Response',
      description: 'Decide which fault to address first based on time criticality.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['lnb-temperature-alarm'],
      conditions: [
        {
          type: 'decision-made',
          description: 'Fault Priority Decision Made',
          params: {
            // GPSDO: 15 minutes remaining before service loss
            // LNB temp: Immediate risk of damage if continues rising
            // Correct decision: Address LNB first (hardware damage risk), then GPSDO
            correctPriority: 'lnb-first',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'mitigate-lnb-temperature',
      title: 'Phase 6: Mitigate LNB Temperature Issue',
      description: 'Reduce LNB gain to lower power dissipation and temperature.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['prioritize-faults'],
      conditions: [
        {
          type: 'lnb-gain-reduced',
          description: 'LNB Gain Reduced to 50 dB (from 55 dB)',
          params: {
            targetGain: 50 as dB,
            tolerance: 1 as dB,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-temperature-stabilizing',
          description: 'LNB Temperature Stabilizing (< 80°C)',
          params: {
            maxTemperature: 80, // °C
          },
          mustMaintain: false,
        },
        {
          type: 'signal-quality-acceptable',
          description: 'Signal Quality Still Acceptable Despite Reduced Gain',
          params: {
            minCnRatio: 9 as dB,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'switch-to-backup-gpsdo',
      title: 'Phase 7: Switch to Backup GPSDO Reference',
      description: 'Switch LNB reference to backup GPSDO to stop frequency drift.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['mitigate-lnb-temperature'],
      conditions: [
        {
          type: 'reference-source-switched',
          description: 'LNB Reference Switched to Backup GPSDO',
          params: {
            rfFrontEndId: 0, // Primary RF front end
            referenceSource: 'backup-gpsdo', // From backup rack
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'frequency-accuracy-restored',
          description: 'Frequency Accuracy Restored (< 1e-11)',
          params: {
            maxFrequencyError: 1e-11,
          },
          mustMaintain: false,
        },
        {
          type: 'service-maintained',
          description: 'Service Maintained During Switch (no loss of lock)',
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'verify-stable-operation',
      title: 'Phase 8: Verify Stable Operation',
      description: 'Confirm both faults mitigated and service quality stable.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['switch-to-backup-gpsdo'],
      conditions: [
        {
          type: 'lnb-temperature-normal',
          description: 'LNB Temperature < 75°C (below alarm threshold)',
          params: {
            maxTemperature: 75,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'frequency-reference-stable',
          description: 'Frequency Reference Stable (backup GPSDO locked)',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'service-quality-stable',
          description: 'Service Quality Stable for 120 Seconds',
          maintainDuration: 120,
          mustMaintain: true,
        },
        {
          type: 'time-remaining',
          description: 'Resolved Before Frequency Drift Deadline',
          params: {
            minTimeRemaining: 0,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `
      <p>
        [Alarm sounds] GPSDO holdover alarm. You check the panel - GNSS lock lost, zero satellites visible.
      </p>
      <p>
        The oscillator's in holdover mode now. Still putting out a 10 MHz reference, but the frequency accuracy is degrading.
      </p>
      <p>
        Holdover stability spec is 1 part in 10^9. That gives you about twenty minutes before accumulated drift kills the TIDEMARK-1 link.
      </p>
      <p>
        Charlie left for dinner fifteen minutes ago. You're solo on console. Better figure this out fast.
      </p>
      `,
      character: Character.SYSTEM,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/level-7/intro.mp3'),
    },
    objectives: {
      'diagnose-gpsdo-fault': {
        text: `
        <p>
          Maintenance log from earlier today: "Roof crew removing snow, GPS antenna cable may have been disturbed."
        </p>
        <p>
          You check the GPS antenna status - cable connector shows as disconnected.
        </p>
        <p>
          That's your problem. No GPS signal means no lock. Call Charlie.
        </p>
        `,
        character: Character.SYSTEM,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/level-7/obj-diagnose.mp3'),
      },
      'call-charlie-gpsdo': {
        text: `
        <p>
          [Phone, Charlie sounds like he's in a restaurant] Yeah, I saw the alarm on my phone. What's the situation?
        </p>
        <p>
          [You explain: GPSDO holdover, GPS antenna cable disconnected, twenty minutes before drift kills service]
        </p>
        <p>
          Okay. Can't get back for at least thirty minutes. Check the roof access logs - if maintenance is still up there, have them reconnect it. If not, you'll need to switch to the backup GPSDO reference. It's rack two, already locked. Just need to switch the reference source on the LNB. I'll walk you through it if—
        </p>
        <p>
          [Another alarm sounds on your console]
        </p>
        <p>
          What was that?
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONCERNED,
        audioUrl: getAssetUrl('/assets/campaigns/nats/level-7/obj-call-charlie.mp3'),
      },
      'lnb-temperature-alarm': {
        text: `
        <p>
          [You check the new alarm] LNB temperature - 85 celsius and rising. Alarm threshold is 75.
        </p>
        <p>
          [Charlie on phone] LNB temp alarm? That's not related to the GPSDO. Two separate failures.
        </p>
        <p>
          Check the current draw. If it's normal, it's probably thermal control failing. You need to reduce power dissipation - drop the gain by 5 dB.
        </p>
        <p>
          Handle the LNB first - if it overheats you'll damage hardware. Then switch to backup GPSDO. I'm heading back now but I'm twenty-five minutes out.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.STRESSED,
        audioUrl: getAssetUrl('/assets/campaigns/nats/level-7/obj-lnb-alarm.mp3'),
      },
      'mitigate-lnb-temperature': {
        text: `
        <p>
          LNB gain reduced to 50 dB. Temperature's starting to drop - 82 celsius and falling.
        </p>
        <p>
          C/N ratio dropped a bit with the lower gain, but still at 9.5 dB. Above threshold. Service is holding.
        </p>
        <p>
          Now deal with the GPSDO before the frequency drifts too far.
        </p>
        `,
        character: Character.SYSTEM,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/level-7/obj-mitigate-lnb.mp3'),
      },
      'switch-to-backup-gpsdo': {
        text: `
        <p>
          Reference switched to backup GPSDO. Frequency accuracy restored to 1 part in 10^12.
        </p>
        <p>
          Link stayed up during the switch - no loss of lock. Good execution.
        </p>
        <p>
          Both faults mitigated. LNB temperature stabilizing, frequency reference stable.
        </p>
        `,
        character: Character.SYSTEM,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/level-7/obj-switch-gpsdo.mp3'),
      },
      'verify-stable-operation': {
        text: `
        <p>
          [Phone, Charlie sounds relieved] I'm seeing stable telemetry now. LNB temp back below threshold, backup GPSDO locked, service quality nominal.
        </p>
        <p>
          You handled a cascade failure solo. Two unrelated faults, time pressure, no physical backup. That's exactly the kind of situation that separates good operators from great ones.
        </p>
        <p>
          I'll be back in fifteen minutes. We'll schedule roof access tomorrow to reconnect the primary GPS antenna and investigate that LNB thermal control issue.
        </p>
        <p>
          For tonight, you kept the service running. Well done.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.VERY_HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/level-7/complete.mp3'),
      },
    },
  },
};
