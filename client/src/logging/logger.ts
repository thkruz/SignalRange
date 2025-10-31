export class Logger {
  private static color(type: string): string {
    switch (type) {
      case 'LOG': return 'color: #2196F3';      // Blue
      case 'INFO': return 'color: #4CAF50';     // Green
      case 'WARN': return 'color: #FFC107';     // Amber
      case 'ERROR': return 'color: #F44336';    // Red
      default: return '';
    }
  }

  static log(message: string, ...optionalParams: any[]): void {
    console.log(`%c[LOG] ${message}`, Logger.color('LOG'), ...optionalParams);
  }

  static info(message: string, ...optionalParams: any[]): void {
    console.info(`%c[INFO] ${message}`, Logger.color('INFO'), ...optionalParams);
  }

  static warn(message: string, ...optionalParams: any[]): void {
    console.warn(`%c[WARN] ${message}`, Logger.color('WARN'), ...optionalParams);
  }

  static error(message: string, ...optionalParams: any[]): void {
    console.error(`%c[ERROR] ${message}`, Logger.color('ERROR'), ...optionalParams);
  }
}