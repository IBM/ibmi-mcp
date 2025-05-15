import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ClientCapabilities } from "@modelcontextprotocol/sdk/types.js"; // Import ClientCapabilities type
import { BaseErrorCode, McpError } from "../types-global/errors.js";
// Import utils from the main barrel file (ErrorHandler, logger, RequestContext, requestContextService from ../utils/internal/*)
import {
  ErrorHandler,
  logger,
  RequestContext,
  requestContextService,
} from "../utils/index.js";
import { getClientTransport } from "./transport.js";
// Import config loader for early validation
import { getMcpServerConfig } from "./configLoader.js";

/**
 * Represents a successfully connected MCP Client instance.
 * This is an alias for the SDK's Client class for improved readability.
 */
export type ConnectedMcpClient = Client;

/**
 * In-memory cache for active MCP client connections.
 * Maps server names (from config) to their connected Client instances.
 * This prevents redundant connections to the same server.
 */
const connectedClients: Map<string, ConnectedMcpClient> = new Map();

/**
 * Creates, connects, and returns an MCP client instance for a specified server.
 * Implements caching: If a client for the server is already connected, it returns the existing instance.
 * Validates server configuration before attempting connection.
 * Follows the MCP 2025-03-26 specification for client initialization and capabilities.
 *
 * @param serverName - The name of the MCP server to connect to (must exist in mcp-config.json).
 * @param parentContext - Optional parent request context for logging and tracing.
 * @returns A promise resolving to the connected Client instance.
 * @throws McpError if configuration is missing/invalid, transport fails, or connection/initialization fails.
 */
export async function connectMcpClient(
  serverName: string,
  parentContext?: RequestContext | null,
): Promise<ConnectedMcpClient> {
  const operationContext = requestContextService.createRequestContext({
    ...(parentContext ?? {}),
    operation: "connectMcpClient",
    targetServer: serverName,
  });

  // --- Check Cache ---
  if (connectedClients.has(serverName)) {
    logger.debug(
      `Returning existing connected client for server: ${serverName}`,
      operationContext,
    );
    return connectedClients.get(serverName)!;
  }

  logger.info(
    `Attempting to connect to MCP server: ${serverName}`,
    operationContext,
  );

  return await ErrorHandler.tryCatch(
    async () => {
      // --- 1. Validate Server Configuration ---
      // Ensure the server is defined in the configuration file before proceeding.
      // This prevents trying to create transports for non-existent servers.
      logger.debug(
        `Validating configuration for server: ${serverName}`,
        operationContext,
      );
      // getMcpServerConfig throws McpError if the serverName is not found.
      getMcpServerConfig(serverName, operationContext);
      logger.debug(
        `Configuration validated for server: ${serverName}`,
        operationContext,
      );

      // --- 2. Define Client Identity & Capabilities (MCP Spec 2025-03-26) ---
      // The client MUST identify itself during the 'initialize' handshake.
      // Client identity details:
      const clientIdentity = {
        name: `mcp-ts-template-client-for-${serverName}`,
        version: "1.0.0", // Use actual client version if available
        // Optional: Add other client info like supportedProtocolVersions if needed
        // supportedProtocolVersions: ['2025-03-26']
      };

      // The client MUST declare its capabilities during 'initialize'.
      // This informs the server about what features the client supports.
      const clientCapabilities: ClientCapabilities = {
        // Resources Capability: Ability to interact with server-provided data sources.
        resources: {
          list: true, // Client can request a list of available resources (`resources/list`).
          read: true, // Client can request the content of a resource (`resources/read`).
          templates: {
            list: true, // Client can request a list of resource templates (`resources/templates/list`).
          },
          // Optional resource features:
          // subscribe: true, // Client supports subscribing to resource updates (`resources/subscribe`, `resources/unsubscribe`, `notifications/resources/updated`).
          // listChanged: true, // Client supports receiving notifications when the list of available resources changes (`notifications/resources/list_changed`).
        },
        // Tools Capability: Ability to interact with server-provided executable functions.
        tools: {
          list: true, // Client can request a list of available tools (`tools/list`).
          call: true, // Client can request the execution of a tool (`tools/call`).
          // Optional tool features:
          // listChanged: true, // Client supports receiving notifications when the list of available tools changes (`notifications/tools/list_changed`).
        },
        // Prompts Capability: Ability to interact with server-provided prompt templates.
        prompts: {
          list: true, // Client can request a list of available prompts (`prompts/list`).
          get: true, // Client can request the content of a specific prompt (`prompts/get`).
          // Optional prompt features:
          // listChanged: true, // Client supports receiving notifications when the list of available prompts changes (`notifications/prompts/list_changed`).
        },
        // Logging Capability: Ability to interact with server-side logging.
        logging: {
          // Client can request the server to adjust its logging level (`logging/setLevel`).
          // Note: The client *receives* log messages via `notifications/message` if the *server* declares the logging capability.
          // This flag indicates the client can *send* the setLevel request.
          setLevel: true,
        },
        // Roots Capability: Ability to handle filesystem root information from the server.
        roots: {
          // Client supports receiving notifications when the server's accessible filesystem roots change (`notifications/roots/list_changed`).
          // The initial list of roots is provided by the server in the 'initialize' response.
          listChanged: true,
        },
        // Other Standard Capabilities (Uncomment and set to true if supported):
        // sampling: { createMessage: true }, // Client can request the server to generate text via an LLM (`sampling/createMessage`). Requires server support.
        // completions: { complete: true }, // Client can request simple text completions from the server (`completion/complete`). Requires server support.
        // configuration: { get: true, set: true }, // Client can get/set server configuration (`configuration/get`, `configuration/set`). Requires server support.
        // ping: true, // Client supports the basic ping request for connectivity checks. (Implicitly supported by SDK Client)
        // cancellation: true, // Client supports sending cancellation notifications (`notifications/cancelled`). (Implicitly supported by SDK Client)
        // progress: true, // Client supports receiving progress notifications (`notifications/progress`). (Implicitly supported by SDK Client)
      };
      logger.debug("Client identity and capabilities defined", {
        ...operationContext,
        identity: clientIdentity,
        capabilities: clientCapabilities, // Consider logging selectively for brevity if needed
      });

      // --- 3. Get Transport ---
      // Obtain the configured transport (Stdio or HTTP) for the server.
      // This happens *after* config validation to ensure transport details are available.
      const transport = getClientTransport(serverName, operationContext);

      // --- 4. Create Client Instance ---
      // Instantiate the high-level SDK Client. It requires identity and capabilities.
      logger.debug(
        `Creating MCP Client instance for ${serverName}`,
        operationContext,
      );
      const client = new Client(clientIdentity, {
        capabilities: clientCapabilities,
      });

      // --- 5. Setup Event Handlers ---
      // Handle errors originating from the client or transport layer.
      // Handle transport closure to clean up the connection state.
      client.onerror = (clientError: Error) => {
        // Errors reported by the Client class itself (e.g., protocol violations)
        const errorCode = (clientError as any).code; // Attempt to get JSON-RPC error code
        const errorData = (clientError as any).data; // Attempt to get error data
        logger.error(`MCP Client error for server ${serverName}`, {
          ...operationContext,
          error: clientError.message,
          code: errorCode,
          data: errorData,
          stack: clientError.stack,
        });
        // Trigger disconnection and cleanup
        disconnectMcpClient(serverName, operationContext, clientError);
      };
      transport.onerror = (transportError: Error) => {
        // Errors reported by the underlying transport (e.g., process crash, network issue)
        logger.error(`MCP Transport error for server ${serverName}`, {
          ...operationContext,
          error: transportError.message,
          stack: transportError.stack,
        });
        // Trigger disconnection and cleanup
        disconnectMcpClient(serverName, operationContext, transportError);
      };
      transport.onclose = () => {
        // Transport connection closed (gracefully or unexpectedly)
        logger.info(
          `MCP Transport closed for server ${serverName}`,
          operationContext,
        );
        // Trigger disconnection and cleanup
        disconnectMcpClient(serverName, operationContext);
      };

      // --- 6. Connect and Initialize ---
      // Establish the connection and perform the MCP initialize handshake.
      // The `client.connect()` method handles sending the `initialize` request
      // with the defined identity and capabilities, and processing the server's response.
      logger.info(
        `Connecting client to transport for ${serverName}...`,
        operationContext,
      );
      await client.connect(transport); // This promise resolves after successful initialization
      logger.info(
        `Successfully connected and initialized with MCP server: ${serverName}`,
        operationContext,
      );

      // --- 7. Store Connection ---
      // Cache the successfully connected client instance.
      connectedClients.set(serverName, client);

      return client;
    },
    {
      operation: `connecting to MCP server ${serverName}`,
      context: operationContext,
      errorCode: BaseErrorCode.INTERNAL_ERROR, // Use INTERNAL_ERROR as fallback for connection issues
    },
  );
}

/**
 * Disconnects a specific MCP client, closes its transport, and removes it from the cache.
 * Handles potential errors during the close operation.
 *
 * @param serverName - The name of the server whose client should be disconnected.
 * @param parentContext - Optional parent request context for logging.
 * @param error - Optional error that triggered the disconnect (used for logging context).
 */
export async function disconnectMcpClient(
  serverName: string,
  parentContext?: RequestContext | null,
  error?: Error | McpError,
): Promise<void> {
  const context = requestContextService.createRequestContext({
    ...(parentContext ?? {}),
    operation: "disconnectMcpClient",
    targetServer: serverName,
    triggerReason: error ? error.message : "explicit disconnect or close",
  });

  const client = connectedClients.get(serverName);

  if (client) {
    // Only remove from cache *before* attempting close if triggered by an error,
    // otherwise remove *after* successful close or failed close attempt.
    // This prevents race conditions where a new connection attempt might occur
    // while the old one is still closing gracefully.
    if (error) {
      connectedClients.delete(serverName);
      logger.debug(
        `Removed client ${serverName} from cache due to error trigger.`,
        context,
      );
    }

    logger.info(`Disconnecting client for server: ${serverName}`, context);
    try {
      // Attempt graceful shutdown (sends 'shutdown' notification if supported, closes transport)
      await client.close();
      logger.info(`Client for ${serverName} closed successfully.`, context);
    } catch (closeError) {
      logger.error(`Error closing client for ${serverName}`, {
        ...context,
        error:
          closeError instanceof Error ? closeError.message : String(closeError),
        stack: closeError instanceof Error ? closeError.stack : undefined,
      });
      // Continue cleanup even if close fails
    } finally {
      // Ensure removal from cache if not already removed due to error
      if (connectedClients.has(serverName)) {
        connectedClients.delete(serverName);
        logger.debug(
          `Removed client ${serverName} from connection cache after close attempt.`,
          context,
        );
      }
    }
  } else {
    // Only log warning if it wasn't triggered by an error (to avoid duplicate logs on error disconnect)
    if (!error) {
      logger.warning(
        `Client for server ${serverName} not found in cache or already disconnected.`,
        context,
      );
    }
    // Defensive removal in case of inconsistent state
    if (connectedClients.has(serverName)) {
      connectedClients.delete(serverName);
    }
  }
}

/**
 * Disconnects all currently connected MCP clients.
 * Useful for graceful application shutdown.
 *
 * @param parentContext - Optional parent request context for logging.
 */
export async function disconnectAllMcpClients(
  parentContext?: RequestContext | null,
): Promise<void> {
  const context = requestContextService.createRequestContext({
    ...(parentContext ?? {}),
    operation: "disconnectAllMcpClients",
  });
  logger.info("Disconnecting all MCP clients...", context);
  const disconnectionPromises: Promise<void>[] = [];
  // Create a copy of keys to avoid issues while iterating and deleting
  const serverNames = Array.from(connectedClients.keys());
  for (const serverName of serverNames) {
    // Pass the main context down to individual disconnect calls
    disconnectionPromises.push(disconnectMcpClient(serverName, context));
  }
  try {
    // Wait for all disconnection attempts to complete
    await Promise.all(disconnectionPromises);
    logger.info("All MCP clients disconnected.", context);
  } catch (error) {
    // Log if any disconnection failed, but don't necessarily halt shutdown
    logger.error("Error during disconnection of all clients", {
      ...context,
      error: error instanceof Error ? error.message : String(error),
    });
    // Decide if this should throw or just log based on application needs
  }
}

// --- Graceful Shutdown Integration ---
// Consider moving this logic to the main application entry point (e.g., src/index.ts)
// to coordinate shutdown across different parts of the application.
/*
async function gracefulShutdown(signal: string) {
  const context = requestContextService.createRequestContext({ operation: 'gracefulShutdown', signal });
  logger.info(`Received ${signal}. Initiating graceful shutdown...`, context);
  await disconnectAllMcpClients(context);
  logger.info("Graceful shutdown complete. Exiting.", context);
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Ctrl+C
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Termination signal
*/
