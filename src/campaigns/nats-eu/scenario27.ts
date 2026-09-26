import { Character } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import { DRILL_BRIEF, DRILL_EQUIPMENT, drillGalway, drillSatellites } from './drills';

/**
 * nats-eu Scenario 27: "Removable Media" (Drill 3/4, phase 18 G)
 *
 * A vendor technician on site has mounted a USB stick on the M&C workstation
 * and staged an ACU firmware image from it. The drill is the transfer rule
 * (6.5), trusting what was installed (6.8) and, underneath both, why the ACU
 * is not a laptop (6.2).
 *
 * The decision is graded on config-drifted: the firmware stage is a
 * config-category anomaly and stays unacknowledged until after the call, so
 * the fact reads true when the call is made. The evidence for the call is the
 * media entry flagged (an access-category entry, which config-drifted does
 * not read). The wrong "let it install" branch injects the reboot it would
 * have caused.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0803: Knowledge of supply chain risk management principles and practices
 *   - K0721: Knowledge of threats to information systems
 *   - K0820: Knowledge of supply chain risks
 * Supporting Codes:
 *   - S0838: Skill in identifying anomalous activities
 *   - K0741: Knowledge of system availability measures
 *   - T1567: Implement system security configurations
 *   - S0842: Skill in recording operational events
 */
export const natsEuScenario27Data: ScenarioData = {
  id: 'nats-eu-scenario27',
  url: 'nats-eu/scenarios/nats-eu-scenario27',
  imageUrl: 'nats/17/card.png',
  number: 27,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario26'],
  title: 'Removable Media',
  subtitle: 'Security Drill 3/4',
  duration: '15 min',
  missionType: 'Security Drill',
  description: `08:00, Galway, Friday. The ACU vendor’s technician is on site for the annual service and has been in the equipment room since 07:30. The audit log has two entries from the last twenty minutes that were not on the service plan: a USB device mounted on the M&C workstation, and an ACU firmware image staged from it.<br><br>Nothing has installed yet. The drill is what you do in the next ten minutes: the transfer rule, how a firmware image earns trust, and why the machine that moves the dish gets none of the shortcuts a laptop gets.`,
  equipment: DRILL_EQUIPMENT,
  settings: {
    isSync: true,
    groundStations: [drillGalway()],
    satellites: drillSatellites(),
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-04-30',
    scenarioStartWallTime: '08:00:00',
    missionBriefUrl: DRILL_BRIEF(27),
    workingDocument: {
      title: 'Security Event GW-01 / 30 April',
      description: 'Removable media on the M&C workstation. What was found, what was held, what was verified.',
    },
    security: {
      accounts: [
        { id: 'op-duty', name: 'Operator on duty (you)', role: 'Operator', status: 'active' },
        { id: 'op-charlie', name: 'C. Brooks', role: 'Site Lead', status: 'active' },
        { id: 'vend-tech', name: 'Vendor technician (on site, escorted)', role: 'Maintenance', status: 'active' },
      ],
      events: [
        { id: 'evt-login-day', timeS: 0, timestampLabel: '05:58 UTC', actor: 'op-duty', action: 'Console login', category: 'auth', severity: 'info' },
        {
          id: 'evt-tech-login',
          timeS: 0,
          timestampLabel: '07:31 UTC',
          actor: 'vend-tech',
          action: 'Console login (escorted maintenance, ticket MNT-0430)',
          category: 'auth',
          severity: 'info',
        },
        { id: 'evt-acu-read', timeS: 0, timestampLabel: '07:36 UTC', actor: 'vend-tech', action: 'ACU diagnostics read (per MNT-0430)', category: 'command', severity: 'info' },
        {
          id: 'evt-usb',
          timeS: 0,
          timestampLabel: '07:41 UTC',
          actor: 'vend-tech',
          action: 'USB mass-storage device mounted on M&C workstation GW-MC-01 (no media ticket)',
          category: 'access',
          severity: 'warning',
          isAnomaly: true,
        },
        {
          id: 'evt-fw-stage',
          timeS: 0,
          timestampLabel: '07:44 UTC',
          actor: 'vend-tech',
          action: 'ACU controller firmware image staged from removable media: acu-4.2.1-vendor.bin (unsigned, not in MNT-0430)',
          category: 'config',
          severity: 'critical',
          isAnomaly: true,
        },
        { id: 'evt-ntp', timeS: 0, timestampLabel: '07:45 UTC', actor: 'svc-monitor', action: 'Reference sync check OK', category: 'command', severity: 'info' },
      ],
    },
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Read the Service Plan',
      description: 'Open the plan: ticket MNT-0430 (diagnostics read, fan replacement, no firmware), the transfer rule for the enclave, and the vendor’s signed-release process.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [{ type: 'mission-brief-opened', description: 'Service Plan Opened', params: { boxId: 'mission-brief' }, mustMaintain: false }],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'review-the-log',
      nice: ['S0838', 'K0803'],
      title: 'Find What Is Off the Plan',
      description: 'Open the Security console and read the morning against MNT-0430. Two entries are not on it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        { type: 'audit-log-reviewed', description: 'Audit Log Reviewed', params: {}, mustMaintain: false },
        {
          type: 'status-check',
          description: 'Off-plan Entries Identified',
          params: {
            character: Character.SYSTEM,
            question: 'Which entries in the log are outside ticket MNT-0430, and which rule does each break?',
            options: [
              '07:41 USB mass storage mounted on the M&C workstation (breaks the transfer rule: nothing enters the enclave on removable media without a media ticket and a scan) and 07:44 an unsigned ACU firmware image staged from it (breaks change control: no firmware in the ticket, no signed release)',
              'Only the 07:44 firmware stage; the USB mount is routine for a vendor visit',
              'The 07:36 diagnostics read - the vendor should not have console access at all',
              'None: the technician is escorted and on a ticket, so everything they do is covered by it',
            ],
            correctIndex: 0,
            explanation:
              'Logged. An escort and a ticket cover what the ticket says. The stick and the image are two separate rules broken in three minutes, and the second one has not finished happening yet.',
            pointPenalty: 5,
            documentLine: '07:41 USB mounted on GW-MC-01 (no media ticket); 07:44 unsigned ACU firmware acu-4.2.1-vendor.bin staged (not in MNT-0430).',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'call-the-media',
      nice: ['K0803', 'K0721', 'S0838'],
      title: 'Call It',
      description:
        'Flag the media entry so the record shows you saw it. Leave the firmware entry until the call is made - the call is graded on the log as it stands. Then decide what happens to the image.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-the-log'],
      conditions: [
        { id: 'usb-flagged', type: 'security-event-acknowledged', description: 'USB mount flagged', params: { eventId: 'evt-usb' }, mustMaintain: true },
        {
          type: 'decision',
          description: 'What Happens to the Image',
          params: {
            character: Character.SYSTEM,
            prompt: 'Charlie, from the equipment room: "He says it is the service release and it takes four minutes. Yes or no, and what do you want done with the stick?"',
            evidence: ['usb-flagged'],
            decisionOptions: [
              {
                label:
                  'No. Hold the staged image, take the workstation off the M&C segment, keep the stick as it is, and suspend the technician’s account. The image installs only after its hash matches the vendor’s signed release, obtained through the enclave transfer path, under a ticket that names it. Group Security gets the log',
                correctWhen: { fact: 'config-drifted', is: true },
                consequence: { log: 'ACU firmware stage held; GW-MC-01 isolated; media retained; vend-tech suspended pending verification' },
              },
              {
                label: 'Nothing is pending against the configuration - the log is clean. Let the service continue',
                correctWhen: { fact: 'config-drifted', is: false },
                feedback:
                  'An unsigned firmware image is staged on the ACU controller and the entry is sitting unflagged in the log. That is a pending configuration change with nobody’s name on it.',
              },
              {
                label: 'Yes - it is the vendor’s own technician with the vendor’s own release. Let it install, acknowledge the entries, note it in the ticket afterwards',
                feedback:
                  'The technician’s badge does not sign the file. An image that arrived on a stick, is not in the ticket, and carries no signature is exactly what a supply-chain compromise looks like from the inside - and the ACU would have rebooted on it.',
                consequence: {
                  pointDelta: -10,
                  auditEvent: {
                    id: 'evt-acu-reboot',
                    timestampLabel: '08:07 UTC',
                    actor: 'vend-tech',
                    action: 'ACU controller rebooted on unverified image acu-4.2.1-vendor.bin',
                    category: 'config',
                    severity: 'critical',
                    isAnomaly: true,
                  },
                  log: 'ACU firmware installed from unverified media',
                },
              },
              {
                label: 'Wipe and reimage the workstation now, destroy the stick, and send the technician off site',
                feedback:
                  'Wiping the workstation and destroying the stick removes the only evidence of what was on them. Hold, isolate, keep - then let CSIRT decide what gets wiped.',
                consequence: { pointDelta: -5, log: 'Workstation wiped and media destroyed before analysis' },
              },
            ],
            explanation:
              'The right answer is a hold, not a verdict. The image might be exactly what he says it is; the station cannot know that yet, and the machine it is staged on moves the dish. Verification is a hash against a signed release through the proper path, not a technician’s word.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'verify-the-image',
      nice: ['K0820', 'K0803'],
      title: 'How the Image Earns Trust',
      description: 'The technician is sure it is the service release. Say what would make the station sure.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['call-the-media'],
      conditions: [
        {
          type: 'status-check',
          description: 'Verification Path Stated',
          params: {
            character: Character.SYSTEM,
            question: 'What makes acu-4.2.1-vendor.bin trustworthy enough to install on the ACU controller?',
            options: [
              'A release the vendor publishes with a signature and a hash; the file obtained through the enclave transfer path (not the stick); the hash checked against the published one on the isolated workstation; and a change ticket naming the version, the window and the rollback. Any link missing, it does not install',
              'The technician’s assurance plus a virus scan of the stick',
              'The file name matching the version in the vendor’s release notes',
              'Nothing can make it trustworthy; the ACU should never be updated',
            ],
            correctIndex: 0,
            explanation:
              'Logged. Trusting what was installed means being able to say where it came from and prove it is what it claims to be. A signed release, a controlled path, a hash match and a ticket are that proof; a badge and a scan are not.',
            pointPenalty: 5,
            documentLine: 'Verification: vendor-signed release, obtained via enclave transfer path, hash matched on isolated host, installed under a ticket with rollback.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'flag-the-firmware',
      nice: ['S0838', 'S0842'],
      title: 'Flag the Firmware Stage',
      description: 'Now flag the firmware entry so the record carries the hold.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['verify-the-image'],
      conditions: [{ type: 'security-event-acknowledged', description: 'Firmware Stage Flagged', params: { eventId: 'evt-fw-stage' }, mustMaintain: true }],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'hold-the-technician',
      nice: ['T1567', 'K0645'],
      title: 'Suspend the Technician’s Account',
      description: 'The escorted account is disabled until the image is verified and the ticket amended. The fan can wait.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['flag-the-firmware'],
      conditions: [{ type: 'access-control-set', description: 'vend-tech Disabled', params: { accountId: 'vend-tech', accountStatus: 'disabled' }, mustMaintain: true }],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'the-transfer-rule',
      nice: ['K0803', 'K0645'],
      title: 'The Right Way In',
      description: 'The vendor does need to get firmware onto the station sometimes. Say how it is supposed to happen.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['hold-the-technician'],
      conditions: [
        {
          type: 'status-check',
          description: 'Transfer Rule Stated',
          params: {
            character: Character.SYSTEM,
            question: 'How does a file get into the M&C enclave?',
            options: [
              'Through the transfer station: a media ticket raised in advance, the file scanned and hash-checked on the isolated kiosk, moved across by the one-way path onto site-owned media, and the whole thing logged with two names on it. Personal or vendor media never mounts on an M&C host',
              'On any stick, as long as the workstation’s antivirus scans it first',
              'By email to the operator, who copies it across',
              'Vendors bring their own media; the site trusts the vendor',
            ],
            correctIndex: 0,
            explanation: 'Logged. The rule exists so that the question "what is on this stick" never has to be answered on the machine that moves the dish. Slow by design.',
            pointPenalty: 5,
            documentLine: 'Transfer rule: media ticket, isolated kiosk scan + hash, one-way path to site media, two-name log; no foreign media on M&C hosts.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'why-not-a-laptop',
      nice: ['K0741', 'K0721'],
      title: 'Why Not Just Scan It',
      description: 'The technician’s objection: every office in the country scans a stick and moves on. Say why this room is different.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['the-transfer-rule'],
      conditions: [
        {
          type: 'status-check',
          description: 'OT Reasoning Stated',
          params: {
            character: Character.SYSTEM,
            question: 'Why is "scan the stick on the workstation and install" not acceptable here when it is everywhere else?',
            options: [
              'Because the workstation is on the segment that controls the antenna, and the ACU runs firmware nothing on that segment can inspect afterwards. A scanner catches what it knows; a modified controller image is not on its list. On operational equipment the control is the path the file took, not a scan at the end of it',
              'Because the antivirus on the workstation is out of date',
              'Because the vendor is not trusted by the site',
              'It is acceptable; the drill is about paperwork',
            ],
            correctIndex: 0,
            explanation:
              'Logged. An office laptop can be wiped tomorrow. A controller running a bad image points a four-metre dish wherever the image says, on the next pass, with nobody watching.',
            pointPenalty: 5,
            documentLine: 'OT reasoning: M&C hosts control the antenna; controller firmware cannot be inspected after install; the control is the transfer path, not a scan.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'log-the-event',
      nice: ['S0842', 'K0645'],
      title: 'Log the Event',
      description: 'One entry for Group Security with the times, the hold, and what verification is waiting on.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['why-not-a-laptop'],
      conditions: [
        {
          type: 'status-check',
          description: 'Event Logged',
          params: {
            character: Character.SYSTEM,
            question: 'Which entry closes the event?',
            options: [
              '07:41 USB mounted on GW-MC-01 by vend-tech (no media ticket); 07:44 unsigned acu-4.2.1-vendor.bin staged on ACU (not in MNT-0430). 08:05 stage held, GW-MC-01 isolated, media retained, vend-tech suspended. Install pending hash match against signed release via transfer path. Group Security notified',
              'Vendor tried to install firmware; told him no',
              'Firmware installed after the technician confirmed it was the service release',
              'Event closed; workstation reimaged; media destroyed',
            ],
            correctIndex: 0,
            explanation: 'Logged. Times, entries, hold, what is waiting on what. The service resumes when the image has a signature and a ticket, and not before.',
            pointPenalty: 5,
            documentLine: 'Closed 08:10: stage held, GW-MC-01 isolated, media retained, vend-tech suspended; install pending verified release; Group Security notified.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ],
};
