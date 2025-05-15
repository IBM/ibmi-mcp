/**
 * @fileoverview Defines the core logic, schemas, and types for the `echo` resource.
 * This module includes a Zod schema for query parameter validation, type definitions,
 * and the main processing function that constructs the resource response.
 * The echo resource is designed to return a message, typically extracted from the
 * request URI's path or query parameters, along with a timestamp.
 * @module mcp-server/resources/echoResource/echoResourceLogic
 */

import { z } from "zod";
// Import utils from the main barrel file
import { logger, type RequestContext } from "../../../utils/index.js";

/**
 * Zod schema defining expected *query* parameters for the echo resource.
 *
 * This schema is intended for validating parameters passed via the URI's query string
 * (e.g., `echo://some_message?message=override_from_query&anotherParam=value`).
 * Path parameters, such as `{message}` in a template like `echo://{message}`,
 * are typically defined in the `ResourceTemplate` (see `registration.ts`) and
 * extracted by the MCP SDK from the URI path. The SDK might merge these path
 * parameters into the `params` object passed to the handler.
 *
 * If a path parameter and a query parameter share the same name (e.g., 'message'),
 * the SDK's behavior for precedence or merging should be considered. This schema
 * defines `message` as an optional query parameter.
 *
 * @constant {z.ZodObject} EchoResourceQuerySchema
 * @property {z.ZodOptional<z.ZodString>} message - An optional message string that can be provided
 *                                                  as a query parameter to be echoed in the response.
 */
export const EchoResourceQuerySchema = z.object({
  /**
   * Optional message to be echoed back in the response.
   * If the resource template also defines a 'message' path parameter,
   * this query parameter might serve as an override or alternative.
   * @type {string}
   */
  message: z
    .string()
    .optional()
    .describe(
      "Optional message to echo back in the response. If not provided, a default may be used or derived from the path.",
    ),
  // Add other potential query parameters here if needed in the future.
  // For example:
  // format: z.enum(["json", "text"]).optional().default("json").describe("Response format"),
});

/**
 * TypeScript type inferred from the {@link EchoResourceQuerySchema}.
 * Represents the validated query parameters that might be passed to the echo resource.
 *
 * @typedef {z.infer<typeof EchoResourceQuerySchema>} EchoResourceParams
 * @property {string} [message] - Optional message from query parameters.
 */
export type EchoResourceParams = z.infer<typeof EchoResourceQuerySchema>;

/**
 * Defines the structure of the JSON payload returned by the `processEchoResource` function.
 * This object is typically JSON-stringified by the resource handler before being sent
 * as the resource content.
 *
 * @property {string} message - The message that is being echoed. This could be from a path parameter,
 *                              a query parameter, or a default value.
 * @property {string} timestamp - An ISO 8601 timestamp indicating when the response was generated.
 * @property {string} requestUri - The full URI of the original resource request.
 */
export interface EchoResourceResponsePayload {
  /** The message that is being echoed. */
  message: string;
  /** An ISO 8601 timestamp indicating when the response was generated. */
  timestamp: string;
  /** The full URI of the original resource request. */
  requestUri: string;
}

/**
 * Processes the core logic for an echo resource request.
 * It constructs a response payload containing a message (derived from path or query parameters),
 * the current timestamp, and the original request URI.
 *
 * The `params` argument is expected to contain validated query parameters. If the resource
 * template (e.g., `echo://{message}`) includes path parameters, the MCP SDK is responsible
 * for extracting them and potentially making them available, often by merging them into
 * the `params` object. This function assumes `params.message` will hold the message
 * if provided either via path or query.
 *
 * @function processEchoResource
 * @param {URL} uri - The full URL object of the incoming resource request.
 *                    This is used to include the original request URI in the response.
 * @param {EchoResourceParams} params - The validated query parameters for the request,
 *                                      conforming to {@link EchoResourceParams}. This object
 *                                      may also include path parameters merged by the SDK.
 * @param {RequestContext} context - The request context, used for logging and tracing the operation.
 * @returns {EchoResourceResponsePayload} The data payload for the response, conforming to
 *                                        {@link EchoResourceResponsePayload}. This payload is
 *                                        typically JSON-stringified by the calling handler.
 * @example
 * const requestUrl = new URL("echo://hello_world_from_path?message=override_from_query");
 * const queryParams = { message: "override_from_query" }; // Assuming SDK provides this
 * // If SDK merges path param 'hello_world_from_path' into params.message, then
 * // params.message might be 'hello_world_from_path' or 'override_from_query' depending on SDK logic.
 * // For this example, let's assume query param takes precedence or is the only one considered by `params`.
 * const reqContext = requestContextService.createRequestContext({ operation: "EchoResourceCall" });
 * const response = processEchoResource(requestUrl, queryParams, reqContext);
 * // response would be like:
 * // {
 * //   message: "override_from_query",
 * //   timestamp: "2023-10-27T10:00:00.000Z",
 * //   requestUri: "echo://hello_world_from_path?message=override_from_query"
 * // }
 */
export const processEchoResource = (
  uri: URL,
  params: EchoResourceParams,
  context: RequestContext,
): EchoResourceResponsePayload => {
  // Determine the message to echo.
  // The `params.message` could originate from a query parameter validated by `EchoResourceQuerySchema`.
  // If the resource template is `echo://{message_from_path}`, the SDK might also place
  // the value of `{message_from_path}` into `params.message`.
  // The fallback "Default message..." is a safeguard, though ideally, a message
  // should always be present if the resource URI matches a template expecting one.
  const messageToEcho = params.message || `Default echo from ${uri.pathname}`;

  // Log the start of processing with relevant input details.
  logger.debug("Processing echo resource logic.", {
    ...context, // Spread context for consistent log structure
    resourceUri: uri.href,
    extractedMessage: messageToEcho,
    queryParamMessage: params.message, // Log specifically what came from query params
  });

  // Prepare the response data payload.
  const responsePayload: EchoResourceResponsePayload = {
    message: messageToEcho,
    timestamp: new Date().toISOString(), // Generate a current ISO 8601 timestamp.
    requestUri: uri.href, // Include the full original request URI for context.
  };

  // Log the successful completion of the processing.
  logger.debug("Echo resource processed successfully.", {
    ...context,
    responsePayloadSummary: {
      messageLength: responsePayload.message.length,
      uriEchoed: responsePayload.requestUri.length > 50 ? `${responsePayload.requestUri.substring(0, 47)}...` : responsePayload.requestUri,
    },
  });

  return responsePayload;
};
