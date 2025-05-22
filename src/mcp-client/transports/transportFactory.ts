/**
 * @fileoverview Factory for creating MCP client transports.
 * This module provides a centralized function (`getClientTransport`) to instantiate
 * the appropriate client transport (Stdio or HTTP) based on server configuration.
 * It uses specific transport creation functions from other modules within this directory.
 * @module src/mcp-client/transports/transportFactory
 */
import type { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"; // For return type
import type { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"; // For return type
import { BaseErrorCode, McpError } from "../../types-global/errors.js";
import {
  logger,
  RequestContext,
  requestContextService,
} from "../../utils/index.js"; // Centralized internal imports
import { getMcpServerConfig } from "../client-config/configLoader.js";
import { createStdioClientTransport } from "./stdioClientTransport.js";
import { createHttpClientTransport } from "./httpClientTransport.js";

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
      const baseUrl = serverConfig.command; // In HTTP config, 'command' holds the baseUrl
      // Validate baseUrl for HTTP transport
      if (
        !baseUrl ||
        typeof baseUrl !== "string" ||
        !baseUrl.startsWith("http")
      ) {
        const httpConfigError = `Invalid configuration for HTTP transport server "${serverName}": The 'command' field (used as baseUrl for HTTP) must be a valid URL string starting with http(s). Found: "${baseUrl}"`;
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
      return createHttpClientTransport(
        {
          baseUrl: baseUrl,
        },
        context,
      );
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
      throw error; // Re-throw McpError instances directly as they should have context.
    } else {
      // For unexpected errors not already McpError, wrap them.
      // These are likely programming errors or unexpected system issues.
      throw new McpError(
        BaseErrorCode.INTERNAL_ERROR, // Use INTERNAL_ERROR for unexpected issues
        `Unexpected error while getting transport for ${serverName}: ${errorMessage}`,
        { originalError: error, ...context },
      );
    }
  }
}
