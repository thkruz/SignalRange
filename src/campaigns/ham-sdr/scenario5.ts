import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import { backyardGpsStation } from './ground-stations';
import { navstar77Satellite } from './satellites';

/**
 * ham-sdr Scenario 5 - "The Noise Bump" / GPS L1 + spoofing detection
 * (since phase 19.3 the only bump in the L1 noise is the spoofer: real GPS
 * never shows on the analyzer)
 *
 * Opens the security half of the campaign. Act 1: look for GPS and see
 * nothing. NAVSTAR-77 transmits its real L1 EIRP (27 dBW) and arrives about
 * 8 dB UNDER the receiver's own noise in its 2 MHz (phase 19.3 calibration
 * ledger: rx IF -44.8 dBm vs noise -36.8 dBm), so the analyzer shows flat
 * noise with the bird overhead: GPS is below the floor until despread, and
 * this receiver has no code. Act 2: a GPS spoofer comes up a few blocks away.
 * The tells are the campaign's first adversarial lesson:
 * - a carrier stands ~37 dB above the floor on 1575.42, where real L1 never
 *   shows at all (terrestrial emitter, E1 - and it never Dopplers);
 * - the SDR console's CLK deltaT readout starts walking while the SATS count
 *   stays healthy (a real outage drops satellites; a spoof keeps them).
 * Defense: stop trusting GPS - flip the reference to HOLDOVER and ride the
 * disciplined oscillator until the spoofer goes off the air (E4 REF control,
 * gpsdo-reference-mode-set condition).
 *
 * Timeline (scenario clock starts 2027-06-22 16:00:00 UTC):
 * - NAVSTAR-77 (MEO) is high overhead all scenario - no pass to catch
 * - spoofer on the air 10 s after 'spot-the-spoofer' opens (gnssThreat +
 *   terrestrial event, both anchored; about T+7:00 on time)
 * - 8 minutes later, off the air; offset freezes wherever it walked to
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
  subtitle: 'Look for GPS. Then Stop Trusting It.',
  duration: '20-25 min',
  missionType: 'Backyard Session',
  description: `Riley's newest experiment is a GPS patch antenna hose-clamped to a paint stick. Tonight's first job is humble: look for GPS. You will not see it. A satellite is nearly overhead, transmitting at full power, and the spectrum at 1575.42 is flat noise: GPS reaches you <em>below</em> the noise floor of your own receiver, spread across two megahertz, and only a receiver holding the code can despread it back out. Nothing to see is the whole lesson.<br><br>The second job nobody planned. Somewhere in the neighborhood, something starts transmitting on L1 - and this one you CAN see. Strong, clean, standing above the floor, and wrong. Your clock offset starts walking while the satellite count stays perfect. Riley has been waiting years to show somebody this.<br><br>RF is unauthenticated. Physics is your authentication.`,
  equipment: ['GPS Patch on a Paint-Stick Mast (fixed skyward)', 'RTL-SDR Receiver (Direct Sampling)', 'SkyWatcher SDR Console (GPS-disciplined reference)'],
  settings: {
    isSync: true,
    groundStations: [backyardGpsStation],
    satellites: [navstar77Satellite],
    isExtraSatellitesVisible: false,
    scenarioStartDate: '2027-06-22',
    scenarioStartWallTime: '16:00:00',
    missionBriefUrl: 'https://docs.signalrange.space/campaign-3/scenario-5?content-only=true&dark=true',
    // Phase 19.0a: spoof and carrier both key up 10 s after 'spot-the-spoofer'
    // opens and run their authored 480 s (were fixed 420..900 s: a player who
    // reached the objective after 900 s had nothing left to find)
    gnssThreat: {
      groundStationIds: ['BKYD-GPS'],
      startAfterObjectiveId: 'spot-the-spoofer',
      spoofStartS: 10,
      spoofEndS: 490,
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
        // EIRP dBm. 3.3 km away through the patch's horizon pattern it arrives
        // near -82 dBm in 500 kHz, ~37 dB above the floor; real L1 sits ~8 dB
        // under the floor, so the spoofer is the only thing visible on L1
        power: 30,
        polarization: 'RHCP',
        startAfterObjectiveId: 'spot-the-spoofer',
        startTime: 10,
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
      description: "The note explains why tonight's signal is different: GPS reaches you weaker than the noise in your own receiver, on purpose, and works anyway.",
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
            question: 'GPS arrives BELOW the noise floor of your own receiver, yet a $10 receiver uses it. How?',
            options: [
              'It is spread across 2 MHz by a known code; the receiver correlates against that code and pulls it out of the noise.',
              'The satellites transmit megawatts from orbit; the signal is strong, and the floor you see is a display artifact.',
              'The receiver cools its own front end; its noise floor drops below the signal and the carrier shows through it.',
            ],
            correctIndex: 0,
            explanation:
              'Spreading buys processing gain: correlate 2 MHz of "noise" against the right code and about 43 dB of gain appears. Without the code there is nothing on the waterfall at all - not a stripe, not a bump.',
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
      title: 'Look for GPS',
      description:
        "Watch the spectrum and waterfall at 1575.42 MHz. NAVSTAR-77 is nearly overhead right now, transmitting at full power, and the trace is flat noise. That is not a fault: GPS reaches this patch under your receiver's own noise, spread over two megahertz. Confirm the bird is there and the band looks empty.",
      groundStation: 'BKYD-GPS',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          // The L1 signal reaches the analyzer input (the sim knows it is
          // there) while the trace shows only noise: ~8 dB under the floor
          type: 'signal-detected',
          description: 'NAVSTAR-77 L1 Reaching the Antenna',
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
          description: 'Below the Floor Understood',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'NAVSTAR-77 is overhead and transmitting, yet the trace at 1575.42 is flat noise and the lock indicator never says LOCKED. Why?',
            options: [
              'It arrives under your noise floor, spread over 2 MHz, and the receiver has no despreading code - so to you it IS noise.',
              'The channel bandwidth is set too narrow - the 2 MHz signal spills past the edges, so neither trace nor lock can see it.',
              'The patch antenna has the wrong handedness - GPS is right-hand circular, so the signal cancels before it reaches you.',
            ],
            correctIndex: 0,
            explanation:
              'Right. The full power of a GPS satellite reaches this patch and still sits under the noise; only a receiver holding the code despreads it into something usable. Turn that around and you get a rule: on L1, anything you CAN see on a spectrum analyzer is not coming from orbit. Hold that thought.',
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
      description:
        'A new signal has risen out of the flat noise inside the GPS band - narrow, strong, and clean. Real L1 never shows on this trace; this one stands far above the floor. That visibility is the tell. Get it on the waterfall.',
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
      description: 'Check the SOURCE panel: CLK ΔT is walking upward, a few microseconds every second. Now check SATS. Compare the two and name what is happening.',
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
              'Spoofing - a fake GPS signal is being tracked. A real outage LOSES satellites; a spoof keeps them and walks your clock.',
              'Normal GPSDO aging - the oscillator itself is drifting. Every reference walks like this; the 8 satellites prove GPS is fine.',
              'A stuck display - the satellite count is frozen. The receiver has actually lost lock; the offset is plain holdover drift.',
            ],
            correctIndex: 0,
            explanation:
              'That is the signature. Jamming is loud and obvious - you lose everything. Spoofing is polite: full bars, wrong time. The stronger, cleaner "GPS" your receiver found is the one on a roof three blocks away.',
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
      description:
        'Flip the REF control in the SOURCE panel to HOLDOVER. The disciplined oscillator free-runs on its own inertia - it drifts nanoseconds per hour instead of microseconds per second of lies.',
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
      description:
        'Stay on holdover until the intruder leaves the band - you will see the carrier vanish from the waterfall and the ΔT freeze. Then, and only then, put the reference back on GPS and let it re-acquire.',
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
              'Fifteen minutes have passed on the shift clock AND the offset has settled - a spoof cannot hold a lock longer than that.',
              'The receiver still reports 8 satellites AND the position fix is steady - a real outage would have dropped them by now.',
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
              'Its physics were wrong: visible above the floor, too clean, and standing still - legitimate signals obey orbits.',
              'Its frequency was wrong: a few kilohertz off L1, too narrow, and unmodulated - legitimate signals sit on 1575.42 MHz.',
              'Its identity was wrong: a callsign, no almanac, and no ephemeris - legitimate signals carry a full navigation message.',
            ],
            correctIndex: 0,
            explanation:
              'RF is unauthenticated; physics is your authentication. Orbits leave fingerprints. A real GPS bird is under the noise floor, spread, and moving. Anything else is a claim, not a satellite. The rest of this campaign is that sentence, over and over.',
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
      text: `<p>New antenna day! Ignore the paint stick, it is holding the mast up. Tonight we hunt the weakest signal you will ever chase: GPS. It's up there right now, twenty thousand kilometers out, whispering at every device in the neighborhood.</p><p>Fair warning: you will not see it at all. Not a stripe, not a bump. Understanding WHY is worth more than a hundred easy passes. Read the note.</p>`,
      character: Character.RILEY_BROOKS,
      emotion: Emotion.EXCITED,
      audioUrl: '',
    },
    objectives: {
      'review-mission-brief': {
        text: `<p>Below the noise floor, and it works anyway. Spread spectrum is the closest thing radio has to magic, and it's just arithmetic.</p><p>Now go look for it. 1575.42. Spoiler: you will see noise. Just noise. That's the point.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'find-the-hump': {
        text: `<p>Flat, right? NAVSTAR-77 is straight over your head, older than you, pointing its full power at this yard - and it arrives under your own noise. Your receiver doesn't have the code, so to you it IS noise. Which gives you a rule for free: real GPS never shows on this trace.</p><p>Keep the waterfall up while I get snacks. L1 never does anything interesting anyw—</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'spot-the-spoofer': {
        text: `<p>...okay. That is NOT GPS. You just watched real L1 not show up at all - this thing is standing way above the floor, narrow and LOUD. Something in the neighborhood is transmitting in a protected band, and every receiver that can hear it is now listening to IT instead of the sky.</p><p>Check your clock panel. Quickly.</p>`,
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
        text: `<p>ΔT frozen. The lie is still on the air but nobody here is listening to it anymore. That's the whole defense: a good clock and the nerve to trust it over the sky.</p><p>Now we wait the intruder out. Watch the waterfall - you'll know the moment they give up.</p>`,
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
