import { Character } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { Degrees } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { meridianSar1Satellite, meridianSar2Satellite } from './satellites';

/**
 * nats-eu Scenario 5 - "Shetland Comes Online" / Two-Station Pass Network
 *
 * New mechanic: M3 multi-station contact scheduling (Contact Plan tab), and the
 * debut of SH-02 Shetland with Fiona MacLeod operating it.
 *
 * The scheduling puzzle is built from two conflicting pairs. Both sites can see
 * each MERIDIAN pass, but a single antenna cannot work two overlapping windows,
 * so the plan is only valid when each pair is split across the two stations:
 *
 *   SAR1-GW (T+3.2 .. T+10.3)  overlaps  SAR1-SH (T+5.0 .. T+12.7)
 *   SAR2-GW (T+18.7 .. T+25.7) overlaps  SAR2-SH (T+20.0 .. T+27.5)
 *
 * Every contact is priority <= 2 and `requiredPriorityAtOrAbove: 2`, so all four
 * must be allocated before the plan validates.
 *
 * MODELING NOTE: satellite az/el is Galway-relative (see the SH-02 comment in
 * ground-stations.ts), so this scenario allocates contacts to Shetland but never
 * asks the operator to track from it. The window times above are authored to
 * represent Shetland's higher-latitude geometry, not propagated from it.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0689: Knowledge of network systems management principles and tools
 *   - T0129: Coordinate and manage system operations schedules
 *   - K0737: Knowledge of network operations planning
 *
 * Supporting Codes:
 *   - S0421: Skill in operating network equipment
 *   - K1032: Knowledge of satellite-based communication systems
 */
export const natsEuScenario5Data: ScenarioData = {
  id: 'nats-eu-scenario5',
  url: 'nats-eu/scenarios/nats-eu-scenario5',
  imageUrl: 'nats/5/card.png',
  number: 5,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario4'],
  title: 'Shetland Comes Online',
  subtitle: 'Two-Station Pass Network',
  duration: '20-25 min',
  missionType: 'Mission Planning',
  description: `SH-02 Shetland went operational overnight. Fiona MacLeod has been running acceptance up there for three weeks in weather you would not believe, and as of this morning NATS Europe is a network rather than a station.<br><br>That changes your job. Galway is no longer the only place a MERIDIAN pass can be worked, which means somebody has to decide which site takes which contact - and that somebody is the operator holding the plan.<br><br>Four contacts today across two birds. Both sites can see all four. One antenna cannot be in two places at once.`,
  equipment: [
    'GW-01 Galway: 4m Ku-Band LEO Tracker',
    'SH-02 Shetland: 4m Ku-Band LEO Tracker',
    'Contact Plan Console',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayGroundStation, shetlandGroundStation],
    satellites: [meridianSar1Satellite, meridianSar2Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-15',
    scenarioStartWallTime: '14:00:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-5?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 2,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    // M3 - two conflicting pairs; the plan only validates when each pair is
    // split across the two sites.
    contactSchedule: {
      stationIds: ['GW-01', 'SH-02'],
      requiredPriorityAtOrAbove: 2,
      contacts: [
        { id: 'SAR1-GW', satelliteNoradId: 61701, label: 'MERIDIAN-SAR-1 (Galway horizon)', priority: 1, windowStartS: 192, windowEndS: 618 },
        { id: 'SAR1-SH', satelliteNoradId: 61701, label: 'MERIDIAN-SAR-1 (Shetland horizon)', priority: 1, windowStartS: 300, windowEndS: 762 },
        { id: 'SAR2-GW', satelliteNoradId: 61702, label: 'MERIDIAN-SAR-2 (Galway horizon)', priority: 1, windowStartS: 1122, windowEndS: 1542 },
        { id: 'SAR2-SH', satelliteNoradId: 61702, label: 'MERIDIAN-SAR-2 (Shetland horizon)', priority: 2, windowStartS: 1200, windowEndS: 1650 },
      ],
    },
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'K0737'],
      title: 'Review the Network Brief',
      description: 'Open the shift brief and read the day\'s tasking. Four contacts, two sites.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Network Brief Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Conflict Rule Understood',
          params: {
            character: Character.SYSTEM,
            question: 'Two contacts have overlapping windows and both are visible from Galway. What makes that a conflict?',
            options: [
              'One antenna can only point at one satellite at a time, so overlapping windows on the same site cannot both be worked.',
              'The two satellites would interfere with each other on the downlink.',
              'It is not a conflict - the scheduler time-shares the antenna.',
            ],
            correctIndex: 0,
            explanation: 'Correct. The constraint is the pedestal, not the spectrum. Overlapping windows have to go to different sites.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'open-contact-plan',
      nice: ['T0129', 'K0689'],
      title: 'Open the Contact Plan',
      description: 'The Contact Plan tab lists the day\'s contacts and lets you allocate each one to a site. Open it and review what is unassigned.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'tab-active',
          description: 'Contact Plan Tab Open',
          params: { tab: 'contact-schedule' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'allocate-galway',
      nice: ['T0129', 'K0689', 'S0421'],
      title: 'Allocate the Galway Contacts',
      description: 'Assign the two Galway-horizon contacts to GW-01. These are the passes you have worked all week, and Galway keeps them.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['open-contact-plan'],
      conditions: [
        {
          type: 'contact-assigned',
          description: 'SAR-1 Galway Contact on GW-01',
          params: { contactId: 'SAR1-GW', groundStationId: 'GW-01' },
          mustMaintain: true,
        },
        {
          type: 'contact-assigned',
          description: 'SAR-2 Galway Contact on GW-01',
          params: { contactId: 'SAR2-GW', groundStationId: 'GW-01' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'hand-shetland-the-overlap',
      nice: ['T0129', 'K0737'],
      title: 'Hand Shetland the Overlaps',
      description: 'The two remaining contacts overlap the ones Galway is already working. Give them to SH-02 - that is what a second site is for.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['allocate-galway'],
      conditions: [
        {
          type: 'contact-assigned',
          description: 'SAR-1 Shetland Contact on SH-02',
          params: { contactId: 'SAR1-SH', groundStationId: 'SH-02' },
          mustMaintain: true,
        },
        {
          type: 'contact-assigned',
          description: 'SAR-2 Shetland Contact on SH-02',
          params: { contactId: 'SAR2-SH', groundStationId: 'SH-02' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'validate-the-plan',
      nice: ['T0129', 'K0689'],
      title: 'Validate the Contact Plan',
      description: 'With every contact allocated and no site double-booked, the plan status should read VALID. Confirm it before you publish it to Fiona.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['hand-shetland-the-overlap'],
      conditions: [
        {
          type: 'contact-plan-valid',
          description: 'Plan Valid - No Conflicts, All Contacts Allocated',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Plan Published',
          params: {
            character: Character.SYSTEM,
            question: 'The plan validates. What has a second site actually bought the network here?',
            options: [
              'Every contact gets worked instead of one of each overlapping pair being dropped.',
              'A stronger signal, because two antennas receive the same pass.',
              'Nothing operationally - it is redundancy for outages only.',
            ],
            correctIndex: 0,
            explanation: 'Correct. Capacity, not just redundancy. Plan published to Shetland.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },
  ],
};
