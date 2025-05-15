/**
 * @fileoverview Handles the setup and connection for the Stdio MCP transport.
 * Implements the MCP Specification 2025-03-26 for stdio transport.
 * This transport communicates directly over standard input (stdin) and
 * standard output (stdout), typically used when the MCP server is launched
 * as a child process by a host application.
 *
 * Specification Reference:
 * https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/basic/transports.mdx#stdio
 *
 * --- Authentication Note ---
 * As per the MCP Authorization Specification (2025-03-26, Section 1.2),
 * STDIO transports SHOULD NOT implement HTTP-based authentication flows.
 * Authorization is typically handled implicitly by the host application
 * controlling the server process. This implementation follows that guideline.
 *
 * @see {@link https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/basic/authorization.mdx | MCP Authorization Specification}
 * @module mcp-server/transports/stdioTransport
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// Import core utilities: ErrorHandler for centralized error management, logger for logging, and RequestContext for typing.
import { ErrorHandler, logger, RequestContext } from "../../utils/index.js";

/**
 * Connects a given `McpServer` instance (from `@modelcontextprotocol/sdk`) to the Stdio transport.
 * This function is asynchronous. It initializes the SDK's `StdioServerTransport`,
 * which manages communication over `process.stdin` and `process.stdout`
 * according to the MCP stdio transport specification.
 *
 * MCP Spec Points Covered by SDK's `StdioServerTransport`:
 * - Reads JSON-RPC messages (requests, notifications, responses, batches) from stdin.
 * - Writes JSON-RPC messages to stdout.
 * - Handles newline delimiters and ensures no embedded newlines in output messages.
 * - Ensures only valid MCP messages are written to stdout.
 *
 * Note: Logging via the `logger` utility MAY result in output to stderr, which is
 * permitted by the spec for logging purposes.
 *
 * @param {McpServer} server - The `McpServer` instance containing the core server logic (tools, resources, etc.).
 * @param {RequestContext} parentContext - The logging and tracing context from the calling function (e.g., server startup).
 * @returns {Promise<void>} A promise that resolves when the Stdio transport is successfully connected and listening.
 * @throws {Error} Throws an error if the connection fails during setup (e.g., issues connecting the server to the transport).
 * @public
 */
export async function connectStdioTransport(
  server: McpServer,
  parentContext: RequestContext,
): Promise<void> {
  const operationContext = {
    ...parentContext,
    operation: "connectStdioTransport",
    transportType: "Stdio",
  };
  logger.debug("Attempting to connect stdio transport...", operationContext);

  try {
    logger.debug("Creating StdioServerTransport instance...", operationContext);
    const transport = new StdioServerTransport();

    logger.debug(
      "Connecting McpServer instance to StdioServerTransport...",
      operationContext,
    );
    await server.connect(transport);

    logger.info(
      "MCP Server connected and listening via stdio transport.",
      operationContext,
    );
    if (process.stdout.isTTY) {
      console.log(
        `\n🚀 MCP Server running in STDIO mode.\n   (MCP Spec: 2025-03-26 Stdio Transport)\n`,
      );
    }
  } catch (err) {
    ErrorHandler.handleError(err, { ...operationContext, critical: true });
    throw err;
  }
}
