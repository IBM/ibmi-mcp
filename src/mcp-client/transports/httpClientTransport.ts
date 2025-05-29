/**
 * @fileoverview Provides functions for creating and configuring MCP StreamableHTTPClientTransport.
 * This module is responsible for instantiating and setting up the StreamableHTTPClientTransport
 * from the @modelcontextprotocol/sdk, used for communicating with MCP servers over HTTP.
 * @module src/mcp-client/transports/httpClientTransport
 */
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { BaseErrorCode, McpError } from "../../types-global/errors.js";
import {
  logger,
  RequestContext,
  requestContextService,
} from "../../utils/index.js"; // Centralized internal imports

/**
 * Configuration options specifically required for creating a `StreamableHTTPClientTransport`.
 * This primarily includes the base URL of the MCP server.
 */
export interface HttpTransportConfig {
  baseUrl: string;
  // Potentially add other HTTP-specific options like custom headers, auth tokens, etc.
  // For example:
  // headers?: Record<string, string>;
  // authToken?: string;
}

/**
 * Creates and configures a `StreamableHTTPClientTransport` instance (from the `@modelcontextprotocol/sdk`)
 * for communicating with an MCP server over HTTP.
 *
 * @param transportConfig - Configuration containing the base URL for the HTTP server.
 * @param parentContext - Optional parent request context for logging and tracing.
 * @returns A configured `StreamableHTTPClientTransport` instance, ready to be connected.
 * @throws {McpError} If the provided `transportConfig` is invalid (e.g., missing or malformed baseUrl)
 *                    or if the transport fails to initialize for other reasons.
 */
export function createHttpClientTransport(
  transportConfig: HttpTransportConfig,
  parentContext?: RequestContext | null,
): StreamableHTTPClientTransport {
  const baseContext = parentContext ? { ...parentContext } : {};
  const context = requestContextService.createRequestContext({
    ...baseContext,
    operation: "createHttpClientTransport",
    transportType: "http",
    baseUrl: transportConfig.baseUrl,
  });

  logger.debug("Creating StreamableHTTPClientTransport", context);

  // The check for `startsWith("http")` should have been done by the caller (e.g., transportFactory)
  // which should have already validated the nature of the command string for HTTP transport.
  if (!transportConfig.baseUrl || typeof transportConfig.baseUrl !== "string") {
    const httpConfigError = `Invalid baseUrl for StreamableHTTPClientTransport: command must be a non-empty URL string. Found: "${transportConfig.baseUrl}"`;
    logger.error(httpConfigError, context);
    throw new McpError(
      BaseErrorCode.CONFIGURATION_ERROR,
      httpConfigError,
      context,
    );
  }

  try {
    // Authentication headers or other options can be added here if needed.
    // Example:
    // const transportOptions = transportConfig.headers ? { headers: transportConfig.headers } : {};
    const transportOptions = {
      // headers: { 'Authorization': `Bearer YOUR_TOKEN_HERE` } // Example
    };

    const transport = new StreamableHTTPClientTransport(
      new URL(transportConfig.baseUrl), // SDK expects a URL object
      transportOptions,
    );

    logger.info(
      `StreamableHTTPClientTransport created successfully for ${transportConfig.baseUrl}`,
      context,
    );
    return transport;
  } catch (error) {
    logger.error(
      `Failed to create StreamableHTTPClientTransport for ${transportConfig.baseUrl}`,
      {
        ...context,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    );
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Failed to create StreamableHTTPClientTransport for ${
        transportConfig.baseUrl
      }: ${error instanceof Error ? error.message : String(error)}`,
      { originalError: error, ...context },
    );
  }
}
