/**
 * @fileoverview Barrel file for MCP client transport modules.
 * This file re-exports the transport creation functions and the transport factory.
 * @module src/mcp-client/transports/index
 */

export {
  createStdioClientTransport,
  type StdioTransportConfig,
} from "./stdioClientTransport.js";
export {
  createHttpClientTransport,
  type HttpTransportConfig,
} from "./httpClientTransport.js";
export { getClientTransport } from "./transportFactory.js";
