/**
 * User Account Type Definitions for SignalRange
 *
 * Based on KeepTrack's user account system, simplified for SignalRange needs
 * Shares the same Supabase backend with KeepTrack
 */

import type { AppState } from '@app/sync/sync-manager';

/**
 * App identifier for multi-app support
 */
export type AppId = 'signalrange' | 'keeptrack';

/**
 * User type enum
 */
export type UserType = 'civilian' | 'education' | 'government' | 'military';

/**
 * User profile data from public.users table
 */
export interface User {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  userType: UserType | null;
  country: string | null;
  organization: string | null;
  branch: string | null; // Military branch
  rank: string | null; // Military rank
  emailNotifications: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * User preferences data for SignalRange
 * Simplified compared to KeepTrack - focuses on SignalRange-specific settings
 */
export interface UserPreferencesData {
  // Audio settings
  isSoundEnabled: boolean;
  soundVolume: number;

  // UI settings
  theme: 'dark' | 'light';
  autoSaveProgress: boolean;

  // Simulation settings
  defaultFrequencyUnits: 'Hz' | 'kHz' | 'MHz' | 'GHz';
  defaultPowerUnits: 'dBm' | 'W' | 'mW';
}

/**
 * User preferences from public.user_preferences table (API response)
 */
export interface UserPreferences extends UserPreferencesData {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Progress entry for a single scenario including score breakdown
 * @deprecated Use ScenarioProgress instead (normalized table row)
 */
export interface ScenarioProgressEntry {
  completedObjectives: number[];
  score: number;
  /** Points earned from completing objectives */
  basePoints?: number;
  /** Bonus points from remaining time */
  timeBonus?: number;
  /** Points deducted from quiz wrong answers */
  quizPenalties?: number;
  /** Points deducted from time-based objective penalties */
  timePenalties?: number;
  /** Points deducted from requesting hints (50% per objective) */
  hintPenalties?: number;
  /** ISO timestamp when scenario was completed */
  completedAt?: string;
  lastPlayed: string;
}

/**
 * User progress data for tracking scenario completion
 * @deprecated Use ScenarioProgress and Checkpoint tables instead
 */
export interface UserProgressData {
  completedScenarios?: number[];
  scenarioProgress?: {
    [scenarioId: number]: ScenarioProgressEntry;
  };
  totalScore?: number;
  signalForge?: Array<{
    scenarioId: string;
    version: string;
    state: AppState;
    savedAt: number;
  }>;
}

/**
 * User progress from public.user_progress table
 * @deprecated Use ScenarioProgress table instead
 */
export interface UserProgress extends UserProgressData {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// New Normalized Table Types (replaces JSONB-based progress)
// ============================================================================

/**
 * Scenario progress from public.scenario_progress table
 * One row per user + app + scenario
 */
export interface ScenarioProgress {
  id: string;
  userId: string;
  appId: AppId;
  scenarioId: string;
  scenarioNumber?: number;
  completedObjectives: number[];
  score: number;
  basePoints: number;
  timeBonus: number;
  quizPenalties: number;
  timePenalties: number;
  completedAt?: string;
  lastPlayed: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Checkpoint from public.checkpoints table
 * Stores full AppState for scenario resume
 */
export interface Checkpoint {
  id: string;
  userId: string;
  appId: AppId;
  scenarioId: string;
  version: string;
  state: AppState;
  savedAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Per-app preferences from public.app_preferences table
 */
export interface AppPreferences {
  id: string;
  userId: string;
  appId: AppId;
  preferences: UserPreferencesData;
  createdAt: string;
  updatedAt: string;
}

/**
 * User app summary from public.user_app_summary table
 * Aggregated stats per app
 */
export interface UserAppSummary {
  id: string;
  userId: string;
  appId: AppId;
  totalScore: number;
  completedScenarioCount: number;
  lastPlayedScenario?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Batch response for all scenarios progress
 */
export interface ScenariosProgressResponse {
  scenarios: ScenarioProgress[];
  summary: UserAppSummary;
}

/**
 * Full user data response (app-scoped)
 */
export interface FullAppUserData {
  user: User;
  preferences: AppPreferences;
  progress: ScenariosProgressResponse;
  achievements: UserAchievement[];
}

/**
 * User data - simplified for SignalRange (no watchlist/sensor like KeepTrack)
 */
export interface UserDataData {
  lastPlayedScenario?: number | null;
  favoriteScenarios?: number[];
}

/**
 * User data from public.user_data table
 */
export interface UserData extends UserDataData {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Achievement definition from public.achievements table
 */
export interface Achievement {
  id: number;
  title: string;
  description: string;
  imageUrl: string;
  category: string;
  points: number;
  createdAt: string;
}

/**
 * User achievement from public.user_achievements table
 */
export interface UserAchievement {
  id: string;
  userId: string;
  achievementId: number;
  unlockedAt: string;
  achievement?: Achievement; // Joined data from achievements table
}

/**
 * Complete user data response (all tables joined)
 * Used for initial load when user logs in
 */
export interface FullUserData {
  user: User;
  preferences: UserPreferences;
  data: UserData;
  progress: UserProgress;
  achievements: UserAchievement[];
}

/**
 * API request/response types
 */

export interface UpdateUserProfileRequest {
  fullName?: string;
  avatarUrl?: string;
  userType?: UserType;
  country?: string;
  organization?: string;
  branch?: string;
  rank?: string;
  emailNotifications?: boolean;
}

export interface UpdateUserPreferencesRequest {
  isSoundEnabled?: boolean;
  soundVolume?: number;
  theme?: 'dark' | 'light';
  autoSaveProgress?: boolean;
  defaultFrequencyUnits?: 'Hz' | 'kHz' | 'MHz' | 'GHz';
  defaultPowerUnits?: 'dBm' | 'W' | 'mW';
}

/**
 * @deprecated Use UpdateScenarioProgressRequest instead
 */
export interface UpdateUserProgressRequest {
  completedScenarios?: number[];
  scenarioProgress?: UserProgressData['scenarioProgress'];
  totalScore?: number;
  signalForge?: UserProgressData['signalForge'];
}

// ============================================================================
// New API Request Types (for granular operations)
// ============================================================================

/**
 * Update request for a single scenario's progress
 */
export interface UpdateScenarioProgressRequest {
  completedObjectives?: number[];
  score?: number;
  basePoints?: number;
  timeBonus?: number;
  quizPenalties?: number;
  timePenalties?: number;
  hintPenalties?: number;
  completedAt?: string;
  lastPlayed?: string;
  scenarioNumber?: number;
}

/**
 * Upsert request for a checkpoint
 */
export interface UpsertCheckpointRequest {
  version: string;
  state: AppState;
}

/**
 * Update request for app preferences
 */
export interface UpdateAppPreferencesRequest {
  preferences: Partial<UserPreferencesData>;
}

export interface UpdateUserDataRequest {
  lastPlayedScenario?: number | null;
  favoriteScenarios?: number[];
}

export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
}

/**
 * Legacy types for migration compatibility
 */
export interface LegacyUserProfile {
  avatar_url?: string;
  email?: string;
  email_verified?: boolean;
  full_name?: string;
  name?: string;
  picture?: string;
  userType?: string;
  country?: string;
  branch?: string;
  rank?: string;
  organization?: string;
  achievements?: number[];
  emailNotifications?: boolean;
}

/**
 * Type guards
 */

export const isApiErrorResponse = (response: unknown): response is ApiErrorResponse =>
  typeof response === 'object' && response !== null && 'error' in response;

export const isUser = (obj: unknown): obj is User =>
  typeof obj === 'object' && obj !== null && 'id' in obj && 'email' in obj;

export const isFullUserData = (obj: unknown): obj is FullUserData => (
  typeof obj === 'object' &&
  obj !== null &&
  'user' in obj &&
  'preferences' in obj &&
  'data' in obj &&
  'progress' in obj &&
  'achievements' in obj
);
