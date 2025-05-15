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
 * @module mcp-server/server
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// Import validated configuration and environment details.
import { config, environment } from "../config/index.js";
// Import core utilities: ErrorHandler, logger, requestContextService.
import { ErrorHandler, logger, requestContextService } from "../utils/index.js";
// Import registration functions for specific resources and tools.
import { registerEchoResource } from "./resources/echoResource/index.js";
import { registerEchoTool } from "./tools/echoTool/index.js";
// Import transport setup functions.
import { startHttpTransport } from "./transports/httpTransport.js";
import { connectStdioTransport } from "./transports/stdioTransport.js";

/**
 * Creates and configures a new instance of the `McpServer` (from `@modelcontextprotocol/sdk`).
 *
 * This function is central to defining the server's identity and functionality
 * as presented to connecting clients during the MCP initialization phase.
 *
 * MCP Spec Relevance:
 * - Server Identity (`serverInfo`): The `name` and `version` provided here are part
 *   of the `ServerInformation` object returned in the `InitializeResult` message,
 *   allowing clients to identify the server they are connected to.
 * - Capabilities Declaration: The `capabilities` object declares the features this
 *   server supports, enabling clients to tailor their interactions.
 *   - `logging: {}`: Indicates the server can receive `logging/setLevel` requests
 *     and may send `notifications/message` log messages (handled by the logger utility).
 *   - `resources: { listChanged: true }`: Signals that the server supports dynamic
 *     resource lists and will send `notifications/resources/list_changed` if the
 *     available resources change after initialization.
 *   - `tools: { listChanged: true }`: Signals support for dynamic tool lists and
 *     `notifications/tools/list_changed`.
 * - Resource/Tool Registration: This function calls specific registration functions
 *   (e.g., `registerEchoResource`) which use SDK methods (`server.resource`, `server.tool`)
 *   to make capabilities available for discovery (`resources/list`, `tools/list`) and
 *   invocation (`resources/read`, `tools/call`).
 *
 * Design Note: This factory function is used to create server instances. For the 'stdio'
 * transport, it's called once. For the 'http' transport, it's passed to `startHttpTransport`
 * and called *per session* to ensure session isolation.
 *
 * @returns {Promise<McpServer>} A promise resolving with the configured `McpServer` instance.
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
        logging: {},
        resources: { listChanged: true },
        tools: { listChanged: true },
      },
    },
  );

  try {
    logger.debug("Registering resources and tools...", context);
    await registerEchoResource(server);
    await registerEchoTool(server);
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
 * This function acts as the bridge between the core server logic and the communication channel.
 *
 * MCP Spec Relevance:
 * - Transport Selection: Reads `config.mcpTransportType` ('stdio' or 'http') to determine
 *   which transport mechanism defined in the MCP specification to use.
 * - Transport Connection: Calls dedicated functions (`connectStdioTransport` or `startHttpTransport`)
 *   which handle the specifics of establishing communication according to the chosen
 *   transport's rules.
 * - Server Instance Lifecycle:
 *   - For 'stdio', creates a single `McpServer` instance for the lifetime of the process.
 *   - For 'http', passes the `createMcpServerInstance` factory function to `startHttpTransport`,
 *     allowing the HTTP transport to create a new, isolated server instance for each client session.
 *
 * @returns {Promise<McpServer | void>} Resolves with the `McpServer` instance for 'stdio' transport,
 *                                      or `void` for 'http' transport (as it runs indefinitely).
 * @throws {Error} If the configured transport type is unsupported or if transport setup fails.
 * @private
 */
async function startTransport(): Promise<McpServer | void> {
  const transportType = config.mcpTransportType;
  const context = requestContextService.createRequestContext({
    operation: "startTransport",
    transport: transportType,
  });
  logger.info(`Starting transport: ${transportType}`, context);

  if (transportType === "http") {
    logger.debug("Delegating to startHttpTransport...", context);
    await startHttpTransport(createMcpServerInstance, context);
    return;
  }

  if (transportType === "stdio") {
    logger.debug(
      "Creating single McpServer instance for stdio transport...",
      context,
    );
    const server = await createMcpServerInstance();
    logger.debug("Delegating to connectStdioTransport...", context);
    await connectStdioTransport(server, context);
    return server;
  }

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
 * This function orchestrates the server startup sequence, including transport selection
 * and top-level error handling.
 *
 * MCP Spec Relevance:
 * - Orchestrates the server startup sequence, culminating in a server ready to accept
 *   connections and process MCP messages according to the chosen transport's rules.
 * - Implements top-level error handling for critical startup failures, ensuring the
 *   process exits appropriately if it cannot initialize correctly.
 *
 * @returns {Promise<void | McpServer>} Resolves upon successful startup. For 'http' transport, this promise
 *                                      effectively does not resolve as the server runs indefinitely. For 'stdio',
 *                                      it resolves with the `McpServer` instance. Rejects on critical failure,
 *                                      leading to process exit.
 * @public
 */
export async function initializeAndStartServer(): Promise<void | McpServer> {
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
    return result; // For stdio, this is the server instance. For http, this is void.
  } catch (err) {
    logger.fatal("Critical error during MCP server initialization.", {
      ...context,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    ErrorHandler.handleError(err, {
      operation: "initializeAndStartServer",
      context: context,
      critical: true,
    });
    logger.info(
      "Exiting process due to critical initialization error.",
      context,
    );
    process.exit(1);
  }
}
