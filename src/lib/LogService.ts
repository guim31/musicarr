
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

    console.log = (...args: any[]) => {
      this.addLog('info', args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
      originalLog.apply(console, args);
    };

    console.error = (...args: any[]) => {
      this.addLog('error', args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
      originalError.apply(console, args);
    };

    console.warn = (...args: any[]) => {
      this.addLog('warn', args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
      originalWarn.apply(console, args);
    };

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
