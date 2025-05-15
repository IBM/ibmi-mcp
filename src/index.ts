#!/usr/bin/env node

/**
 * @fileoverview Main entry point for the MCP TypeScript Template application.
 * This script initializes the configuration, sets up the logger, starts the
 * MCP server (either via STDIO or HTTP transport), and handles graceful
 * shutdown on process signals or unhandled errors.
 *
 * The script uses an Immediately Invoked Function Expression (IIFE) with async/await
 * to manage the asynchronous nature of server startup and shutdown.
 *
 * Key operations:
 * 1. Import necessary modules and utilities.
 * 2. Define a `shutdown` function for graceful server termination.
 * 3. Define a `start` function to:
 *    - Initialize the logger with the configured log level.
 *    - Create a startup request context for logging and correlation.
 *    - Initialize and start the MCP server transport (stdio or http).
 *    - Set up global error handlers (uncaughtException, unhandledRejection)
 *      and signal handlers (SIGTERM, SIGINT) to trigger graceful shutdown.
 * 4. Execute the `start` function within an async IIFE.
 *
 * @module src/index
 */

// Imports MUST be at the top level for proper module resolution and static analysis.
import { logger, McpLogLevel } from "./utils/internal/logger.js"; // Import logger instance early
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config, environment } from "./config/index.js"; // This loads .env via dotenv.config()
import { initializeAndStartServer } from "./mcp-server/server.js";
import { requestContextService } from "./utils/index.js";

/**
 * Holds the main MCP server instance, primarily for STDIO transport.
 * For HTTP transport, server instances are typically managed per session within `server.ts`.
 * This variable is used by the `shutdown` function to close the server if it exists.
 *
 * @type {McpServer | undefined}
 */
let server: McpServer | undefined;

/**
 * Gracefully shuts down the main MCP server and associated resources.
 * This function is designed to be called on process termination signals (SIGTERM, SIGINT)
 * or in response to critical unhandled errors (uncaughtException, unhandledRejection).
 *
 * It attempts to:
 * - Close the active MCP server instance (if one exists, mainly for STDIO).
 * - Log the shutdown process.
 * - Exit the process with an appropriate code (0 for success, 1 for failure).
 *
 * @async
 * @function shutdown
 * @param {string} signal - The signal or event name that triggered the shutdown (e.g., "SIGTERM", "uncaughtException").
 *                          This is used for logging purposes to understand why shutdown was initiated.
 * @returns {Promise<void>} A promise that resolves when shutdown is complete or an error occurs.
 */
const shutdown = async (signal: string): Promise<void> => {
  // Create a dedicated request context for the shutdown operation to correlate logs.
  const shutdownContext = requestContextService.createRequestContext({
    operation: "ServerShutdown", // Consistent operation name for shutdown
    triggerEvent: signal, // Include the triggering signal/event in the context
  });

  logger.info(
    `Received ${signal}. Initiating graceful shutdown...`,
    shutdownContext,
  );

  try {
    // Attempt to close the main MCP server instance if it was initialized (primarily for STDIO).
    if (server) {
      logger.info("Attempting to close main MCP server...", shutdownContext);
      await server.close(); // The close method should handle its own internal cleanup.
      logger.info("Main MCP server closed successfully.", shutdownContext);
    } else {
      // This might be normal for HTTP transport if `server` isn't globally assigned,
      // or if shutdown is called before server initialization completes.
      logger.notice(
        // Use notice as it's not necessarily an error.
        "No global server instance found to close during shutdown (this may be normal for HTTP transport).",
        shutdownContext,
      );
    }

    // Additional cleanup tasks can be added here (e.g., closing database connections, releasing resources).

    logger.info(
      "Graceful shutdown completed successfully. Exiting.",
      shutdownContext,
    );
    process.exit(0); // Exit with code 0 for successful shutdown.
  } catch (error) {
    // Log any critical errors that occur *during* the shutdown process itself.
    logger.error("Critical error encountered during shutdown process.", {
      ...shutdownContext,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1); // Exit with code 1 if shutdown fails.
  }
};

/**
 * Initializes and starts the main MCP server application.
 * This function orchestrates the entire startup sequence:
 * 1. Initializes the logger with the level specified in the configuration.
 * 2. Creates a root request context for the startup process.
 * 3. Logs startup messages and configuration details.
 * 4. Calls `initializeAndStartServer` to set up and run the chosen MCP transport (stdio or http).
 * 5. Registers global signal handlers (SIGTERM, SIGINT) for graceful shutdown.
 * 6. Registers global error handlers (uncaughtException, unhandledRejection) to attempt graceful shutdown on critical errors.
 *
 * @async
 * @function start
 * @returns {Promise<void>} A promise that resolves when the server has started and handlers are registered,
 *                          or rejects if a critical startup error occurs.
 */
const start = async (): Promise<void> => {
  // --- Logger Initialization ---
  // This section MUST run AFTER `config/index.js` is imported because `config.logLevel`
  // depends on `dotenv.config()` being called within `config/index.js`.

  // Define the set of valid log levels according to McpLogLevel.
  const validMcpLogLevels: McpLogLevel[] = [
    "debug",
    "info",
    "notice",
    "warning",
    "error",
    "crit",
    "alert",
    "emerg",
  ];
  // Get the configured log level from the `config` object.
  const initialLogLevelConfig = config.logLevel;

  // Validate the configured log level against the allowed McpLogLevel values.
  let validatedMcpLogLevel: McpLogLevel = "info"; // Default to 'info' if validation fails.
  if (validMcpLogLevels.includes(initialLogLevelConfig as McpLogLevel)) {
    validatedMcpLogLevel = initialLogLevelConfig as McpLogLevel;
  } else {
    // If the configured log level is invalid, log a warning to the console (if TTY).
    // This uses `console.warn` directly because the logger instance is not yet fully initialized.
    if (process.stdout.isTTY) {
      console.warn(
        `[Startup Warning] Invalid MCP_LOG_LEVEL "${initialLogLevelConfig}" found in configuration. ` +
          `Defaulting to log level "info". Valid levels are: ${validMcpLogLevels.join(", ")}.`,
      );
    }
  }
  // Initialize the logger with the validated (or default) log level.
  // `logger.initialize` might perform async operations (e.g., setting up file streams).
  await logger.initialize(validatedMcpLogLevel);
  // Now that the logger is initialized, use it for subsequent logging.
  logger.info(
    `Logger has been initialized by start(). Effective MCP logging level set to: ${validatedMcpLogLevel}.`,
  );
  // --- End Logger Initialization ---

  // Create an application-level request context for the startup process.
  // This context will be used for logging and can be passed down to subsequent operations if needed.
  const transportType = config.mcpTransportType; // Get transport type from config.
  const startupContext = requestContextService.createRequestContext({
    operation: `ServerStartupSequence_${transportType}`, // Make operation name descriptive.
    applicationName: config.mcpServerName,
    applicationVersion: config.mcpServerVersion,
    nodeEnvironment: environment, // `environment` is exported directly from config.
  });

  // Log that configuration has been loaded, now that `startupContext` is available for correlation.
  // This can be useful for debugging configuration issues.
  logger.debug("Application configuration loaded successfully.", {
    ...startupContext,
    // Avoid logging sensitive parts of config like MCP_AUTH_SECRET_KEY directly.
    // The config object itself might be too verbose for debug logs; consider cherry-picking.
    configSummary: {
      serverName: config.mcpServerName,
      serverVersion: config.mcpServerVersion,
      transport: config.mcpTransportType,
      logLevel: config.logLevel,
      env: config.environment,
      httpPort:
        config.mcpTransportType === "http" ? config.mcpHttpPort : undefined,
      httpHost:
        config.mcpTransportType === "http" ? config.mcpHttpHost : undefined,
    },
  });

  logger.info(
    `Starting ${config.mcpServerName} (Version: ${config.mcpServerVersion}, Transport: ${transportType}, Env: ${environment})...`,
    startupContext,
  );

  try {
    // Initialize the MCP server instance and start the selected transport mechanism (stdio or http).
    // `initializeAndStartServer` is responsible for the transport-specific setup.
    logger.debug(
      "Calling initializeAndStartServer to set up MCP transport...",
      startupContext,
    );

    // `initializeAndStartServer` might return the server instance (for stdio) or handle its own lifecycle (for http).
    const potentialServerInstance = await initializeAndStartServer();

    // For STDIO transport, `initializeAndStartServer` returns the McpServer instance.
    // We store this instance in the global `server` variable so `shutdown` can close it.
    if (
      transportType === "stdio" &&
      potentialServerInstance instanceof McpServer
    ) {
      server = potentialServerInstance;
      logger.info(
        "STDIO McpServer instance stored globally for shutdown.",
        startupContext,
      );
    } else if (transportType === "http") {
      // For HTTP transport, `initializeAndStartServer` typically starts an HTTP server (e.g., Express)
      // which listens for incoming connections. The MCP SDK might manage McpServer instances per session.
      // The main HTTP server listener itself keeps the Node.js process alive.
      // Explicit shutdown of the HTTP server might be handled within `initializeAndStartServer`'s
      // own cleanup or by a mechanism returned from it if needed here.
      // For this template, we assume the HTTP server handles its lifecycle or `process.exit` is sufficient.
      logger.info(
        "HTTP transport initialized. Server lifecycle managed by HTTP listener and session handlers.",
        startupContext,
      );
    }

    // If `initializeAndStartServer` encountered a critical error, it should have thrown,
    // and execution would have jumped to the `catch` block below.

    logger.info(
      `${config.mcpServerName} is now running and ready to accept connections via ${transportType} transport.`,
      {
        ...startupContext,
        serverStartTime: new Date().toISOString(), // Log the actual server ready time.
      },
    );

    // --- Signal and Error Handling Setup ---
    // These handlers ensure that the application attempts a graceful shutdown
    // when an external signal is received or an unhandled error occurs.

    // Listen for SIGTERM (e.g., from `kill` or process managers like systemd, Docker).
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    // Listen for SIGINT (e.g., from Ctrl+C in the terminal).
    process.on("SIGINT", () => shutdown("SIGINT"));

    // Listen for uncaught exceptions. These are errors that were not caught by any try/catch block.
    process.on("uncaughtException", async (error: Error) => {
      const errorContext = {
        ...startupContext, // Correlate with startup context.
        triggerEvent: "uncaughtException",
        errorMessage: error.message,
        errorStack: error.stack,
      };
      logger.error(
        // Use logger.error for severe issues.
        "FATAL: Uncaught exception detected. This indicates a bug or unexpected state. Initiating shutdown...",
        errorContext,
      );
      // Attempt a graceful shutdown. `shutdown()` handles its own internal error logging and process exit.
      await shutdown("uncaughtException");
      // If shutdown itself fails catastrophically before exiting, the process might terminate abruptly here.
      // However, `shutdown` is designed to call `process.exit`.
    });

    // Listen for unhandled promise rejections. These occur when a Promise is rejected but no .catch() handler is attached.
    process.on(
      "unhandledRejection",
      async (reason: unknown, promise: Promise<unknown>) => {
        // `reason` can be an Error object or any other value.
        const rejectionContext = {
          ...startupContext, // Correlate with startup context.
          triggerEvent: "unhandledRejection",
          rejectionReason:
            reason instanceof Error ? reason.message : String(reason),
          rejectionStack: reason instanceof Error ? reason.stack : undefined,
          // Optionally, log details about the promise if helpful, but be cautious with large objects.
          // promiseDetails: util.inspect(promise) // Example, requires `util` module.
        };
        logger.error(
          // Use logger.error for severe issues.
          "FATAL: Unhandled promise rejection detected. This indicates a bug or missing error handling in async code. Initiating shutdown...",
          rejectionContext,
        );
        // Attempt a graceful shutdown.
        await shutdown("unhandledRejection");
      },
    );
  } catch (error) {
    // This catch block handles critical errors that occur *during the startup sequence itself*
    // (e.g., failure in `initializeAndStartServer`, issues before global error handlers are set).
    // Errors caught by `ErrorHandler.tryCatch` within called functions should already be logged.
    logger.error(
      "CRITICAL ERROR DURING STARTUP: The application could not start. Exiting.",
      {
        ...startupContext, // Include startup context for correlation.
        finalErrorContext: "ApplicationStartupFailure",
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      },
    );
    process.exit(1); // Exit with a non-zero code to indicate startup failure.
  }
};

// --- Async IIFE (Immediately Invoked Function Expression) to allow top-level await ---
// The `start()` function is async. To call it at the top level of the module,
// we wrap it in an async IIFE. This is a common pattern in modern JavaScript/TypeScript
// for entry point scripts.
(async () => {
  try {
    // Execute the main application startup logic.
    await start();
    // If start() completes without throwing, the server is running and handlers are set.
    // The process will now stay alive due to active listeners (e.g., HTTP server, signal handlers)
    // or an active STDIO loop if applicable.
  } catch (error) {
    // This catch is a final fallback for any unexpected error escaping `start()`'s own try/catch.
    // `start()` is designed to handle its errors and exit, so this should ideally not be reached.
    // If it is, log it directly to console as logger might not be initialized or working.
    if (process.stdout.isTTY) {
      console.error(
        "[GLOBAL CATCH] An unexpected error occurred outside of the main start function's error handling:",
        error,
      );
    }
    process.exit(1); // Exit with an error code.
  }
})(); // End of async IIFE.
