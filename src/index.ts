#!/usr/bin/env node
/**
 * @fileoverview Main entry point for the MCP TypeScript Template application.
 * This script initializes the configuration, sets up the logger, starts the
 * MCP server (either via STDIO or HTTP transport), and handles graceful
 * shutdown on process signals or unhandled errors.
 * @module src/index
 */

// IMPORTANT: This line MUST be the first import to ensure OpenTelemetry is
// initialized before any other modules are loaded.
import { shutdownOpenTelemetry } from "@/utils/telemetry/instrumentation.js";

import { config, environment } from "@/config/index.js";
import { initializeAndStartServer } from "@/mcp-server/server.js";
import { requestContextService } from "@/utils/index.js";
import {
  logFatal,
  logOperationError,
  logOperationStart,
  logOperationSuccess,
} from "@/utils/internal/logging-helpers.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import http from "http";
import { applyCliOverrides } from "./config/resolver.js";
import {
  parseCliArguments,
  showHelp,
  validateToolsPath,
} from "./ibmi-mcp-server/utils/cli/argumentParser.js";
import { YamlConfigBuilder } from "@/ibmi-mcp-server/utils/yaml/yamlConfigBuilder.js";

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

// Apply CLI overrides directly to global config so downstream modules see changes
applyCliOverrides(cliArgs);

// Log overrides if provided
if (cliArgs.tools) {
  console.log(`ℹ Using tools path: ${config.toolsYamlPath}`);
}
if (cliArgs.transport) {
  console.info(`Using MCP transport type: ${config.mcpTransportType}`);
}

let mcpStdioServer: McpServer | undefined;
let actualHttpServer: http.Server | undefined;

const shutdown = async (signal: string): Promise<void> => {
  const shutdownContext = requestContextService.createRequestContext({
    operation: "ServerShutdown",
    triggerEvent: signal,
  });

  logOperationStart(
    shutdownContext,
    `Received ${signal}. Initiating graceful shutdown...`,
  );

  try {
    await shutdownOpenTelemetry();

    let closePromise: Promise<void> = Promise.resolve();
    const transportType = config.mcpTransportType;

    if (transportType === "stdio" && mcpStdioServer) {
      logOperationStart(
        shutdownContext,
        "Attempting to close main MCP server (STDIO)...",
      );
      closePromise = mcpStdioServer.close();
    } else if (transportType === "http" && actualHttpServer) {
      logOperationStart(shutdownContext, "Attempting to close HTTP server...");
      closePromise = new Promise((resolve, reject) => {
        actualHttpServer!.close((err) => {
          if (err) {
            logOperationError(
              shutdownContext,
              "Error closing HTTP server.",
              err,
            );
            return reject(err);
          }
          logOperationSuccess(
            shutdownContext,
            "HTTP server closed successfully.",
          );
          resolve();
        });
      });
    }

    await closePromise;
    // Cleanup YAML config cache and file watchers before exit
    try {
      YamlConfigBuilder.clearCacheAndWatchers();
    } catch {
      // best-effort
    }
    logOperationSuccess(
      shutdownContext,
      "Graceful shutdown completed successfully. Exiting.",
    );
    process.exit(0);
  } catch (error) {
    logOperationError(
      shutdownContext,
      "Critical error during shutdown process.",
      error,
    );
    try {
      YamlConfigBuilder.clearCacheAndWatchers();
    } catch {
      // best-effort
    }
    process.exit(1);
  }
};

const start = async (): Promise<void> => {
  const transportType = config.mcpTransportType;
  const startupContext = requestContextService.createRequestContext({
    operation: `ServerStartupSequence_${transportType}`,
    applicationName: config.mcpServerName,
    applicationVersion: config.mcpServerVersion,
    nodeEnvironment: environment,
  });

  logOperationStart(
    startupContext,
    `Starting ${config.mcpServerName} (Version: ${config.mcpServerVersion}, Transport: ${transportType}, Env: ${environment})...`,
  );

  try {
    const serverInstance = await initializeAndStartServer();

    if (transportType === "stdio" && serverInstance instanceof McpServer) {
      mcpStdioServer = serverInstance;
    } else if (
      transportType === "http" &&
      serverInstance instanceof http.Server
    ) {
      actualHttpServer = serverInstance;
    }

    logOperationSuccess(
      startupContext,
      `${config.mcpServerName} is now running and ready.`,
    );

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    // The logger already has a global uncaughtException handler for logging.
    // This handler is for initiating a graceful shutdown.
    process.on("uncaughtException", (error: Error) => {
      const context = requestContextService.createRequestContext({
        operation: "uncaughtException",
      });
      logFatal(context, "FATAL: Uncaught exception triggered shutdown.", error);
      shutdown("uncaughtException");
    });

    process.on("unhandledRejection", (reason: unknown) => {
      const context = requestContextService.createRequestContext({
        operation: "unhandledRejection",
      });
      logFatal(
        context,
        "FATAL: Unhandled promise rejection triggered shutdown.",
        reason,
      );
      shutdown("unhandledRejection");
    });
  } catch (error) {
    logFatal(startupContext, "CRITICAL ERROR DURING STARTUP.", error);
    await shutdownOpenTelemetry(); // Attempt to flush any startup-related traces
    process.exit(1);
  }
};

(async () => {
  try {
    await start();
  } catch (error) {
    const context = requestContextService.createRequestContext({
      operation: "globalCatch",
    });
    logFatal(
      context,
      "[GLOBAL CATCH] A fatal, unhandled error occurred.",
      error,
    );
    try {
      YamlConfigBuilder.clearCacheAndWatchers();
    } catch {
      // ignore
    }
    process.exit(1);
  }
})();
