import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { getAssetUrl } from '@app/utils/asset-url';
import { vermontGroundStation } from './ground-stations';
import { natsHtmlLayout } from './html-layout';
import { tidemark1Satellite } from './satellites';

/**
 * Scenario 1: "First Day" - TIDEMARK-1 Health Check
 *
 * A beginner-level tutorial where Charlie Brooks walks you through a routine
 * health check on an already-operational satellite ground station.
 */

export const scenario1Data: ScenarioData = {
  id: 'nats-scenario1',
  url: 'nats/scenarios/nats-scenario1',
  imageUrl: 'nats/1/card.png',
  number: 1,
  title: 'First Day',
  subtitle: 'TIDEMARK-1 Health Check',
  duration: '25-35 min',
  difficulty: 'beginner',
  missionType: 'Routine Operations',
  description: `Welcome to your first day at North Atlantic Teleport Services, a commercial satellite ground station facility in rural Vermont. Your company provides ground segment services for the TIDEMARK constellation - SeaLink Global Communications' fleet of GEO satellites providing maritime broadband across the Atlantic.<br><br>TIDEMARK-1 is already online at 53°W, serving customer traffic. Today, Charlie Brooks will walk you through a routine health check. You'll learn what each equipment panel shows, what the indicators mean, and what "normal" looks like.<br><br>No pressure today - just observation and familiarization. Click through each panel and verify the status indicators as Charlie explains them.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
    'Receiver Modem (pre-configured)',
    'Transmitter Modem (pre-configured)',
  ],
  settings: {
    isSync: true,
    groundStations: [
      vermontGroundStation,
    ],
    layout: natsHtmlLayout,
    missionBriefUrl: 'https://docs.signalrange.space/scenarios/scenario-1?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
    satellites: [
      tidemark1Satellite,
    ]
  },
  timeLimitSeconds: 6000, // 100 minutes
  objectives: [
    {
      id: 'phase-1-gpsdo',
      title: 'Phase 1: GPSDO Status Check',
      description: 'Click on the GPSDO panel and verify all status indicators show normal operation.',
      groundStation: 'VT-01',
      conditions: [
        {
          type: 'status-check',
          description: 'Verify GPSDO Status',
          params: {
            question: 'What does the GPSDO "Lock" indicator show?',
            options: [
              'Locked (green) - stable frequency reference',
              'Unlocked (red) - no frequency reference',
              'Holdover (yellow) - using backup oscillator',
              'Off - GPSDO is powered down',
            ],
            correctIndex: 0,
            explanation: 'The green "Locked" indicator means the GPSDO is receiving GPS timing signals and providing a stable 10 MHz reference to all equipment in the rack.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
      timeLimitSeconds: 120, // 2 minutes
    },
    {
      id: 'phase-2-lnb',
      title: 'Phase 2: LNB Status Check',
      description: 'Review the LNB panel. Learn what each indicator means for the receive chain.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-1-gpsdo'],
      conditions: [
        {
          type: 'status-check',
          description: 'Verify LNB Noise Temperature',
          params: {
            question: 'What is the LNB noise temperature reading, and is it within spec?',
            options: [
              '43K - within spec (good receive sensitivity)',
              '150K - above spec (degraded sensitivity)',
              '290K - far above spec (major problem)',
              'No reading - LNB is offline',
            ],
            correctIndex: 0,
            explanation: 'The LNB noise temperature of 45K is excellent. Lower noise temperature means better receive sensitivity. Anything under 100K is considered good for C-band.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'phase-3-hpa',
      title: 'Phase 3: HPA Status Check',
      description: 'Review the High Power Amplifier panel. Learn how to verify it is in a safe standby state.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-2-lnb'],
      conditions: [
        {
          type: 'status-check',
          description: 'Verify HPA Status',
          params: {
            question: 'What is the current state of the HPA (High Power Amplifier)?',
            options: [
              'Transmitting with 10 db backoff',
              'Powered on but not enabled (safe standby)',
              'Transmitting at full power',
              'Powered off completely',
            ],
            correctIndex: 0,
            explanation: 'The HPA is powered on and transmitting with 10 dB backoff, which is a safe condition for routine operations. This reduces stress on the amplifier while still allowing signal transmission.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'phase-4-antenna',
      title: 'Phase 4: Antenna Tracking Status',
      description: 'Check the antenna control unit. The antenna should be actively tracking TIDEMARK-1.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-3-hpa'],
      conditions: [
        {
          type: 'status-check',
          description: 'Verify Antenna Tracking Mode',
          params: {
            question: 'What tracking mode is the antenna currently using?',
            options: [
              'Step-track - actively tracking beacon signal',
              'Program-track - following predicted orbital position',
              'Manual - operator-controlled pointing',
              'Stow - antenna in safe position',
            ],
            correctIndex: 1,
            explanation: 'Program-track mode follows the predicted orbital position of the satellite based on ephemeris data. This mode is used when the beacon signal is not available or during initial acquisition.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'phase-5-polarization',
      title: 'Phase 5: ACU Polarization Check',
      description: 'Verify the antenna polarization setting matches the satellite requirements.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-4-antenna'],
      conditions: [
        {
          type: 'status-check',
          description: 'Verify Polarization Setting',
          params: {
            question: 'What is the current polarization angle shown on the ACU, and why is it set to that value?',
            options: [
              '14° - matched to TIDEMARK-1 satellite polarization',
              '0° - default horizontal polarization',
              '90° - vertical polarization',
              '45° - circular polarization',
            ],
            correctIndex: 0,
            explanation: 'The polarization is set to 14° to match TIDEMARK-1\'s polarization angle. Proper polarization alignment maximizes signal strength and minimizes cross-pol interference.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'phase-6-spectrum',
      title: 'Phase 6: Spectrum Analyzer Reading',
      description: 'Look at the spectrum analyzer display. You should see the TIDEMARK-1 beacon signal.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-5-polarization'],
      conditions: [
        {
          type: 'status-check',
          description: 'Identify Beacon Signal',
          params: {
            question: 'What do you see at the center of the spectrum analyzer display?',
            options: [
              'A clear spike - the TIDEMARK-1 beacon signal',
              'Only noise floor - no signal detected',
              'Multiple interference spikes - contaminated spectrum',
              'Flat line at 0 dBm - equipment malfunction',
            ],
            correctIndex: 0,
            explanation: 'The beacon signal appears as a narrow spike rising above the noise floor. This CW (continuous wave) signal at 1,247.5 MHz IF confirms the satellite is in view and the receive chain is working.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'phase-7-speca-settings',
      title: 'Phase 7: Spectrum Analyzer Settings',
      description: 'Review the spectrum analyzer settings to understand how it is configured for beacon observation.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-6-spectrum'],
      conditions: [
        {
          type: 'status-check',
          description: 'Verify Spectrum Analyzer Configuration',
          params: {
            question: 'What center frequency and reference level are set on the spectrum analyzer?',
            options: [
              '1247.5 MHz center, -95 dBm reference - configured for TIDEMARK-1 beacon IF',
              '3902.5 MHz center, -50 dBm reference - configured for TIDEMARK-1 RF frequency',
              '70 MHz center, -30 dBm reference - configured for baseband',
              '600 MHz center, 0 dBm reference - default settings',
            ],
            correctIndex: 0,
            explanation: 'The spectrum analyzer is set to 1247.5 MHz (beacon IF frequency for TIDEMARK-1 after LNB downconversion) with a -95 dBm reference level to properly display the weak beacon signal above the noise floor.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'phase-8-receiver',
      title: 'Phase 8: Receiver Modem Check',
      description: 'Verify the receiver modem is locked and the link quality is good.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-7-speca-settings'],
      conditions: [
        {
          type: 'status-check',
          description: 'Verify Link Quality',
          params: {
            question: 'What does the receiver modem C/N indicate for a QPSK link?',
            options: [
              '≥ 8 dB - Strong link with good operating margin',
              '5-7 dB - Usable link; FEC working normally',
              '3-4 dB - Near lock threshold; errors likely',
              '< 3 dB - Below demodulation threshold; no reliable lock',
            ],
            correctIndex: 0,
            explanation: 'A C/N ratio above 10 dB indicates a healthy link with adequate margin for reliable data reception. This confirms the entire receive chain from antenna to modem is functioning properly.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'phase-9-constellation',
      title: 'Phase 9: I&Q Constellation Check',
      description: 'Examine the I&Q constellation diagram to verify signal quality and modulation.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-8-receiver'],
      conditions: [
        {
          type: 'status-check',
          description: 'Interpret I&Q Constellation',
          params: {
            question: 'What does the I&Q constellation diagram show about the received signal?',
            options: [
              'Tight clusters at symbol points - clean QPSK modulation',
              'Scattered points in a circle - high noise, poor signal',
              'Points along a line - phase-only modulation issue',
              'Empty display - no signal lock',
            ],
            correctIndex: 0,
            explanation: 'The tight clusters at the four QPSK symbol points indicate clean demodulation with good signal-to-noise ratio. Spread or scattered points would indicate noise, interference, or phase problems.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'phase-10-alarms',
      title: 'Phase 10: Dashboard Alarm Check',
      description: 'Final step: review the alarm dashboard to confirm no active alarms.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-9-constellation'],
      conditions: [
        {
          type: 'status-check',
          description: 'Verify Alarm Status',
          params: {
            question: 'What is the current alarm status shown on the dashboard?',
            options: [
              'No active alarms - all systems nominal',
              'Warning: LNB temperature high',
              'Error: GPSDO holdover mode',
              'Critical: Antenna tracking lost',
            ],
            correctIndex: 0,
            explanation: 'A clean alarm dashboard with no active alarms confirms all equipment is operating within normal parameters. This is the final confirmation of a healthy ground station.',
            pointPenalty: 5,
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
        I've got three new hires to train before I leave next month, so let's make good use of our time. I'm Charlie Brooks - senior operator here at NATS.
      </p>
      <p>
        TIDEMARK-1 is already online at 53 West, serving customer traffic for SeaLink. Today I'm going to walk you through a routine health check. You'll learn what each equipment panel shows, what the indicators mean, and what "normal" looks like.
      </p>
      <p>
        No pressure today - just observation and familiarization. Click through each panel and verify the status indicators as I explain them.
      </p>
      <p>
        Let's start with the GPSDO - that's the GPS-Disciplined Oscillator. It's the timing heart of our frequency reference system. Everything else in this rack keys off that 10 MHz clock.
      </p>
      <p>
        Pull up the GPSDO panel and check the lock indicator. It can show a few different states - locked to GPS, running in holdover mode on the backup oscillator, unlocked, or completely off. You need to know what state it's in before we check anything else.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.CONFIDENT,
      audioUrl: getAssetUrl('/assets/campaigns/nats/1/intro-v2.mp3'),
    },
    objectives: {
      'phase-1-gpsdo': {
        text: `
        <p>
          Good. The GPSDO provides the frequency reference for everything else in the rack. If it ever drops to holdover mode, you've got maybe twenty minutes before frequency drift starts causing problems. If it's unlocked entirely, nothing downstream will work right.
        </p>
        <p>
          Next up: the LNB panel. That's the Low Noise Block downconverter - it's part of the receive chain, mounted right at the antenna feed. It converts incoming C-band signals down to an intermediate frequency we can work with.
        </p>
        <p>
          The key spec to check is noise temperature - that's measured in Kelvin and tells you how much thermal noise the LNB adds to the signal. Lower is better. Under 100K is acceptable for C-band, but you'll see a range of values depending on equipment condition. Check what the panel shows and whether it's within spec.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-1-gpsdo.mp3'),
      },
      'phase-2-lnb': {
        text: `
        <p>
          Noise temperature is critical for receive sensitivity. Higher numbers mean more noise getting added to your signal, which eats into your link margin. If you ever see it climb above spec, that's an early warning sign of equipment degradation.
        </p>
        <p>
          Now let's check the HPA - the High Power Amplifier. That's the muscle of our transmit chain. It amplifies our signal to the power level needed to reach the satellite - we're talking hundreds of watts.
        </p>
        <p>
          The HPA can be in several states: transmitting at power, in safe standby with RF muted, powered off, or faulted. It's potentially dangerous equipment - you don't want it transmitting when you're not expecting it. Check the panel and determine what state it's in.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-2-lnb.mp3'),
      },
      'phase-3-hpa': {
        text: `
        <p>
          Good awareness on the HPA state. That mute control is your safety - it prevents RF emission when you're doing maintenance or when there's a problem. Never assume it's muted; always verify.
        </p>
        <p>
          Next, let's check the antenna control unit. The antenna needs to stay pointed at TIDEMARK-1 to maintain the link.
        </p>
        <p>
          There are different tracking modes: program-track follows predicted orbital position from ephemeris data, step-track actively hunts for maximum signal, manual lets the operator control pointing directly, and stow parks the antenna safely. Each has its use case. Check what mode we're currently in.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-3-hpa.mp3'),
      },
      'phase-4-antenna': {
        text: `
        <p>
          Different satellites need different tracking approaches. TIDEMARK-1 is eight years old and starting to drift in its orbit, so our tracking strategy may need to adapt over time.
        </p>
        <p>
          Now let's verify the polarization setting. Polarization is how the electromagnetic wave is oriented - and it has to match what the satellite expects.
        </p>
        <p>
          You might see horizontal at 0 degrees, vertical at 90 degrees, or a specific angle that matches the satellite's configuration. If you're off, you lose signal strength. At 90 degrees off from where you should be, you'd be in the null - almost nothing. Check the ACU and see what angle is set.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-4-antenna.mp3'),
      },
      'phase-5-polarization': {
        text: `
        <p>
          Polarization alignment is one of those details that's easy to overlook but costs you dBs if it's wrong. Always verify it matches the satellite spec.
        </p>
        <p>
          Let's move to the spectrum analyzer. This is where you'll spend a lot of time as an operator - it shows you the RF environment in real time.
        </p>
        <p>
          You're looking for the TIDEMARK-1 beacon signal. It should appear as a narrow spike rising above the noise floor. But you might also see just noise if something's wrong with the receive chain, interference spikes if there's RF contamination, or a flat line if the equipment has a problem. Look at the display and identify what you see.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-5-polarization.mp3'),
      },
      'phase-6-spectrum': {
        text: `
        <p>
          The beacon is your constant reference - if you can see it clean and stable, you know the receive path is working. If it's missing or degraded, that's your first clue something's wrong.
        </p>
        <p>
          Now look at how the spectrum analyzer itself is configured. The settings determine what you can see.
        </p>
        <p>
          Center frequency should match what you're trying to observe - that could be the RF frequency, the IF frequency after downconversion, or baseband depending on where you're tapping the signal. Reference level needs to be set so weak signals are visible above the noise floor on the display. Check the current settings and see if they make sense for beacon observation.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-6-spectrum.mp3'),
      },
      'phase-7-speca-settings': {
        text: `
        <p>
          Getting the spectrum analyzer settings right is an art. Wrong reference level and you either can't see weak signals or you clip strong ones. Wrong center frequency and you're looking at the wrong part of the spectrum entirely.
        </p>
        <p>
          Now let's check the receiver modem. This is where the rubber meets the road - it demodulates the RF signal back into data.
        </p>
        <p>
          The key metric is C/N ratio - Carrier-to-Noise. Higher numbers mean better signal quality. Above 10 dB is healthy with good margin. Around 5 dB is marginal - you might see errors. At or below threshold, the link becomes unreliable. Check the modem panel and see where we stand.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-7-speca-settings.mp3'),
      },
      'phase-8-receiver': {
        text: `
        <p>
          C/N ratio is your primary link health indicator. It tells you how much margin you have before errors start creeping in. Always know where you are relative to threshold.
        </p>
        <p>
          Let's look at the I&Q constellation diagram. This gives you a visual representation of the demodulated symbols.
        </p>
        <p>
          For QPSK modulation, you'll see four cluster positions - one for each symbol. Tight clusters mean clean demodulation. Scattered or spread-out points indicate noise or interference. If the pattern is rotating or stretched, you've got phase or amplitude problems. An empty display means no lock at all. Check what the constellation shows you.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-8-receiver.mp3'),
      },
      'phase-9-constellation': {
        text: `
        <p>
          The constellation diagram is a quick visual health check. Experienced operators can spot problems at a glance - noise, phase errors, interference all show up as distinct patterns.
        </p>
        <p>
          One final check - pull up the alarm dashboard. This aggregates status from every piece of equipment into one view.
        </p>
        <p>
          You might see no alarms if everything's nominal, or various warnings and errors if there are problems - temperature warnings, tracking issues, equipment faults. This is your early warning system. Check the dashboard and see what it's reporting.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-9-constellation.mp3'),
      },
      'phase-10-alarms': {
        text: `
        <p>
          Alright, that covers the complete health check. You've walked through every critical indicator: GPSDO, LNB, HPA, antenna tracking, polarization, spectrum, receiver, constellation, and alarms.
        </p>
        <p>
          Not bad for your first day. Now you know what to look for on each panel and what the different states mean. That's the foundation for everything else - when something goes wrong, you'll recognize it because you know what right looks like.
        </p>
        <p>
          I've got other work to handle, so we'll pick this up tomorrow. Next shift, we'll do something more hands-on - actually powering systems down and bringing them back up in sequence. Get some rest.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-10-alarms.mp3'),
      },
    },
  },
}
