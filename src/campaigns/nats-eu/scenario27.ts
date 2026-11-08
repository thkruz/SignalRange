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
  imageUrl: 'nats-eu/27/card.png',
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
      description: 'Open the plan and read ticket MNT-0430 (diagnostics read, fan replacement, no firmware), the enclave transfer rule and the vendor’s signed-release process.',
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
      description: 'Open the Security console and compare the morning’s entries with ticket MNT-0430. Two entries aren’t on it, so find them and name the rule each one breaks.',
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
              'The 07:41 USB mount breaks the transfer rule; the 07:44 unsigned firmware stage breaks change control',
              'Only the 07:44 firmware stage, because a USB mount is routine during any vendor visit here',
              'Only the 07:36 diagnostics read, because the vendor should not have console access at all',
              'None of them, because an escorted technician working on a ticket is covered for everything he does on site',
            ],
            correctIndex: 0,
            explanation:
              'An escort and a ticket cover what the ticket says, and MNT-0430 says diagnostics and a fan, nothing more. The stick had no media ticket, so it broke the transfer rule. The image was unsigned and not in the ticket, so it broke change control. These are two separate breaches three minutes apart, and the second one hasn’t finished happening yet.',
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
        'Flag the USB entry so the record shows you saw it, but leave the firmware entry alone until you’ve made the call, because the call is graded on the log as it stands. Then decide what happens to the image.',
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
                  'No. Hold the staged image, take the workstation off the M&C segment, keep the stick as it is and suspend the technician’s account. Group Security gets the log',
                correctWhen: { fact: 'config-drifted', is: true },
                consequence: {
                  log: 'ACU firmware stage hold ordered; GW-MC-01 isolation and media retention requested from Charlie; vend-tech suspension ordered pending verification; anything already installed from the media to be rolled back to the last verified image',
                },
              },
              {
                label: 'Nothing is pending against the configuration, so the log is clean. Let the service continue',
                correctWhen: { fact: 'config-drifted', is: false },
                feedback:
                  'An unsigned firmware image is staged on the ACU controller, and its entry is still sitting unflagged in the log. That’s a pending configuration change with nobody’s name on it.',
              },
              {
                label: 'Yes, it’s the vendor’s own technician with the vendor’s own release. Let it install, acknowledge the entries and note it in the ticket afterwards',
                feedback:
                  'The technician’s badge doesn’t sign the file. An image that arrived on a stick, isn’t in the ticket and carries no signature is exactly what a supply-chain compromise looks like from the inside, and the ACU would have rebooted on it.',
                consequence: {
                  pointDelta: -10,
                  auditEvent: {
                    id: 'evt-acu-reboot',
                    // Pre-audit 24: no label, so the entry is stamped with the moment of injection (a fixed 08:07 read as the future when answered at ~08:01)
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
                label: 'Wipe and reimage the workstation now, destroy the stick and send the technician off site',
                feedback:
                  'Wiping the workstation and destroying the stick removes the only evidence of what was on them. Hold the image, isolate the machine and keep the stick, then let CSIRT decide what gets wiped.',
                consequence: { pointDelta: -5, log: 'Workstation wiped and media destroyed before analysis' },
              },
            ],
            explanation:
              'The right answer is a hold, not a verdict. The image might be exactly what he says it is, but the station can’t know that yet, and the machine it’s staged on moves the dish. Verification means a hash against a signed release through the proper path, not a technician’s word.',
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
      description: 'The technician is sure it’s the service release. Pick what would make the station sure too.',
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
              'A signed vendor release, obtained through the transfer path, hash-checked on the isolated host and named in a ticket',
              'The technician’s assurance, backed by a clean virus scan of the stick he brought with him to the site today',
              'A file name that matches the version in the vendor’s release notes, since a matching name shows the file is genuine and untouched',
              'Nothing could make it trustworthy, because a controller like the ACU should never be updated at all, by anyone',
            ],
            correctIndex: 0,
            explanation:
              'Trust means you can say where the file came from and prove it’s what it claims to be. A signed release, a controlled path, a hash match and a ticket naming the version, the window and the rollback give you that proof. A badge and a scan don’t, because a scanner only catches what it already knows.',
            pointPenalty: 5,
            documentLine:
              'Verification path required before any install: vendor-signed release, obtained via the enclave transfer path, hash matched against the published one on the isolated host, change ticket naming version, window and rollback. Every link must hold before it installs.',
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
      description: 'Now flag the firmware entry so the record carries the hold, including the rollback to the last verified image if anything was installed from the stick.',
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
      description: 'Disable the escorted vendor account until the image is verified and the ticket is amended. The fan can wait.',
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
      description: 'The vendor does need to get firmware onto the station sometimes. Say how that’s supposed to happen.',
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
              'Through the transfer station: ticket first, scan and hash check on the isolated kiosk, one-way copy to site media',
              'On any stick, as long as the workstation’s antivirus scans it first and the result is logged',
              'By email to the operator, who copies the attachment across to the workstation once it looks right',
              'On the vendor’s own media, because the site trusts its vendors and logs the visit afterwards',
            ],
            correctIndex: 0,
            explanation:
              'The rule exists so nobody has to answer “what is on this stick” on the machine that moves the dish. Every file is checked first on a kiosk that can’t reach the antenna, it crosses by the one-way path with two names in the log, and only site-owned media ever mounts on an M&C host. It’s slow by design.',
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
      description: 'The technician’s objection is that every office in the country scans a stick and moves on. Say why this room is different.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['the-transfer-rule'],
      conditions: [
        {
          type: 'status-check',
          description: 'Stricter Rule Explained',
          params: {
            character: Character.SYSTEM,
            question: 'Why is “scan the stick on the workstation and install” not acceptable here when it is everywhere else?',
            options: [
              'Because the workstation is on the segment that controls the antenna, and a scanner can miss a modified image',
              'Because the workstation’s antivirus is out of date, so a scan run on it today proves nothing',
              'Because the site doesn’t trust the vendor, so anything a vendor brings is refused at the door',
              'It is acceptable here too, because the drill is about paperwork and a clean scan settles the question',
            ],
            correctIndex: 0,
            explanation:
              'An office laptop can be wiped tomorrow. A controller running a bad image points the dish wherever the image says, on the next pass, with nobody watching, and nothing on that segment can inspect the image after it installs. That’s why the control is the path the file took, not a scan at the end of it.',
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
      description: 'Write one entry for Group Security with the times, the hold and what verification is waiting on.',
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
              '07:41 USB mounted, 07:44 image staged; {{at:obj:flag-the-firmware|08:05}} hold ordered, account suspended, Group Security told',
              'Vendor tried to install firmware and was told no, so there is nothing to record about the visit',
              'Firmware installed after the technician confirmed that it was the service release, and the fan replaced too, all within the ticket',
              'Event closed, with the workstation reimaged and the media destroyed before anyone could analyse what was on either one',
            ],
            correctIndex: 0,
            explanation:
              'A good closing entry has the times, the two entries, the hold and what the hold is waiting on. The service resumes when the image has a signature and a ticket, and not before.',
            pointPenalty: 5,
            documentLine:
              'Closed {{stationTime}}: stage hold ordered, GW-MC-01 isolation and media retention requested from Charlie, vend-tech suspension ordered; anything installed from the media rolled back to the last verified image; install only after a verified release; Group Security notification requested.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ],
};
