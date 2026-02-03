import { isApiErrorResponse, isUser, isFullUserData } from '../../src/user-account/types';

describe('Type Guards', () => {
  describe('isApiErrorResponse', () => {
    it('should return true for valid API error response', () => {
      const validError = { error: 'Something went wrong' };
      expect(isApiErrorResponse(validError)).toBe(true);
    });

    it('should return true for API error with code and details', () => {
      const validError = {
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: { field: 'email', message: 'Invalid format' },
      };
      expect(isApiErrorResponse(validError)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isApiErrorResponse(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isApiErrorResponse(undefined)).toBe(false);
    });

    it('should return false for non-object types', () => {
      expect(isApiErrorResponse('error')).toBe(false);
      expect(isApiErrorResponse(123)).toBe(false);
      expect(isApiErrorResponse(true)).toBe(false);
      expect(isApiErrorResponse([])).toBe(false);
    });

    it('should return false for object without error property', () => {
      expect(isApiErrorResponse({ message: 'error' })).toBe(false);
      expect(isApiErrorResponse({ code: 'ERROR' })).toBe(false);
      expect(isApiErrorResponse({})).toBe(false);
    });
  });

  describe('isUser', () => {
    it('should return true for valid user object', () => {
      const validUser = {
        id: 'user-123',
        email: 'test@example.com',
        fullName: 'Test User',
        avatarUrl: null,
        userType: 'civilian',
        country: null,
        organization: null,
        branch: null,
        rank: null,
        emailNotifications: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      expect(isUser(validUser)).toBe(true);
    });

    it('should return true for minimal user object with id and email', () => {
      const minimalUser = { id: 'user-456', email: 'minimal@example.com' };
      expect(isUser(minimalUser)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isUser(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isUser(undefined)).toBe(false);
    });

    it('should return false for non-object types', () => {
      expect(isUser('user')).toBe(false);
      expect(isUser(123)).toBe(false);
      expect(isUser(true)).toBe(false);
    });

    it('should return false for object missing id', () => {
      expect(isUser({ email: 'test@example.com' })).toBe(false);
    });

    it('should return false for object missing email', () => {
      expect(isUser({ id: 'user-123' })).toBe(false);
    });

    it('should return false for empty object', () => {
      expect(isUser({})).toBe(false);
    });
  });

  describe('isFullUserData', () => {
    it('should return true for valid full user data object', () => {
      const validFullUserData = {
        user: { id: 'user-123', email: 'test@example.com' },
        preferences: { id: 'pref-123', userId: 'user-123' },
        data: { id: 'data-123', userId: 'user-123' },
        progress: { id: 'prog-123', userId: 'user-123' },
        achievements: [],
      };
      expect(isFullUserData(validFullUserData)).toBe(true);
    });

    it('should return true for full user data with populated achievements', () => {
      const fullData = {
        user: { id: 'user-123', email: 'test@example.com' },
        preferences: {},
        data: {},
        progress: {},
        achievements: [{ id: 'ach-1', achievementId: 1, unlockedAt: '2024-01-01' }],
      };
      expect(isFullUserData(fullData)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isFullUserData(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isFullUserData(undefined)).toBe(false);
    });

    it('should return false for non-object types', () => {
      expect(isFullUserData('data')).toBe(false);
      expect(isFullUserData(123)).toBe(false);
      expect(isFullUserData(true)).toBe(false);
    });

    it('should return false for object missing user', () => {
      const missingUser = {
        preferences: {},
        data: {},
        progress: {},
        achievements: [],
      };
      expect(isFullUserData(missingUser)).toBe(false);
    });

    it('should return false for object missing preferences', () => {
      const missingPrefs = {
        user: { id: 'user-123', email: 'test@example.com' },
        data: {},
        progress: {},
        achievements: [],
      };
      expect(isFullUserData(missingPrefs)).toBe(false);
    });

    it('should return false for object missing data', () => {
      const missingData = {
        user: { id: 'user-123', email: 'test@example.com' },
        preferences: {},
        progress: {},
        achievements: [],
      };
      expect(isFullUserData(missingData)).toBe(false);
    });

    it('should return false for object missing progress', () => {
      const missingProgress = {
        user: { id: 'user-123', email: 'test@example.com' },
        preferences: {},
        data: {},
        achievements: [],
      };
      expect(isFullUserData(missingProgress)).toBe(false);
    });

    it('should return false for object missing achievements', () => {
      const missingAchievements = {
        user: { id: 'user-123', email: 'test@example.com' },
        preferences: {},
        data: {},
        progress: {},
      };
      expect(isFullUserData(missingAchievements)).toBe(false);
    });

    it('should return false for empty object', () => {
      expect(isFullUserData({})).toBe(false);
    });
  });
});
