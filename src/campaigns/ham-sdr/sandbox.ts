import type { ScenarioData } from '@app/ScenarioData';
import { Character, Emotion } from '@app/modal/character-enum';
import type { dBm } from '@app/types';
import { backyardGpsStation, backyardQfhStation, backyardYagiStation } from './ground-stations';
import { cubehop1Satellite, navstar77Satellite, wxsat19Satellite } from './satellites';

/**
 * Campaign 3 (Backyard Operator) - Sandbox: "Riley's Backyard"
 *
 * Mechanics testbed for the amateur campaign. Guided objectives exercise every
 * new Campaign 3 mechanic end to end (missionType 'Sandbox' keeps it out of
 * campaign progress):
 * - Fixed-gain DIY antennas (QFH / crossed yagi / GPS patch) at VHF/UHF/L-band
 * - Direct-sampling SDR chain (LNB mixer bypass) + SDR Console tab
 * - Circular polarization handedness switch on the crossed yagi
 * - Doppler chasing / AFC on the 70cm FM bird
 * - SatNOGS-style Observations list (pass schedule reskin)
 * - GPS L1 spread-spectrum detection from a MEO bird
 *
 * Pass timeline (scenario clock starts 2027-06-19 16:00:00 UTC):
 * - WXSAT-19:   AOS T+3.0 min, max el 55.0 deg T+10.6, LOS T+18.2 min
 * - CUBEHOP-1:  AOS T+18.0 min, max el 48.2 deg T+24.2, LOS T+30.5 min
 * - NAVSTAR-77: already at el 89 deg, drifts slowly (MEO) - visible all session
 */
export const hamSdrSandboxData: ScenarioData = {
  id: 'ham-sdr-sandbox',
  url: 'ham-sdr/scenarios/ham-sdr-sandbox',
  imageUrl: 'nats/8/card.png',
  number: 0,
  isDisabled: false,
  difficulty: 'beginner',
  title: "Riley's Backyard",
  subtitle: 'DIY Satellite Tracking',
  duration: 'Unlimited',
  missionType: 'Sandbox',
  description: `Charlie's niece Riley (KD2RLY) has turned the family backyard in Burlington into a satellite ground station built from scrap: a hand-wound quadrifilar helix on a fence post, a crossed yagi bolted to an old TV rotator, and a GPS patch antenna taped to a paint stick. Total budget: about $80 and one weekend.
  <br/><br/>No mission control, no shift supervisor - just an SDR dongle, a laptop running SkyWatcher, and physics. Everything runs from the SDR Console: tuning, polarization, the rotator, the decoder. Catch a weather satellite with the QFH, chase a cubesat's Doppler on the yagi (mind the polarization switch), and find the GPS constellation hiding under the noise floor.`,
  equipment: [
    'DIY 137 MHz Quadrifilar Helix',
    'DIY 70cm Crossed Yagi on TV Rotator',
    'GPS L1 Patch Antenna',
    'RTL-SDR Receiver (Direct Sampling)',
    'SkyWatcher SDR Console',
  ],
  settings: {
    isSync: true,
    groundStations: [backyardQfhStation, backyardYagiStation, backyardGpsStation],
    satellites: [wxsat19Satellite, cubehop1Satellite, navstar77Satellite],
    isExtraSatellitesVisible: false,
    scenarioStartDate: '2027-06-19',
    scenarioStartWallTime: '16:00:00',
  },
  objectives: [
    {
      id: 'check-observations',
      title: 'Check the Observations List',
      description: 'Open the Observations tab and see what is coming over the horizon. WXSAT-19 rises in about three minutes; note its AOS time. NAVSTAR-77 is already overhead - MEO birds hang around for hours, not minutes.',
      groundStation: 'BKYD-QFH',
      conditions: [
        {
          type: 'tab-active',
          description: 'Observations Tab Open',
          params: { tab: 'pass-schedule' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'wx-first-contact',
      title: 'First Contact: Decode the Weather Bird',
      description: 'The QFH needs no pointing - it stares straight up and its beam covers most of the sky. On the Weather Rig, watch 137.100 MHz on the SDR Console as WXSAT-19 rises, and lock the APT downlink. VHF Doppler is only a few kHz, so the channel holds it without retuning. The channel BW must bracket the signal, like a modem symbol rate: the APT signal is 34 kHz wide, so the stock 50 kHz channel works - much narrower or wider than the signal and the demodulator drops out (watch the lock indicator, it tells you which way you are off).',
      groundStation: 'BKYD-QFH',
      prerequisiteObjectiveIds: ['check-observations'],
      conditions: [
        {
          type: 'signal-detected',
          description: 'WXSAT-19 APT Detected at 137.1 MHz',
          params: {
            signalId: 'WXSAT-19-APT',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'sdr-console',
          },
          mustMaintain: false,
        },
        {
          type: 'receiver-signal-locked',
          description: 'APT Downlink Locked',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'sdr-console' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'yagi-track-cubehop',
      title: 'Track CUBEHOP-1 with the Yagi',
      description: 'CUBEHOP-1 rises at T+18 min. On the Yagi Rig, select CUBEHOP-1 in the SDR Console rotator panel and engage TRACK so the yagi follows the bird. The crossed yagi has a switchable feed: CUBEHOP-1 transmits right-hand circular (RHCP) - pick the wrong handedness and you throw away ~18 dB.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['check-observations'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'signal-detected',
          description: 'CUBEHOP-1 Downlink Detected at 435.25 MHz',
          params: {
            signalId: 'CUBEHOP-1-FM',
            minPower: -130 as dBm,
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
      id: 'doppler-chase',
      title: 'Chase the Doppler',
      description: 'At 435 MHz the Doppler shift runs +/-10 kHz across the pass - more than the 15 kHz channel can swallow. Watch the carrier slide across the waterfall and keep the VFO on it with the tune buttons (or discover the AFC checkbox). Hold the lock with decent C/N.',
      groundStation: 'BKYD-YAGI',
      prerequisiteObjectiveIds: ['yagi-track-cubehop'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'FM Downlink Locked Through the Drift',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'sdr-console' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Above 10 dB (correct handedness required)',
          params: { modemNumber: 1, minCNRatio: 10, requiresObservation: true, observationTab: 'sdr-console' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'gps-detect',
      title: 'Find GPS Under the Noise',
      description: 'Switch to the GPS Experiment rig. NAVSTAR-77 is nearly overhead, but you will not see a carrier: GPS L1 is spread-spectrum, a 2 MHz-wide bump barely above the noise floor. That is the whole point - the signal is below the noise until a receiver despreads it. Spot the hump around 1575.42 MHz.',
      groundStation: 'BKYD-GPS',
      isOptional: true,
      prerequisiteObjectiveIds: ['check-observations'],
      conditions: [
        {
          type: 'signal-detected',
          description: 'L1 Spread-Spectrum Energy Detected',
          params: {
            signalId: 'NAVSTAR-77-L1',
            minPower: -120 as dBm,
            requiresObservation: true,
            observationTab: 'sdr-console',
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
      text: `<p>Hey! You must be the one Uncle Charlie keeps talking about. I'm Riley - KD2RLY. Welcome to my ground station! Okay, it's a fence post, a TV rotator from the dump, and eighty dollars of SDR dongle, but it hears actual satellites, which makes it a ground station.</p><p>Uncle Charlie tracks birds with a nine-meter dish and a control room. We're going to do the same physics with coat hangers. First rule of backyard tracking: you don't need big iron, you need to know when to listen and where to point. Pull up the Observations list and let's see what's flying over.</p>`,
      character: Character.RILEY_BROOKS,
      emotion: Emotion.EXCITED,
      audioUrl: '',
    },
    objectives: {
      'check-observations': {
        text: `<p>See it? WXSAT-19 comes over the horizon in about three minutes - that's a weather satellite screaming along at seven and a half kilometers a second. It'll be gone again in fifteen.</p><p>And look at NAVSTAR-77: it's basically parked overhead. That's a GPS bird in MEO, twenty thousand kilometers up. Higher orbit, slower sky. We'll mess with that one later.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'wx-first-contact': {
        text: `<p>YES! Hear that? Okay, you can't hear it, but LOOK at it on the waterfall - that's a satellite talking to your fence post!</p><p>The QFH is the secret: it's circularly polarized and sees almost the whole sky at once, so no rotator needed. And at 137 megahertz the Doppler shift is tiny - the channel just eats it. Enjoy the easy one. The next bird will not be this polite.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.EXCITED,
        audioUrl: '',
      },
      'yagi-track-cubehop': {
        text: `<p>The yagi's on the bird! Now, about that switch on the feed: satellite signals come in right-hand or left-hand circular polarization, like a screw thread. CUBEHOP-1 is right-handed. Flip the feed to LHCP and you lose about eighteen dB - that's the difference between a picture and static.</p><p>Fun fact: when a signal bounces off something, the handedness flips. That's why your antenna cares.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'doppler-chase': {
        text: `<p>You held it through the drift! That slide across the waterfall is Doppler - same reason an ambulance siren drops pitch as it passes. At four-thirty-five megahertz it's plus-or-minus ten kilohertz, and our little channel is only fifteen wide, so somebody has to keep chasing it.</p><p>If you found the AFC checkbox: yeah, the software can chase it for you. I still make everyone do it by hand once. Builds character.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'gps-detect': {
        text: `<p>There it is - that fat little bump at 1575.42. That's GPS. Notice there's no carrier spike? The signal is spread across two megahertz ON PURPOSE, so it's basically hiding under the noise floor. Your phone digs it out with math - correlation, not muscle.</p><p>Congratulations: you just found the signal that runs the whole world, with a patch antenna taped to a paint stick. Uncle Charlie's dish can't even tune this low. Don't tell him I said that.</p>`,
        character: Character.RILEY_BROOKS,
        emotion: Emotion.EXCITED,
        audioUrl: '',
      },
    },
  },
};
