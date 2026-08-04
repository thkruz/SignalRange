import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import { backyardQfhStation, backyardTxStation } from './ground-stations';
import { cubehop1Satellite, wxsat19Satellite } from './satellites';

/**
 * ham-sdr Scenario 8 - "Callsign" / license exam, pirate carrier, first TX,
 * fake beacon epilogue. The campaign finale: the tape comes off the microphone.
 *
 * Four acts on the TX-capable yagi rig (E2) plus the weather rig:
 * 1. License exam - Riley's quiz chain (band plan, control operator, why ham
 *    bands cannot encrypt). No RF until it is passed.
 * 2. Pirate prelude - an unlicensed carrier is being relayed by CUBEHOP-1's
 *    V/U transponder during the afternoon pass. Hear the unauthorized user on
 *    the downlink; understand what makes a transmission authorized.
 * 3. First TX - evening pass: set the uplink to 435.900, key the transmitter,
 *    then tune the receiver to 435.290 and lock your OWN transponded downlink.
 * 4. Fake beacon - after LOS, a "WXSAT-19 beacon" appears on the weather rig
 *    at exactly 137.100 - while no WXSAT pass exists until 23:46. Right
 *    frequency, impossibly strong, zero Doppler, never decodes: physics is
 *    your authentication.
 *
 * Timeline (scenario clock starts 2027-06-26 15:30:00 UTC):
 * - T+20:00 pirate carrier on the CUBEHOP uplink (off again ~16:50)
 * - CUBEHOP-1: AOS 15:55:47, max el 28.9 deg, LOS 16:07:43 (pirate act)
 * - CUBEHOP-1: AOS 17:31:29, max el 25.7 deg, LOS 17:43:24 (first TX)
 * - T+136:40 (~17:46:40) fake WXSAT-19 beacon on the air; the real bird's
 *   next pass is a 2 deg graze at 23:46 - the sky is provably empty
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - S0421: Skill in operating communications equipment
 *   - S0648: Skill in detecting anomalies
 * Supporting Codes:
 *   - K0740: Knowledge of system performance indicators
 *   - T0153: Monitor system performance
 */
export const hamSdrScenario8Data: ScenarioData = {
  id: 'ham-sdr-scenario8',
  url: 'ham-sdr/scenarios/ham-sdr-scenario8',
  imageUrl: 'nats/8/card.png',
  number: 8,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['ham-sdr-scenario7'],
  title: 'Callsign',
  subtitle: 'The Tape Comes Off the Microphone',
  duration: '25-30 min',
  missionType: 'Backyard Session',
  description: `Seven scenarios of listening. Tonight you talk back.<br><br>First the exam - Riley does not hand anyone a microphone who cannot recite the band plan and the control-operator rule in their sleep. Then a lesson nobody planned: somebody unlicensed is already on the bird, and the transponder relays them just as faithfully as it will relay you. RF is unauthenticated; a license is a promise, not a password.<br><br>Then the evening pass: five watts into the crossed yagi, up 435.900, down 435.290, and the strangest signal you will ever chase - your own voice coming back from orbit. Keep the receiver on it through LOS.<br><br>And afterwards, one last visitor proves why everything in this campaign mattered.`,
  equipment: [
    'DIY 70cm Crossed Yagi on TV Rotator + 5W Brick Amplifier',
    'SDR Transceiver (TRANSMIT unlocked)',
    'QFH Weather Rig (137 MHz)',
  ],
  settings: {
    isSync: true,
    groundStations: [backyardTxStation, backyardQfhStation],
    satellites: [cubehop1Satellite, wxsat19Satellite],
    isExtraSatellitesVisible: false,
    scenarioStartDate: '2027-06-26',
    scenarioStartWallTime: '15:30:00',
    missionBriefUrl: 'https://docs.signalrange.space/campaign-3/scenario-8?content-only=true&dark=true',
    timeSkip: {},
    interferenceEvents: [
      {
        // The pirate: an unlicensed carrier keyed up through CUBEHOP's V/U
        // transponder (transponder path: power is received-at-satellite).
        // Louder than the bird's own beacon on purpose. Long envelope so the
        // afternoon pass is covered regardless of how long the exam takes,
        // but OFF well before the 17:31 first-TX pass.
        id: 'cq-pirate',
        satelliteNoradId: 63002,
        frequency: 435.905e6, // inside the 435.885-915 passband -> downlink 435.295
        bandwidth: 12e3,
        power: -100, // dBm at the satellite -> ~+32 dBm transponded (beacon is +28)
        polarization: 'RHCP',
        startTime: 1200,
        duration: 3600,
        periodSeconds: 3600,
        onSeconds: 3600,
      },
      {
        // The fake beacon: a ground transmitter impersonating WXSAT-19 on
        // exactly 137.100 after the evening pass - when the real bird is
        // below the horizon until a 2 deg graze at 23:46. Terrestrial path:
        // no Doppler, no drift, never decodes, impossibly strong.
        id: 'fake-wxsat',
        frequency: 137.1e6,
        bandwidth: 34e3, // dressed up in APT's clothing
        power: 10, // EIRP dBm at ~2 km: lands ~30 dB hotter than the real bird ever does
        polarization: 'RHCP',
        startTime: 8200,
        duration: 5400,
        periodSeconds: 5400,
        onSeconds: 5400,
        path: 'terrestrial',
        emitter: { latitude: 44.498, longitude: -73.21 }, // ~2 km north of the yard
      },
    ],
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: "Read Riley's Note",
      description: 'The note covers the 70cm band plan, the uplink/downlink pair CUBEHOP-1 listens on, and the one rule Riley will not bend: nobody transmits without passing her exam first.',
      groundStation: 'BKYD-YAGI',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Brief Read',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'exam-bands',
      nice: ['K0645', 'S0421'],
      title: 'Exam, Part One: The Band Plan',
      description: 'Riley\'s exam, question one. The amateur bands are shared by agreement, not enforcement - know where you are allowed to put five watts before you own a key.',
      groundStation: 'BKYD-YAGI',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'status-check',
          description: 'Band Plan Question Passed',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'CUBEHOP-1 listens on 435.900 MHz. Why is it legal for you to transmit there tonight?',
            options: [
              '435.900 sits in the 70cm amateur satellite sub-band, I hold a license that covers it, and the satellite is open for amateur use - all three have to be true.',
              'Any frequency is legal at five watts or less.',
              'Because the receiver can already hear the satellite there.',
            ],
            correctIndex: 0,
            explanation: 'Band, license, and the bird\'s own published plan - legality is the overlap of all three. Nothing about your radio enforces any of them. That is the whole point of tonight.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'exam-rules',
      nice: ['K0645'],
      title: 'Exam, Part Two: The Rules That Matter',
      description: 'Question two: control operators and why you will never encrypt a word on these bands. Pass this and the tape comes off.',
      groundStation: 'BKYD-YAGI',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: ['exam-bands'],
      conditions: [
        {
          type: 'status-check',
          description: 'Control-Operator Question Passed',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'Why do amateur rules FORBID encrypting transmissions, when every other lesson in this campaign was about untrusted RF?',
            options: [
              'Amateur radio is self-policing: any operator must be able to identify any transmission and its sender. Openness is the enforcement mechanism - which is also why a pirate is caught by listeners, not by the satellite.',
              'Encryption uses too much bandwidth on narrow channels.',
              'Encryption is impossible below 1 GHz.',
            ],
            correctIndex: 0,
            explanation: 'The bands stay usable because everyone can hear everyone. No secrecy means every operator is a sensor - remember that when you meet tonight\'s uninvited guest.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'hear-the-pirate',
      nice: ['S0648', 'T0153'],
      title: 'Somebody Is Already on the Bird',
      description: 'Track CUBEHOP-1 through the afternoon pass and look 45 kHz above the beacon: a second carrier, coming down through the transponder at 435.295 - louder than the bird\'s own beacon. That is an uplink. It is not yours, and it is not licensed.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['exam-rules'],
      conditions: [
        {
          type: 'signal-detected',
          description: 'Pirate Downlink Detected near 435.295',
          params: {
            signalId: 'INTERFERER-cq-pirate',
            minPower: -110 as dBm,
            requiresObservation: true,
            observationTab: 'sdr-console',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'pirate-ethics',
      nice: ['S0648', 'K0645'],
      title: 'What Makes a Transmission Authorized',
      description: 'The transponder relayed the pirate exactly as faithfully as it relays anyone. Tell Riley what - if anything - the satellite could have done about it.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['hear-the-pirate'],
      conditions: [
        {
          type: 'status-check',
          description: 'Authorization Understood',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'What stopped the transponder from relaying the pirate\'s carrier?',
            options: [
              'Nothing. A bent-pipe transponder amplifies whatever lands in its passband with the right polarization - authorization lives in licenses and listeners on the ground, not in the RF.',
              'The satellite checked the callsign and let it through by mistake.',
              'The pirate found a secret command frequency.',
            ],
            correctIndex: 0,
            explanation: 'RF is unauthenticated. The bird cannot tell you from a pirate from a fake - every defense you have learned lives on the ground: band plans, physics, and operators paying attention.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'set-uplink',
      nice: ['S0421'],
      title: 'Dial In the Uplink',
      description: 'Your turn. In the TRANSMIT section, set the TX frequency to 435.900 MHz - the center of CUBEHOP-1\'s uplink passband. The transponder is 30 kHz wide; sloppy tuning falls right off its edge.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['pirate-ethics'],
      conditions: [
        {
          type: 'tx-modem-frequency-set',
          description: 'TX on 435.900 MHz (+/-5 kHz)',
          params: {
            modemNumber: 1,
            frequency: 435.90e6,
            frequencyTolerance: 5e3,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'first-contact',
      nice: ['S0421', 'K0740'],
      title: 'Work Yourself Through the Bird',
      description: 'Evening pass. TRACK CUBEHOP-1, key the transmitter, then tune the RECEIVER to 435.290 and catch your own signal coming back down. Five watts, up and over Vermont. AFC is allowed - the downlink still Dopplers even though your uplink holds still.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['set-uplink'],
      conditions: [
        {
          type: 'tx-modem-transmitting',
          description: 'Transmitter Keyed (ON AIR)',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'rx-modem-frequency-set',
          description: 'Receiver on Your Downlink (435.290 +/-15 kHz)',
          params: {
            modemNumber: 1,
            frequency: 435.29e6,
            frequencyTolerance: 15e3,
          },
          mustMaintain: false,
        },
        {
          type: 'receiver-signal-locked',
          description: 'Locked on Your Own Transponded Signal',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'sdr-console' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'clear-the-channel',
      nice: ['S0421'],
      title: 'Clear the Channel',
      description: 'LOS is coming. Unkey the transmitter - the transponder is a shared resource, and dead carriers are how tonight\'s other operator got his reputation.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['first-contact'],
      conditions: [
        {
          type: 'tx-modem-not-transmitting',
          description: 'Transmitter Unkeyed',
          params: { modemNumber: 1 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'unmask-the-beacon',
      nice: ['S0648', 'T0153'],
      title: 'The Last Visitor',
      description: 'Switch to the weather rig. There is a "WXSAT-19 beacon" sitting on 137.100 - and the Observations list says the real bird does not rise again until 23:46, and then only two degrees above the trees. Look at everything this signal is not doing.',
      groundStation: 'BKYD-QFH',
      prerequisiteObjectiveIds: ['clear-the-channel'],
      conditions: [
        {
          type: 'signal-detected',
          description: 'Impostor Carrier Detected on 137.100',
          params: {
            signalId: 'INTERFERER-fake-wxsat',
            minPower: -90 as dBm,
            requiresObservation: true,
            observationTab: 'sdr-console',
          },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Impostor Called Out',
          params: {
            character: Character.RILEY_BROOKS,
            question: 'Which signal is the real WXSAT-19, and how do you know?',
            options: [
              'Neither - the real bird is below the horizon. The carrier has zero Doppler, no rise or set, never decodes, and is far too strong: ground truth wearing a satellite\'s frequency.',
              'The 137.100 carrier - it is on the published beacon frequency.',
              'Impossible to tell without decrypting it.',
            ],
            correctIndex: 0,
            explanation: 'Frequency is the ONE thing an impostor gets right for free. Doppler, schedule, decode, and power all have to agree with orbital mechanics - and orbital mechanics does not lie. Physics is your authentication. Class dismissed.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
  ],
  dialogClips: {
    intro: {
      text: `<p>Exam night. I know, I know - you have been flying the rig for weeks. But the microphone is different. Receive-only mistakes cost you a picture; transmit mistakes go to EVERYONE with an antenna, at the speed of light, with your callsign on them.</p><p>Read the note, pass my two questions, and the tape comes off. Then we have an afternoon pass to listen to, and an evening pass to TALK to.</p>`,
      character: Character.RILEY_BROOKS,
      emotion: Emotion.CONFIDENT,
      audioUrl: '',
    },
    objectives: {
      'review-mission-brief': {
        text: `<p>Band plan first. Where you may transmit is an agreement written down by people who never met you and enforced by nobody - which is exactly why every operator has to actually know it.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'exam-bands': {
        text: `<p>One for one. Second question is the one people get wrong - it is about why these bands are naked on purpose.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'exam-rules': {
        text: `<p>PASSED. Congratulations - as of tonight you are a control operator, which means everything that leaves this yard is yours to answer for.</p><p>Afternoon pass first, and... hm. Track the bird and look about forty-five kilohertz above the beacon. We appear to have company.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.EXCITED,
        audioUrl: '',
      },
      'hear-the-pirate': {
        text: `<p>Hear him? Louder than the beacon - he is running way more power than he needs, which tells you everything about his operating class. No callsign, not in any club log, keying up over everyone.</p><p>And the bird? The bird relays him PERFECTLY. Think about what that means, then tell me.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.SKEPTICAL,
        audioUrl: '',
      },
      'pirate-ethics': {
        text: `<p>Exactly. The transponder is a bent pipe - in one side, amplified out the other, no questions asked. The license is a promise WE make, not a lock the satellite checks. He will be found the way pirates always are: by a hundred bored operators with directional antennas and grudges.</p><p>Enough about him. Evening pass in a bit - dial in YOUR uplink. 435.900, dead center.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'set-uplink': {
        text: `<p>On frequency. When the bird comes up: TRACK it, key TX, and then - this is the part nobody believes until they do it - tune your own receiver to 435.290 and listen to yourself coming back from six hundred kilometers up.</p><p>Your uplink holds still; the DOWNLINK Dopplers. You know what to do about that.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.EXCITED,
        audioUrl: '',
      },
      'first-contact': {
        text: `<p>THAT IS YOU. Five watts, a homemade yagi, a hundred-dollar radio - up to orbit and back down over two states. Every operator remembers this exact moment. Welcome to the club, for real.</p><p>Now mind your manners: LOS soon. Clear the channel.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.EXCITED,
        audioUrl: '',
      },
      'clear-the-channel': {
        text: `<p>Clean release. The band forgets a polite operator instantly and remembers a rude one for years.</p><p>...Huh. Before you pack up - the weather rig is showing something it should not. WXSAT doesn't rise until nearly midnight. Go look.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.SKEPTICAL,
        audioUrl: '',
      },
      'unmask-the-beacon': {
        text: `<p>And THERE it is. Right frequency, wrong everything else: no Doppler, no rise, no decode, and thirty decibels too loud. Someone is broadcasting a costume.</p><p>Seven weeks ago you would have believed it. Tonight you checked the physics first. That is the entire course, and you passed it twice in one evening - once on paper, once for real. Seventy-three, operator. The yard is yours.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.EXCITED,
        audioUrl: '',
      },
    },
  },
};
