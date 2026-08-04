import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import { backyardGpsStation } from './ground-stations';
import { navstar77Satellite } from './satellites';

/**
 * ham-sdr Scenario 5 - "The Noise Bump" / GPS L1 + spoofing detection
 *
 * Opens the security half of the campaign. Act 1: find GPS - a signal that
 * lives BELOW the noise floor and can be detected but never locked (spread
 * spectrum). Act 2: a GPS spoofer comes up a few blocks away. The tells are
 * the campaign's first adversarial lesson:
 * - a too-clean, too-strong carrier rises out of the gentle L1 hump
 *   (terrestrial emitter, E1 - and it never Dopplers);
 * - the SDR console's CLK deltaT readout starts walking while the SATS count
 *   stays healthy (a real outage drops satellites; a spoof keeps them).
 * Defense: stop trusting GPS - flip the reference to HOLDOVER and ride the
 * disciplined oscillator until the spoofer goes off the air (E4 REF control,
 * gpsdo-reference-mode-set condition).
 *
 * Timeline (scenario clock starts 2027-06-22 16:00:00 UTC):
 * - NAVSTAR-77 (MEO) is high overhead all scenario - no pass to catch
 * - T+7:00  spoofer on the air (gnssThreat spoofStartS + terrestrial event)
 * - T+15:00 spoofer off the air; offset freezes wherever it walked to
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0752: Knowledge of system vulnerabilities (threat recognition)
 *   - S0421: Skill in operating communications equipment
 * Supporting Codes:
 *   - K1032: Knowledge of satellite-based communication systems
 *   - T0153: Monitor system performance
 */
export const hamSdrScenario5Data: ScenarioData = {
  id: 'ham-sdr-scenario5',
  url: 'ham-sdr/scenarios/ham-sdr-scenario5',
  imageUrl: 'nats/5/card.png',
  number: 5,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['ham-sdr-scenario4'],
  title: 'The Noise Bump',
  subtitle: 'Find GPS. Then Stop Trusting It.',
  duration: '20-25 min',
  missionType: 'Backyard Session',
  description: `Riley's newest experiment is a GPS patch antenna hose-clamped to a paint stick. Tonight's first job is humble: find GPS at all. The signal is so weak it lives <em>below</em> the noise floor - what you can see is a gentle two-megahertz bump of extra noise at 1575.42. You can detect it. You can never lock it. That asymmetry is the whole lesson.<br><br>The second job nobody planned. Somewhere in the neighborhood, something starts transmitting on L1 - strong, clean, and wrong. Your clock offset starts walking while the satellite count stays perfect. Riley has been waiting years to show somebody this.<br><br>RF is unauthenticated. Physics is your authentication.`,
  equipment: [
    'GPS Patch on a Paint-Stick Mast (fixed skyward)',
    'RTL-SDR Receiver (Direct Sampling)',
    'SkyWatcher SDR Console (GPS-disciplined reference)',
  ],
  settings: {
    isSync: true,
    groundStations: [backyardGpsStation],
    satellites: [navstar77Satellite],
    isExtraSatellitesVisible: false,
    scenarioStartDate: '2027-06-22',
    scenarioStartWallTime: '16:00:00',
    missionBriefUrl: 'https://docs.signalrange.space/campaign-3/scenario-5?content-only=true&dark=true',
    gnssThreat: {
      groundStationIds: ['BKYD-GPS'],
      spoofStartS: 420,
      spoofEndS: 900,
      offsetDriftUsPerS: 5,
    },
    interferenceEvents: [
      {
        // The spoofer's own signal: a narrow, too-clean carrier riding on L1,
        // received over the air from a rooftop a few blocks southeast. No
        // Doppler, ever - it is standing still on the ground.
        id: 'l1-spoofer',
        frequency: 1575.42e6,
        bandwidth: 500e3,
        power: 30, // EIRP dBm - lights up ~25 dB above the real GPS hump
        polarization: 'RHCP',
        startTime: 420,
        duration: 480,
        periodSeconds: 480,
        onSeconds: 480,
        path: 'terrestrial',
        emitter: { latitude: 44.46, longitude: -73.18 },
      },
    ],
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: "Read Riley's Note",
      description: 'The note explains why tonight\'s signal is different: GPS reaches you weaker than the noise in your own receiver, on purpose, and works anyway.',
      groundStation: 'BKYD-GPS',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Brief Read',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Spread Spectrum Understood',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'GPS arrives ~20 dB BELOW your noise floor, yet a $10 receiver uses it. How?',
            options: [
              'The signal is spread across 2 MHz by a known code; the receiver correlates against that code and pulls it out of the noise.',
              'GPS satellites transmit megawatts, so the signal is actually strong.',
              'The receiver cools itself to reduce the noise floor below the signal.',
            ],
            correctIndex: 0,
            explanation: 'Spreading buys processing gain: correlate 2 MHz of "noise" against the right code and a 43-dB gain appears. On a waterfall, all you ever see is a gentle bump of extra noise.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'find-the-hump',
      nice: ['S0421', 'K1032'],
      title: 'Find the Noise Bump',
      description: 'Watch the waterfall at 1575.42 MHz. NAVSTAR-77 is nearly overhead right now - look for a two-megahertz-wide swelling of the noise floor. That swelling is every GPS fix in the neighborhood.',
      groundStation: 'BKYD-GPS',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'signal-detected',
          description: 'NAVSTAR-77 L1 Detected',
          params: {
            signalId: 'NAVSTAR-77-L1',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'sdr-console',
          },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Detect vs Demodulate Understood',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'The bump is plainly there, but the lock indicator will never say LOCKED. Why not?',
            options: [
              'The demodulator has no despreading code - without it the signal IS noise. Detection and demodulation are different privileges.',
              'The channel bandwidth is set wrong.',
              'The patch antenna has the wrong handedness.',
            ],
            correctIndex: 0,
            explanation: 'Right. You can prove energy exists without being able to read it. Remember that direction: it also means something can TRANSMIT energy you cannot vet. Hold that thought.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'spot-the-spoofer',
      nice: ['T0153', 'S0648'],
      title: 'Something New on L1',
      description: 'A new signal has appeared inside the GPS band - narrow, strong, and clean. Real L1 is a whisper spread over megahertz. This is a shout. Get it on the waterfall.',
      groundStation: 'BKYD-GPS',
      prerequisiteObjectiveIds: ['find-the-hump'],
      conditions: [
        {
          type: 'signal-detected',
          description: 'Unknown L1 Carrier Detected',
          params: {
            signalId: 'INTERFERER-l1-spoofer',
            minPower: -110 as dBm,
            requiresObservation: true,
            observationTab: 'sdr-console',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'read-the-tell',
      nice: ['K0752', 'K0684'],
      title: 'Read the Clock',
      description: 'Check the SOURCE panel: CLK Î”T is walking upward, a few microseconds every second. Now check SATS. Compare the two and name what is happening.',
      groundStation: 'BKYD-GPS',
      prerequisiteObjectiveIds: ['spot-the-spoofer'],
      conditions: [
        {
          type: 'status-check',
          description: 'Spoof Signature Identified',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'The timing offset is growing steadily but the receiver still reports 8 healthy satellites. What does that combination mean?',
            options: [
              'Spoofing - a fake GPS signal is being tracked. A real outage LOSES satellites; a spoof keeps them and quietly walks your clock.',
              'Normal GPSDO aging - all oscillators drift like this.',
              'The satellite count display is broken.',
            ],
            correctIndex: 0,
            explanation: 'That is the signature. Jamming is loud and obvious - you lose everything. Spoofing is polite: full bars, wrong time. The stronger, cleaner "GPS" your receiver found is the one on a roof three blocks away.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'go-holdover',
      nice: ['S0421', 'K0752'],
      title: 'Stop Trusting GPS',
      description: 'Flip the REF control in the SOURCE panel to HOLDOVER. The disciplined oscillator free-runs on its own inertia - it drifts nanoseconds per hour instead of microseconds per second of lies.',
      groundStation: 'BKYD-GPS',
      prerequisiteObjectiveIds: ['read-the-tell'],
      conditions: [
        {
          type: 'gpsdo-reference-mode-set',
          description: 'Reference in Holdover',
          params: { referenceMode: 'holdover' },
          mustMaintain: true,
          maintainDuration: 60,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'all-clear',
      nice: ['S0421', 'T0153'],
      title: 'Ride It Out, Then Come Back',
      description: 'Stay on holdover until the intruder leaves the band - you will see the carrier vanish from the waterfall and the Î”T freeze. Then, and only then, put the reference back on GPS and let it re-acquire.',
      groundStation: 'BKYD-GPS',
      prerequisiteObjectiveIds: ['go-holdover'],
      conditions: [
        {
          type: 'status-check',
          description: 'All-Clear Called Correctly',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'What did you verify before trusting GPS again?',
            options: [
              'The rogue carrier is gone from the waterfall AND the timing offset has stopped growing - the spoofer is off the air.',
              'Fifteen minutes passed, which is how long spoofs last.',
              'The satellite count went back to 8.',
            ],
            correctIndex: 0,
            explanation: 'Verify the SIGNAL environment, not the clock face. Satellite count was healthy the whole time - it was never evidence of anything.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
        {
          type: 'gpsdo-reference-mode-set',
          description: 'Reference Back on GPS',
          params: { referenceMode: 'gnss' },
          mustMaintain: false,
        },
        {
          type: 'gpsdo-gnss-locked',
          description: 'GNSS Re-Acquired (4+ satellites)',
          params: {},
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'noise-bump-log',
      nice: ['K0684', 'K1032'],
      title: 'Log the Incident',
      description: 'First contact with an adversary, handled. Write down the principle before the adrenaline fades.',
      groundStation: 'BKYD-GPS',
      prerequisiteObjectiveIds: ['all-clear'],
      conditions: [
        {
          type: 'status-check',
          description: 'Principle Recorded',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'What made the spoofer detectable, given that GPS signals carry no authentication at all?',
            options: [
              'Its physics were wrong: too strong, too clean, and standing still - legitimate signals must obey orbits, and orbits leave fingerprints.',
              'It used the wrong frequency.',
              'It transmitted its own callsign.',
            ],
            correctIndex: 0,
            explanation: 'RF is unauthenticated; physics is your authentication. A real bird is weak, spread, and moving. Anything else is a claim, not a satellite. The rest of this campaign is that sentence, over and over.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ],
  dialogClips: {
    intro: {
      text: `<p>New antenna day! Ignore the paint stick, it's load-bearing. Tonight we hunt the weakest signal you will ever chase: GPS. It's up there right now, twenty thousand kilometers out, whispering at every device in the neighborhood.</p><p>Fair warning: you will find it and you will never lock it, and understanding WHY is worth more than a hundred easy passes. Read the note.</p>`,
      character: Character.RILEY_BROOKS,
      emotion: Emotion.EXCITED,
      audioUrl: '',
    },
    objectives: {
      'review-mission-brief': {
        text: `<p>Below the noise floor, and it works anyway. Spread spectrum is the closest thing radio has to magic, and it's just arithmetic.</p><p>Now go find it. 1575.42. Don't look for a stripe - look for the noise itself getting gently... fatter.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'find-the-hump': {
        text: `<p>THAT'S IT. That soft two-megahertz swell - that's a spacecraft older than you, heard on a patch antenna clamped to a paint stick. Detected, never decoded. Your receiver doesn't have the code, so to you it stays noise-shaped.</p><p>Keep the waterfall up while I get snacks. L1 never does anything interesting anywâ€”</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'spot-the-spoofer': {
        text: `<p>...okay. That is NOT GPS. Real L1 is a whisper spread thin across megahertz - this thing is narrow and LOUD. Something in the neighborhood is transmitting in a protected band, and every receiver that can hear it is now listening to IT instead of the sky.</p><p>Check your clock panel. Quickly.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.SKEPTICAL,
        audioUrl: '',
      },
      'read-the-tell': {
        text: `<p>Walking clock, perfect constellation. Textbook spoof - and I mean that literally, it's in the textbooks, and seeing it live is still something else.</p><p>Your GPSDO believes every word that roof is saying. Stop it. REF to HOLDOVER - the oscillator's own flywheel is more honest than a liar with full bars.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'go-holdover': {
        text: `<p>Î”T frozen. The lie is still on the air but nobody here is listening to it anymore. That's the whole defense: a good clock and the nerve to trust it over the sky.</p><p>Now we wait the intruder out. Watch the waterfall - you'll know the moment they give up.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'all-clear': {
        text: `<p>Carrier gone, offset flat, and NOW we trust GPS again - because we verified the environment, not because we got tired of waiting.</p><p>You just detected and defeated a GPS spoofing attack with hardware that costs less than a textbook about GPS spoofing attacks. Log it.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'noise-bump-log': {
        text: `<p>"Physics is your authentication." Underline it. Every scenario from here on is an argument between what a signal CLAIMS and what its physics prove.</p><p>Next session the network comes to us with a job - and a lesson about trusting other people's orbital elements.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
    },
  },
};
