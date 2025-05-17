/**
 * @fileoverview Handles the registration of the `echo_message` tool with an MCP server instance.
 * This module defines the tool's metadata (name, description), its input schema shape,
 * and the asynchronous handler function that processes tool invocation requests.
 * It leverages the MCP SDK's `server.tool()` method for registration and integrates
 * robust error handling using the project's `ErrorHandler` utility.
 * @module mcp-server/tools/echoTool/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  ErrorHandler,
  logger,
  RequestContext,
  requestContextService,
} from "../../../utils/index.js";
import type { EchoToolInput } from "./echoToolLogic.js";
import { EchoToolInputSchema, processEchoMessage } from "./echoToolLogic.js";

/**
 * Registers the 'echo_message' tool and its handler with the provided MCP server instance.
 *
 * This function defines the tool's name, description, input schema shape (derived from Zod),
 * and the core asynchronous handler logic that is executed when the tool is called by a client.
 *
 * The registration process itself, as well as the tool's handler execution, are wrapped
 * with `ErrorHandler.tryCatch` to ensure consistent error logging and reporting.
 *
 * @param server - The MCP server instance to register the tool with.
 * @returns A promise that resolves when the tool registration is complete.
 * @throws {McpError} If the registration process fails critically.
 *   This typically indicates a problem that prevents the tool from being
 *   correctly set up (e.g., issues with the SDK, schema problems).
 *   Such errors are marked as critical and may halt server startup.
 * @see {@link EchoToolInputSchema} for the input schema.
 * @see {@link processEchoMessage} for the core tool logic.
 */
export const registerEchoTool = async (server: McpServer): Promise<void> => {
  const toolName = "echo_message";
  const toolDescription =
    "Echoes a message back with optional formatting and repetition.";

  const registrationContext: RequestContext =
    requestContextService.createRequestContext({
      operation: "RegisterTool",
      toolName: toolName,
      moduleName: "EchoToolRegistration",
    });

  logger.info(
    `Attempting to register tool: '${toolName}'`,
    registrationContext,
  );

  await ErrorHandler.tryCatch(
    async () => {
      // Register the tool using the 4-argument server.tool() overload (SDK v1.10.2+).
      // This method simplifies tool registration by handling schema conversion and validation internally.
      server.tool(
        toolName,
        toolDescription,
        EchoToolInputSchema.shape, // The SDK uses this to generate a JSON schema and validate incoming parameters.
        /**
         * Asynchronous handler function for the 'echo_message' tool.
         * This function is executed when the MCP server receives a `tools/call` request for this tool.
         * The `params` argument is automatically validated by the MCP SDK against `EchoToolInputSchema.shape`
         * before this handler is invoked.
         *
         * On successful execution, this handler returns a `Promise<CallToolResult>` with `isError: false`.
         * If an error occurs within the handler and is rethrown by the inner `ErrorHandler.tryCatch`
         * (which is the default behavior), the MCP SDK's `server.tool()` wrapper is responsible for
         * catching this thrown error. The SDK will then automatically format it into a `CallToolResult`
         * with `isError: true` and appropriate error content to be sent back to the client.
         *
         * @param params - The validated input parameters for the tool.
         * @returns A promise that resolves with the tool's result.
         *   For successful calls, `isError` will be `false`. If an error is thrown
         *   from this handler, the SDK formats it into an error `CallToolResult`.
         */
        async (params: EchoToolInput): Promise<CallToolResult> => {
          const handlerContext: RequestContext =
            requestContextService.createRequestContext({
              parentContext: registrationContext,
              operation: "HandleToolRequest",
              toolName: toolName,
              inputSummary: {
                messageLength: params.message.length,
                mode: params.mode,
                repeat: params.repeat,
              },
            });

          logger.debug(`Handling '${toolName}' tool request.`, handlerContext);

          // Wrap the core tool logic execution in ErrorHandler.tryCatch.
          // If an error occurs, ErrorHandler.tryCatch will log it and, by default, rethrow it.
          // This rethrown error will then be caught by the MCP SDK's server.tool() wrapper.
          return await ErrorHandler.tryCatch(
            async () => {
              const responsePayload = processEchoMessage(
                params,
                handlerContext,
              );

              logger.debug(
                `'${toolName}' tool processed successfully. Preparing result.`,
                handlerContext,
              );

              // Return the response in the standard MCP `CallToolResult` format for successful execution.
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(responsePayload, null, 2),
                  },
                ],
                isError: false,
              };
            },
            {
              operation: `ExecutingCoreLogicFor_${toolName}`,
              context: handlerContext,
              input: params,
              errorMapper: (error: unknown): McpError => {
                const baseErrorCode =
                  error instanceof McpError
                    ? error.code
                    : BaseErrorCode.INTERNAL_ERROR;
                const errorMessage = `Error processing '${toolName}' tool: ${error instanceof Error ? error.message : "An unknown error occurred"}`;
                return new McpError(baseErrorCode, errorMessage, {
                  ...handlerContext,
                  originalErrorName:
                    error instanceof Error ? error.name : typeof error,
                });
              },
            },
          );
        },
      );

      logger.info(
        `Tool '${toolName}' registered successfully with the MCP server.`,
        registrationContext,
      );
    },
    {
      operation: `RegisteringTool_${toolName}`,
      context: registrationContext,
      errorCode: BaseErrorCode.INITIALIZATION_FAILED,
      errorMapper: (error: unknown): McpError => {
        const errorMessage = `Failed to register tool '${toolName}': ${error instanceof Error ? error.message : "An unknown error occurred during registration."}`;
        const code =
          error instanceof McpError
            ? error.code
            : BaseErrorCode.INITIALIZATION_FAILED;
        return new McpError(code, errorMessage, {
          ...registrationContext,
          originalErrorName: error instanceof Error ? error.name : typeof error,
        });
      },
      critical: true,
    },
  );
};
