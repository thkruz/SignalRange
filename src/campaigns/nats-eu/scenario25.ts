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
  imageUrl: 'nats/17/card.png',
  number: 25,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario16'],
  title: 'Site Orientation',
  subtitle: 'Security Drill 1/4',
  duration: '15 min',
  missionType: 'Security Drill',
  description: `09:00, Galway, a quiet Wednesday after a loud fortnight. Group Security has written a site orientation sheet out of everything the Gray Zone incidents taught, and every operator walks it once with the consoles in front of them.<br><br>Ten stops. What the station is part of, what it does across a satellite's life, who owns which decision, why the ground is the soft target, what an attacker is trying to do to a link and what is lost when they succeed, where the monitor-and-control path runs and why it is not ordinary IT, how a ground emitter got into a dish pointed at the sky, and what about a shift must not leave the fence.`,
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
      description: 'Ten stops, one line each. Signed off by the operator walking it.',
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
      description: 'Open the sheet: the ten stops, the diagram of the segments, the flow baseline, and the incident list from the fortnight the questions come from.',
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
      description: 'Space, link, ground, user. Galway is one of them; the imagery customer in Rotterdam is another; the thing that goes wrong most often is in between.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'status-check',
          description: 'Segments Named',
          params: {
            character: Character.SYSTEM,
            question: 'Stop 1. Which of these puts GW-01, MERIDIAN-SAR-1, the Ku-band downlink and the imagery analysts in Rotterdam into the right segments?',
            options: [
              'Ground segment: GW-01 and Rotterdam constellation ops. Space segment: SAR-1. Link segment: the Ku-band downlink and the uplink. User segment: the analysts who consume the imagery',
              'Ground segment: GW-01 only. Space segment: SAR-1 and the downlink. User segment: Rotterdam. There is no separate link segment',
              'Everything on the Earth is the user segment; everything above it is the space segment; the link is part of both',
              'Ground segment: GW-01 and the analysts. Space segment: SAR-1 and Rotterdam constellation ops, since they fly the bird',
            ],
            correctIndex: 0,
            explanation:
              'Logged. Four segments, and the operator sits in one of them. Rotterdam flies the bird from the ground; the analysts are users of the product, not of the station. The link segment is where the fortnight happened: the carrier, the replay, the denial were all attacks on the link, seen from the ground.',
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
      description: 'A ground station is not one job. What it does for a satellite changes from launch to disposal, and the fortnight touched three of those phases.',
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
              'Launch and early orbit (first contact, first telemetry), commissioning (payload checkout), routine operations (passes, products, state of health), anomaly response, end of life (disposal commanding)',
              'Routine operations first, then commissioning once the customer is happy, then launch support for the next bird',
              'Commissioning, launch, routine operations, disposal - the station is not involved in early orbit',
              'Routine operations only; launch, commissioning and disposal belong to the constellation operator, not to a ground station',
            ],
            correctIndex: 0,
            explanation:
              'Logged. Galway spends most of its life in routine operations and anomaly response - the two the fortnight was made of - but the station is also the first thing a new bird talks to and the last thing an old one hears.',
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
      description: 'The fortnight had a dozen decisions in it. Each one had an owner, and the owner was not always the person with the console in front of them.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['across-the-lifetime'],
      conditions: [
        {
          type: 'status-check',
          description: 'Decision Ownership Named',
          params: {
            character: Character.SYSTEM,
            question: 'Stop 3. Rotate the command key out of cycle; hold a pass to protect evidence; zeroize a key; declare an incident to the regulator. Who owns each?',
            options: [
              'Rotation: the operator proposes, constellation ops (Anneke) concurs at the far end. Holding a pass: the site lead (Charlie). Zeroize: nobody below CSIRT (Priya) without a compromise finding. Regulator: Group, never the site',
              'All four are the operator’s: whoever has the console makes the call and reports it afterwards',
              'All four are the site lead’s; the operator executes and CSIRT is informed',
              'Rotation and zeroize are the operator’s; holding a pass is Rotterdam’s; the regulator is the customer’s',
            ],
            correctIndex: 0,
            explanation:
              'Logged. The operator owns what happens on the console in the next minute and proposes everything else. The night a key was nearly zeroized on principle is the reason this stop exists: a decision with a cost the site cannot undo belongs to the level that can.',
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
      description: 'Nobody attacked MERIDIAN in April. Everything that happened, happened to the ground, and there is a reason for that.',
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
              'The ground is reachable: it has people, accounts, vendors, a network with an outside edge, and RF that anyone with a dish can hear or key into. The bird has none of those, and everything that commands it goes through the ground anyway',
              'Satellites are better built than ground stations; the ground is where the cheap equipment is',
              'The bird is out of range of any attacker; only a nation with a launch capability can reach the space segment',
              'The ground is not the target - the fortnight was aimed at MERIDIAN and Galway was collateral',
            ],
            correctIndex: 0,
            explanation:
              'Logged. A failed-login burst, a contractor account, a config export, a carrier from 24 km away, a replay of our own frames: every one of them needed nothing in orbit. The ground is where the attack surface is because the ground is where everything else is.',
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
      description: 'Deny, degrade, disrupt, deceive, exploit. The fortnight had one of each. Match them.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['the-soft-target'],
      conditions: [
        {
          type: 'status-check',
          description: 'Effects Matched',
          params: {
            character: Character.SYSTEM,
            question:
              'Stop 5. The 11690 carrier under SAR-1; the spoofed GNSS time; the uplink denial on SAR-3; the replayed command frames; the exported configuration. Which effect was each?',
            options: [
              'Carrier: degrade. Spoofed time: deceive. Uplink denial: deny. Replayed frames: exploit (an attempt to use our own command path). Config export: exploit (information taken for later)',
              'Carrier: deny. Spoofed time: disrupt. Uplink denial: degrade. Replayed frames: deceive. Config export: deny',
              'All five were denial - every one of them cost the customer a product',
              'Carrier: deceive (it looked like the satellite). Spoofed time: exploit. Uplink denial: deny. Replayed frames: degrade. Config export: disrupt',
            ],
            correctIndex: 0,
            explanation:
              'Logged. The effect is what the attacker gets, not what it looked like on the analyzer. A carrier that dents the video degrades; a reference that lies deceives; a jammed uplink denies; a replayed frame and an exported config are both exploitation - using our own system, or knowledge of it, against us.',
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
      description: 'A pass is a number on the board. The consequence of losing it is not. Frame it the way the customer would.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['the-effects'],
      conditions: [
        {
          type: 'status-check',
          description: 'Consequence Framed',
          params: {
            character: Character.SYSTEM,
            question: 'Stop 6. SAR-2’s 02:40 pass is lost to the carrier. What is the consequence, stated the way the report should state it?',
            options: [
              'One SAR-2 collect over the North Atlantic not delivered: the imagery product for that orbit is missing, the next opportunity is the following pass, and the customer’s decision that needed it is made without it. C/N is how we saw it; the product is what was lost',
              'C/N dropped below 8 dB for four minutes',
              'The station failed to meet its service level for the night',
              'Nothing was lost - the next pass will collect the same scene',
            ],
            correctIndex: 0,
            explanation:
              'Logged. C/N is the symptom on our side of the wall. The consequence lives on the customer’s side: a product not delivered, a decision made without it, a window that does not come back. The report says that, and then says when the next one is.',
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
        'Open the Security console, sign off the log as reviewed, and follow the path from the workstation you are sitting at to the dish. Everything the fortnight did to the station went along it.',
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
            question: 'Stop 7. Trace the monitor-and-control path from the operator workstation to the antenna.',
            options: [
              'Workstation (M&C client) -> M&C network segment -> the ACU, the RF front end controller, the modems and the GPSDO, each on its own management port. The Security console watches that segment; the crypto unit sits beside it with its own path',
              'Workstation -> corporate network -> internet -> vendor cloud -> ACU',
              'Workstation -> the modem only; the ACU and the front end are stand-alone and are configured at the rack',
              'There is no path: every unit is configured by hand at the rack and the console only displays',
            ],
            correctIndex: 0,
            explanation:
              'Logged. One segment carries every command that moves the dish, tunes the LNB, sets the modems and disciplines the reference. That is why the audit log is the most useful screen on the station and why the boundary of that segment is the thing to defend.',
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
      description: 'Two questions on the same stop: why the units on the M&C segment cannot be treated like office laptops, and where the boundaries around that segment are.',
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
              'Availability first: it runs a pass at 02:20 whether or not a patch is out; its firmware is vendor-qualified against the hardware, so an unplanned update is a risk to the mission, not a fix; and an agent scanning it can stall a control loop. Changes go in maintenance windows, from verified images, and are logged',
              'It is too old to patch; the vendor stopped supporting it',
              'It is air-gapped, so it cannot be attacked and does not need patching',
              'It is patched exactly like a laptop; the difference is only that it runs Linux',
            ],
            correctIndex: 0,
            explanation:
              'Logged. Operational equipment is judged by whether the pass happens. Security on it is windows, verified images, logging and a boundary, not an agent and a reboot on Tuesday.',
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
            question: 'Stop 8b. Where are the boundaries around the M&C segment, and what crosses them?',
            options: [
              'Between M&C and the corporate network: a firewall that allows only the monitoring feed out and nothing in. Between corporate and the internet: the site edge, with vendor access only through a jump host on a ticket. Nothing on the M&C segment reaches the internet directly',
              'There is one boundary, at the internet; inside the site everything can talk to everything',
              'The boundary is the modem: RF is outside, everything with an Ethernet port is inside and trusted',
              'There are no boundaries; the site relies on the operator noticing',
            ],
            correctIndex: 0,
            explanation:
              'Logged. Two boundaries, each with a short list of what crosses it. A vendor session that arrives on the M&C segment from the internet has crossed both without appearing on either list - which is the fourth drill.',
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
      description: 'Open RX Analysis. On 12 April a carrier from a hill 24 km south-west showed on a dish pointed at 30 degrees elevation, north. Say why.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['not-ordinary-it'],
      conditions: [
        { type: 'tab-active', description: 'RX Analysis Open', params: { tab: 'rx-analysis' }, mustMaintain: false },
        {
          type: 'status-check',
          description: 'Pattern Explained',
          params: {
            character: Character.SYSTEM,
            question: 'Stop 9. A 4 m dish pointed at el 30 north received a ground emitter 24 km to the south-west at about -90 dBm. How?',
            options: [
              'Through a sidelobe. The mainlobe is a degree wide, but the pattern does not fall to nothing outside it: the sidelobe envelope sits tens of dB below the peak in every direction, and 60 dBm of EIRP over 24 km leaves enough for that to matter. Nulls between sidelobes are narrow; no direction is deaf',
              'Through the mainlobe: the emitter was on the same bearing as the satellite',
              'It was not received by the dish at all; the carrier came in on the LNB cable',
              'Ground emitters are always received at full gain because they are closer than the satellite',
            ],
            correctIndex: 0,
            explanation:
              'Logged. Mainlobe, sidelobes, nulls. The gain outside the mainlobe is small but it is not zero, and a strong emitter nearby does not need much. That is also why the 9 m dish in the Signal Hunter campaign hears a fixed-wireless site, and why the correlator, which only sees what the satellites see, does not.',
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
        'The config export, the contact schedule, a photo of the dish at dawn. What about a shift is sensitive once it leaves the site, and what does the station itself give away?',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['the-pattern'],
      conditions: [
        {
          type: 'status-check',
          description: 'OPSEC and Emissions Named',
          params: {
            character: Character.SYSTEM,
            question: 'Stop 10. Which of these is the operations-security list for a Galway shift?',
            options: [
              'The contact schedule (when the dish will be pointed where), the frequency plan and configuration, key change dates, staffing and vendor visits - none of it posted, mailed unencrypted or discussed off site. And the station emits: a dish pointed at the sky, a BUC keyed up, a beacon locked are all observable from outside, so a pass is a public event to anyone watching',
              'Only the crypto keys are sensitive; the schedule and the frequency plan are published to the customer anyway',
              'Nothing: the station is fenced and the network is segmented, so information leaving the site is not a risk',
              'The operators’ names and shifts only; equipment details are public in the vendor’s brochure',
            ],
            correctIndex: 0,
            explanation:
              'Logged. The carrier arrived at the culmination of a pass whose time somebody knew. The schedule is targeting information; the config export is a map; and the dish itself tells the hill when we are busy. The list is short, and the discipline is to keep it that way.',
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
