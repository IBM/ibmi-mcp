/**
 * @fileoverview Registration for the fetch_image_test MCP tool.
 * @module src/mcp-server/tools/imageTest/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode } from "../../../types-global/errors.js";
import {
  ErrorHandler,
  logger,
  requestContextService,
  // RequestContext, // No longer needed directly in this function signature
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
  const registrationContext = requestContextService.createRequestContext({
    operation,
  });

  ErrorHandler.tryCatch(
    () => {
      server.tool(
        "fetch_image_test",
        "Fetches a random cat image from an external API (cataas.com) and returns it as a blob. Useful for testing image handling capabilities.",
        FetchImageTestInputSchema.shape, // CRITICAL: Pass the .shape
        async (
          validatedInput: FetchImageTestInput,
          mcpProvidedContext: any,
        ) => {
          // Create a new context for each tool invocation.
          // Link to an initial request ID if available from mcpProvidedContext or use registration context's ID as a fallback.
          const parentRequestId =
            mcpProvidedContext?.requestId || registrationContext.requestId;

          const handlerRequestContext =
            requestContextService.createRequestContext({
              parentRequestId,
              operation: "fetchImageTestToolHandler",
              toolName: "fetch_image_test",
              // Include any other relevant details from mcpProvidedContext if needed
              // For example, if mcpProvidedContext itself is a RequestContext or has useful fields:
              // ...(typeof mcpProvidedContext === 'object' && mcpProvidedContext !== null ? mcpProvidedContext : {}),
            });
          return fetchImageTestLogic(validatedInput, handlerRequestContext);
        },
      );
      logger.notice(`Tool 'fetch_image_test' registered.`, registrationContext);
    },
    {
      operation, // Operation name for error handling
      context: registrationContext, // Context for error handling
      errorCode: BaseErrorCode.INITIALIZATION_FAILED, // Default error code if registration fails
      critical: true, // Registration failures are typically critical
      // Note: `rethrow` is not an option for `ErrorHandler.tryCatch`.
      // `tryCatch` internally calls `ErrorHandler.handleError` with `rethrow: true`.
      // If non-rethrowing behavior is essential for a specific registration,
      // a manual try/catch block calling `ErrorHandler.handleError` with `rethrow: false` would be needed.
      // For consistency with the typical use of `tryCatch`, this assumes rethrowing is acceptable.
    },
  );
}
