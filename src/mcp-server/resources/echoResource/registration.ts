/**
 * @fileoverview Handles the registration of the `echo` resource with an MCP server instance.
 * This module defines the resource's template (URI structure), metadata (name, description, examples),
 * and the asynchronous handler function that processes `resources/read` requests matching the template.
 * It utilizes the MCP SDK's `server.resource()` method for registration and integrates
 * robust error handling using the project's `ErrorHandler` utility.
 * @module mcp-server/resources/echoResource/registration
 */

import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
// Import specific types needed for resource operations
import type {
  ListResourcesResult,
  ReadResourceResult, // For the handler's return type
} from "@modelcontextprotocol/sdk/types.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
// Import utils from the main barrel file
import {
  ErrorHandler,
  logger,
  RequestContext,
  requestContextService,
} from "../../../utils/index.js";
// Import logic and type from the dedicated logic file
import {
  EchoResourceParams, // Type for validated query parameters
  processEchoResource,
} from "./echoResourceLogic.js";

/**
 * Registers the 'echo' resource and its handlers with the provided MCP server instance.
 * This function defines:
 * 1. The resource template (e.g., `echo://{message}`) which determines the URI structure.
 *    The `{message}` part is a path variable.
 * 2. A `list` operation for the template to provide example/discoverable URIs.
 * 3. Metadata for the resource, including its user-friendly name, description, MIME type,
 *    and example URIs.
 * 4. The core asynchronous handler logic for `resources/read` requests that match the template.
 *    This handler processes the request and returns the resource content.
 *
 * Error handling is integrated throughout using `ErrorHandler.tryCatch` for robustness.
 *
 * @function registerEchoResource
 * @param {McpServer} server - The MCP server instance to register the resource with.
 * @returns {Promise<void>} A promise that resolves when the resource registration is complete.
 *                          It does not return a value upon successful completion.
 * @throws {McpError} Throws an `McpError` if the registration process fails critically,
 *                    which might halt server startup.
 * @see {@link EchoResourceParams} for the type of parameters passed to the handler.
 * @see {@link processEchoResource} for the core resource logic.
 */
export const registerEchoResource = async (
  server: McpServer,
): Promise<void> => {
  const resourceName = "echo-resource"; // Internal identifier for this resource registration.

  // Create a request context for the registration operation.
  const registrationContext: RequestContext = requestContextService.createRequestContext({
    operation: "RegisterResource",
    resourceName: resourceName,
    moduleName: "EchoResourceRegistration",
  });

  logger.info(`Attempting to register resource: '${resourceName}'`, registrationContext);

  // Wrap the entire registration process for robust error management.
  await ErrorHandler.tryCatch(
    async () => {
      // Define the resource template. This specifies the URI structure and supported operations.
      // The URI `echo://{message}` uses RFC 6570 syntax, where `{message}` is a path variable.
      const template = new ResourceTemplate(
        "echo://{message}",
        {
          /**
           * Asynchronous handler for the `resources/list` operation associated with this template.
           * It provides a list of example or discoverable resource URIs that match this template.
           * This allows clients to discover how to interact with the echo resource.
           *
           * @returns {Promise<ListResourcesResult>} A promise resolving to an object containing
           *                                         an array of resource descriptors.
           */
          list: async (): Promise<ListResourcesResult> => {
            const listContext: RequestContext = requestContextService.createRequestContext({
              parentContext: registrationContext,
              operation: "ListEchoResourceExamples",
            });
            logger.debug("Executing list operation for echo resource template.", listContext);
            // Return a static list of example URIs.
            return {
              resources: [
                {
                  uri: "echo://hello",
                  name: "Default Echo Message",
                  description:
                    "A simple echo resource example using a default message.",
                },
                // Add more examples as needed
              ],
              // nextCursor could be used here if the list were paginated.
            };
          },
          // The `complete` operation (for URI completion suggestions) is optional and not implemented here.
        },
      );
      logger.debug(
        `Resource template created for '${resourceName}': ${template.uriTemplate}`,
        registrationContext,
      );

      // Register the resource with the server.
      // This involves providing the registration name, the template, metadata, and the handler for read operations.
      server.resource(
        resourceName, // Unique name for this specific resource registration.
        template,     // The ResourceTemplate instance defined above.
        // --- Resource Metadata ---
        // Provides descriptive information about the resource type defined by this template.
        {
          name: "Echo Message Resource", // User-friendly display name for this type of resource.
          description:
            "A simple echo resource that returns a message, optionally specified in the URI path.",
          mimeType: "application/json", // The default MIME type of the content returned by this resource.

          // The `querySchema` property could be used here to define a Zod schema shape
          // for validating query parameters if they were a primary part of this resource's interface.
          // Example: querySchema: EchoResourceQuerySchema.shape,
          // In this specific implementation, the main variable 'message' is expected from the path.

          // Example URIs that clients can use to understand how to interact with this resource.
          examples: [
            {
              name: "Basic echo",
              uri: "echo://hello", // Example of a complete URI.
              description: "Accesses the echo resource to echo the message 'hello'.",
            },
            {
              name: "Custom echo",
              uri: "echo://custom-message-here",
              description: "Accesses the echo resource to echo 'custom-message-here'.",
            },
          ],
          // capabilities: { subscribe: false, listChanged: false } // Default capabilities.
        },

        /**
         * Asynchronous handler for `resources/read` requests matching the `echo://{message}` template.
         * This function is invoked by the MCP SDK when a client requests to read a resource
         * whose URI matches the registered template.
         *
         * The SDK extracts path variables (like `{message}` from `echo://{message}`) from the URI.
         * These path variables, along with any validated query parameters (if a `querySchema` were
         * provided in metadata and query parameters were present in the request), are typically
         * passed in the `params` object.
         *
         * @param {URL} uri - The full {@link URL} object of the resource being requested.
         * @param {EchoResourceParams} params - An object containing parameters derived from the request.
         *                                      For this resource, it's expected to include `message`
         *                                      extracted from the URI path by the SDK. It conforms to
         *                                      {@link EchoResourceParams} which primarily defines optional query params.
         * @returns {Promise<ReadResourceResult>} A promise that resolves with the resource content,
         *                                        formatted as a `ReadResourceResult`. This includes the URI,
         *                                        Base64 encoded content blob, and MIME type.
         *                                        If an error is thrown from this handler, the SDK is responsible
         *                                        for catching it and formatting an error response.
         */
        async (uri: URL, params: EchoResourceParams): Promise<ReadResourceResult> => {
          // Create a new request context for this specific resource read operation.
          const handlerContext: RequestContext = requestContextService.createRequestContext({
            parentContext: registrationContext,
            operation: "HandleResourceRead",
            resourceName: resourceName,
            resourceUri: uri.href,
            // Summarize input params for logging to avoid logging potentially large or sensitive full params.
            inputParamsSummary: params.message ? { messageLength: params.message.length } : { noMessageParam: true },
          });

          logger.debug(`Handling read request for resource '${resourceName}', URI: ${uri.href}`, handlerContext);

          // Wrap the core resource processing logic in ErrorHandler.tryCatch.
          // If an error occurs, it will be logged and rethrown (by default) for the SDK to handle.
          return await ErrorHandler.tryCatch(
            async () => {
              // Delegate to the core processing function to get the response data.
              // `params` is expected to contain the `message` from the path variable.
              const responseData = processEchoResource(
                uri,
                params,
                handlerContext,
              );

              logger.debug(
                `'${resourceName}' (URI: ${uri.href}) processed successfully. Preparing content.`,
                handlerContext,
              );

              // Construct the `ReadResourceResult` as expected by the MCP SDK.
              // The content (blob) must be Base64 encoded.
              return {
                contents: [
                  {
                    uri: uri.href, // Echo back the requested URI as per spec.
                    blob: Buffer.from(JSON.stringify(responseData)).toString("base64"),
                    mimeType: "application/json", // Specify the content type.
                  },
                ],
              };
            },
            {
              // Configuration for the error handler specific to this resource read request.
              operation: `ExecutingCoreLogicFor_${resourceName}_Read`,
              context: handlerContext,
              input: { uri: uri.href, params }, // Log full input on error for debugging.
              // Custom error mapping. This mapped error will be rethrown by ErrorHandler.tryCatch.
              errorMapper: (error: unknown): McpError => {
                const baseErrorCode = error instanceof McpError ? error.code : BaseErrorCode.INTERNAL_ERROR;
                const errorMessage = `Error processing read request for resource '${uri.href}': ${error instanceof Error ? error.message : "An unknown error occurred"}`;
                return new McpError(
                  baseErrorCode,
                  errorMessage,
                  { ...handlerContext, originalErrorName: error instanceof Error ? error.name : typeof error },
                );
              },
            },
          ); // End of ErrorHandler.tryCatch for handler logic
        }, // End of server.resource handler function
      ); // End of server.resource call

      logger.info(
        `Resource '${resourceName}' (template: '${template.uriTemplate}') registered successfully.`,
        registrationContext,
      );
    },
    {
      // Configuration for the error handler wrapping the entire registration attempt.
      operation: `RegisteringResource_${resourceName}`,
      context: registrationContext,
      errorCode: BaseErrorCode.INITIALIZATION_FAILED, // Specific code for registration failure.
      errorMapper: (error: unknown): McpError => {
        const errorMessage = `Failed to register resource '${resourceName}': ${error instanceof Error ? error.message : "An unknown error occurred during registration."}`;
        const code = error instanceof McpError ? error.code : BaseErrorCode.INITIALIZATION_FAILED;
        return new McpError(
          code,
          errorMessage,
          { ...registrationContext, originalErrorName: error instanceof Error ? error.name : typeof error },
        );
      },
      critical: true, // Mark registration failure as critical.
      // rethrow is implicitly true for ErrorHandler.tryCatch, so it's not needed here.
    },
  ); // End of ErrorHandler.tryCatch for the entire registration process
};
