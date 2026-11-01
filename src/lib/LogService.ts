import { formatLogArg } from './redact';

type LogLevel = 'info' | 'error' | 'warn' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
}

class LogService {
  private static instance: LogService;
  private logs: LogEntry[] = [];
  private readonly MAX_LOGS = 500;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): LogService {
    if (!LogService.instance) {
      LogService.instance = new LogService();
    }
    return LogService.instance;
  }

  init() {
    if (this.isInitialized) return;

    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    // Les arguments sont mis en forme une seule fois, secrets masqués, et
    // c'est cette forme qui part à la fois dans le journal en mémoire (lu par
    // `GET /api/logs`) et sur la sortie standard (journaux Docker).
    const intercept = (level: LogLevel, original: (...args: unknown[]) => void) =>
      (...args: unknown[]) => {
        const message = args.map(formatLogArg).join(' ');
        this.addLog(level, message);
        original.call(console, message);
      };

    console.log = intercept('info', originalLog);
    console.error = intercept('error', originalError);
    console.warn = intercept('warn', originalWarn);

    this.isInitialized = true;
    console.log('[LogService] Global logging interceptor initialized');
  }

  private addLog(level: LogLevel, message: string) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message
    };

    this.logs.unshift(entry); // Newest first

    if (this.logs.length > this.MAX_LOGS) {
      this.logs.pop();
    }
  }

  getLogs() {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
  }
}

export const logger = LogService.getInstance();
