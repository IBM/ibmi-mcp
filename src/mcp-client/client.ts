/**
 * @fileoverview Manages MCP (Model Context Protocol) client connections.
 * This module is responsible for establishing, maintaining, and terminating connections
 * to MCP servers. It includes features such as connection caching to prevent redundant
 * connections, validation of server configurations, and adherence to the MCP
 * specification for client identity and capabilities. It also provides robust error
 * handling and graceful disconnection mechanisms.
 *
 * MCP Specification References:
 * - Client Lifecycle & Initialization: Aligns with general MCP lifecycle principles.
 * - Client Identity & Capabilities: Adheres to the structure defined in the MCP specification (e.g., 2025-03-26).
 * @module src/mcp-client/client
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ClientCapabilities } from "@modelcontextprotocol/sdk/types.js";
import { BaseErrorCode, McpError } from "../types-global/errors.js";
// Import utilities from the main barrel file for consistent access
import {
  ErrorHandler,
  logger,
  RequestContext,
  requestContextService,
} from "../utils/index.js";
import { getClientTransport } from "./transport.js";
// Import config loader for early validation of server configurations
import { getMcpServerConfig } from "./configLoader.js";

/**
 * Represents a successfully connected and initialized MCP Client instance.
 * This type alias enhances readability by providing a descriptive name for the SDK's `Client` class
 * when used in the context of an established connection.
 */
export type ConnectedMcpClient = Client;

/**
 * In-memory cache for active MCP client connections.
 * This map stores `ConnectedMcpClient` instances, keyed by their server names (as defined in `mcp-config.json`).
 * Caching prevents redundant connection attempts and reuses existing connections for efficiency.
 * @private
 */
const connectedClients: Map<string, ConnectedMcpClient> = new Map();

/**
 * Creates, connects, and returns an MCP client instance for a specified server.
 *
 * This function orchestrates the entire lifecycle of an MCP client connection:
 * 1.  **Cache Check**: Verifies if an active connection to the `serverName` already exists in the
 *     `connectedClients` cache. If so, the existing `ConnectedMcpClient` instance is returned.
 * 2.  **Configuration Validation**: Retrieves and validates the server's configuration from `mcp-config.json`
 *     via `getMcpServerConfig`. This step is crucial to ensure the server is known and properly
 *     configured before attempting a connection. Throws `McpError` if configuration is missing or invalid.
 * 3.  **Client Identity & Capabilities Definition**: Constructs the client's identity (name, version) and
 *     declares its capabilities (e.g., support for listing resources, calling tools) as per the
 *     MCP 2025-03-26 specification. This information is sent to the server during the `initialize` handshake.
 * 4.  **Transport Acquisition**: Obtains the appropriate communication transport (Stdio or HTTP) for the
 *     target server using `getClientTransport`, based on the validated server configuration.
 * 5.  **Client Instantiation**: Creates a new `Client` instance from the `@modelcontextprotocol/sdk`,
 *     providing the defined client identity and capabilities.
 * 6.  **Event Handler Setup**: Attaches `onerror` and `onclose` event handlers to both the `Client` instance
 *     and its underlying transport. These handlers are responsible for logging errors, managing connection
 *     state, and triggering the `disconnectMcpClient` function for cleanup.
 * 7.  **Connection and Initialization**: Invokes `client.connect(transport)` to establish the physical
 *     connection to the server and perform the MCP `initialize` handshake. This is an asynchronous
 *     operation that resolves upon successful initialization.
 * 8.  **Connection Caching**: Upon successful connection and initialization, the new `ConnectedMcpClient`
 *     instance is stored in the `connectedClients` cache for future reuse.
 *
 * @param serverName - The unique name of the MCP server to connect to. This name must correspond
 *                     to an entry in the `mcp-config.json` file.
 * @param parentContext - Optional. A parent `RequestContext` for maintaining logging and tracing continuity.
 *                        If not provided, a new root context is created.
 * @returns A promise that resolves to the connected and initialized `ConnectedMcpClient` instance.
 * @throws {McpError} If server configuration is missing or invalid, if the transport cannot be established,
 *                    or if the connection or MCP initialization handshake fails. Other errors may be
 *                    thrown if unexpected issues occur.
 */
export async function connectMcpClient(
  serverName: string,
  parentContext?: RequestContext | null,
): Promise<ConnectedMcpClient> {
  const operationContext = requestContextService.createRequestContext({
    ...(parentContext ?? {}), // Inherit from parent or create new if null/undefined
    operation: "connectMcpClient",
    targetServer: serverName,
  });

  // --- Step 1: Check Cache ---
  if (connectedClients.has(serverName)) {
    logger.debug(
      `Returning existing connected client for server: ${serverName}`,
      operationContext,
    );
    return connectedClients.get(serverName)!; // Non-null assertion is safe due to .has() check
  }

  logger.info(
    `Attempting to connect to MCP server: ${serverName}`,
    operationContext,
  );

  // Wrap the entire connection process in a tryCatch for robust error handling
  return await ErrorHandler.tryCatch(
    async () => {
      // --- Step 2: Validate Server Configuration ---
      logger.debug(
        `Validating configuration for server: ${serverName}`,
        operationContext,
      );
      // getMcpServerConfig will throw an McpError if the serverName is not found or config is invalid.
      // This ensures we don't proceed with a misconfigured server.
      getMcpServerConfig(serverName, operationContext);
      logger.debug(
        `Configuration successfully validated for server: ${serverName}`,
        operationContext,
      );

      // --- Step 3: Define Client Identity & Capabilities (MCP Spec 2025-03-26) ---
      // The client MUST identify itself and declare its capabilities during the 'initialize' handshake.
      const clientIdentity = {
        name: `mcp-ts-template-client-for-${serverName}`, // Unique name for this client instance
        version: "1.0.0", // Version of this client.
        // supportedProtocolVersions: ['2025-03-26'] // Optional: Specify supported MCP spec versions
      };

      const clientCapabilities: ClientCapabilities = {
        resources: {
          list: true,
          read: true,
          templates: { list: true },
          // subscribe: false, // Example: Client does not support resource subscriptions
          // listChanged: false,
        },
        tools: {
          list: true,
          call: true,
          // listChanged: false,
        },
        prompts: {
          list: true,
          get: true,
          // listChanged: false,
        },
        logging: {
          setLevel: true, // Client can request the server to change its log level.
        },
        roots: {
          listChanged: true, // Client can handle notifications if server's filesystem roots change.
        },
        // Other capabilities can be added here if supported by the client.
        // e.g., sampling, completions, configuration management.
        // ping: true, // Implicitly supported by SDK Client
        // cancellation: true, // Implicitly supported by SDK Client
        // progress: true, // Implicitly supported by SDK Client
      };
      logger.debug("Client identity and capabilities defined", {
        ...operationContext,
        identity: clientIdentity,
        capabilities: clientCapabilities, // Full capabilities object logged for debug purposes.
      });

      // --- Step 4: Get Transport ---
      // Obtain the configured transport (Stdio or HTTP) for the server.
      const transport = getClientTransport(serverName, operationContext);
      logger.debug(
        `Transport acquired for server ${serverName}: ${transport.constructor.name}`,
        operationContext,
      );

      // --- Step 5: Create Client Instance ---
      logger.debug(
        `Creating MCP Client SDK instance for ${serverName}`,
        operationContext,
      );
      const client = new Client(clientIdentity, {
        capabilities: clientCapabilities,
      });

      // --- Step 6: Setup Event Handlers ---
      // These handlers are crucial for reacting to errors and closures, ensuring proper cleanup.
      client.onerror = (clientError: Error) => {
        const errorCode = (clientError as any).code;
        const errorData = (clientError as any).data;
        logger.error(`MCP SDK Client error for server ${serverName}`, {
          ...operationContext, // Use the context from the connectMcpClient scope
          error: clientError.message,
          code: errorCode,
          data: errorData,
          stack: clientError.stack,
        });
        // This will trigger cleanup and removal from cache.
        disconnectMcpClient(serverName, operationContext, clientError);
      };

      transport.onerror = (transportError: Error) => {
        logger.error(`MCP Transport layer error for server ${serverName}`, {
          ...operationContext, // Use the context from the connectMcpClient scope
          error: transportError.message,
          stack: transportError.stack,
        });
        // This will trigger cleanup and removal from cache.
        disconnectMcpClient(serverName, operationContext, transportError);
      };

      transport.onclose = () => {
        logger.info(
          `MCP Transport closed for server ${serverName}. Initiating client disconnect.`,
          operationContext, // Use the context from the connectMcpClient scope
        );
        // This will trigger cleanup and removal from cache.
        disconnectMcpClient(serverName, operationContext);
      };
      logger.debug(
        `Event handlers (onerror, onclose) set up for client and transport for ${serverName}`,
        operationContext,
      );

      // --- Step 7: Connect and Initialize ---
      logger.info(
        `Connecting client to transport and performing MCP initialization for ${serverName}...`,
        operationContext,
      );
      // client.connect() handles sending the 'initialize' request and processing the server's response.
      // It resolves after a successful 'initialize' handshake.
      await client.connect(transport);
      logger.info(
        `Successfully connected and initialized with MCP server: ${serverName}`,
        operationContext,
      );

      // --- Step 8: Store Connection in Cache ---
      connectedClients.set(serverName, client);
      logger.debug(
        `Client for ${serverName} stored in connection cache.`,
        operationContext,
      );

      return client;
    },
    {
      // Fallback error details for the ErrorHandler.tryCatch wrapper
      operation: `connectMcpClient (server: ${serverName})`,
      context: operationContext, // Pass the detailed operation context
      errorCode: BaseErrorCode.INITIALIZATION_FAILED, // Specific error code for connection/init failures
      // errorMessage field removed as it's not a valid ErrorHandlerOption.
      // The message will be constructed by ErrorHandler.handleError based on the original error and operation.
    },
  );
}

/**
 * Disconnects a specific MCP client, closes its transport, and removes it from the cache.
 * This function is designed to be idempotent; calling it multiple times for an already
 * disconnected client will not cause errors.
 *
 * The disconnection process involves:
 * 1.  Retrieving the client from the `connectedClients` cache. If not found, it logs a warning
 *     (unless an error triggered the disconnect) and exits.
 * 2.  If an `error` parameter is provided (indicating an error-triggered disconnect),
 *     the client is immediately removed from the cache to prevent further use of a potentially
 *     unstable client.
 * 3.  The `client.close()` method is called. This method from the SDK attempts a graceful shutdown,
 *     which may include sending a 'shutdown' notification to the server (depending on protocol version
 *     and capabilities) and then closes the underlying transport.
 * 4.  Any errors occurring during the `client.close()` operation are caught and logged. The process
 *     continues to the `finally` block regardless of `close()` success or failure.
 * 5.  In the `finally` block, a check is performed to ensure the client is removed from the cache
 *     if it hasn't been already (e.g., if the disconnect was not error-triggered or if an error
 *     occurred during the `close()` operation itself).
 *
 * @param serverName - The name of the server whose client connection should be terminated.
 * @param parentContext - Optional. A parent `RequestContext` for logging and tracing continuity.
 * @param error - Optional. The error that triggered the disconnect, if any. This is used
 *                for logging the reason for disconnection and for guiding immediate cache removal.
 * @returns A promise that resolves when the disconnection attempt is complete.
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
    triggerReason: error
      ? `Error: ${error.message}` // More descriptive reason if an error is provided
      : "Explicit disconnect call or transport close event",
  });

  const client = connectedClients.get(serverName);

  if (!client) {
    // If no client is found in the cache, it might have been already disconnected or never connected.
    // Log a warning only if this wasn't triggered by an error (which might have already removed it,
    // and logging here would be redundant).
    if (!error) {
      logger.warning(
        `Client for server ${serverName} not found in cache or already disconnected. No disconnection action taken.`,
        context,
      );
    }
    // Defensive removal: In case of an inconsistent state where 'client' is undefined but the key still exists.
    if (connectedClients.has(serverName)) {
      connectedClients.delete(serverName);
      logger.warning(
        `Client for server ${serverName} was unexpectedly found and removed from cache despite initial check indicating it was not present. This suggests a potential state inconsistency.`,
        context,
      );
    }
    return; // No client to disconnect
  }

  // If an error triggered this disconnect, remove from cache immediately.
  // This prevents other parts of the application from attempting to use a client
  // that is known to be in an error state or whose transport is compromised.
  if (error) {
    connectedClients.delete(serverName);
    logger.debug(
      `Removed client ${serverName} from cache immediately due to error trigger: ${error.message}`,
      context,
    );
  }

  logger.info(`Disconnecting client for server: ${serverName}...`, context);
  try {
    // client.close() attempts a graceful shutdown.
    // It typically sends a 'shutdown' notification (if supported by the protocol version
    // and client/server capabilities) and then closes the transport.
    await client.close();
    logger.info(
      `Client for ${serverName} and its transport closed successfully.`,
      context,
    );
  } catch (closeError) {
    logger.error(`Error during client.close() for server ${serverName}`, {
      ...context, // Include the disconnectMcpClient context
      error:
        closeError instanceof Error ? closeError.message : String(closeError),
      stack: closeError instanceof Error ? closeError.stack : undefined,
    });
    // Even if client.close() fails, proceed to ensure it's removed from the cache in the finally block.
  } finally {
    // Ensure the client is removed from the cache if it wasn't already removed
    // (e.g., if disconnect was not error-triggered, or if an error occurred during client.close itself).
    if (connectedClients.has(serverName)) {
      connectedClients.delete(serverName);
      logger.debug(
        `Ensured client ${serverName} is removed from connection cache after close attempt.`,
        context,
      );
    }
  }
}

/**
 * Disconnects all currently active MCP client connections.
 * This function is typically used during application shutdown to ensure all
 * resources are released gracefully. It iterates over all cached connections
 * and calls `disconnectMcpClient` for each.
 *
 * @param parentContext - Optional. A parent `RequestContext` for logging, which will be passed down
 *                        to individual `disconnectMcpClient` calls to maintain tracing.
 * @returns A promise that resolves when all disconnection attempts have been processed.
 *          Note: This function uses `Promise.allSettled` to ensure all disconnections are attempted.
 *          It will log individual disconnection failures but will not reject if some disconnections fail,
 *          allowing the overall shutdown process to continue as smoothly as possible.
 */
export async function disconnectAllMcpClients(
  parentContext?: RequestContext | null,
): Promise<void> {
  const context = requestContextService.createRequestContext({
    ...(parentContext ?? {}),
    operation: "disconnectAllMcpClients",
  });
  logger.info("Disconnecting all active MCP clients...", context);

  // Create a copy of server names to iterate over, as `disconnectMcpClient` modifies the `connectedClients` map during iteration.
  const serverNames = Array.from(connectedClients.keys());

  if (serverNames.length === 0) {
    logger.info("No active MCP clients to disconnect.", context);
    return;
  }

  logger.debug(
    `Found ${serverNames.length} active clients to disconnect: ${serverNames.join(", ")}`,
    context,
  );

  const disconnectionPromises: Promise<void>[] = serverNames.map((serverName) =>
    disconnectMcpClient(serverName, context), // Pass down the aggregate operation's context for consistent logging
  );

  // Use Promise.allSettled to ensure all disconnection attempts are made,
  // even if some individual disconnections fail. This is important for graceful shutdown.
  const results = await Promise.allSettled(disconnectionPromises);

  logger.info(
    "All MCP client disconnection attempts completed. Reviewing results...",
    context,
  );
  results.forEach((result, index) => {
    const serverName = serverNames[index]; // Get the corresponding server name
    if (result.status === "rejected") {
      // Log failures for individual client disconnections
      logger.error(
        `Failed to cleanly disconnect client for server: ${serverName}`,
        {
          ...context, // Use the aggregate context from disconnectAllMcpClients
          targetServer: serverName, // Add specific server for this error log
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason), // Get the error message
          stack: // Include stack trace if available
            result.reason instanceof Error ? result.reason.stack : undefined,
        },
      );
    } else {
      // Optionally log success for each, or rely on logs from disconnectMcpClient
      logger.debug(
        `Successfully processed disconnection for server: ${serverName}.`,
        { ...context, targetServer: serverName },
      );
    }
  });
  logger.info("Finished processing all client disconnections.", context);
}
