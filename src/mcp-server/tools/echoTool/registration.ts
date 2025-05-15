/**
 * @fileoverview Handles the registration of the `echo_message` tool with an MCP server instance.
 * This module defines the tool's metadata (name, description), its input schema shape,
 * and the asynchronous handler function that processes tool invocation requests.
 * It leverages the MCP SDK's `server.tool()` method for registration and integrates
 * robust error handling using the project's `ErrorHandler` utility.
 * @module mcp-server/tools/echoTool/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"; // Import for handler return type
// Import schema and types from the logic file
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
// Import utils from the main barrel file (ErrorHandler, logger, requestContextService from ../../../utils/internal/*)
import {
  ErrorHandler,
  logger,
  RequestContext,
  requestContextService,
} from "../../../utils/index.js";
import type { EchoToolInput } from "./echoToolLogic.js"; // Use type import
import { EchoToolInputSchema } from "./echoToolLogic.js"; // Schema needed for shape extraction
// Import the core logic function
import { processEchoMessage } from "./echoToolLogic.js";

/**
 * Registers the 'echo_message' tool and its handler with the provided MCP server instance.
 * This function defines the tool's name, description, input schema shape (derived from Zod),
 * and the core asynchronous handler logic that is executed when the tool is called by a client.
 *
 * The registration process itself, as well as the tool's handler execution, are wrapped
 * with `ErrorHandler.tryCatch` to ensure consistent error logging and reporting.
 *
 * @function registerEchoTool
 * @param {McpServer} server - The MCP server instance to register the tool with.
 *                             This instance is provided by the main server setup.
 * @returns {Promise<void>} A promise that resolves when the tool registration is complete.
 *                          It does not return a value upon successful completion.
 * @throws {McpError} Throws an `McpError` if the registration process fails critically.
 *                    This typically indicates a problem that prevents the tool from being
 *                    correctly set up (e.g., issues with the SDK, schema problems).
 *                    Such errors are marked as critical and may halt server startup.
 * @see {@link EchoToolInputSchema} for the input schema.
 * @see {@link processEchoMessage} for the core tool logic.
 * @see {@link ErrorHandler.tryCatch} for error handling patterns.
 */
export const registerEchoTool = async (server: McpServer): Promise<void> => {
  const toolName = "echo_message"; // The unique identifier for the tool as per MCP spec.
  const toolDescription =
    "Echoes a message back with optional formatting and repetition."; // Human-readable description for the tool.

  // Create a request context specifically for this registration operation.
  // This helps in correlating logs related to the setup of this particular tool.
  const registrationContext: RequestContext =
    requestContextService.createRequestContext({
      operation: "RegisterTool", // Standardized operation name for tool registration
      toolName: toolName,
      moduleName: "EchoToolRegistration", // Identifies the module performing registration
    });

  logger.info(
    `Attempting to register tool: '${toolName}'`,
    registrationContext,
  );

  // Wrap the entire registration process in ErrorHandler.tryCatch for robust error management.
  // Any errors during server.tool() or within its setup will be caught and handled.
  await ErrorHandler.tryCatch(
    async () => {
      // Register the tool using the 4-argument server.tool() overload (SDK v1.10.2+).
      // This method simplifies tool registration by handling schema conversion and validation internally.
      server.tool(
        toolName, // Argument 1: The unique name of the tool.
        toolDescription, // Argument 2: A human-readable description of what the tool does.
        EchoToolInputSchema.shape, // Argument 3: The Zod schema shape for input validation.
        // The SDK uses this to generate a JSON schema and validate incoming parameters.
        /**
         * Asynchronous handler function for the 'echo_message' tool.
         * This function is executed when the MCP server receives a `tools/call` request for this tool.
         * The `params` argument is automatically validated by the MCP SDK against `EchoToolInputSchema.shape`
         * before this handler is invoked.
         *
         * On successful execution, this handler returns a `Promise<CallToolResult>` with `isError: false`.
         * If an error occurs within the handler (e.g., during `processEchoMessage` or subsequent logic),
         * and that error is rethrown by the inner `ErrorHandler.tryCatch` (which is the default behavior),
         * the MCP SDK's `server.tool()` wrapper is responsible for catching this thrown error. The SDK
         * will then automatically format it into a `CallToolResult` with `isError: true` and appropriate
         * error content to be sent back to the client.
         *
         * @param {EchoToolInput} params - The validated input parameters for the tool, conforming to {@link EchoToolInput}.
         * @returns {Promise<CallToolResult>} A promise that resolves with the tool's result, formatted as a `CallToolResult`.
         *                                    For successful calls, `isError` will be `false`. If an error is thrown
         *                                    from this handler, the SDK formats it into an error `CallToolResult`.
         */
        async (params: EchoToolInput): Promise<CallToolResult> => {
          // Argument 4: The asynchronous handler function.

          // Create a new request context for this specific tool invocation,
          // linking it to the parent registration context if desired for tracing.
          const handlerContext: RequestContext =
            requestContextService.createRequestContext({
              parentContext: registrationContext, // Optional: link to registration for broader tracing
              operation: "HandleToolRequest",
              toolName: toolName,
              // Sanitize or summarize params if logging them directly:
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
              // Delegate the core processing logic to `processEchoMessage`, passing validated params and context.
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
                  // An array of content items. For simple text/JSON, usually one item.
                  {
                    type: "text", // The type of content. "text" is common for stringified JSON.
                    // The actual content is a JSON string representing the EchoToolResponse.
                    // Pretty-print JSON (null, 2) for better readability if inspected.
                    text: JSON.stringify(responsePayload, null, 2),
                  },
                ],
                isError: false, // Explicitly set isError to false for successful execution.
              };
            },
            {
              // Configuration for the error handler specific to this tool call's logic.
              operation: `ExecutingCoreLogicFor_${toolName}`,
              context: handlerContext, // Pass the handler-specific context for detailed logging.
              input: params, // Log the input parameters if an error occurs during processing.
              // Custom error mapping to ensure errors from tool logic are McpError instances.
              // This mapped error will be rethrown by ErrorHandler.tryCatch by default.
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
          ); // End of ErrorHandler.tryCatch for handler logic
        }, // End of server.tool handler function
      ); // End of server.tool call

      logger.info(
        `Tool '${toolName}' registered successfully with the MCP server.`,
        registrationContext,
      );
    },
    {
      // Configuration for the error handler wrapping the entire registration attempt.
      operation: `RegisteringTool_${toolName}`,
      context: registrationContext, // Context for registration-level errors.
      errorCode: BaseErrorCode.INITIALIZATION_FAILED, // More specific code for registration failure.
      // Custom error mapping for registration failures.
      errorMapper: (error: unknown): McpError => {
        const errorMessage = `Failed to register tool '${toolName}': ${error instanceof Error ? error.message : "An unknown error occurred during registration."}`;
        // Ensure the error code reflects a registration/initialization problem.
        const code =
          error instanceof McpError
            ? error.code
            : BaseErrorCode.INITIALIZATION_FAILED;
        return new McpError(code, errorMessage, {
          ...registrationContext,
          originalErrorName: error instanceof Error ? error.name : typeof error,
        });
      },
      critical: true, // Mark registration failure as critical, potentially halting server startup.
      // rethrow is implicitly true for ErrorHandler.tryCatch, so it's not needed here.
    },
  ); // End of ErrorHandler.tryCatch for the entire registration process
};
