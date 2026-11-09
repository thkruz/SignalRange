import type { FrontlineScenarioData } from './scenario-support';
import { frontlineScenario1Data } from './scenario1';
import { frontlineScenario2Data } from './scenario2';
import { frontlineScenario3Data } from './scenario3';
import { frontlineScenario4Data } from './scenario4';
import { frontlineScenario5Data } from './scenario5';
import { frontlineScenario6Data } from './scenario6';
import { frontlineScenario7Data } from './scenario7';
import { frontlineScenario8Data } from './scenario8';
import { frontlineScenario9Data } from './scenario9';
import { frontlineScenario10Data } from './scenario10';
import { frontlineScenario11Data } from './scenario11';
import { frontlineScenario12Data } from './scenario12';
import { frontlineScenario13Data } from './scenario13';
import { frontlineScenario14Data } from './scenario14';
import { frontlineScenario15Data } from './scenario15';
import { frontlineScenario16Data } from './scenario16';

/**
 * Authored curriculum. Unimplemented assessments keep each draft disabled.
 * TODO(C6-SCENARIO-ART): replace the shared sandbox card with approved scenario
 * cards and forward-site art. Do not request nonexistent portrait variants.
 * TODO(C6-VO): audition and record the four Eastern European accented voices;
 * empty audioUrl values are intentional until actual takes are selected.
 * TODO(C6-RELEASE): enable each scenario only after its mechanicTodos are
 * implemented, pending gates are replaced, and a full completion test passes.
 */
export const frontlineScenarios: FrontlineScenarioData[] = [
  frontlineScenario1Data,
  frontlineScenario2Data,
  frontlineScenario3Data,
  frontlineScenario4Data,
  frontlineScenario5Data,
  frontlineScenario6Data,
  frontlineScenario7Data,
  frontlineScenario8Data,
  frontlineScenario9Data,
  frontlineScenario10Data,
  frontlineScenario11Data,
  frontlineScenario12Data,
  frontlineScenario13Data,
  frontlineScenario14Data,
  frontlineScenario15Data,
  frontlineScenario16Data,
];
