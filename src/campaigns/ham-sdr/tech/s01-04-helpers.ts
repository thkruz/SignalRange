/**
 * @file s01-04-helpers - Small authoring helpers shared by the C3 Technician S1-S4 scenario files
 * @description Keeps the repeated pieces (quiz rows gated behind the practical rows, the mission
 * brief objective, Riley clips, the shared settings block) in one place so each scenario file reads
 * as its objective table.
 */

import type { HamStationConfig } from '@app/ham/ham-station-config';
import { buildQuizCondition } from '@app/ham/quiz/technician-quiz';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Condition, Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { DialogClip } from '@app/scenario-manager';
import { TECH_STATION_ID, techHomeStation } from './tech-ground-station';

export { TECH_STATION_ID };

/** A quiz row that waits for every practical row of its objective (quizAfterConditions) */
export function quiz(localId: string): Condition {
  const c = buildQuizCondition(localId);

  return { ...c, params: { ...c.params, quizAfterConditions: true } };
}

/** Riley clip with no recorded audio (no voice-over in this package) */
export function riley(text: string, emotion: Emotion = Emotion.NEUTRAL): DialogClip {
  return { text: `<p>${text}</p>`, character: Character.RILEY_BROOKS, emotion, audioUrl: '' };
}

/** First objective of every C3 Technician scenario: open the mission brief (freezes the timer) */
export function briefObjective(description: string): Objective {
  return {
    id: 'review-mission-brief',
    nice: ['K0645'],
    title: 'Read the Mission Brief',
    description,
    groundStation: TECH_STATION_ID,
    freezesScenarioTimer: true,
    prerequisiteObjectiveIds: [],
    points: 0,
    conditions: [{ type: 'mission-brief-opened', description: 'Brief opened', params: { boxId: 'mission-brief' }, mustMaintain: false }],
  };
}

/** The settings block every C3 Technician scenario shares */
export function techSettings(n: number, hamStation: HamStationConfig, startWallTime = '15:00:00'): ScenarioData['settings'] {
  return {
    isSync: true,
    groundStations: [techHomeStation],
    satellites: [],
    isExtraSatellitesVisible: false,
    scenarioStartDate: '2027-03-15',
    scenarioStartWallTime: startWallTime,
    missionBriefUrl: `https://docs.signalrange.space/campaign-3/scenario-${n}?content-only=true&dark=true`,
    hamStation,
  };
}

/** Objective chain helper: each objective requires the previous one */
export function chain(first: string, objectives: Omit<Objective, 'prerequisiteObjectiveIds' | 'groundStation'>[]): Objective[] {
  let prev = first;

  return objectives.map((o) => {
    const full: Objective = { ...o, groundStation: TECH_STATION_ID, prerequisiteObjectiveIds: [prev] };
    prev = o.id;

    return full;
  });
}
