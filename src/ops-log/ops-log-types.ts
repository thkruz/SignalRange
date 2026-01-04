/**
 * @file ops-log-types.ts - Type definitions for the Operations Log system
 */

/**
 * A single operations log entry
 */
export interface OpsLogEntry {
  /** Fictional wall-clock timestamp string, e.g., "14:32:15" */
  timestamp: string;
  /** The log message text */
  message: string;
  /** Optional category for filtering/styling */
  category?: 'action' | 'system' | 'previous-shift' | 'alert';
  /** Optional source identifier (e.g., equipment name, operator name) */
  source?: string;
}

/**
 * Previous shift log entry from scenario data
 */
export interface PreviousShiftLogEntry {
  /** Display timestamp (can be relative like "Earlier Today" or absolute "17:30") */
  timestamp: string;
  /** Log entry text */
  entry: string;
  /** Optional source */
  source?: string;
}

/**
 * Serializable state for checkpoint persistence
 */
export interface OpsLogState {
  /** All log entries (previous shift + current session) */
  entries: OpsLogEntry[];
  /** Current fictional clock time in seconds since midnight */
  currentTimeSeconds: number;
}
