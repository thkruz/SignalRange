import type { Objective } from './objectives';
import type { DialogClip, SimulationSettings } from './scenario-manager';


export interface ScenarioData {
  id: string;
  isDisabled?: boolean;
  prerequisiteScenarioIds?: string[];
  url: string;
  imageUrl: string;
  number: number;
  title: string;
  subtitle: string;
  duration: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  missionType: string;
  description: string;
  equipment: string[];
  settings: SimulationSettings;
  objectives?: Objective[];
  dialogClips?: {
    intro?: DialogClip;
    objectives?: Record<string, DialogClip>;
  };
}
