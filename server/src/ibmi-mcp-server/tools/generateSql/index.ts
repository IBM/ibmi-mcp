/**
 * @fileoverview Barrel file for the `generate_sql` tool.
 * This file serves as the public interface for the generate SQL tool module,
 * primarily exporting the `registerGenerateSqlTool` function. This function is
 * responsible for registering the generate SQL tool with an MCP server instance,
 * making it available for invocation by clients.
 *
 * Consuming modules should import from this barrel file to access
 * the generate SQL tool's registration capabilities.
 * @module src/mcp-server/tools/generateSql/index
 */

export { registerGenerateSqlTool } from "./registration.js";
