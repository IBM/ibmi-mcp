/**
 * @fileoverview Orchestrates MCP (Model Context Protocol) client connections.
 * This module serves as the primary public interface for connecting to, disconnecting from,
 * and managing MCP server connections. It utilizes helper modules for caching
 * (`clientCache.ts`) and detailed connection establishment logic (`clientConnectionLogic.ts`).
 *
 * Key responsibilities include:
 * - Providing `connectMcpClient` to establish or retrieve cached/pending connections.
 * - Providing `disconnectMcpClient` to terminate a specific server connection with timeout.
 * - Providing `disconnectAllMcpClients` for graceful shutdown of all connections.
 *
 * MCP Specification References:
 * - Client Lifecycle & Initialization: Aligns with general MCP lifecycle principles.
 * @module src/mcp-client/core/clientManager
 */

import { BaseErrorCode, McpError } from "../../types-global/errors.js";
import {
  ErrorHandler,
  logger,
  RequestContext,
  requestContextService,
} from "../../utils/index.js";
import {
  getCachedClient,
  getPendingConnection,
  removeClientFromCache,
  removePendingConnection,
  setCachedClient,
  setPendingConnection,
  clearAllClientCache,
  getAllCachedServerNames, // Import the new function
  type ConnectedMcpClient as CachedConnectedMcpClient,
} from "./clientCache.js";
import { establishNewMcpConnection } from "./clientConnectionLogic.js";

/**
 * Represents a successfully connected and initialized MCP Client instance.
 * This type alias is re-exported for external use.
 */
export type ConnectedMcpClient = CachedConnectedMcpClient;

const SHUTDOWN_TIMEOUT_MS = 5000; // 5 seconds for client.close() timeout

/**
 * Creates, connects, or returns an existing/pending MCP client instance for a specified server.
 *
 * This function orchestrates the client connection lifecycle:
 * 1.  **Cache Check**: Uses `clientCache.getCachedClient` to check for an active connection.
 * 2.  **Pending Connection Check**: Uses `clientCache.getPendingConnection` to check for an in-flight connection attempt.
 * 3.  **New Connection**: If no cached or pending connection exists:
 *     a.  A new connection promise is initiated by calling `establishNewMcpConnection`.
 *     b.  This promise is stored using `clientCache.setPendingConnection`.
 *     c.  Upon successful connection, the client is cached using `clientCache.setCachedClient`.
 *     d.  The pending promise is removed using `clientCache.removePendingConnection`.
 * 4.  **Error Handling**: The entire process is wrapped in `ErrorHandler.tryCatch` for robust error management.
 *
 * @param serverName - The unique name of the MCP server to connect to.
 * @param parentContext - Optional parent `RequestContext` for logging and tracing.
 * @returns A promise that resolves to the connected and initialized `ConnectedMcpClient` instance.
 * @throws {McpError} If connection or initialization fails, or if configuration is invalid.
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

  const cachedClient = getCachedClient(serverName);
  if (cachedClient) {
    logger.debug(
      `Returning existing connected client for server: ${serverName}`,
      operationContext,
    );
    return cachedClient;
  }

  const pendingPromise = getPendingConnection(serverName);
  if (pendingPromise) {
    logger.debug(
      `Returning pending connection promise for server: ${serverName}`,
      operationContext,
    );
    return pendingPromise;
  }

  logger.info(
    `No active or pending connection for ${serverName}. Initiating new connection.`,
    operationContext,
  );

  const connectionPromise = ErrorHandler.tryCatch(
    async () => {
      // Pass the local disconnectMcpClient function to break the circular dependency
      const client = await establishNewMcpConnection(
        serverName,
        operationContext,
        disconnectMcpClient, // Pass the function itself
      );
      setCachedClient(serverName, client);
      return client;
    },
    {
      operation: `connectMcpClient (server: ${serverName})`,
      context: operationContext,
      errorCode: BaseErrorCode.INITIALIZATION_FAILED,
    },
  ).finally(() => {
    removePendingConnection(serverName);
  });

  setPendingConnection(serverName, connectionPromise);
  return connectionPromise;
}

/**
 * Disconnects a specific MCP client, closes its transport with a timeout, and removes it from the cache.
 * Idempotent: multiple calls for an already disconnected client will not cause errors.
 *
 * @param serverName - The name of the server whose client connection should be terminated.
 * @param parentContext - Optional parent `RequestContext` for logging.
 * @param error - Optional error that triggered the disconnect, for logging.
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
      ? `Error: ${error.message}`
      : "Explicit disconnect call or transport close event",
  });

  const client = getCachedClient(serverName);

  if (!client) {
    if (!error) {
      logger.warning(
        `Client for server ${serverName} not found in cache or already disconnected. No action taken.`,
        context,
      );
    }
    removeClientFromCache(serverName, "Not found during disconnect");
    return;
  }

  logger.info(`Disconnecting client for server: ${serverName}...`, context);
  try {
    const closePromise = client.close();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout: client.close() for ${serverName} exceeded ${SHUTDOWN_TIMEOUT_MS}ms`)),
        SHUTDOWN_TIMEOUT_MS,
      ),
    );

    await Promise.race([closePromise, timeoutPromise]);
    logger.info(
      `Client for ${serverName} and its transport closed successfully.`,
      context,
    );
  } catch (closeError) {
    logger.error(`Error during client.close() for server ${serverName} (or timeout)`, {
      ...context,
      error:
        closeError instanceof Error ? closeError.message : String(closeError),
      stack: closeError instanceof Error ? closeError.stack : undefined,
    });
  } finally {
    removeClientFromCache(serverName, "After close attempt");
  }
}

/**
 * Disconnects all currently active MCP client connections.
 * Typically used during application shutdown.
 *
 * @param parentContext - Optional parent `RequestContext` for logging.
 * @returns A promise that resolves when all disconnection attempts are processed.
 */
export async function disconnectAllMcpClients(
  parentContext?: RequestContext | null,
): Promise<void> {
  const context = requestContextService.createRequestContext({
    ...(parentContext ?? {}),
    operation: "disconnectAllMcpClients",
  });
  logger.info("Disconnecting all active MCP clients...", context);

  const serverNamesToDisconnect = getAllCachedServerNames();

  if (serverNamesToDisconnect.length === 0) {
    logger.info("No active MCP clients to disconnect.", context);
    // Still call clearAllClientCache in case pending connections exist or for consistency
    clearAllClientCache();
    logger.info("Finished processing all client disconnections (no active clients found, cache cleared).", context);
    return;
  }

  logger.debug(
    `Found ${serverNamesToDisconnect.length} active clients to disconnect: ${serverNamesToDisconnect.join(", ")}`,
    context,
  );

  const disconnectionPromises: Promise<void>[] = serverNamesToDisconnect.map(
    (serverName) => disconnectMcpClient(serverName, context),
  );

  const results = await Promise.allSettled(disconnectionPromises);

  logger.info(
    "All MCP client disconnection attempts completed. Reviewing results...",
    context,
  );
  results.forEach((result, index) => {
    const serverName = serverNamesToDisconnect[index];
    if (result.status === "rejected") {
      logger.error(
        `Failed to cleanly disconnect client for server: ${serverName}`,
        {
          ...context,
          targetServer: serverName,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
          stack:
            result.reason instanceof Error ? result.reason.stack : undefined,
        },
      );
    } else {
      logger.debug(
        `Successfully processed disconnection for server: ${serverName}.`,
        { ...context, targetServer: serverName },
      );
    }
  });

  // Ensure all caches are cleared regardless of individual disconnections.
  clearAllClientCache();
  logger.info("Finished processing all client disconnections and cleared caches.", context);
}
