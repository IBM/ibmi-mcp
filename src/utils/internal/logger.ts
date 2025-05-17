/**
 * @fileoverview Provides a singleton Logger class that wraps Winston for file logging
 * and supports sending MCP (Model Context Protocol) `notifications/message`.
 * It handles different log levels compliant with RFC 5424 and MCP specifications.
 * @module utils/internal/logger
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import winston from "winston";
import TransportStream from "winston-transport";
import { config } from "../../config/index.js";
import { RequestContext } from "./requestContext.js";

/**
 * Defines the supported logging levels based on RFC 5424 Syslog severity levels,
 * as used by the Model Context Protocol (MCP).
 * Levels are: 'debug'(7), 'info'(6), 'notice'(5), 'warning'(4), 'error'(3), 'crit'(2), 'alert'(1), 'emerg'(0).
 * Lower numeric values indicate higher severity.
 */
export type McpLogLevel =
  | "debug"
  | "info"
  | "notice"
  | "warning"
  | "error"
  | "crit"
  | "alert"
  | "emerg";

/**
 * Numeric severity mapping for MCP log levels (lower is more severe).
 * @private
 */
const mcpLevelSeverity: Record<McpLogLevel, number> = {
  emerg: 0,
  alert: 1,
  crit: 2,
  error: 3,
  warning: 4,
  notice: 5,
  info: 6,
  debug: 7,
};

/**
 * Maps MCP log levels to Winston's core levels for file logging.
 * @private
 */
const mcpToWinstonLevel: Record<
  McpLogLevel,
  "debug" | "info" | "warn" | "error"
> = {
  debug: "debug",
  info: "info",
  notice: "info",
  warning: "warn",
  error: "error",
  crit: "error",
  alert: "error",
  emerg: "error",
};

/**
 * Interface for a more structured error object, primarily for formatting console logs.
 * @private
 */
interface ErrorWithMessageAndStack {
  message?: string;
  stack?: string;
  [key: string]: any;
}

/**
 * Interface for the payload of an MCP log notification.
 * This structure is used when sending log data via MCP `notifications/message`.
 */
export interface McpLogPayload {
  message: string;
  context?: RequestContext;
  error?: {
    message: string;
    stack?: string;
  };
  [key: string]: any;
}

/**
 * Type for the `data` parameter of the `McpNotificationSender` function.
 */
export type McpNotificationData = McpLogPayload | Record<string, unknown>;

/**
 * Defines the signature for a function that can send MCP log notifications.
 * This function is typically provided by the MCP server instance.
 * @param level - The severity level of the log message.
 * @param data - The payload of the log notification.
 * @param loggerName - An optional name or identifier for the logger/server.
 */
export type McpNotificationSender = (
  level: McpLogLevel,
  data: McpNotificationData,
  loggerName?: string,
) => void;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isRunningFromDist = __dirname.includes(path.sep + "dist" + path.sep);
const levelsToGoUp = isRunningFromDist ? 3 : 2;
const pathSegments = Array(levelsToGoUp).fill("..");
const projectRoot = path.resolve(__dirname, ...pathSegments);

const logsDir = path.join(projectRoot, "logs");

const resolvedLogsDir = path.resolve(logsDir);
const isLogsDirSafe =
  resolvedLogsDir === projectRoot ||
  resolvedLogsDir.startsWith(projectRoot + path.sep);
if (!isLogsDirSafe) {
  if (process.stdout.isTTY) {
    console.error(
      `FATAL: logs directory "${resolvedLogsDir}" is outside project root "${projectRoot}". File logging disabled.`,
    );
  }
}

/**
 * Creates the Winston console log format.
 * @returns The Winston log format for console output.
 * @private
 */
function createWinstonConsoleFormat(): winston.Logform.Format {
  return winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      let metaString = "";
      const metaCopy = { ...meta };
      if (metaCopy.error && typeof metaCopy.error === "object") {
        const errorObj = metaCopy.error as ErrorWithMessageAndStack;
        if (errorObj.message) metaString += `\n  Error: ${errorObj.message}`;
        if (errorObj.stack)
          metaString += `\n  Stack: ${String(errorObj.stack)
            .split("\n")
            .map((l: string) => `    ${l}`)
            .join("\n")}`;
        delete metaCopy.error;
      }
      if (Object.keys(metaCopy).length > 0) {
        try {
          const remainingMetaJson = JSON.stringify(metaCopy, null, 2);
          if (remainingMetaJson !== "{}")
            metaString += `\n  Meta: ${remainingMetaJson}`;
        } catch (stringifyError: unknown) {
          const errorMessage =
            stringifyError instanceof Error
              ? stringifyError.message
              : String(stringifyError);
          metaString += `\n  Meta: [Error stringifying metadata: ${errorMessage}]`;
        }
      }
      return `${timestamp} ${level}: ${message}${metaString}`;
    }),
  );
}

/**
 * Singleton Logger class that wraps Winston for robust logging.
 * Supports file logging, conditional console logging, and MCP notifications.
 */
export class Logger {
  private static instance: Logger;
  private winstonLogger?: winston.Logger;
  private initialized = false;
  private mcpNotificationSender?: McpNotificationSender;
  private currentMcpLevel: McpLogLevel = "info";
  private currentWinstonLevel: "debug" | "info" | "warn" | "error" = "info";

  private readonly LOG_FILE_MAX_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly LOG_MAX_FILES = 5;

  /** @private */
  private constructor() {}

  /**
   * Initializes the Winston logger instance.
   * Should be called once at application startup.
   * @param level - The initial minimum MCP log level.
   */
  public async initialize(level: McpLogLevel = "info"): Promise<void> {
    if (this.initialized) {
      this.warning("Logger already initialized.", {
        loggerSetup: true,
        requestId: "logger-init",
        timestamp: new Date().toISOString(),
      });
      return;
    }
    this.currentMcpLevel = level;
    this.currentWinstonLevel = mcpToWinstonLevel[level];

    let logsDirCreatedMessage: string | null = null;

    if (isLogsDirSafe) {
      try {
        if (!fs.existsSync(resolvedLogsDir)) {
          await fs.promises.mkdir(resolvedLogsDir, { recursive: true });
          logsDirCreatedMessage = `Created logs directory: ${resolvedLogsDir}`;
        }
      } catch (err: unknown) {
        if (process.stdout.isTTY) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(
            `Error creating logs directory at ${resolvedLogsDir}: ${errorMessage}. File logging disabled.`,
          );
        }
      }
    }

    const fileFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    );

    const transports: TransportStream[] = [];
    const fileTransportOptions = {
      format: fileFormat,
      maxsize: this.LOG_FILE_MAX_SIZE,
      maxFiles: this.LOG_MAX_FILES,
      tailable: true,
    };

    if (isLogsDirSafe) {
      transports.push(
        new winston.transports.File({
          filename: path.join(resolvedLogsDir, "error.log"),
          level: "error",
          ...fileTransportOptions,
        }),
        new winston.transports.File({
          filename: path.join(resolvedLogsDir, "warn.log"),
          level: "warn",
          ...fileTransportOptions,
        }),
        new winston.transports.File({
          filename: path.join(resolvedLogsDir, "info.log"),
          level: "info",
          ...fileTransportOptions,
        }),
        new winston.transports.File({
          filename: path.join(resolvedLogsDir, "debug.log"),
          level: "debug",
          ...fileTransportOptions,
        }),
        new winston.transports.File({
          filename: path.join(resolvedLogsDir, "combined.log"),
          ...fileTransportOptions,
        }),
      );
    } else {
      if (process.stdout.isTTY) {
        console.warn(
          "File logging disabled due to unsafe logs directory path.",
        );
      }
    }

    let consoleLoggingEnabledMessage: string | null = null;
    let consoleLoggingSkippedMessage: string | null = null;

    if (this.currentMcpLevel === "debug" && process.stdout.isTTY) {
      const consoleFormat = createWinstonConsoleFormat();
      transports.push(
        new winston.transports.Console({
          level: "debug",
          format: consoleFormat,
        }),
      );
      consoleLoggingEnabledMessage =
        "Console logging enabled at level: debug (stdout is TTY)";
    } else if (this.currentMcpLevel === "debug" && !process.stdout.isTTY) {
      consoleLoggingSkippedMessage =
        "Console logging skipped: Level is debug, but stdout is not a TTY (likely stdio transport).";
    }

    this.winstonLogger = winston.createLogger({
      level: this.currentWinstonLevel,
      transports,
      exitOnError: false,
    });

    const initialContext: RequestContext = {
      loggerSetup: true,
      requestId: "logger-init-deferred",
      timestamp: new Date().toISOString(),
    };
    if (logsDirCreatedMessage) {
      this.info(logsDirCreatedMessage, initialContext);
    }
    if (consoleLoggingEnabledMessage) {
      this.info(consoleLoggingEnabledMessage, initialContext);
    }
    if (consoleLoggingSkippedMessage) {
      this.info(consoleLoggingSkippedMessage, initialContext);
    }

    this.initialized = true;
    this.info(
      `Logger initialized. File logging level: ${this.currentWinstonLevel}. MCP logging level: ${this.currentMcpLevel}. Console logging: ${process.stdout.isTTY && this.currentMcpLevel === "debug" ? "enabled" : "disabled"}`,
      {
        loggerSetup: true,
        requestId: "logger-post-init",
        timestamp: new Date().toISOString(),
      },
    );
  }

  /**
   * Sets the function used to send MCP 'notifications/message'.
   * @param sender - The function to call for sending notifications, or undefined to disable.
   */
  public setMcpNotificationSender(
    sender: McpNotificationSender | undefined,
  ): void {
    this.mcpNotificationSender = sender;
    const status = sender ? "enabled" : "disabled";
    this.info(`MCP notification sending ${status}.`, {
      loggerSetup: true,
      requestId: "logger-set-sender",
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Dynamically sets the minimum logging level.
   * @param newLevel - The new minimum MCP log level to set.
   */
  public setLevel(newLevel: McpLogLevel): void {
    const setLevelContext: RequestContext = {
      loggerSetup: true,
      requestId: "logger-set-level",
      timestamp: new Date().toISOString(),
    };
    if (!this.ensureInitialized()) {
      if (process.stdout.isTTY) {
        console.error("Cannot set level: Logger not initialized.");
      }
      return;
    }
    if (!(newLevel in mcpLevelSeverity)) {
      this.warning(
        `Invalid MCP log level provided: ${newLevel}. Level not changed.`,
        setLevelContext,
      );
      return;
    }

    const oldLevel = this.currentMcpLevel;
    this.currentMcpLevel = newLevel;
    this.currentWinstonLevel = mcpToWinstonLevel[newLevel];
    this.winstonLogger!.level = this.currentWinstonLevel;

    const consoleTransport = this.winstonLogger!.transports.find(
      (t) => t instanceof winston.transports.Console,
    );
    const shouldHaveConsole = newLevel === "debug" && process.stdout.isTTY;

    if (shouldHaveConsole && !consoleTransport) {
      const consoleFormat = createWinstonConsoleFormat();
      this.winstonLogger!.add(
        new winston.transports.Console({
          level: "debug",
          format: consoleFormat,
        }),
      );
      this.info("Console logging dynamically enabled.", setLevelContext);
    } else if (!shouldHaveConsole && consoleTransport) {
      this.winstonLogger!.remove(consoleTransport);
      this.info("Console logging dynamically disabled.", setLevelContext);
    }

    if (oldLevel !== newLevel) {
      this.info(
        `Log level changed. File logging level: ${this.currentWinstonLevel}. MCP logging level: ${this.currentMcpLevel}. Console logging: ${shouldHaveConsole ? "enabled" : "disabled"}`,
        setLevelContext,
      );
    }
  }

  /**
   * Gets the singleton instance of the Logger.
   * @returns The singleton Logger instance.
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Ensures the logger has been initialized.
   * @returns True if initialized, false otherwise.
   * @private
   */
  private ensureInitialized(): boolean {
    if (!this.initialized || !this.winstonLogger) {
      if (process.stdout.isTTY) {
        console.warn("Logger not initialized; message dropped.");
      }
      return false;
    }
    return true;
  }

  /**
   * Centralized log processing method.
   * @param level - The MCP severity level of the message.
   * @param msg - The main log message.
   * @param context - Optional request context for the log.
   * @param error - Optional error object associated with the log.
   * @private
   */
  private log(
    level: McpLogLevel,
    msg: string,
    context?: RequestContext,
    error?: Error,
  ): void {
    if (!this.ensureInitialized()) return;
    if (mcpLevelSeverity[level] > mcpLevelSeverity[this.currentMcpLevel]) {
      return; // Do not log if message level is less severe than currentMcpLevel
    }

    const logData: Record<string, unknown> = { ...context };
    const winstonLevel = mcpToWinstonLevel[level];

    if (error) {
      this.winstonLogger!.log(winstonLevel, msg, { ...logData, error });
    } else {
      this.winstonLogger!.log(winstonLevel, msg, logData);
    }

    if (this.mcpNotificationSender) {
      const mcpDataPayload: McpLogPayload = { message: msg };
      if (context && Object.keys(context).length > 0)
        mcpDataPayload.context = context;
      if (error) {
        mcpDataPayload.error = { message: error.message };
        // Include stack trace in debug mode for MCP notifications, truncated for brevity
        if (this.currentMcpLevel === "debug" && error.stack) {
          mcpDataPayload.error.stack = error.stack.substring(0, 500);
        }
      }
      try {
        const serverName =
          config?.mcpServerName ?? "MCP_SERVER_NAME_NOT_CONFIGURED";
        this.mcpNotificationSender(level, mcpDataPayload, serverName);
      } catch (sendError: unknown) {
        const errorMessage =
          sendError instanceof Error ? sendError.message : String(sendError);
        const internalErrorContext: RequestContext = {
          requestId: context?.requestId || "logger-internal-error",
          timestamp: new Date().toISOString(),
          originalLevel: level,
          originalMessage: msg,
          sendError: errorMessage,
          mcpPayload: JSON.stringify(mcpDataPayload).substring(0, 500), // Log a preview
        };
        this.winstonLogger!.error(
          "Failed to send MCP log notification",
          internalErrorContext,
        );
      }
    }
  }

  /** Logs a message at the 'debug' level. */
  public debug(msg: string, context?: RequestContext): void {
    this.log("debug", msg, context);
  }

  /** Logs a message at the 'info' level. */
  public info(msg: string, context?: RequestContext): void {
    this.log("info", msg, context);
  }

  /** Logs a message at the 'notice' level. */
  public notice(msg: string, context?: RequestContext): void {
    this.log("notice", msg, context);
  }

  /** Logs a message at the 'warning' level. */
  public warning(msg: string, context?: RequestContext): void {
    this.log("warning", msg, context);
  }

  /**
   * Logs a message at the 'error' level.
   * @param msg - The main log message.
   * @param err - Optional. Error object or RequestContext.
   * @param context - Optional. RequestContext if `err` is an Error.
   */
  public error(
    msg: string,
    err?: Error | RequestContext,
    context?: RequestContext,
  ): void {
    const errorObj = err instanceof Error ? err : undefined;
    const actualContext = err instanceof Error ? context : err;
    this.log("error", msg, actualContext, errorObj);
  }

  /**
   * Logs a message at the 'crit' (critical) level.
   * @param msg - The main log message.
   * @param err - Optional. Error object or RequestContext.
   * @param context - Optional. RequestContext if `err` is an Error.
   */
  public crit(
    msg: string,
    err?: Error | RequestContext,
    context?: RequestContext,
  ): void {
    const errorObj = err instanceof Error ? err : undefined;
    const actualContext = err instanceof Error ? context : err;
    this.log("crit", msg, actualContext, errorObj);
  }

  /**
   * Logs a message at the 'alert' level.
   * @param msg - The main log message.
   * @param err - Optional. Error object or RequestContext.
   * @param context - Optional. RequestContext if `err` is an Error.
   */
  public alert(
    msg: string,
    err?: Error | RequestContext,
    context?: RequestContext,
  ): void {
    const errorObj = err instanceof Error ? err : undefined;
    const actualContext = err instanceof Error ? context : err;
    this.log("alert", msg, actualContext, errorObj);
  }

  /**
   * Logs a message at the 'emerg' (emergency) level.
   * @param msg - The main log message.
   * @param err - Optional. Error object or RequestContext.
   * @param context - Optional. RequestContext if `err` is an Error.
   */
  public emerg(
    msg: string,
    err?: Error | RequestContext,
    context?: RequestContext,
  ): void {
    const errorObj = err instanceof Error ? err : undefined;
    const actualContext = err instanceof Error ? context : err;
    this.log("emerg", msg, actualContext, errorObj);
  }

  /**
   * Logs a message at the 'emerg' (emergency) level, typically for fatal errors.
   * @param msg - The main log message.
   * @param err - Optional. Error object or RequestContext.
   * @param context - Optional. RequestContext if `err` is an Error.
   */
  public fatal(
    msg: string,
    err?: Error | RequestContext,
    context?: RequestContext,
  ): void {
    const errorObj = err instanceof Error ? err : undefined;
    const actualContext = err instanceof Error ? context : err;
    this.log("emerg", msg, actualContext, errorObj);
  }
}

/**
 * The singleton instance of the Logger.
 * Use this instance for all logging operations.
 */
export const logger = Logger.getInstance();
