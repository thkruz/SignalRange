import { errorManagerInstance } from '@app/engine/utils/errorManager';
import {
  Achievement,
  AppId,
  AppPreferences,
  Checkpoint,
  FullAppUserData,
  FullUserData,
  isApiErrorResponse,
  ScenarioProgress,
  ScenariosProgressResponse,
  UpdateScenarioProgressRequest,
  UpdateUserDataRequest,
  UpdateUserPreferencesRequest,
  UpdateUserProfileRequest,
  UpdateUserProgressRequest,
  UpsertCheckpointRequest,
  User,
  UserAchievement,
  UserAppSummary,
  UserData,
  UserPreferences,
  UserPreferencesData,
  UserProgress,
} from './types';
import { UserDataServiceError } from './user-data-service-error';

/**
 * Configuration for UserDataService
 */
export interface UserDataServiceConfig {
  apiBaseUrl: string;
  getAccessToken: () => string | null;
  appId?: AppId;
  enableRetry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Service class for managing user data via Cloudflare Worker API
 *
 * This service provides a clean abstraction layer between the client
 * and the Cloudflare Worker API, handling:
 * - HTTP requests with proper headers
 * - Error handling and validation
 * - Retry logic for network failures
 * - Type-safe responses
 */
export class UserDataService {
  private config: Required<UserDataServiceConfig>;

  constructor(config: UserDataServiceConfig) {
    this.config = {
      apiBaseUrl: config.apiBaseUrl,
      getAccessToken: config.getAccessToken,
      appId: config.appId ?? 'signalrange',
      enableRetry: config.enableRetry ?? true,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
    };
  }

  /**
   * Get the app ID for this service instance
   */
  get appId(): AppId {
    return this.config.appId;
  }

  /**
   * Get complete user data (profile, preferences, data, achievements)
   * Used for initial load when user logs in
   */
  async getFullUserData(): Promise<FullUserData> {
    const response = await this.request<FullUserData>('/api/user/full-data', 'GET');

    // Transform API response format to match client types
    // API returns { profile, ... } but client expects { user, ... }
    return {
      user: this.transformUserProfile((response as any).profile || response.user),
      preferences: this.transformUserPreferences((response as any).preferences),
      data: this.transformUserData((response as any).data),
      progress: this.transformUserProgress((response as any).progress),
      achievements: (response as any).achievements || [],
    };
  }

  /**
   * Get user profile
   */
  async getUserProfile(): Promise<User> {
    const response = await this.request<any>('/api/user/profile', 'GET');

    return this.transformUserProfile(response);
  }

  /**
   * Update user profile
   */
  async updateUserProfile(updates: UpdateUserProfileRequest): Promise<User> {
    // Transform camelCase to snake_case for API
    const apiUpdates: any = {};

    if (updates.fullName !== undefined) {
      apiUpdates.display_name = updates.fullName;
    }
    if (updates.avatarUrl !== undefined) {
      apiUpdates.avatar_url = updates.avatarUrl;
    }
    if (updates.userType !== undefined) {
      apiUpdates.user_type = updates.userType;
    }
    if (updates.country !== undefined) {
      apiUpdates.country = updates.country;
    }
    if (updates.organization !== undefined) {
      apiUpdates.organization = updates.organization;
    }
    if (updates.branch !== undefined) {
      apiUpdates.branch = updates.branch;
    }
    if (updates.rank !== undefined) {
      apiUpdates.rank = updates.rank;
    }
    if (updates.emailNotifications !== undefined) {
      apiUpdates.email_notifications = updates.emailNotifications;
    }

    const response = await this.request<any>('/api/user/profile', 'PUT', apiUpdates);

    return this.transformUserProfile(response);
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(): Promise<UserPreferences> {
    const response = await this.request<any>('/api/user/preferences', 'GET');

    return this.transformUserPreferences(response);
  }

  async getUserData(): Promise<UserData> {
    const response = await this.request<any>('/api/user/data', 'GET');

    return this.transformUserData(response);
  }

  async getUserProgress(): Promise<UserProgress> {
    const response = await this.request<any>('/api/user/progress', 'GET');

    return this.transformUserProgress(response);
  }

  /**
   * Update user preferences (partial update)
   */
  async updateUserPreferences(updates: UpdateUserPreferencesRequest): Promise<UserPreferences> {
    const response = await this.request<any>('/api/user/preferences', 'PUT', updates);

    return this.transformUserPreferences(response);
  }

  async updateUserProgress(updates: UpdateUserProgressRequest): Promise<UserProgress> {
    const response = await this.request<any>('/api/user/progress', 'PUT', updates);

    return this.transformUserProgress(response);
  }

  async updateUserData(updates: UpdateUserDataRequest): Promise<UserData> {
    const response = await this.request<any>('/api/user/data', 'PUT', updates);

    return this.transformUserData(response);
  }

  /**
   * Delete user data
   */
  async deleteUserData(): Promise<void> {
    await this.request<any>('/api/user/data', 'DELETE');
  }

  async deleteUserProgress(): Promise<void> {
    await this.request<any>('/api/user/progress', 'DELETE');
  }

  /**
   * Get user achievements
   */
  async getUserAchievements(): Promise<UserAchievement[]> {
    return this.request<UserAchievement[]>('/api/user/achievements', 'GET');
  }

  /**
   * Unlock an achievement
   * Returns the unlocked achievement or throws if already unlocked
   */
  async unlockAchievement(achievementId: number): Promise<UserAchievement> {
    return this.request<UserAchievement>(`/api/user/achievements/${achievementId}/unlock`, 'POST');
  }

  /**
   * Get all available achievements (reference data)
   */
  async getAllAchievements(): Promise<Achievement[]> {
    return this.request<Achievement[]>('/api/achievements', 'GET');
  }

  /**
   * Get checkpoint for a specific scenario
   */
  async getScenarioCheckpoint(scenarioId: string): Promise<any | null> {
    try {
      const progress = await this.getUserProgress();
      const signalForge = progress.signalForge || [];
      const checkpoint = signalForge.find((cp) => cp.scenarioId === scenarioId);

      return checkpoint || null;
    } catch (error) {
      throw new UserDataServiceError(
        `Failed to get checkpoint for scenario ${scenarioId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        0,
        'CHECKPOINT_FETCH_ERROR',
      );
    }
  }

  /**
   * Check if a checkpoint exists for a specific scenario
   */
  async hasScenarioCheckpoint(scenarioId: string): Promise<boolean> {
    try {
      const checkpoint = await this.getScenarioCheckpoint(scenarioId);
      return checkpoint !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Clear checkpoint for a specific scenario
   */
  async clearScenarioCheckpoint(scenarioId: string): Promise<void> {
    try {
      const progress = await this.getUserProgress();
      const signalForge = progress.signalForge || [];

      // Filter out the checkpoint for this scenario
      const updatedSignalForge = signalForge.filter((cp) => cp.scenarioId !== scenarioId);

      // Only update if something changed
      if (updatedSignalForge.length !== signalForge.length) {
        await this.updateUserProgress({ signalForge: updatedSignalForge });
      }
    } catch (error) {
      throw new UserDataServiceError(
        `Failed to clear checkpoint for scenario ${scenarioId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        0,
        'CHECKPOINT_CLEAR_ERROR',
      );
    }
  }

  // ============================================================================
  // New Granular API Methods (app-scoped, per-scenario)
  // ============================================================================

  /**
   * Get all scenarios progress for the current app
   */
  async getAllScenariosProgress(): Promise<ScenariosProgressResponse> {
    const response = await this.request<any>(
      `/api/user/apps/${this.config.appId}/scenarios/progress`,
      'GET',
    );

    return this.transformScenariosProgressResponse(response);
  }

  /**
   * Get progress for a specific scenario
   */
  async getScenarioProgress(scenarioId: string): Promise<ScenarioProgress | null> {
    try {
      const response = await this.request<any>(
        `/api/user/apps/${this.config.appId}/scenarios/${scenarioId}/progress`,
        'GET',
      );

      return this.transformScenarioProgress(response);
    } catch (error) {
      // Return null for 404 (not found)
      if (error instanceof UserDataServiceError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Update progress for a specific scenario (upsert)
   */
  async updateScenarioProgress(
    scenarioId: string,
    updates: UpdateScenarioProgressRequest,
  ): Promise<ScenarioProgress> {
    // Transform camelCase to snake_case for API
    const apiUpdates: Record<string, unknown> = {};

    if (updates.completedObjectives !== undefined) {
      apiUpdates.completed_objectives = updates.completedObjectives;
    }
    if (updates.score !== undefined) {
      apiUpdates.score = updates.score;
    }
    if (updates.basePoints !== undefined) {
      apiUpdates.base_points = updates.basePoints;
    }
    if (updates.timeBonus !== undefined) {
      apiUpdates.time_bonus = updates.timeBonus;
    }
    if (updates.quizPenalties !== undefined) {
      apiUpdates.quiz_penalties = updates.quizPenalties;
    }
    if (updates.timePenalties !== undefined) {
      apiUpdates.time_penalties = updates.timePenalties;
    }
    if (updates.hintPenalties !== undefined) {
      apiUpdates.hint_penalties = updates.hintPenalties;
    }
    if (updates.completedAt !== undefined) {
      apiUpdates.completed_at = updates.completedAt;
    }
    if (updates.lastPlayed !== undefined) {
      apiUpdates.last_played = updates.lastPlayed;
    }
    if (updates.scenarioNumber !== undefined) {
      apiUpdates.scenario_number = updates.scenarioNumber;
    }

    const response = await this.request<any>(
      `/api/user/apps/${this.config.appId}/scenarios/${scenarioId}/progress`,
      'PUT',
      apiUpdates,
    );

    return this.transformScenarioProgress(response);
  }

  /**
   * Delete progress for a specific scenario
   */
  async deleteScenarioProgress(scenarioId: string): Promise<void> {
    await this.request<void>(
      `/api/user/apps/${this.config.appId}/scenarios/${scenarioId}/progress`,
      'DELETE',
    );
  }

  /**
   * Reset scenario progress for replay without losing completion status.
   * Clears score and objectives but preserves completedAt so prerequisites stay unlocked.
   */
  async resetScenarioForReplay(scenarioId: string): Promise<ScenarioProgress | null> {
    // Check if progress exists first
    const existing = await this.getScenarioProgress(scenarioId);
    if (!existing) {
      return null; // No progress to reset
    }

    // Reset all gameplay fields but preserve completedAt
    return this.updateScenarioProgress(scenarioId, {
      completedObjectives: [],
      score: 0,
      basePoints: 0,
      timeBonus: 0,
      quizPenalties: 0,
      timePenalties: 0,
      // Note: NOT including completedAt - this preserves the existing value
    });
  }

  /**
   * Get checkpoint for a specific scenario (new API)
   */
  async getCheckpoint(scenarioId: string): Promise<Checkpoint | null> {
    try {
      const response = await this.request<any>(
        `/api/user/apps/${this.config.appId}/scenarios/${scenarioId}/checkpoint`,
        'GET',
      );

      return this.transformCheckpoint(response);
    } catch (error) {
      // Return null for 404 (not found)
      if (error instanceof UserDataServiceError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Save checkpoint for a specific scenario (upsert)
   */
  async saveCheckpoint(scenarioId: string, checkpoint: UpsertCheckpointRequest): Promise<Checkpoint> {
    const response = await this.request<any>(
      `/api/user/apps/${this.config.appId}/scenarios/${scenarioId}/checkpoint`,
      'PUT',
      checkpoint,
    );

    return this.transformCheckpoint(response);
  }

  /**
   * Delete checkpoint for a specific scenario
   */
  async deleteCheckpoint(scenarioId: string): Promise<void> {
    await this.request<void>(
      `/api/user/apps/${this.config.appId}/scenarios/${scenarioId}/checkpoint`,
      'DELETE',
    );
  }

  /**
   * Delete all progress and checkpoints for the current app
   * This is a bulk operation that clears all scenario_progress and checkpoints
   */
  async deleteAllProgress(): Promise<void> {
    await this.request<void>(
      `/api/user/apps/${this.config.appId}/progress`,
      'DELETE',
    );
  }

  /**
   * Check if a checkpoint exists for a specific scenario (HEAD request)
   */
  async checkpointExists(scenarioId: string): Promise<boolean> {
    try {
      await this.request<void>(
        `/api/user/apps/${this.config.appId}/scenarios/${scenarioId}/checkpoint`,
        'HEAD',
      );

      return true;
    } catch (error) {
      if (error instanceof UserDataServiceError && error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get app-specific preferences
   */
  async getAppPreferences(): Promise<AppPreferences> {
    const response = await this.request<any>(
      `/api/user/apps/${this.config.appId}/preferences`,
      'GET',
    );

    return this.transformAppPreferences(response);
  }

  /**
   * Update app-specific preferences
   */
  async updateAppPreferences(updates: Partial<UserPreferencesData>): Promise<AppPreferences> {
    const response = await this.request<any>(
      `/api/user/apps/${this.config.appId}/preferences`,
      'PUT',
      { preferences: updates },
    );

    return this.transformAppPreferences(response);
  }

  /**
   * Get app summary (aggregated stats)
   */
  async getAppSummary(): Promise<UserAppSummary> {
    const response = await this.request<any>(
      `/api/user/apps/${this.config.appId}/summary`,
      'GET',
    );

    return this.transformUserAppSummary(response);
  }

  /**
   * Get full user data (app-scoped)
   */
  async getFullAppUserData(): Promise<FullAppUserData> {
    const response = await this.request<any>(
      `/api/user/apps/${this.config.appId}/full-data`,
      'GET',
    );

    return {
      user: this.transformUserProfile(response.user || response.profile),
      preferences: this.transformAppPreferences(response.preferences),
      progress: this.transformScenariosProgressResponse(response.progress),
      achievements: response.achievements || [],
    };
  }

  // ============================================================================
  // Legacy Methods (deprecated - use granular methods above)
  // ============================================================================

  /**
   * Remove a scenario from the completed scenarios list (for Play Again)
   * @deprecated Use deleteScenarioProgress() instead
   */
  async removeCompletedScenario(scenarioNumber: number): Promise<void> {
    try {
      const progress = await this.getUserProgress();
      const completedScenarios = progress.completedScenarios || [];

      // Filter out the scenario number
      const updatedCompletedScenarios = completedScenarios.filter((num) => num !== scenarioNumber);

      // Only update if something changed
      if (updatedCompletedScenarios.length !== completedScenarios.length) {
        await this.updateUserProgress({ completedScenarios: updatedCompletedScenarios });
      }
    } catch (error) {
      throw new UserDataServiceError(
        `Failed to remove completed scenario ${scenarioNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        0,
        'SCENARIO_REMOVE_ERROR',
      );
    }
  }

  /**
   * Transform API user profile response (snake_case) to client format (camelCase)
   */
  private transformUserProfile(apiProfile: any): User {
    return {
      id: apiProfile.id || '',
      email: apiProfile.email || '',
      fullName: apiProfile.display_name || apiProfile.username || apiProfile.fullName || null,
      avatarUrl: apiProfile.avatar_url || apiProfile.avatarUrl || null,
      userType: apiProfile.user_type || apiProfile.userType || null,
      country: apiProfile.country || null,
      organization: apiProfile.organization || null,
      branch: apiProfile.branch || null,
      rank: apiProfile.rank || null,
      emailNotifications: apiProfile.email_notifications ?? apiProfile.emailNotifications ?? true,
      createdAt: apiProfile.created_at || apiProfile.createdAt || new Date().toISOString(),
      updatedAt: apiProfile.updated_at || apiProfile.updatedAt || new Date().toISOString(),
    };
  }

  /**
   * Transform API user preferences response to client format
   */
  private transformUserPreferences(apiPrefs: any): UserPreferences {
    // Extract metadata fields
    const metadata = {
      id: String(apiPrefs.id || ''),
      userId: apiPrefs.userId || apiPrefs.user_id || '',
      createdAt: apiPrefs.createdAt || apiPrefs.created_at || new Date().toISOString(),
      updatedAt: apiPrefs.updatedAt || apiPrefs.updated_at || new Date().toISOString(),
    };

    // Remove metadata fields from the rest of the object to get preference data
    const { id, user_id, userId, created_at, createdAt, updated_at, updatedAt, ...prefsData } = apiPrefs;

    // Combine metadata with preference data
    return {
      ...metadata,
      ...prefsData,
    } as UserPreferences;
  }

  /**
   * Transform API user data response to client format
   */
  private transformUserData(apiData: any): UserData {
    // Extract metadata fields
    const metadata = {
      id: String(apiData.id || ''),
      userId: apiData.userId || apiData.user_id || '',
      createdAt: apiData.createdAt || apiData.created_at || new Date().toISOString(),
      updatedAt: apiData.updatedAt || apiData.updated_at || new Date().toISOString(),
    };

    // Remove metadata fields from the rest of the object to get data
    const { id, user_id, userId, created_at, createdAt, updated_at, updatedAt, ...data } = apiData;

    // Combine metadata with data
    return {
      ...metadata,
      ...data,
    } as UserData;
  }

  /**
   * Transform API user progress response to client format
   */
  private transformUserProgress(apiProgress: any): UserProgress {
    // Extract metadata fields
    const metadata = {
      id: String(apiProgress.id || ''),
      userId: apiProgress.userId || apiProgress.user_id || '',
      createdAt: apiProgress.createdAt || apiProgress.created_at || new Date().toISOString(),
      updatedAt: apiProgress.updatedAt || apiProgress.updated_at || new Date().toISOString(),
    };

    // Remove metadata fields from the rest of the object to get progress data
    const { id, user_id, userId, created_at, createdAt, updated_at, updatedAt, ...progressData } = apiProgress;

    // Combine metadata with progress data
    return {
      ...metadata,
      ...progressData,
    } as UserProgress;
  }

  // ============================================================================
  // New Transform Methods (for normalized table types)
  // ============================================================================

  /**
   * Transform API scenario progress response to client format
   */
  private transformScenarioProgress(apiProgress: any): ScenarioProgress {
    return {
      id: String(apiProgress.id || ''),
      userId: apiProgress.user_id || apiProgress.userId || '',
      appId: apiProgress.app_id || apiProgress.appId || this.config.appId,
      scenarioId: apiProgress.scenario_id || apiProgress.scenarioId || '',
      scenarioNumber: apiProgress.scenario_number ?? apiProgress.scenarioNumber,
      completedObjectives: apiProgress.completed_objectives || apiProgress.completedObjectives || [],
      score: apiProgress.score ?? 0,
      basePoints: apiProgress.base_points ?? apiProgress.basePoints ?? 0,
      timeBonus: apiProgress.time_bonus ?? apiProgress.timeBonus ?? 0,
      quizPenalties: apiProgress.quiz_penalties ?? apiProgress.quizPenalties ?? 0,
      timePenalties: apiProgress.time_penalties ?? apiProgress.timePenalties ?? 0,
      completedAt: apiProgress.completed_at || apiProgress.completedAt,
      lastPlayed: apiProgress.last_played || apiProgress.lastPlayed || new Date().toISOString(),
      createdAt: apiProgress.created_at || apiProgress.createdAt || new Date().toISOString(),
      updatedAt: apiProgress.updated_at || apiProgress.updatedAt || new Date().toISOString(),
    };
  }

  /**
   * Transform API scenarios progress response (batch) to client format
   */
  private transformScenariosProgressResponse(apiResponse: any): ScenariosProgressResponse {
    const scenarios = (apiResponse.scenarios || []).map((s: any) => this.transformScenarioProgress(s));
    const summary = this.transformUserAppSummary(apiResponse.summary || {});

    return { scenarios, summary };
  }

  /**
   * Transform API checkpoint response to client format
   */
  private transformCheckpoint(apiCheckpoint: any): Checkpoint {
    return {
      id: String(apiCheckpoint.id || ''),
      userId: apiCheckpoint.user_id || apiCheckpoint.userId || '',
      appId: apiCheckpoint.app_id || apiCheckpoint.appId || this.config.appId,
      scenarioId: apiCheckpoint.scenario_id || apiCheckpoint.scenarioId || '',
      version: apiCheckpoint.version || '',
      state: apiCheckpoint.state || {},
      savedAt: apiCheckpoint.saved_at || apiCheckpoint.savedAt || new Date().toISOString(),
      createdAt: apiCheckpoint.created_at || apiCheckpoint.createdAt || new Date().toISOString(),
      updatedAt: apiCheckpoint.updated_at || apiCheckpoint.updatedAt || new Date().toISOString(),
    };
  }

  /**
   * Transform API app preferences response to client format
   */
  private transformAppPreferences(apiPrefs: any): AppPreferences {
    return {
      id: String(apiPrefs.id || ''),
      userId: apiPrefs.user_id || apiPrefs.userId || '',
      appId: apiPrefs.app_id || apiPrefs.appId || this.config.appId,
      preferences: apiPrefs.preferences || {},
      createdAt: apiPrefs.created_at || apiPrefs.createdAt || new Date().toISOString(),
      updatedAt: apiPrefs.updated_at || apiPrefs.updatedAt || new Date().toISOString(),
    };
  }

  /**
   * Transform API user app summary response to client format
   */
  private transformUserAppSummary(apiSummary: any): UserAppSummary {
    return {
      id: String(apiSummary.id || ''),
      userId: apiSummary.user_id || apiSummary.userId || '',
      appId: apiSummary.app_id || apiSummary.appId || this.config.appId,
      totalScore: apiSummary.total_score ?? apiSummary.totalScore ?? 0,
      completedScenarioCount: apiSummary.completed_scenario_count ?? apiSummary.completedScenarioCount ?? 0,
      lastPlayedScenario: apiSummary.last_played_scenario || apiSummary.lastPlayedScenario,
      createdAt: apiSummary.created_at || apiSummary.createdAt || new Date().toISOString(),
      updatedAt: apiSummary.updated_at || apiSummary.updatedAt || new Date().toISOString(),
    };
  }

  /**
   * Internal method to make HTTP requests with retry logic and error handling
   */
  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD',
    body?: unknown,
    retryCount: number = 0,
  ): Promise<T> {
    const url = `${this.config.apiBaseUrl}${endpoint}`;
    const accessToken = this.config.getAccessToken();

    if (!accessToken) {
      throw new Error('User not authenticated');
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: body ? JSON.stringify(body) : null,
      });

      // Handle non-2xx responses
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));

        if (isApiErrorResponse(errorData)) {
          throw new UserDataServiceError(errorData.error, response.status, errorData.code, errorData.details);
        }

        throw new UserDataServiceError(`HTTP ${response.status}: ${response.statusText}`, response.status);
      }

      // HEAD and DELETE requests don't have a body
      if (method === 'HEAD' || method === 'DELETE') {
        return undefined as T;
      }

      // Handle empty responses (204 No Content)
      const contentLength = response.headers.get('content-length');
      if (response.status === 204 || contentLength === '0') {
        return undefined as T;
      }

      // Parse and return successful response
      const data = await response.json();

      return data as T;
    } catch (error) {
      // Handle network errors with retry logic
      if (this.shouldRetry(error, retryCount)) {
        errorManagerInstance.warn(`Request failed, retrying (${retryCount + 1}/${this.config.maxRetries}): ${error}`);

        await this.delay(this.config.retryDelay * 2 ** retryCount); // Exponential backoff

        return this.request<T>(endpoint, method, body, retryCount + 1);
      }

      // Re-throw error if not retrying
      if (error instanceof UserDataServiceError) {
        throw error;
      }

      throw new UserDataServiceError(
        `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        0,
        'NETWORK_ERROR',
      );
    }
  }

  /**
   * Determine if a request should be retried
   */
  private shouldRetry(error: unknown, retryCount: number): boolean {
    if (!this.config.enableRetry || retryCount >= this.config.maxRetries) {
      return false;
    }

    // Don't retry on client errors (4xx) except 429 (rate limit)
    if (error instanceof UserDataServiceError) {
      if (error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429) {
        return false;
      }
    }

    return true;
  }

  /**
   * Delay helper for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Update configuration (e.g., change API base URL)
   */
  updateConfig(config: Partial<UserDataServiceConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }
}

/**
 * Singleton instance for use throughout the application
 */
let userDataServiceInstance: UserDataService | null = null;

/**
 * Initialize the UserDataService singleton
 */
export const initUserDataService = (config: UserDataServiceConfig): UserDataService => {
  userDataServiceInstance = new UserDataService(config);

  return userDataServiceInstance;
};

/**
 * Get the UserDataService singleton instance
 */
export const getUserDataService = (): UserDataService => {
  if (!userDataServiceInstance) {
    throw new Error('UserDataService not initialized. Call initUserDataService() first.');
  }

  return userDataServiceInstance;
};
