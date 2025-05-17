/**
 * @fileoverview Handles the registration of the `echo` resource with an MCP server instance.
 * This module defines the resource's template (URI structure), metadata (name, description, examples),
 * and the asynchronous handler function that processes `resources/read` requests matching the template.
 * It utilizes the MCP SDK's `server.resource()` method for registration and integrates
 * robust error handling using the project's `ErrorHandler` utility.
 * @module src/mcp-server/resources/echoResource/registration
 */

import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  ListResourcesResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  ErrorHandler,
  logger,
  RequestContext,
  requestContextService,
} from "../../../utils/index.js";
import {
  EchoResourceParams,
  processEchoResource,
} from "./echoResourceLogic.js";

/**
 * Registers the 'echo' resource and its handlers with the provided MCP server instance.
 *
 * This function defines:
 * 1.  The resource template (e.g., `echo://{message}`), which determines the URI structure.
 *     The `{message}` part is a path variable.
 * 2.  A `list` operation for the template to provide example/discoverable URIs.
 * 3.  Metadata for the resource, including its user-friendly name, description, MIME type,
 *     and example URIs.
 * 4.  The core asynchronous handler logic for `resources/read` requests that match the template.
 *     This handler processes the request and returns the resource content.
 *
 * Error handling is integrated throughout using `ErrorHandler.tryCatch` for robustness.
 *
 * @param server - The MCP server instance to register the resource with.
 * @returns A promise that resolves when the resource registration is complete. It does not return a value upon successful completion.
 * @throws {McpError} If the registration process fails critically, which might halt server startup.
 * @see {@link EchoResourceParams} for the type of parameters passed to the handler.
 * @see {@link processEchoResource} for the core resource logic.
 */
export const registerEchoResource = async (
  server: McpServer,
): Promise<void> => {
  const resourceName = "echo-resource"; // Internal identifier for this resource registration.

  const registrationContext: RequestContext =
    requestContextService.createRequestContext({
      operation: "RegisterResource",
      resourceName: resourceName,
      moduleName: "EchoResourceRegistration",
    });

  logger.info(
    `Attempting to register resource: '${resourceName}'`,
    registrationContext,
  );

  await ErrorHandler.tryCatch(
    async () => {
      // Define the resource template. This specifies the URI structure and supported operations.
      // The URI `echo://{message}` uses RFC 6570 syntax, where `{message}` is a path variable.
      const template = new ResourceTemplate("echo://{message}", {
        /**
         * Asynchronous handler for the `resources/list` operation associated with this template.
         * It provides a list of example or discoverable resource URIs that match this template.
         * This allows clients to discover how to interact with the echo resource.
         *
         * @returns A promise resolving to an object containing an array of resource descriptors.
         */
        list: async (): Promise<ListResourcesResult> => {
          const listContext: RequestContext =
            requestContextService.createRequestContext({
              parentContext: registrationContext,
              operation: "ListEchoResourceExamples",
            });
          logger.debug(
            "Executing list operation for echo resource template.",
            listContext,
          );
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
      });
      logger.debug(
        `Resource template created for '${resourceName}': ${template.uriTemplate}`,
        registrationContext,
      );

      // Register the resource with the server.
      // This involves providing the registration name, the template, metadata, and the handler for read operations.
      server.resource(
        resourceName,
        template,
        {
          name: "Echo Message Resource",
          description:
            "A simple echo resource that returns a message, optionally specified in the URI path.",
          mimeType: "application/json",
          examples: [
            {
              name: "Basic echo",
              uri: "echo://hello",
              description:
                "Accesses the echo resource to echo the message 'hello'.",
            },
            {
              name: "Custom echo",
              uri: "echo://custom-message-here",
              description:
                "Accesses the echo resource to echo 'custom-message-here'.",
            },
          ],
        },

        /**
         * Asynchronous handler for `resources/read` requests matching the `echo://{message}` template.
         * This function is invoked by the MCP SDK when a client requests to read a resource
         * whose URI matches the registered template.
         *
         * The SDK extracts path variables (like `{message}` from `echo://{message}`) from the URI.
         * These path variables, along with any validated query parameters, are passed in the `params` object.
         *
         * @param uri - The full URL object of the resource being requested.
         * @param params - An object containing parameters derived from the request.
         *   For this resource, it's expected to include `message` extracted from the URI
         *   path by the SDK. It conforms to {@link EchoResourceParams}.
         * @returns A promise that resolves with the resource content, formatted as a `ReadResourceResult`.
         *   This includes the URI, Base64 encoded content blob, and MIME type.
         *   If an error is thrown from this handler, the SDK is responsible for catching it and
         *   formatting an error response.
         */
        async (
          uri: URL,
          params: EchoResourceParams,
        ): Promise<ReadResourceResult> => {
          const handlerContext: RequestContext =
            requestContextService.createRequestContext({
              parentContext: registrationContext,
              operation: "HandleResourceRead",
              resourceName: resourceName,
              resourceUri: uri.href,
              inputParamsSummary: params.message
                ? { messageLength: params.message.length }
                : { noMessageParam: true },
            });

          logger.debug(
            `Handling read request for resource '${resourceName}', URI: ${uri.href}`,
            handlerContext,
          );

          return await ErrorHandler.tryCatch(
            async () => {
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
                    uri: uri.href,
                    blob: Buffer.from(JSON.stringify(responseData)).toString(
                      "base64",
                    ),
                    mimeType: "application/json",
                  },
                ],
              };
            },
            {
              operation: `ExecutingCoreLogicFor_${resourceName}_Read`,
              context: handlerContext,
              input: { uri: uri.href, params },
              errorMapper: (error: unknown): McpError => {
                const baseErrorCode =
                  error instanceof McpError
                    ? error.code
                    : BaseErrorCode.INTERNAL_ERROR;
                const errorMessage = `Error processing read request for resource '${uri.href}': ${error instanceof Error ? error.message : "An unknown error occurred"}`;
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
        `Resource '${resourceName}' (template: '${template.uriTemplate}') registered successfully.`,
        registrationContext,
      );
    },
    {
      operation: `RegisteringResource_${resourceName}`,
      context: registrationContext,
      errorCode: BaseErrorCode.INITIALIZATION_FAILED,
      errorMapper: (error: unknown): McpError => {
        const errorMessage = `Failed to register resource '${resourceName}': ${error instanceof Error ? error.message : "An unknown error occurred during registration."}`;
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
