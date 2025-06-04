/**
 * @fileoverview Provides functions for creating and configuring MCP StdioClientTransport.
 * This module is responsible for instantiating and setting up the StdioClientTransport
 * from the @modelcontextprotocol/sdk, which is used to communicate with local MCP
 * server processes via their standard input/output streams.
 * @module src/mcp-client/transports/stdioClientTransport
 */
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { BaseErrorCode, McpError } from "../../types-global/errors.js";
import {
  logger,
  RequestContext,
  requestContextService,
} from "../../utils/index.js"; // Centralized internal imports

/**
 * Configuration options specifically required for creating a `StdioClientTransport`
 * (from the `@modelcontextprotocol/sdk`).
 * This includes the command to execute the server process, arguments to pass to it,
 * and optional environment variables for the server's execution context.
 */
export interface StdioTransportConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * Creates and configures a `StdioClientTransport` instance (from the `@modelcontextprotocol/sdk`)
 * for launching and communicating with an MCP server process via its standard input and output streams.
 *
 * @param transportConfig - Configuration containing the command, arguments,
 *                                                 and environment variables for the server process.
 * @param parentContext - Optional parent request context for logging and tracing.
 * @returns A configured `StdioClientTransport` instance, ready to be connected.
 * @throws {McpError} If the provided `transportConfig` is invalid (e.g., missing command)
 *                    or if the transport fails to initialize for other reasons.
 */
export function createStdioClientTransport(
  transportConfig: StdioTransportConfig,
  parentContext?: RequestContext | null,
): StdioClientTransport {
  const baseContext = parentContext ? { ...parentContext } : {};
  const context = requestContextService.createRequestContext({
    ...baseContext,
    operation: "createStdioClientTransport",
    transportType: "stdio",
    command: transportConfig.command,
  });

  logger.debug("Creating StdioClientTransport", context);

  if (!transportConfig.command || typeof transportConfig.command !== "string") {
    logger.error("Invalid command provided for StdioClientTransport", context);
    throw new McpError(
      BaseErrorCode.CONFIGURATION_ERROR,
      "Invalid command for StdioClientTransport: command must be a non-empty string.",
      context,
    );
  }
  // Args validation (Array.isArray) is handled by TypeScript and Zod schema at config load time.
  // If individual arg string validation (e.g., non-empty) is needed,
  // it should be part of the Zod schema in configLoader.ts.

  try {
    // Only pass through environment variables explicitly defined in the server's configuration.
    // Inheriting all of process.env is a security risk.
    // If specific variables from process.env are needed, they should be explicitly
    // listed in the mcp-config.json for that server or handled by an allowlist mechanism.
    const serverSpecificEnv: Record<string, string> = {
      ...(transportConfig.env || {}), // Only use explicitly defined env vars from config
    };

    logger.debug("Creating StdioClientTransport with merged environment", {
      ...context,
      envKeysCount: Object.keys(serverSpecificEnv).length,
      envVarNames: Object.keys(serverSpecificEnv).join(", ") || "None",
    });

    const transport = new StdioClientTransport({
      command: transportConfig.command,
      args: transportConfig.args, // Assumed to be string[] by this point
      env: serverSpecificEnv,
    });

    logger.info("StdioClientTransport created successfully", context);
    return transport;
  } catch (error) {
    logger.error("Failed to create StdioClientTransport", {
      ...context,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Failed to create StdioClientTransport: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { originalError: error, ...context },
    );
  }
}
