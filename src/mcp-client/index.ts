/**
 * @fileoverview Barrel file for the MCP Client module (`src/mcp-client`).
 * This file re-exports the primary functions and types related to creating,
 * configuring, connecting, and managing MCP client instances based on the
 * MCP 2025-03-26 specification and the high-level TypeScript SDK.
 * @module src/mcp-client/index
 */

// Export core client connection management functions and the connected client type alias.
export {
  connectMcpClient,
  disconnectAllMcpClients,
  disconnectMcpClient,
  type ConnectedMcpClient,
} from "./core/clientManager.js";

// Export configuration loading functions and related types.
// These handle reading and validating server connection details from `mcp-config.json`.
export {
  getMcpServerConfig,
  loadMcpClientConfig, // Export the type for a single server's config
  type McpClientConfigFile,
  type McpServerConfigEntry,
} from "./client-config/configLoader.js";

// Export transport creation functions and the transport factory.
export * from "./transports/index.js";
