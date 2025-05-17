/**
 * @fileoverview Defines the core logic, schemas, and types for the `echo_message` tool.
 * This module includes input validation using Zod, type definitions for input and output,
 * and the main processing function that handles message formatting and repetition.
 * @module mcp-server/tools/echoTool/echoToolLogic
 */

import { z } from "zod";
import { logger, type RequestContext } from "../../../utils/index.js";

/**
 * Defines the valid formatting modes for the echo tool operation.
 * - `standard`: Echo the message as is.
 * - `uppercase`: Convert the message to uppercase.
 * - `lowercase`: Convert the message to lowercase.
 */
export const ECHO_MODES = ["standard", "uppercase", "lowercase"] as const;

/**
 * Zod schema defining the input parameters for the `echo_message` tool.
 * This schema is used by the MCP SDK to validate the arguments provided when the tool is called.
 * It specifies constraints such as message length, formatting mode, repetition count,
 * and whether a timestamp should be included in the response.
 * The `.describe()` calls on each field provide human-readable explanations that
 * can be used by documentation generators or for context by LLMs.
 */
export const EchoToolInputSchema = z
  .object({
    message: z
      .string()
      .min(1, "Message cannot be empty.")
      .max(1000, "Message cannot exceed 1000 characters.")
      .describe(
        "The message to echo back. It must be between 1 and 1000 characters long.",
      ),
    mode: z
      .enum(ECHO_MODES)
      .optional()
      .default("standard")
      .describe(
        "Specifies how the message should be formatted. " +
          "Options: 'standard' (as-is), 'uppercase', 'lowercase'. Defaults to 'standard'.",
      ),
    repeat: z
      .number()
      .int("Repeat count must be an integer.")
      .min(1, "Repeat count must be at least 1.")
      .max(10, "Repeat count cannot exceed 10.")
      .optional()
      .default(1)
      .describe(
        "The number of times the formatted message should be repeated. Must be an integer between 1 and 10. Defaults to 1.",
      ),
    timestamp: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "Whether to include an ISO 8601 timestamp in the response. Defaults to true.",
      ),
  })
  .describe(
    "Zod schema for validating the input arguments for the echo_message tool.",
  );

/**
 * TypeScript type inferred from `EchoToolInputSchema`.
 * Represents the validated input parameters for the echo tool.
 */
export type EchoToolInput = z.infer<typeof EchoToolInputSchema>;

/**
 * Defines the structure of the JSON payload returned by the `echo_message` tool handler.
 * This object is typically JSON-stringified and placed within the `text` field of a
 * `CallToolResult`'s `content` array when the tool is invoked successfully.
 *
 * @property originalMessage - The original message as provided in the input.
 * @property formattedMessage - The message after the specified formatting mode (e.g., uppercase) has been applied.
 * @property repeatedMessage - The `formattedMessage` repeated the specified number of times, with repetitions joined by a single space.
 * @property mode - The formatting mode that was actually applied to the message.
 * @property repeatCount - The number of times the `formattedMessage` was repeated to create the `repeatedMessage`.
 * @property timestamp - An optional ISO 8601 timestamp indicating when the response was generated. This is included if the `timestamp` input parameter was true.
 */
export interface EchoToolResponse {
  /** The original message provided in the input. */
  originalMessage: string;
  /** The message after applying the specified formatting mode. */
  formattedMessage: string;
  /** The formatted message repeated the specified number of times, joined by spaces. */
  repeatedMessage: string;
  /** The formatting mode that was applied. */
  mode: (typeof ECHO_MODES)[number];
  /** The number of times the message was repeated. */
  repeatCount: number;
  /** Optional ISO 8601 timestamp of when the response was generated. */
  timestamp?: string;
}

/**
 * Processes the core logic for the `echo_message` tool.
 * It takes validated input parameters, formats the message according to the specified mode,
 * repeats it as requested, and optionally adds a timestamp to the response.
 *
 * @param params - The validated input parameters for the echo tool.
 * @param context - The request context, used for logging and tracing the operation.
 * @returns An object containing the processed response data.
 * @example
 * ```typescript
 * const input = { message: "Hello", mode: "uppercase", repeat: 2, timestamp: true };
 * const context = requestContextService.createRequestContext({ operation: "EchoToolCall" });
 * const response = processEchoMessage(input, context);
 * // response might be:
 * // {
 * //   originalMessage: "Hello",
 * //   formattedMessage: "HELLO",
 * //   repeatedMessage: "HELLO HELLO",
 * //   mode: "uppercase",
 * //   repeatCount: 2,
 * //   timestamp: "2023-10-27T10:00:00.000Z"
 * // }
 * ```
 */
export const processEchoMessage = (
  params: EchoToolInput,
  context: RequestContext,
): EchoToolResponse => {
  logger.debug("Processing echo message logic with input parameters.", {
    ...context,
    toolInput: {
      messageLength: params.message.length,
      mode: params.mode,
      repeat: params.repeat,
      timestampRequested: params.timestamp,
    },
  });

  let formattedMessage = params.message;
  switch (params.mode) {
    case "uppercase":
      formattedMessage = params.message.toUpperCase();
      break;
    case "lowercase":
      formattedMessage = params.message.toLowerCase();
      break;
  }

  const repeatedMessage = Array(params.repeat).fill(formattedMessage).join(" ");

  const response: EchoToolResponse = {
    originalMessage: params.message,
    formattedMessage,
    repeatedMessage,
    mode: params.mode,
    repeatCount: params.repeat,
  };

  if (params.timestamp) {
    response.timestamp = new Date().toISOString();
  }

  logger.debug("Echo message processed successfully.", {
    ...context,
    toolResponseSummary: {
      formattedMessageLength: response.formattedMessage.length,
      repeatedMessageLength: response.repeatedMessage.length,
      modeUsed: response.mode,
      timesRepeated: response.repeatCount,
      timestampGenerated: !!response.timestamp,
    },
  });

  return response;
};
