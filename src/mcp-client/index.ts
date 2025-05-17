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
  type ConnectedMcpClient, // Export the type alias for a connected client instance
} from "./client.js";

// Export configuration loading functions and related types.
// These handle reading and validating server connection details from `mcp-config.json`.
export {
  getMcpServerConfig,
  loadMcpClientConfig,
  type McpServerConfigEntry, // Export the type for a single server's config
  type McpClientConfigFile, // Export the type for the entire config file structure
} from "./configLoader.js";

// Export transport creation functions.
// `getClientTransport` acts as a factory based on the server's configured `transportType`.
export { createStdioClientTransport, getClientTransport } from "./transport.js";
