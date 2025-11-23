import { Logger } from '../../src/logging/logger';

describe('Logger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('log', () => {
    it('should log messages with LOG prefix and blue color', () => {
      Logger.log('Test message');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '%c[LOG] Test message',
        'color: #2196F3'
      );
    });

    it('should log messages with optional parameters', () => {
      const obj = { key: 'value' };
      Logger.log('Test message', obj, 123);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '%c[LOG] Test message',
        'color: #2196F3',
        obj,
        123
      );
    });

    it('should ignore logs containing "app:" namespace', () => {
      Logger.log('app: some message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should log info messages with INFO prefix and green color', () => {
      Logger.info('Info message');

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        '%c[INFO] Info message',
        'color: #4CAF50'
      );
    });

    it('should log info messages with optional parameters', () => {
      Logger.info('Info message', 'param1', 'param2');

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        '%c[INFO] Info message',
        'color: #4CAF50',
        'param1',
        'param2'
      );
    });
  });

  describe('warn', () => {
    it('should log warning messages with WARN prefix and amber color', () => {
      Logger.warn('Warning message');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '%c[WARN] Warning message',
        'color: #FFC107'
      );
    });

    it('should log warning messages with optional parameters', () => {
      const warning = new Error('Test warning');
      Logger.warn('Warning message', warning);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '%c[WARN] Warning message',
        'color: #FFC107',
        warning
      );
    });
  });

  describe('error', () => {
    it('should log error messages with ERROR prefix and red color', () => {
      Logger.error('Error message');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '%c[ERROR] Error message',
        'color: #F44336'
      );
    });

    it('should log error messages with optional parameters', () => {
      const error = new Error('Test error');
      Logger.error('Error message', error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '%c[ERROR] Error message',
        'color: #F44336',
        error
      );
    });
  });
});
