import { Character } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import { DRILL_BRIEF, DRILL_EQUIPMENT, drillGalway, drillSatellites } from './drills';

/**
 * nats-eu Scenario 25: "Site Orientation" (Drill 1/4, phase 18 G)
 *
 * Priya Sharma's post-incident security orientation for the Galway crew: a
 * walk through the station with the question sheet the Gray Zone fortnight
 * wrote. Knowledge, not hands - every stop is a status-check anchored to the
 * console it is about. The drill closes the threat-model module the arc
 * assumed rather than taught (1.1 segments, 1.2 lifetime, 1.3 decision
 * ownership, 1.4 the soft target, 1.6 effects, 1.7 consequence), the
 * monitor-and-control path and why OT is not IT (6.1-6.3), the antenna
 * pattern that let a ground emitter into a dish pointed at the sky (3.2), and
 * what about a shift is sensitive outside the fence (12.5).
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K1032: Knowledge of satellite-based communication systems
 *   - K0721: Knowledge of threats to information systems
 *   - K0915: Knowledge of network architecture principles and practices
 * Supporting Codes:
 *   - K0645: Knowledge of standard operating procedures
 *   - K0689: Knowledge of network architecture
 *   - K0926: Knowledge of signal jamming tools and techniques
 *   - K0741: Knowledge of operational impacts of system outages
 *   - K0682: Knowledge of cybersecurity threats
 *   - K0741: Knowledge of system availability measures
 */
export const natsEuScenario25Data: ScenarioData = {
  id: 'nats-eu-scenario25',
  url: 'nats-eu/scenarios/nats-eu-scenario25',
  imageUrl: 'nats-eu/25/card.png',
  number: 25,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario16'],
  title: 'Site Orientation',
  subtitle: 'Security Drill 1/4',
  duration: '15 min',
  missionType: 'Security Drill',
  description: `09:00, Galway, a quiet Wednesday after a loud fortnight. Group Security has written a site orientation sheet out of everything the Gray Zone incidents taught, and every operator walks it once with the consoles in front of them.<br><br>There are ten stops. They cover what the station is part of, what it does across a satellite’s life, who owns which decision, why the ground is the soft target, what an attacker is trying to do to a link and what is lost when they succeed, where the monitor-and-control path runs and why it isn’t ordinary IT, how a ground emitter got into a dish pointed at the sky, and what about a shift must not leave the fence.`,
  equipment: DRILL_EQUIPMENT,
  settings: {
    isSync: true,
    groundStations: [drillGalway()],
    satellites: drillSatellites(),
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-04-28',
    scenarioStartWallTime: '09:00:00',
    missionBriefUrl: DRILL_BRIEF(25),
    workingDocument: {
      title: 'Orientation Sheet GW-01 / 28 April',
      description: 'Ten stops, eleven lines (stop 8 has two). Signed off by the operator walking it.',
    },
    // The Security console is a stop on the walk: a quiet morning's log, nothing to flag.
    security: {
      accounts: [
        { id: 'op-duty', name: 'Operator on duty (you)', role: 'Operator', status: 'active' },
        { id: 'op-charlie', name: 'C. Brooks', role: 'Site Lead', status: 'active' },
        { id: 'svc-monitor', name: 'Monitoring Service', role: 'Service Account', status: 'active' },
      ],
      events: [
        {
          id: 'evt-poll',
          timeS: 0,
          timestampLabel: '08:40 UTC',
          actor: 'svc-monitor',
          action: 'M&C poll: ACU, RF front end, modems, GPSDO',
          category: 'command',
          severity: 'info',
        },
        { id: 'evt-login', timeS: 0, timestampLabel: '08:55 UTC', actor: 'op-duty', action: 'Console login', category: 'auth', severity: 'info' },
        { id: 'evt-sheet', timeS: 0, timestampLabel: '09:00 UTC', actor: 'op-charlie', action: 'Orientation sheet issued to duty operator', category: 'access', severity: 'info' },
      ],
    },
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Read the Orientation Sheet',
      description: 'Open the sheet. It holds the ten stops, the diagram of the segments, the flow baseline, and the list of incidents the questions come from.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [{ type: 'mission-brief-opened', description: 'Orientation Sheet Opened', params: { boxId: 'mission-brief' }, mustMaintain: false }],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'the-four-segments',
      nice: ['K1032'],
      title: 'Stop 1 - The Segments',
      description:
        'The satellite world splits into four segments: space, link, ground and user. Galway is one of them, the imagery customer in Rotterdam is another, and the thing that goes wrong most often sits in between.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'status-check',
          description: 'Segments Named',
          params: {
            character: Character.SYSTEM,
            question: 'Stop 1. Which answer puts GW-01, MERIDIAN-SAR-1, the Ku-band downlink and the imagery analysts in Rotterdam into the right segments?',
            options: [
              'Ground segment: GW-01 and Rotterdam constellation ops. Space segment: SAR-1. Link segment: the Ku-band downlink and uplink. User segment: the imagery analysts',
              'Ground segment: GW-01 only. Space segment: SAR-1 and the Ku-band downlink. User segment: Rotterdam. There is no separate link segment at all',
              'Ground segment: everything on the Earth. Space segment: everything above it. The link is part of both, so it has no segment of its own',
              'Ground segment: GW-01 and the analysts. Space segment: SAR-1 and Rotterdam constellation ops, since they fly the satellite. Link segment: the Ku-band downlink',
            ],
            correctIndex: 0,
            explanation:
              'There are four segments, and the operator sits in one of them. Rotterdam flies the satellite from the ground, and the analysts use the product rather than the station, so they’re the user segment. The link segment is where the fortnight happened, because the carrier, the replay and the denial were all attacks on the link, seen from the ground.',
            pointPenalty: 5,
            documentLine: 'Stop 1: segments - ground (GW-01, Rotterdam ops), space (MERIDIAN), link (Ku up/down), user (imagery analysts).',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'across-the-lifetime',
      nice: ['K1032'],
      title: 'Stop 2 - Across the Lifetime',
      description: 'A ground station is not one job. What it does for a satellite changes from launch to disposal, and the fortnight was spent in two of those phases.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['the-four-segments'],
      conditions: [
        {
          type: 'status-check',
          description: 'Lifetime Phases Named',
          params: {
            character: Character.SYSTEM,
            question: 'Stop 2. Which list puts the station’s jobs in the order a satellite needs them?',
            options: [
              'Launch and early orbit (first contact), commissioning (payload checkout), routine operations, anomaly response, end of life (disposal commanding)',
              'Routine operations first, then commissioning once the customer is happy, then launch support for the next satellite, with disposal left to the vendor',
              'Commissioning, launch, routine operations, disposal; the station is not involved in early orbit, so first contact is made by the constellation operator',
              'Routine operations only; launch, commissioning and disposal belong to the constellation operator, so a ground station never handles any of them',
            ],
            correctIndex: 0,
            explanation:
              'The order follows the satellite’s life: the station is the first thing a new satellite talks to, spends most of its time on routine operations and anomaly response, and sends the disposal commands at the end. The middle two phases are what the fortnight was made of. The other lists skip a phase or put commissioning before launch.',
            pointPenalty: 5,
            documentLine: 'Stop 2: lifetime - LEOP, commissioning, routine ops, anomaly response, end of life.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'who-decides',
      nice: ['K0645'],
      title: 'Stop 3 - Who Decides',
      description: 'The fortnight had a dozen decisions in it. Each one had an owner, and the owner wasn’t always the person with the console in front of them.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['across-the-lifetime'],
      conditions: [
        {
          type: 'status-check',
          description: 'Decision Ownership Named',
          params: {
            character: Character.SYSTEM,
            question:
              'Stop 3. Who owns each of these: rotating the command key out of cycle, holding a pass to protect evidence, zeroizing a key, and declaring an incident to the regulator?',
            options: [
              'Rotation: the operator proposes, constellation ops (Anneke) concurs. Hold a pass: the site lead (Charlie). Zeroize: CSIRT (Priya). Regulator: Group',
              'All four are the operator’s: whoever has the console makes the call and reports it afterwards, including the call to the regulator, with no sign-off',
              'All four are the site lead’s: the operator executes, CSIRT is informed afterwards, and Group hears about it from the site lead later that day',
              'Rotation and zeroize are the operator’s. Holding a pass is Rotterdam’s. The regulator is the customer’s to declare, not Group’s, and CSIRT is only told afterwards',
            ],
            correctIndex: 0,
            explanation:
              'The operator owns what happens at the console in the next minute and proposes everything else. A decision with a cost the site can’t undo belongs to the level that can, which is why one night a key was nearly zeroized on principle and this stop exists. The other answers hand all four calls to one person.',
            pointPenalty: 5,
            documentLine:
              'Stop 3: decision ownership - operator (console, proposes), site lead (holds), constellation ops (concurs), CSIRT (zeroize, compromise), Group (regulator).',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'the-soft-target',
      nice: ['K0721'],
      title: 'Stop 4 - The Soft Target',
      description: 'Nobody attacked MERIDIAN in April. Everything that happened was aimed at the ground, so work out why the ground is the target.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['who-decides'],
      conditions: [
        {
          type: 'status-check',
          description: 'Soft Target Explained',
          params: {
            character: Character.SYSTEM,
            question: 'Stop 4. Why is the ground segment the target, and not the satellite?',
            options: [
              'The ground is reachable: it has people, accounts, vendors, a network with an outside edge, and RF anyone can hear. The satellite has none of that',
              'Satellites are better built than ground stations, so the ground is where the cheap equipment is and where an attacker can do the easiest damage to it',
              'The satellite is out of range of any attacker, so only a nation with a launch capability can reach the space segment at all, and nobody else tries',
              'The ground is not the target. The fortnight was aimed at MERIDIAN, and Galway was collateral damage on the way to it',
            ],
            correctIndex: 0,
            explanation:
              'The ground is where the attack surface is, because the ground is where everything else is, including the only path to the satellite. A failed-login burst, a contractor account, a config export, a carrier from 24 km away and a replay of our own frames all needed nothing in orbit.',
            pointPenalty: 5,
            documentLine: 'Stop 4: the ground is the soft target - people, accounts, vendors, an outside edge, open RF; the bird is reached through it.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'the-effects',
      nice: ['K0926', 'K0721'],
      title: 'Stop 5 - The Effects',
      description: 'The five effects are deny, degrade, disrupt, deceive and exploit. Match each incident from the fortnight to the effect the attacker was after.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['the-soft-target'],
      conditions: [
        {
          type: 'status-check',
          description: 'Effects Matched',
          params: {
            character: Character.SYSTEM,
            question:
              'Stop 5. Which effect was each of these: the 11690 carrier under SAR-1, the spoofed GNSS time, the uplink denial on SAR-3, the replayed command frames and the exported configuration?',
            options: [
              'Carrier: degrade. Spoofed time: deceive. Uplink denial: deny. Replayed frames: exploit. Config export: exploit',
              'Carrier: deny. Spoofed time: disrupt. Uplink denial: degrade. Replayed frames: deceive. Config export: deny',
              'Carrier: deny. Spoofed time: deny. Uplink denial: deny. Replayed frames: deny. Config export: deny (each cost a product)',
              'Carrier: deceive. Spoofed time: exploit. Uplink denial: deny. Replayed frames: degrade. Config export: disrupt',
            ],
            correctIndex: 0,
            explanation:
              'The effect is what the attacker gets, not what the incident looked like on the analyzer. The carrier dented the video, so it degraded the link, and the false time reference deceived. The jammed uplink denied. A replayed frame and an exported config are both exploitation, because they use our own command path, or our knowledge of it, against us.',
            pointPenalty: 5,
            documentLine: 'Stop 5: effects - carrier = degrade, spoof = deceive, uplink jam = deny, replay = exploit, config export = exploit.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'the-consequence',
      nice: ['K0741'],
      title: 'Stop 6 - What Is Lost',
      description: 'A pass is a number on the board, but what you lose when you lose it is not. Frame it the way the customer would.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['the-effects'],
      conditions: [
        {
          type: 'status-check',
          description: 'Consequence Framed',
          params: {
            character: Character.SYSTEM,
            question: 'Stop 6. Suppose SAR-2’s 02:40 pass is lost to the carrier. Which statement gives the consequence the way the report should state it?',
            options: [
              'One SAR-2 collect over the North Atlantic not delivered: the imagery for that orbit is missing, and the customer’s decision is made without it',
              'C/N dropped below 8 dB for four minutes, so the receiver lost the video during the pass and the demodulator could not lock until the pass was over',
              'The station failed to meet its service level for the night, and the report should record the missed pass against that target and nothing more',
              'Nothing was lost, because the next pass will collect the same scene and the customer can wait for that one without any loss',
            ],
            correctIndex: 0,
            explanation:
              'C/N is the symptom on our side of the wall. The consequence is on the customer’s side: a product not delivered, a decision made without it, and a window that doesn’t come back. The report says that first and then says when the next opportunity is, which is the following pass.',
            pointPenalty: 5,
            documentLine: 'Stop 6: consequence framing - state the product not delivered and the decision affected, then the next opportunity; C/N is the symptom.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'the-m-and-c-path',
      nice: ['K0915', 'K0689'],
      title: 'Stop 7 - The Monitor-and-Control Path',
      description:
        'Open the Security console, sign off the log as reviewed, and follow the path from the workstation you’re sitting at to the dish. Everything the fortnight did to the station went along it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['the-consequence'],
      conditions: [
        { type: 'tab-active', description: 'Security Console Open', params: { tab: 'security-console' }, mustMaintain: false },
        { type: 'audit-log-reviewed', description: 'Audit Log Reviewed', params: {}, mustMaintain: false },
        {
          type: 'status-check',
          description: 'M&C Path Traced',
          params: {
            character: Character.SYSTEM,
            question: 'Stop 7. Which of these traces the monitor-and-control path from the operator workstation to the antenna?',
            options: [
              'Workstation (M&C client) -> M&C network segment -> the ACU, RF front end controller, modems and GPSDO, each on its own management port',
              'Workstation -> corporate network -> internet -> vendor cloud -> the ACU, RF front end controller, modems and GPSDO together over the open internet',
              'Workstation -> the modem only; the ACU and the RF front end are stand-alone and are configured at the rack by hand, one unit at a time',
              'There is no path: every unit is configured by hand at the rack, and the console only displays what the units report back',
            ],
            correctIndex: 0,
            explanation:
              'One segment carries every command that moves the dish, tunes the LNB, sets the modems and disciplines the reference, and the Security console watches that segment. That’s why the audit log is the most useful screen on the station, and why the boundary of the segment is the thing to defend.',
            pointPenalty: 5,
            documentLine: 'Stop 7: M&C path - workstation -> M&C segment -> ACU / RF front end / modems / GPSDO management ports; console watches the segment.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'not-ordinary-it',
      nice: ['K0741', 'K0915', 'K0689'],
      title: 'Stop 8 - Not Ordinary IT',
      description: 'This stop has two questions: why the units on the M&C segment can’t be treated like office laptops, and where the boundaries around that segment are.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['the-m-and-c-path'],
      conditions: [
        {
          type: 'status-check',
          description: 'OT Difference Named',
          params: {
            character: Character.SYSTEM,
            question: 'Stop 8a. Why is the ACU not patched, scanned and rebooted the way an office laptop is?',
            options: [
              'Availability first: it runs the 02:20 pass whether or not a patch is out, and its firmware is vendor-qualified',
              'It is too old to patch, because the vendor stopped supporting it, so nobody on the site is allowed to touch the firmware at all',
              'It is air-gapped, so it cannot be attacked, and needs no patching, scanning or monitoring',
              'It is patched exactly like a laptop, and the only difference is the operating system underneath, which is Linux rather than Windows',
            ],
            correctIndex: 0,
            explanation:
              'Operational equipment is judged by whether the pass happens, so an unplanned update, or a scanning agent that can stall a control loop, is a risk to the mission and not a fix. Security on it means maintenance windows, verified images, logging and a boundary, not an agent and a reboot on a Tuesday.',
            pointPenalty: 5,
            documentLine: 'Stop 8a: OT is not IT - availability first, vendor-qualified firmware, changes in windows from verified images, logged.',
          },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Boundaries Named',
          params: {
            character: Character.SYSTEM,
            question: 'Stop 8b. Where are the boundaries around the M&C segment, and what is allowed to cross them?',
            options: [
              'Between M&C and the corporate network: a firewall that lets only the monitoring feed out. Between corporate and the internet: the edge and a ticketed jump host',
              'There is one boundary, at the internet, and inside the site every system can talk to every other without restriction',
              'The boundary is the modem: RF is outside, and everything with an Ethernet port is inside and trusted',
              'There are no boundaries, so the site relies on the operator noticing anything unusual and reporting it to the site lead afterwards, and nothing more',
            ],
            correctIndex: 0,
            explanation:
              'There are two boundaries, each with a short list of what crosses it, and nothing on the M&C segment reaches the internet directly. A vendor session that arrives on the M&C segment from the internet has crossed both without appearing on either list, which is what the fourth drill covers.',
            pointPenalty: 5,
            documentLine: 'Stop 8b: boundaries - M&C | corporate (monitoring out only), corporate | internet (jump host, ticketed vendor access).',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'the-pattern',
      nice: ['K1032', 'K0926'],
      title: 'Stop 9 - The Pattern',
      description: 'Open RX Analysis. On 12 April a carrier from a hill 24 km south-west showed up on a dish pointed north at 30 degrees elevation. Work out how it got in.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['not-ordinary-it'],
      conditions: [
        { type: 'tab-active', description: 'RX Analysis Open', params: { tab: 'rx-analysis' }, mustMaintain: false },
        {
          type: 'status-check',
          description: 'Pattern Explained',
          params: {
            character: Character.SYSTEM,
            question: 'Stop 9. A 4 m dish pointed north at 30 degrees elevation received a ground emitter 24 km to the south-west at about -90 dBm. How did that happen?',
            options: [
              'Through a sidelobe. The mainlobe is about a degree wide, but the pattern doesn’t fall to nothing outside it, and 60 dBm of EIRP over 24 km leaves enough',
              'Through the mainlobe, because the emitter was on the same bearing as the satellite and so was inside the beam the dish was pointed along at the time',
              'It was not received by the dish at all, because the carrier came in on the LNB cable instead of through the antenna, which was never involved',
              'Ground emitters are always received at full gain, because they are closer to the dish than the satellite is',
            ],
            correctIndex: 0,
            explanation:
              'The gain outside the mainlobe is small but it isn’t zero. The sidelobe envelope sits tens of dB below the peak in every direction, and the nulls between sidelobes are narrow, so no direction is deaf. A strong emitter nearby doesn’t need much gain to get in. The mainlobe answer fails because the emitter was south-west of a dish pointed north.',
            pointPenalty: 5,
            documentLine:
              'Stop 9: pattern - mainlobe ~1 deg, sidelobe envelope tens of dB down in every direction, narrow nulls; a strong nearby emitter enters through a sidelobe.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'outside-the-fence',
      nice: ['K0682', 'K0721'],
      title: 'Stop 10 - Outside the Fence',
      description:
        'Think about the config export, the contact schedule and a photo of the dish at dawn. What about a shift is sensitive once it leaves the site, and what does the station itself give away?',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['the-pattern'],
      conditions: [
        {
          type: 'status-check',
          description: 'OPSEC and Emissions Named',
          params: {
            character: Character.SYSTEM,
            question: 'Stop 10. Which of these is the operations-security list for a Galway shift, the things that stay inside the fence?',
            options: [
              'The contact schedule (when the dish will be pointed where), the frequency plan and configuration, key change dates, staffing and vendor visits, none of it posted or mailed',
              'Only the crypto keys are sensitive, because the schedule and the frequency plan are published to the customer anyway and tell an outsider nothing they can use against the site',
              'Nothing is sensitive, because the station is fenced and the network is segmented, so information leaving the site is not a risk to a pass or to the customer’s product',
              'The operators’ names and shifts only, because equipment details are already public in the vendor’s brochure and are no use to anyone planning to interfere with a pass',
            ],
            correctIndex: 0,
            explanation:
              'The carrier arrived at the highest point of a pass whose time somebody knew, so the schedule is targeting information and the config export is a map. The station also gives itself away: a dish pointed at the sky, a BUC keyed up and a beacon locked are all observable from outside, so a pass is a public event to anyone watching. The list is short, and the discipline is to keep it that way.',
            pointPenalty: 5,
            documentLine:
              'Stop 10: OPSEC - schedule, frequency plan/config, key dates, staffing/vendor visits stay inside; the station’s own emissions and pointing are observable.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ],
};
