/**
 * @fileoverview Barrel file for the `echo_message` tool.
 * This file serves as the public interface for the echo tool module,
 * primarily exporting the `registerEchoTool` function. This function is
 * responsible for registering the echo tool with an MCP server instance,
 * making it available for invocation by clients.
 *
 * Consuming modules should import from this barrel file to access
 * the echo tool's registration capabilities.
 * @module src/mcp-server/tools/echoTool/index
 */

export { registerEchoTool } from "./registration.js";
