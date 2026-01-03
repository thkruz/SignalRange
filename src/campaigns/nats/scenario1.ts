import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { getAssetUrl } from '@app/utils/asset-url';
import { vermontGroundStation } from './ground-stations';
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
    missionBriefUrl: 'https://docs.signalrange.space/scenarios/scenario-1?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
    satellites: [
      tidemark1Satellite,
    ]
  },
  timeLimitSeconds: 20 * 60, // 20 minutes
  objectives: [
    {
      id: 'open-mission-brief',
      title: 'Review Mission Brief',
      description: 'Open and read the mission brief, then acknowledge you are ready to proceed.',
      groundStation: 'VT-01',
      freezesScenarioTimer: true,
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
            question: 'Have you reviewed the mission brief and are you ready to begin?',
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
      id: 'phase-1-gpsdo',
      title: 'GPSDO Status Check',
      description: 'Click on the GPSDO panel and verify all status indicators show normal operation.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['open-mission-brief'],
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
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
      timeLimitSeconds: 5 * 60, // 5 minutes
    },
    {
      id: 'phase-2-lnb',
      title: 'LNB Status Check',
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
            explanation: 'The LNB noise temperature of 43K is excellent. Lower noise temperature means better receive sensitivity. Anything under 100K is considered good for C-band.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
      timeLimitSeconds: 5 * 60, // 5 minutes
    },
    {
      id: 'phase-3-hpa',
      title: 'HPA Status Check',
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
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
      timeLimitSeconds: 5 * 60, // 5 minutes
    },
    {
      id: 'phase-4-antenna',
      title: 'Antenna Tracking Status',
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
            explanation: 'Program-track mode follows the predicted orbital position of the satellite based on ephemeris data. This mode is used when the beacon signal is not available, during initial acquisition, or when the satellite is GEO stationary and we don\'t want the ACU to make constant adjustments.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
      timeLimitSeconds: 5 * 60, // 5 minutes
    },
    {
      id: 'phase-5-polarization',
      title: 'ACU Polarization Check',
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
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
      timeLimitSeconds: 5 * 60, // 5 minutes
    },
    {
      id: 'phase-6-spectrum',
      title: 'Spectrum Analyzer Reading',
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
            explanation: 'The beacon signal appears as a narrow spike rising above the noise floor. This CW (continuous wave) intermediate frequency signal confirms the satellite is in view and the receive chain is working.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
      timeLimitSeconds: 5 * 60, // 5 minutes
    },
    {
      id: 'phase-7-speca-settings',
      title: 'Spectrum Analyzer Settings',
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
              '1074.5 MHz center, -91 dBm reference - configured for TIDEMARK-1 beacon IF',
              '1532 MHz center, -50 dBm reference - configured for TIDEMARK-1 RF frequency',
              '0.002 MHz center, -30 dBm reference - configured for baseband',
              '40 MHz bandwidth, 1.8 dB insertion loss - configured for low noise floor',
            ],
            correctIndex: 0,
            explanation: 'The spectrum analyzer is set to 1074.5 MHz (beacon IF frequency for TIDEMARK-1 after LNB downconversion) with a -91 dBm reference level to properly display the weak beacon signal above the noise floor.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
      timeLimitSeconds: 5 * 60, // 5 minutes
    },
    {
      id: 'phase-8-receiver',
      title: 'Receiver Modem Check',
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
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
      timeLimitSeconds: 5 * 60, // 5 minutes
    },
    {
      id: 'phase-9-constellation',
      title: 'I&Q Constellation Check',
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
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
      timeLimitSeconds: 5 * 60, // 5 minutes
    },
    {
      id: 'phase-10-alarms',
      title: 'Dashboard Alarm Check',
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
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
      timeLimitSeconds: 5 * 60, // 5 minutes
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `
    <p>
      You must be the new hire. Good - I was starting to think HR forgot about me. I'm Charlie Brooks, senior operator. I've been here six years, but I'm transferring to one of the European stations next month. Family stuff.
    </p>
    <p>
      Point is, I've got three of you to get up to speed before I leave, and not a lot of time to do it. Let's not waste any.
    </p>
    <p>
      TIDEMARK-1 is already online at 53 West, serving customer traffic for SeaLink. Today's a health check - you watch, I explain. You'll learn what each panel shows, what the indicators mean, and what "normal" looks like. Tomorrow we'll see if any of it stuck.
    </p>
    <p>
      If you need to review something later, the buttons on the left are your friends - Mission Brief, Checklist, Dialog History. I'm not repeating myself, but the system will.
    </p>
    <p>
      Alright. First thing, always - the GPSDO. GPS-Disciplined Oscillator. It's the timing heart of this whole rack. Every piece of equipment keys off that 10 MHz reference. If the GPSDO is unhappy, nothing else matters.
    </p>
    <p>
      Click Vermont Ground Station, then GPS Timing tab. Tell me what the lock indicator shows. It'll be locked, holdover, unlocked, or off. Go.
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
        Locked. Good start. That green light means we have a stable frequency reference - everything downstream can trust the timing. If you ever see it drop to holdover, you've got maybe twenty minutes before drift becomes a problem. Unlocked means stop what you're doing and fix it.
      </p>
      <p>
        Next is the LNB - Low Noise Block downconverter. It's mounted at the antenna feed, converts C-band down to IF. The spec that matters is noise temperature, measured in Kelvin. Lower is better. Under 100K is acceptable.
      </p>
      <p>
        RX Analysis tab. Find the noise temperature reading on the LNB panel.
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-1-gpsdo.mp3'),
      },
      'phase-2-lnb': {
        text: `
      <p>
        43K - that's solid. The cooler the LNB runs, the less noise it adds to your signal. You start seeing that number climb, it's an early warning. Equipment doesn't fail all at once - it degrades. Your job is to catch it before the customer does.
      </p>
      <p>
        Now the HPA - High Power Amplifier. This is the muscle. Takes your milliwatt signal and turns it into real power to reach the satellite. It's also the equipment most likely to ruin your day if you're not paying attention.
      </p>
      <p>
        TX Chain tab. The HPA can be transmitting with backoff, muted for safety, powered off, or faulted. Which is it?
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-2-lnb.mp3'),
      },
      'phase-3-hpa': {
        text: `
      <p>
        Transmitting with 10 dB backoff - that's normal ops. We run with headroom so we're not stressing the amplifier. The day you see that backoff at zero, you better have a good reason.
      </p>
      <p>
        One thing - never assume the HPA is muted. I've seen guys reach into the waveguide thinking RF was off. It wasn't. Always verify. Anyway.
      </p>
      <p>
        ACU Control tab - antenna control unit. The dish needs to stay pointed at TIDEMARK-1. There are different tracking modes: program-track follows ephemeris predictions, step-track hunts for peak signal, manual is operator-controlled, stow parks it safe. What mode are we in?
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-3-hpa.mp3'),
      },
      'phase-4-antenna': {
        text: `
      <p>
        Program-track. Right answer for a GEO bird. TIDEMARK-1 sits in essentially the same spot, so we follow the math instead of constantly hunting. Eight years old now, starting to drift a bit in its box, but nothing the ephemeris can't handle.
      </p>
      <p>
        Stay on ACU Control. Next is polarization - how the wave is oriented. Has to match what the satellite expects or you lose signal. Could be horizontal at 0 degrees, vertical at 90, or something in between. Cross-polarized means cross-eyed - you'll see almost nothing.
      </p>
      <p>
        What's our polarization angle?
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-4-antenna.mp3'),
      },
      'phase-5-polarization': {
        text: `
      <p>
        14 degrees - matched to TIDEMARK-1. That's a detail people overlook. Wrong polarization costs you dBs, and dBs are money. Or in bad weather, dBs are the difference between link and no link.
      </p>
      <p>
        Alright, spectrum analyzer time. This is where you'll live as an operator. Shows you the RF environment in real time - what's there, what's not, what shouldn't be.
      </p>
      <p>
        RX Analysis tab. You're looking for the beacon - TIDEMARK-1's CW carrier. Should be a clean spike above the noise floor. Could also be just noise, interference, or a flatline if something's wrong. What do you see?
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-5-polarization.mp3'),
      },
      'phase-6-spectrum': {
        text: `
      <p>
        There it is. Clean beacon. That carrier is your canary - if you can see it, the receive path is working. If it disappears or goes ragged, something changed. Could be weather, could be equipment, could be the satellite. But you'll know something's wrong before the alarms even trip.
      </p>
      <p>
        Now check the analyzer settings. Center frequency and reference level - they determine what you're actually looking at.
      </p>
      <p>
        We're viewing IF after the LNB downconverts. The beacon comes down at 3902.5 MHz, LNB shifts it to 1074.5 MHz. Reference level is set to see weak signals without clipping. What values do you see?
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-6-spectrum.mp3'),
      },
      'phase-7-speca-settings': {
        text: `
      <p>
        1074.5 center, reference around -91. That's the setup for beacon watch. Get these wrong and you're either staring at the wrong frequency or your signal's buried in the noise floor. I've seen new ops spend an hour troubleshooting a "missing" signal that was just off-screen. Don't be that person.
      </p>
      <p>
        Receiver modem next. This is where RF becomes data. The number you care about is C/N - Carrier-to-Noise ratio.
      </p>
      <p>
        Stay on RX Analysis, check the modem panel. Above 8 dB for QPSK means healthy margin. Around 5 is marginal. Below threshold and the link falls apart. Where are we?
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-7-speca-settings.mp3'),
      },
      'phase-8-receiver': {
        text: `
      <p>
        Good margin. That headroom is what keeps you online when a storm rolls through or the satellite has a bad day. C/N is your primary health metric - know it, watch it, respect it.
      </p>
      <p>
        Last thing on the receive side - the constellation diagram. Visual representation of the demodulated symbols.
      </p>
      <p>
        QPSK gives you four clusters, one per symbol. Tight clusters mean clean demod. Scattered means noise. Rotating means phase problems. Empty means no lock. What's the constellation showing?
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-8-receiver.mp3'),
      },
      'phase-9-constellation': {
        text: `
      <p>
        Tight clusters. That's the picture of a healthy link. After a while you'll glance at that diagram and know instantly if something's off. Noise spreads the points, phase errors rotate them, interference makes them dance. You'll learn to read it like a face.
      </p>
      <p>
        One more check, then we're done for today. The alarm dashboard - aggregates everything into one view.
      </p>
      <p>
        Dashboard tab. Could be clean, could be warnings, could be critical faults. This is your early warning system. What's it showing?
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-9-constellation.mp3'),
      },
      'phase-10-alarms': {
        text: `
      <p>
        Clean board. That's what right looks like. Remember it.
      </p>
      <p>
        Alright - GPSDO, LNB, HPA, tracking mode, polarization, beacon, analyzer settings, C/N, constellation, alarms. That's your health check. Ten items, maybe fifteen minutes once you know what you're doing. Do it at the start of every shift, do it after any anomaly, do it whenever something feels off.
      </p>
      <p>
        You did fine. Tomorrow we'll actually touch some controls - power sequencing, safe states, that kind of thing. I need to know you won't break anything before I leave you alone with the equipment.
      </p>
      <p>
        Go get some coffee or something. I've got logs to finish.
      </p>
      `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-10-alarms.mp3'),
      },
    },
  },
}
