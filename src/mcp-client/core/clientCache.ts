/**
 * @fileoverview Manages the cache for active and pending MCP client connections.
 * This module provides a centralized way to store and retrieve connected MCP client
 * instances and promises for connections that are in the process of being established.
 * This helps prevent race conditions and redundant connection attempts.
 * @module src/mcp-client/core/clientCache
 */

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { logger, requestContextService } from "../../utils/index.js";

/**
 * Represents a successfully connected and initialized MCP Client instance.
 * Re-exported from clientManager for local use, will be the primary export from there.
 */
export type ConnectedMcpClient = Client;

/**
 * In-memory cache for active MCP client connections.
 * Keyed by server name.
 * @private
 */
const connectedClients: Map<string, ConnectedMcpClient> = new Map();

/**
 * In-memory map for pending MCP client connection promises.
 * Keyed by server name. This helps manage concurrent connection attempts.
 * @private
 */
const pendingConnections: Map<string, Promise<ConnectedMcpClient>> = new Map();

/**
 * Retrieves a cached connected client instance for the given server name.
 * @param serverName - The name of the server.
 * @returns The cached `ConnectedMcpClient` instance, or `undefined` if not found.
 */
export function getCachedClient(
  serverName: string,
): ConnectedMcpClient | undefined {
  return connectedClients.get(serverName);
}

/**
 * Stores a connected client instance in the cache.
 * @param serverName - The name of the server.
 * @param client - The `ConnectedMcpClient` instance to cache.
 */
export function setCachedClient(
  serverName: string,
  client: ConnectedMcpClient,
): void {
  const context = requestContextService.createRequestContext({
    operation: "setCachedClient",
    targetServer: serverName,
  });
  connectedClients.set(serverName, client);
  logger.debug(`Client for ${serverName} stored in connection cache.`, context);
}

/**
 * Removes a client instance from the cache.
 * @param serverName - The name of the server whose client should be removed.
 * @param reason - Optional reason for removal, for logging.
 */
export function removeClientFromCache(
  serverName: string,
  reason?: string,
): void {
  const context = requestContextService.createRequestContext({
    operation: "removeClientFromCache",
    targetServer: serverName,
    reason: reason ?? "N/A",
  });
  if (connectedClients.has(serverName)) {
    connectedClients.delete(serverName);
    logger.debug(
      `Client for ${serverName} removed from connection cache. Reason: ${reason || "explicit removal"}.`,
      context,
    );
  } else {
    logger.debug(
      `Attempted to remove client ${serverName} from cache, but it was not found. Reason: ${reason || "explicit removal"}.`,
      context,
    );
  }
}

/**
 * Retrieves a pending connection promise for the given server name.
 * @param serverName - The name of the server.
 * @returns The `Promise<ConnectedMcpClient>` for the pending connection, or `undefined` if not found.
 */
export function getPendingConnection(
  serverName: string,
): Promise<ConnectedMcpClient> | undefined {
  return pendingConnections.get(serverName);
}

/**
 * Stores a pending connection promise in the map.
 * @param serverName - The name of the server.
 * @param promise - The `Promise<ConnectedMcpClient>` representing the in-flight connection.
 */
export function setPendingConnection(
  serverName: string,
  promise: Promise<ConnectedMcpClient>,
): void {
  const context = requestContextService.createRequestContext({
    operation: "setPendingConnection",
    targetServer: serverName,
  });
  pendingConnections.set(serverName, promise);
  logger.debug(`Pending connection promise for ${serverName} stored.`, context);
}

/**
 * Retrieves the names of all currently cached (active) server connections.
 * @returns An array of server names (strings).
 */
export function getAllCachedServerNames(): string[] {
  return Array.from(connectedClients.keys());
}

/**
 * Removes a pending connection promise from the map.
 * This should be called once a connection attempt resolves or rejects.
 * @param serverName - The name of the server whose pending connection promise should be removed.
 */
export function removePendingConnection(serverName: string): void {
  const context = requestContextService.createRequestContext({
    operation: "removePendingConnection",
    targetServer: serverName,
  });
  if (pendingConnections.has(serverName)) {
    pendingConnections.delete(serverName);
    logger.debug(
      `Pending connection promise for ${serverName} removed.`,
      context,
    );
  }
}

/**
 * Clears all cached clients and pending connections.
 * Typically used during a full shutdown.
 */
export function clearAllClientCache(): void {
  const context = requestContextService.createRequestContext({
    operation: "clearAllClientCache",
  });
  const connectedCount = connectedClients.size;
  const pendingCount = pendingConnections.size;

  connectedClients.clear();
  pendingConnections.clear();

  logger.info(
    `Cleared all client caches. Removed ${connectedCount} connected clients and ${pendingCount} pending connections.`,
    context,
  );
}
