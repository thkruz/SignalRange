import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { backyardQfhStation } from '../ground-stations';

/**
 * Shared asset-tree anchor for the C3 Technician scenarios. The practical
 * station (radios, cables, instruments) lives in `settings.hamStation`; this
 * backyard ground station only gives the mission-control shell a selectable
 * site and a location for satellite geometry. Its stock receive chain is not
 * part of any C3 objective.
 */
export const techHomeStation = {
  ...backyardQfhStation,
  id: 'KF0SRT-HOME',
  name: 'Home Station (KF0SRT)',
} as GroundStationConfig;

/** Ground-station id every C3 Technician objective references */
export const TECH_STATION_ID = 'KF0SRT-HOME';
