import { errorManagerInstance } from '@app/engine/utils/errorManager';
import {
  Achievement,
  FullUserData,
  isApiErrorResponse,
  UpdateUserDataRequest,
  UpdateUserPreferencesRequest,
  UpdateUserProfileRequest,
  UpdateUserProgressRequest,
  User,
  UserAchievement,
  UserData,
  UserPreferences,
  UserProgress,
} from './types';
import { UserDataServiceError } from './user-data-service-error';

/**
 * Configuration for UserDataService
 */
export interface UserDataServiceConfig {
  apiBaseUrl: string;
  getAccessToken: () => string | null;
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
      enableRetry: config.enableRetry ?? true,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
    };
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

  /**
   * Internal method to make HTTP requests with retry logic and error handling
   */
  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
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
