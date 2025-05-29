/**
 * @fileoverview Registration for the fetch_image_test MCP tool.
 * @module src/mcp-server/tools/imageTest/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  ErrorHandler,
  logger, // Added logger import
  requestContextService,
  RequestContext, // Added RequestContext import
} from "../../../utils/index.js";
import {
  FetchImageTestInput,
  FetchImageTestInputSchema,
  fetchImageTestLogic,
} from "./logic.js";

/**
 * Registers the fetch_image_test tool with the MCP server.
 * @param server - The McpServer instance.
 */
export function registerFetchImageTestTool(server: McpServer): void {
  const operation = "registerFetchImageTestTool";
  const context = requestContextService.createRequestContext({ operation });

  try {
    server.tool(
      "fetch_image_test",
      "Fetches a random cat image from an external API (cataas.com) and returns it as a blob. Useful for testing image handling capabilities.",
      FetchImageTestInputSchema.shape, // CRITICAL: Pass the .shape
      async (validatedInput: FetchImageTestInput, mcpProvidedContext: any) => {
        const handlerRequestContext =
          requestContextService.createRequestContext({
            parentRequestId: context.requestId, // Optional: link to registration context
            operation: "fetchImageTestToolHandler",
            mcpToolContext: mcpProvidedContext, // Context from MCP SDK during call
          });
        return fetchImageTestLogic(validatedInput, handlerRequestContext);
      },
    );
    logger.notice(`Tool 'fetch_image_test' registered.`, context);
  } catch (error) {
    ErrorHandler.handleError(
      new McpError(
        BaseErrorCode.INITIALIZATION_FAILED,
        `Failed to register 'fetch_image_test'`,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      ),
      {
        operation,
        context,
        errorCode: BaseErrorCode.INITIALIZATION_FAILED,
        critical: true,
      },
    );
  }
}
