/**
 * @fileoverview Provides functions for creating and configuring MCP client transports.
 * This module supports creating Stdio (Standard Input/Output) and Streamable HTTP transports
 * based on server configurations loaded via `configLoader.ts`.
 * @module src/mcp-client/transport
 */
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { BaseErrorCode, McpError } from "../types-global/errors.js";
import {
  logger,
  RequestContext,
  requestContextService,
} from "../utils/index.js"; // Centralized internal imports
import { getMcpServerConfig } from "./configLoader.js";

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
  if (!Array.isArray(transportConfig.args)) {
    logger.error(
      "Invalid args provided for StdioClientTransport (must be an array)",
      context,
    );
    throw new McpError(
      BaseErrorCode.CONFIGURATION_ERROR,
      "Invalid args for StdioClientTransport: args must be an array.",
      context,
    );
  }

  try {
    const filteredProcessEnv: Record<string, string> = {};
    for (const key in process.env) {
      if (
        Object.prototype.hasOwnProperty.call(process.env, key) &&
        process.env[key] !== undefined
      ) {
        filteredProcessEnv[key] = process.env[key] as string;
      }
    }

    const mergedEnv: Record<string, string> = {
      ...filteredProcessEnv,
      ...(transportConfig.env || {}),
    };

    logger.debug("Creating StdioClientTransport with merged environment", {
      ...context,
      envKeysCount: Object.keys(mergedEnv).length,
    });

    const transport = new StdioClientTransport({
      command: transportConfig.command,
      args: transportConfig.args,
      env: mergedEnv,
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

/**
 * Retrieves the server configuration and creates the appropriate client transport
 * (either `StdioClientTransport` or `StreamableHTTPClientTransport` from the `@modelcontextprotocol/sdk`)
 * based on the `transportType` specified in the server's configuration.
 * This function acts as a factory for client transport instances.
 *
 * @param serverName - The name of the MCP server, as defined in the `mcp-config.json` file.
 * @param parentContext - Optional parent request context for logging and tracing.
 * @returns A configured transport instance.
 * @throws {McpError} If the server configuration is missing or invalid, if an unsupported
 *                    transport type is specified, or if transport creation fails.
 */
export function getClientTransport(
  serverName: string,
  parentContext?: RequestContext | null,
): StdioClientTransport | StreamableHTTPClientTransport {
  const baseContext = parentContext ? { ...parentContext } : {};
  const context = requestContextService.createRequestContext({
    ...baseContext,
    operation: "getClientTransport",
    targetServer: serverName,
  });

  logger.info(`Getting transport for server: ${serverName}`, context);

  try {
    const serverConfig = getMcpServerConfig(serverName, context);
    const transportType = serverConfig.transportType;
    logger.info(
      `Selected transport type "${transportType}" for server: ${serverName}`,
      { ...context, transportType },
    );

    if (transportType === "stdio") {
      logger.info(`Creating stdio transport for server: ${serverName}`, {
        ...context,
        command: serverConfig.command,
        args: serverConfig.args,
        envProvided: !!serverConfig.env,
      });
      return createStdioClientTransport(
        {
          command: serverConfig.command,
          args: serverConfig.args,
          env: serverConfig.env,
        },
        context,
      );
    } else if (transportType === "http") {
      const baseUrl = serverConfig.command;
      if (
        !baseUrl ||
        typeof baseUrl !== "string" ||
        !baseUrl.startsWith("http")
      ) {
        const httpConfigError = `Invalid configuration for HTTP transport server "${serverName}": The 'command' field must be a valid base URL (e.g., "http://localhost:3001"). Found: "${baseUrl}"`;
        logger.error(httpConfigError, context);
        throw new McpError(
          BaseErrorCode.CONFIGURATION_ERROR,
          httpConfigError,
          context,
        );
      }

      logger.info(
        `Creating HTTP transport for server: ${serverName} with base URL: ${baseUrl}`,
        context,
      );

      try {
        // Authentication headers or other options can be added here if needed.
        const transportOptions = {
          // headers: { 'Authorization': `Bearer YOUR_TOKEN_HERE` }
        };
        const transport = new StreamableHTTPClientTransport(
          new URL(baseUrl), // SDK expects a URL object
          transportOptions,
        );
        logger.info(
          `StreamableHTTPClientTransport created successfully for ${serverName}`,
          context,
        );
        return transport;
      } catch (error) {
        logger.error(
          `Failed to create StreamableHTTPClientTransport for ${serverName}`,
          {
            ...context,
            baseUrl: baseUrl,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        );
        throw new McpError(
          BaseErrorCode.INTERNAL_ERROR,
          `Failed to create HTTP transport for ${serverName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { originalError: error, ...context },
        );
      }
    } else {
      const unsupportedErrorMessage = `Unsupported transportType "${serverConfig.transportType}" configured for server "${serverName}".`;
      logger.error(unsupportedErrorMessage, context);
      throw new McpError(
        BaseErrorCode.CONFIGURATION_ERROR,
        unsupportedErrorMessage,
        context,
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Failed to get or create transport for server "${serverName}"`,
      {
        ...context,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      },
    );
    if (error instanceof McpError) {
      throw error;
    } else {
      throw new McpError(
        BaseErrorCode.CONFIGURATION_ERROR, // Default to config error if origin unknown
        `Failed to initialize transport for ${serverName}: ${errorMessage}`,
        { originalError: error },
      );
    }
  }
}
