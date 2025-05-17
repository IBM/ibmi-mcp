/**
 * @fileoverview Defines the core logic, schemas, and types for the `echo` resource.
 * This module includes a Zod schema for query parameter validation, type definitions,
 * and the main processing function that constructs the resource response.
 * The echo resource is designed to return a message, typically extracted from the
 * request URI's path or query parameters, along with a timestamp.
 * @module src/mcp-server/resources/echoResource/echoResourceLogic
 */

import { z } from "zod";
import { logger, type RequestContext } from "../../../utils/index.js";

/**
 * Zod schema defining expected query parameters for the echo resource.
 *
 * This schema is intended for validating parameters passed via the URI's query string
 * (e.g., `echo://some_message?message=override_from_query&anotherParam=value`).
 * Path parameters, such as `{message}` in a template like `echo://{message}`,
 * are typically defined in the `ResourceTemplate` (see `registration.ts`) and
 * extracted by the MCP SDK from the URI path. The SDK merges these path
 * parameters into the `params` object passed to the handler.
 *
 * If a path parameter and a query parameter share the same name (e.g., 'message'),
 * the query parameter will take precedence over the path parameter. This schema
 * defines `message` as an optional query parameter.
 */
export const EchoResourceQuerySchema = z.object({
  /**
   * Optional message to be echoed back in the response.
   * If the resource template also defines a 'message' path parameter,
   * this query parameter will override the path parameter's value if both are present.
   */
  message: z
    .string()
    .optional()
    .describe(
      "Optional message to echo back in the response. If not provided, a default may be used or derived from the path.",
    ),
});

/**
 * TypeScript type inferred from the {@link EchoResourceQuerySchema}.
 * Represents the validated query parameters that might be passed to the echo resource.
 */
export type EchoResourceParams = z.infer<typeof EchoResourceQuerySchema>;

/**
 * Defines the structure of the JSON payload returned by the `processEchoResource` function.
 * This object is typically JSON-stringified by the resource handler before being sent
 * as the resource content.
 *
 * @property message - The message that is being echoed. This could be from a path parameter,
 *   a query parameter (which takes precedence), or a default value.
 * @property timestamp - An ISO 8601 timestamp indicating when the response was generated.
 * @property requestUri - The full URI of the original resource request.
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
 * template (e.g., `echo://{message}`) includes path parameters, the MCP SDK extracts
 * them and merges them into the `params` object. If a query parameter shares the same
 * name as a path parameter, the query parameter's value takes precedence. This function
 * assumes `params.message` will hold the definitive message.
 *
 * @param uri - The full URL object of the incoming resource request.
 * @param params - The validated query parameters for the request.
 *   This object also includes path parameters merged by the SDK, with query parameters
 *   taking precedence in case of name conflicts.
 * @param context - The request context, used for logging and tracing the operation.
 * @returns The data payload for the response.
 *   This payload is typically JSON-stringified by the calling handler.
 */
export const processEchoResource = (
  uri: URL,
  params: EchoResourceParams,
  context: RequestContext,
): EchoResourceResponsePayload => {
  // The `params.message` can originate from a query parameter (validated by `EchoResourceQuerySchema`)
  // or a path parameter (e.g., from a template like `echo://{message_from_path}`).
  // The MCP SDK merges these, with query parameters taking precedence over path parameters if names conflict.
  // The fallback "Default message..." is a safeguard if no message is provided via path or query.
  const messageToEcho = params.message || `Default echo from ${uri.pathname}`;

  logger.debug("Processing echo resource logic.", {
    ...context,
    resourceUri: uri.href,
    extractedMessage: messageToEcho,
    queryParamMessage: params.message,
  });

  const responsePayload: EchoResourceResponsePayload = {
    message: messageToEcho,
    timestamp: new Date().toISOString(),
    requestUri: uri.href,
  };

  logger.debug("Echo resource processed successfully.", {
    ...context,
    responsePayloadSummary: {
      messageLength: responsePayload.message.length,
      uriEchoed:
        responsePayload.requestUri.length > 50
          ? `${responsePayload.requestUri.substring(0, 47)}...`
          : responsePayload.requestUri,
    },
  });

  return responsePayload;
};
