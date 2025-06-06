/**
 * @fileoverview Main entry point for the MCP (Model Context Protocol) server.
 * This file orchestrates the server's lifecycle:
 * 1. Initializes the core `McpServer` instance (from `@modelcontextprotocol/sdk`) with its identity and capabilities.
 * 2. Registers available resources and tools, making them discoverable and usable by clients.
 * 3. Selects and starts the appropriate communication transport (stdio or Streamable HTTP)
 *    based on configuration.
 * 4. Handles top-level error management during startup.
 *
 * MCP Specification References:
 * - Lifecycle: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/basic/lifecycle.mdx
 * - Overview (Capabilities): https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/basic/index.mdx
 * - Transports: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/basic/transports.mdx
 * @module src/mcp-server/server
 */

import { ServerType } from "@hono/node-server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config, environment } from "../config/index.js";
import { ErrorHandler, logger, requestContextService } from "../utils/index.js";
import { registerEchoResource } from "./resources/echoResource/index.js";
import { registerCatFactFetcherTool } from "./tools/catFactFetcher/index.js";
import { registerEchoTool } from "./tools/echoTool/index.js";
import { startHttpTransport } from "./transports/httpTransport.js";
import { connectStdioTransport } from "./transports/stdioTransport.js";

/**
 * Creates and configures a new instance of the `McpServer`.
 *
 * This function defines the server's identity and capabilities as presented
 * to clients during MCP initialization.
 *
 * MCP Spec Relevance:
 * - Server Identity (`serverInfo`): `name` and `version` are part of `ServerInformation`.
 * - Capabilities Declaration: Declares supported features (logging, dynamic resources/tools).
 * - Resource/Tool Registration: Makes capabilities discoverable and invocable.
 *
 * Design Note: This factory is called once for 'stdio' transport and per session for 'http' transport.
 *
 * @returns A promise resolving with the configured `McpServer` instance.
 * @throws {Error} If any resource or tool registration fails.
 * @private
 */
async function createMcpServerInstance(): Promise<McpServer> {
  const context = requestContextService.createRequestContext({
    operation: "createMcpServerInstance",
  });
  logger.info("Initializing MCP server instance", context);

  requestContextService.configure({
    appName: config.mcpServerName,
    appVersion: config.mcpServerVersion,
    environment,
  });

  logger.debug("Instantiating McpServer with capabilities", {
    ...context,
    serverInfo: {
      name: config.mcpServerName,
      version: config.mcpServerVersion,
    },
    capabilities: {
      logging: {},
      resources: { listChanged: true },
      tools: { listChanged: true },
    },
  });
  const server = new McpServer(
    { name: config.mcpServerName, version: config.mcpServerVersion },
    {
      capabilities: {
        logging: {}, // Server can receive logging/setLevel and send notifications/message
        resources: { listChanged: true }, // Server supports dynamic resource lists
        tools: { listChanged: true }, // Server supports dynamic tool lists
      },
    },
  );

  try {
    logger.debug("Registering resources and tools...", context);
    await registerEchoResource(server);
    await registerEchoTool(server);
    await registerCatFactFetcherTool(server);
    logger.info("Resources and tools registered successfully", context);
  } catch (err) {
    logger.error("Failed to register resources/tools", {
      ...context,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  }

  return server;
}

/**
 * Selects, sets up, and starts the appropriate MCP transport layer based on configuration.
 *
 * MCP Spec Relevance:
 * - Transport Selection: Uses `config.mcpTransportType` ('stdio' or 'http').
 * - Transport Connection: Calls dedicated functions for chosen transport.
 * - Server Instance Lifecycle: Single instance for 'stdio', per-session for 'http'.
 *
 * @returns Resolves with `McpServer` for 'stdio', `http.Server` for 'http', or `void` if http transport manages its own lifecycle without returning a server.
 * @throws {Error} If transport type is unsupported or setup fails.
 * @private
 */
async function startTransport(): Promise<McpServer | ServerType | void> {
  const transportType = config.mcpTransportType;
  const context = requestContextService.createRequestContext({
    operation: "startTransport",
    transport: transportType,
  });
  logger.info(`Starting transport: ${transportType}`, context);

  if (transportType === "http") {
    logger.debug("Delegating to startHttpTransport...", context);
    // For HTTP, startHttpTransport now returns the http.Server instance.
    const httpServerInstance = await startHttpTransport(
      createMcpServerInstance,
      context,
    );
    return httpServerInstance;
  }

  if (transportType === "stdio") {
    logger.debug(
      "Creating single McpServer instance for stdio transport...",
      context,
    );
    const server = await createMcpServerInstance();
    logger.debug("Delegating to connectStdioTransport...", context);
    await connectStdioTransport(server, context);
    return server; // Return the single McpServer instance for stdio.
  }

  // Should not be reached if config validation is effective.
  logger.fatal(
    `Unsupported transport type configured: ${transportType}`,
    context,
  );
  throw new Error(
    `Unsupported transport type: ${transportType}. Must be 'stdio' or 'http'.`,
  );
}

/**
 * Main application entry point. Initializes and starts the MCP server.
 * Orchestrates server startup, transport selection, and top-level error handling.
 *
 * MCP Spec Relevance:
 * - Manages server startup, leading to a server ready for MCP messages.
 * - Handles critical startup failures, ensuring appropriate process exit.
 *
 * @returns For 'stdio', resolves with `McpServer`. For 'http', resolves with `http.Server`.
 *   Rejects on critical failure, leading to process exit.
 */
export async function initializeAndStartServer(): Promise<
  void | McpServer | ServerType
> {
  const context = requestContextService.createRequestContext({
    operation: "initializeAndStartServer",
  });
  logger.info("MCP Server initialization sequence started.", context);
  try {
    const result = await startTransport();
    logger.info(
      "MCP Server initialization sequence completed successfully.",
      context,
    );
    return result;
  } catch (err) {
    logger.fatal("Critical error during MCP server initialization.", {
      ...context,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    // Ensure the error is handled by our centralized handler, which might log more details or perform cleanup.
    ErrorHandler.handleError(err, {
      operation: "initializeAndStartServer", // More specific operation
      context: context, // Pass the existing context
      critical: true, // This is a critical failure
    });
    logger.info(
      "Exiting process due to critical initialization error.",
      context,
    );
    process.exit(1); // Exit with a non-zero code to indicate failure.
  }
}
