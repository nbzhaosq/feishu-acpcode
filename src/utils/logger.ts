// src/utils/logger.ts
import { createWriteStream, mkdirSync, existsSync, statSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Internal configuration with defaults
interface InternalConfig {
  level: LogLevel;
  fileEnabled: boolean;
  filePath: string;
  fileMaxSize: number;
}

// Default configuration
const defaultConfig: InternalConfig = {
  level: (process.env.LOG_LEVEL as LogLevel) || 'info',
  fileEnabled: true,
  filePath: join(homedir(), '.claude', 'logs', 'feishu-acpcode.log'),
  fileMaxSize: 10 * 1024 * 1024, // 10MB
};

let config: InternalConfig = { ...defaultConfig };
let fileStream: ReturnType<typeof createWriteStream> | null = null;

/**
 * Configure the logger
 */
export function configureLogger(options: {
  level?: LogLevel;
  file?: {
    enabled?: boolean;
    path?: string;
    maxSize?: number;
  };
}): void {
  if (options.level) {
    config.level = options.level;
  }
  if (options.file?.enabled !== undefined) {
    config.fileEnabled = options.file.enabled;
  }
  if (options.file?.path) {
    config.filePath = options.file.path;
  }
  if (options.file?.maxSize !== undefined) {
    config.fileMaxSize = options.file.maxSize;
  }

  // Reinitialize file stream if file logging is enabled
  if (config.fileEnabled && !fileStream) {
    initFileStream();
  }
}

/**
 * Initialize file stream for logging
 */
function initFileStream(): void {
  if (!config.fileEnabled) return;

  try {
    const logDir = dirname(config.filePath);

    // Create log directory if it doesn't exist
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    // Check if log rotation is needed
    rotateLogIfNeeded();

    // Create write stream with append mode
    fileStream = createWriteStream(config.filePath, {
      flags: 'a',
      encoding: 'utf8',
    });

    fileStream.on('error', (err) => {
      console.error('[Logger] File stream error:', err);
      fileStream = null;
    });
  } catch (err) {
    console.error('[Logger] Failed to initialize file stream:', err);
    fileStream = null;
  }
}

/**
 * Rotate log file if it exceeds max size
 */
function rotateLogIfNeeded(): void {
  if (!existsSync(config.filePath)) return;

  try {
    const stats = statSync(config.filePath);
    if (stats.size >= config.fileMaxSize) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedPath = `${config.filePath}.${timestamp}`;
      renameSync(config.filePath, rotatedPath);
    }
  } catch (err) {
    // Ignore rotation errors
  }
}

/**
 * Format timestamp for log messages
 */
function formatTime(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Format arguments for logging
 */
function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) {
        return `${arg.message}\n${arg.stack || ''}`;
      }
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

/**
 * Write log message to console and file
 */
function log(level: LogLevel, ...args: unknown[]): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[config.level]) {
    return;
  }

  const timestamp = formatTime();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  const message = formatArgs(args);
  const fullMessage = `${prefix} ${message}`;

  // Console output
  switch (level) {
    case 'error':
      console.error(prefix, ...args);
      break;
    case 'warn':
      console.warn(prefix, ...args);
      break;
    default:
      console.log(prefix, ...args);
  }

  // File output
  if (config.fileEnabled && fileStream) {
    fileStream.write(fullMessage + '\n');
  }
}

/**
 * Flush pending log writes
 */
export function flushLogs(): void {
  if (fileStream) {
    fileStream.write('', () => {
      // Flush complete
    });
  }
}

/**
 * Close the logger and flush pending writes
 */
export function closeLogger(): void {
  if (fileStream) {
    fileStream.end();
    fileStream = null;
  }
}

// Initialize file stream on module load
initFileStream();

export const logger = {
  debug: (...args: unknown[]) => log('debug', ...args),
  info: (...args: unknown[]) => log('info', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  error: (...args: unknown[]) => log('error', ...args),
  configure: configureLogger,
  flush: flushLogs,
  close: closeLogger,
};
