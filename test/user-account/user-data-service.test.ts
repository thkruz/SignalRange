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

  it('should identify auth errors', () => {
    expect(new UserDataServiceError('', 401).isAuthError()).toBe(true);
    expect(new UserDataServiceError('', 403).isAuthError()).toBe(true);
    expect(new UserDataServiceError('', 400).isAuthError()).toBe(false);
  });

  it('should identify validation errors', () => {
    expect(new UserDataServiceError('', 400).isValidationError()).toBe(true);
    expect(new UserDataServiceError('', 401).isValidationError()).toBe(false);
  });

  it('should identify not found errors', () => {
    expect(new UserDataServiceError('', 404).isNotFoundError()).toBe(true);
    expect(new UserDataServiceError('', 400).isNotFoundError()).toBe(false);
  });

  it('should identify conflict errors', () => {
    expect(new UserDataServiceError('', 409).isConflictError()).toBe(true);
    expect(new UserDataServiceError('', 400).isConflictError()).toBe(false);
  });

  it('should identify server errors', () => {
    expect(new UserDataServiceError('', 500).isServerError()).toBe(true);
    expect(new UserDataServiceError('', 502).isServerError()).toBe(true);
    expect(new UserDataServiceError('', 400).isServerError()).toBe(false);
  });

  it('should identify network errors', () => {
    expect(new UserDataServiceError('', 0, 'NETWORK_ERROR').isNetworkError()).toBe(true);
    expect(new UserDataServiceError('', 0, 'OTHER_CODE').isNetworkError()).toBe(false);
  });
});
