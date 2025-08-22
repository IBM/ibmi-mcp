#!/usr/bin/env node
/**
 * @fileoverview Main entry point for the MCP TypeScript Template application.
 * This script initializes the configuration, sets up the logger, starts the
 * MCP server (either via STDIO or HTTP transport), and handles graceful
 * shutdown on process signals or unhandled errors.
 * @module src/index
 */

// to ensure OpenTelemetry is initialized correctly
import { shutdownOpenTelemetry } from "./utils/telemetry/instrumentation.js";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import http from "http";
import { config, environment } from "./config/index.js";
import { resolveConfiguration } from "./config/resolver.js";
import { initializeAndStartServer } from "./mcp-server/server.js";
import { requestContextService } from "./utils/index.js";
import { logger, McpLogLevel } from "./utils/internal/logger.js";
import {
  parseCliArguments,
  showHelp,
  validateToolsPath,
} from "./utils/cli/argumentParser.js";

// Parse CLI arguments and handle immediate responses
const cliArgs = parseCliArguments();

// Handle help request immediately
if (cliArgs.help) {
  showHelp();
  process.exit(0);
}

// Handle any parsing errors
if (cliArgs.errors && cliArgs.errors.length > 0) {
  console.error("CLI Argument Errors:");
  cliArgs.errors.forEach((error) => console.error(`  ✘ ${error}`));
  process.exit(1);
}

// Show warnings but continue execution
if (cliArgs.warnings && cliArgs.warnings.length > 0) {
  console.warn("CLI Argument Warnings:");
  cliArgs.warnings.forEach((warning) => console.warn(`  ⚠ ${warning}`));
}

// Validate tools path if provided
if (cliArgs.tools) {
  const validation = validateToolsPath(cliArgs.tools);
  if (!validation.valid) {
    console.error(`Tools path validation failed: ${validation.message}`);
    process.exit(1);
  }
  if (validation.message) {
    console.log(`ℹ ${validation.message}`);
  }
}

// Resolve final configuration with CLI arguments taking precedence
const resolvedConfig = resolveConfiguration(cliArgs);

// Log resolved configuration
if (cliArgs.tools) {
  console.log(`ℹ Using tools path: ${resolvedConfig.toolsYamlPath}`);
}
if (cliArgs.transport) {
  console.info(`Using MCP transport type: ${resolvedConfig.mcpTransportType}`);
}

let mcpStdioServer: McpServer | undefined;
let actualHttpServer: http.Server | undefined;

const shutdown = async (signal: string): Promise<void> => {
  const shutdownContext = requestContextService.createRequestContext({
    operation: "ServerShutdown",
    triggerEvent: signal,
  });

  logger.info(
    `Received ${signal}. Initiating graceful shutdown...`,
    shutdownContext,
  );

  try {
    // Shutdown OpenTelemetry first to ensure buffered telemetry is sent
    await shutdownOpenTelemetry();

    let closePromise: Promise<void> = Promise.resolve();
    const transportType = resolvedConfig.mcpTransportType;

    if (transportType === "stdio" && mcpStdioServer) {
      logger.info(
        "Attempting to close main MCP server (STDIO)...",
        shutdownContext,
      );
      closePromise = mcpStdioServer.close();
    } else if (transportType === "http" && actualHttpServer) {
      logger.info("Attempting to close HTTP server...", shutdownContext);
      closePromise = new Promise((resolve, reject) => {
        actualHttpServer!.close((err) => {
          if (err) {
            logger.error("Error closing HTTP server.", err, shutdownContext);
            return reject(err);
          }
          logger.info("HTTP server closed successfully.", shutdownContext);
          resolve();
        });
      });
    }

    await closePromise;
    logger.info(
      "Graceful shutdown completed successfully. Exiting.",
      shutdownContext,
    );
    process.exit(0);
  } catch (error) {
    logger.error(
      "Critical error during shutdown process.",
      error as Error,
      shutdownContext,
    );
    process.exit(1);
  }
};

const start = async (): Promise<void> => {
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
  const initialLogLevelConfig = config.logLevel;

  let validatedMcpLogLevel: McpLogLevel = "info";
  if (validMcpLogLevels.includes(initialLogLevelConfig as McpLogLevel)) {
    validatedMcpLogLevel = initialLogLevelConfig as McpLogLevel;
  } else {
    if (process.stdout.isTTY) {
      console.warn(
        `[Startup Warning] Invalid MCP_LOG_LEVEL "${initialLogLevelConfig}". Defaulting to "info".`,
      );
    }
  }

  await logger.initialize(validatedMcpLogLevel);
  logger.info(
    `Logger initialized. Effective MCP logging level: ${validatedMcpLogLevel}.`,
    requestContextService.createRequestContext({ operation: "LoggerInit" }),
  );

  const transportType = resolvedConfig.mcpTransportType;
  const startupContext = requestContextService.createRequestContext({
    operation: `ServerStartupSequence_${transportType}`,
    applicationName: resolvedConfig.mcpServerName,
    applicationVersion: resolvedConfig.mcpServerVersion,
    nodeEnvironment: environment,
  });

  logger.info(
    `Starting ${resolvedConfig.mcpServerName} (Version: ${resolvedConfig.mcpServerVersion}, Transport: ${transportType}, Env: ${environment})...`,
    startupContext,
  );

  try {
    const serverInstance = await initializeAndStartServer(resolvedConfig);

    if (transportType === "stdio" && serverInstance instanceof McpServer) {
      mcpStdioServer = serverInstance;
    } else if (
      transportType === "http" &&
      serverInstance instanceof http.Server
    ) {
      actualHttpServer = serverInstance;
    }

    logger.info(
      `${resolvedConfig.mcpServerName} is now running and ready.`,
      startupContext,
    );

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("uncaughtException", (error: Error) => {
      logger.fatal(
        "FATAL: Uncaught exception detected.",
        error,
        startupContext,
      );
      shutdown("uncaughtException");
    });
    process.on("unhandledRejection", (reason: unknown) => {
      logger.fatal(
        "FATAL: Unhandled promise rejection detected.",
        reason as Error,
        startupContext,
      );
      shutdown("unhandledRejection");
    });
  } catch (error) {
    logger.fatal(
      "CRITICAL ERROR DURING STARTUP.",
      error as Error,
      startupContext,
    );
    await shutdownOpenTelemetry(); // Attempt to flush any startup-related traces
    process.exit(1);
  }
};

(async () => {
  try {
    await start();
  } catch (error) {
    if (process.stdout.isTTY) {
      console.error("[GLOBAL CATCH] A fatal, unhandled error occurred:", error);
    }
    process.exit(1);
  }
})();
