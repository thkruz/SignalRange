import { UserDataServiceError } from '../../src/user-account/user-data-service-error';

describe('UserDataServiceError', () => {
  it('should create error with all properties', () => {
    const error = new UserDataServiceError('Test error', 400, 'TEST_CODE', { foo: 'bar' });

    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('TEST_CODE');
    expect(error.details).toEqual({ foo: 'bar' });
    expect(error.name).toBe('UserDataServiceError');
  });

  it('should create error with default code and details', () => {
    const error = new UserDataServiceError('Test error', 500);

    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBeUndefined();
    expect(error.details).toBeUndefined();
  });

  it('should identify auth errors', () => {
    expect(new UserDataServiceError('', 401).isAuthError()).toBe(true);
    expect(new UserDataServiceError('', 403).isAuthError()).toBe(true);
    expect(new UserDataServiceError('', 400).isAuthError()).toBe(false);
    expect(new UserDataServiceError('', 500).isAuthError()).toBe(false);
  });

  it('should identify validation errors', () => {
    expect(new UserDataServiceError('', 400).isValidationError()).toBe(true);
    expect(new UserDataServiceError('', 401).isValidationError()).toBe(false);
    expect(new UserDataServiceError('', 404).isValidationError()).toBe(false);
  });

  it('should identify not found errors', () => {
    expect(new UserDataServiceError('', 404).isNotFoundError()).toBe(true);
    expect(new UserDataServiceError('', 400).isNotFoundError()).toBe(false);
    expect(new UserDataServiceError('', 500).isNotFoundError()).toBe(false);
  });

  it('should identify conflict errors', () => {
    expect(new UserDataServiceError('', 409).isConflictError()).toBe(true);
    expect(new UserDataServiceError('', 400).isConflictError()).toBe(false);
    expect(new UserDataServiceError('', 500).isConflictError()).toBe(false);
  });

  it('should identify server errors (>= 500)', () => {
    expect(new UserDataServiceError('', 500).isServerError()).toBe(true);
    expect(new UserDataServiceError('', 502).isServerError()).toBe(true);
    expect(new UserDataServiceError('', 503).isServerError()).toBe(true);
    expect(new UserDataServiceError('', 504).isServerError()).toBe(true);
    expect(new UserDataServiceError('', 599).isServerError()).toBe(true);
    expect(new UserDataServiceError('', 600).isServerError()).toBe(true);
    expect(new UserDataServiceError('', 400).isServerError()).toBe(false);
    expect(new UserDataServiceError('', 499).isServerError()).toBe(false);
  });

  it('should identify network errors by code only', () => {
    expect(new UserDataServiceError('', 0, 'NETWORK_ERROR').isNetworkError()).toBe(true);
    expect(new UserDataServiceError('', 500, 'NETWORK_ERROR').isNetworkError()).toBe(true);
    expect(new UserDataServiceError('', 0, 'OTHER_CODE').isNetworkError()).toBe(false);
    expect(new UserDataServiceError('', 0).isNetworkError()).toBe(false);
  });

  it('should extend Error class', () => {
    const error = new UserDataServiceError('Test error', 400);
    expect(error instanceof Error).toBe(true);
    expect(error instanceof UserDataServiceError).toBe(true);
  });

  it('should have proper stack trace', () => {
    const error = new UserDataServiceError('Test error', 400);
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('UserDataServiceError');
  });
});
