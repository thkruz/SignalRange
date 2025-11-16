/**
 * Custom error class for UserDataService
 */

export class UserDataServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'UserDataServiceError';
  }

  /**
   * Check if this is an authentication error
   */
  isAuthError(): boolean {
    return this.statusCode === 401 || this.statusCode === 403;
  }

  /**
   * Check if this is a validation error
   */
  isValidationError(): boolean {
    return this.statusCode === 400;
  }

  /**
   * Check if this is a not found error
   */
  isNotFoundError(): boolean {
    return this.statusCode === 404;
  }

  /**
   * Check if this is a conflict error (e.g., duplicate achievement unlock)
   */
  isConflictError(): boolean {
    return this.statusCode === 409;
  }

  /**
   * Check if this is a server error
   */
  isServerError(): boolean {
    return this.statusCode >= 500;
  }

  /**
   * Check if this is a network error
   */
  isNetworkError(): boolean {
    return this.code === 'NETWORK_ERROR';
  }
}
