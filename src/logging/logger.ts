type LogLevel = 'LOG' | 'INFO' | 'WARN' | 'ERROR';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  LOG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

export class Logger {
  private static readonly minLevel_: LogLevel = (process.env.PUBLIC_LOG_LEVEL as LogLevel) || 'LOG';

  private static color(type: LogLevel): string {
    switch (type) {
      case 'LOG': return 'color: #2196F3';      // Blue
      case 'INFO': return 'color: #4CAF50';     // Green
      case 'WARN': return 'color: #FFC107';     // Amber
      case 'ERROR': return 'color: #F44336';    // Red
      default: return '';
    }
  }

  private static shouldLog_(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[Logger.minLevel_];
  }

  static log(message: string, ...optionalParams: any[]): void {
    if (!Logger.shouldLog_('LOG')) return;
    // Ignore logs coming from 'app:' namespace due to quantity
    if (message.includes('app:')) {
      return;
    }
    console.log(`%c[LOG] ${message}`, Logger.color('LOG'), ...optionalParams);
  }

  static info(message: string, ...optionalParams: any[]): void {
    if (!Logger.shouldLog_('INFO')) return;
    console.info(`%c[INFO] ${message}`, Logger.color('INFO'), ...optionalParams);
  }

  static warn(message: string, ...optionalParams: any[]): void {
    if (!Logger.shouldLog_('WARN')) return;
    console.warn(`%c[WARN] ${message}`, Logger.color('WARN'), ...optionalParams);
  }

  static error(message: string, ...optionalParams: any[]): void {
    if (!Logger.shouldLog_('ERROR')) return;
    console.error(`%c[ERROR] ${message}`, Logger.color('ERROR'), ...optionalParams);
  }
}