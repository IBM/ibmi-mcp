/**
 * @fileoverview Provides a utility class for parsing potentially partial JSON strings.
 * It wraps the 'partial-json' npm library and includes functionality to handle
 * optional <think>...</think> blocks often found at the beginning of LLM outputs.
 * @module utils/parsing/jsonParser
 */
import {
  parse as parsePartialJson,
  Allow as PartialJsonAllow,
} from "partial-json";
import { BaseErrorCode, McpError } from "../../types-global/errors.js";
import { logger, RequestContext, requestContextService } from "../index.js"; // Centralized internal imports

/**
 * Enum mirroring `partial-json`'s `Allow` constants. These constants specify
 * what types of partial JSON structures are permissible during parsing.
 * They can be combined using bitwise OR (e.g., `Allow.STR | Allow.OBJ`).
 *
 * The available properties are:
 * - `STR`: Allow partial string.
 * - `NUM`: Allow partial number.
 * - `ARR`: Allow partial array.
 * - `OBJ`: Allow partial object.
 * - `NULL`: Allow partial null.
 * - `BOOL`: Allow partial boolean.
 * - `NAN`: Allow partial NaN. (Note: Standard JSON does not support NaN)
 * - `INFINITY`: Allow partial Infinity. (Note: Standard JSON does not support Infinity)
 * - `_INFINITY`: Allow partial -Infinity. (Note: Standard JSON does not support -Infinity)
 * - `INF`: Allow both partial Infinity and -Infinity.
 * - `SPECIAL`: Allow all special values (NaN, Infinity, -Infinity).
 * - `ATOM`: Allow all atomic values (strings, numbers, booleans, null, special values).
 * - `COLLECTION`: Allow all collection values (objects, arrays).
 * - `ALL`: Allow all value types to be partial (default for `partial-json`'s parse).
 * @constant
 * @type {typeof PartialJsonAllow}
 * @see {@link https://github.com/promplate/partial-json-parser-js} for more details on `partial-json`.
 */
export const Allow = PartialJsonAllow;

/**
 * Regular expression to find a <think> block at the start of a string.
 * It captures the content within the <think>...</think> tags and the rest of the string.
 * - Group 1: Content inside <think>...</think>
 * - Group 2: The remainder of the string after the </think> tag and any subsequent whitespace.
 * @private
 * @type {RegExp}
 */
const thinkBlockRegex = /^<think>([\s\S]*?)<\/think>\s*([\s\S]*)$/;

/**
 * Utility class for parsing potentially partial JSON strings.
 * It wraps the 'partial-json' library to provide robust JSON parsing capabilities,
 * including handling of incomplete JSON structures and optional <think> blocks
 * often prepended by Language Models.
 * A singleton instance `jsonParser` is exported for convenience.
 * @class JsonParser
 */
export class JsonParser {
  // Exporting the class
  /**
   * Parses a JSON string, which may be partial or prefixed with a <think> block.
   * If a <think> block is present, its content is logged, and parsing proceeds on the
   * remainder of the string. The method uses the 'partial-json' library to handle
   * incomplete JSON structures (including atomic values like strings, numbers, booleans, etc.,
   * not just objects and arrays) according to the `allowPartial` flags.
   *
   * @template T - The expected type of the parsed JSON object. Defaults to `any`.
   * @param {string} jsonString - The JSON string to parse. This string may include a <think> block.
   * @param {number} [allowPartial=Allow.ALL] - A bitwise OR combination of `Allow` constants
   *                                            (e.g., `Allow.OBJ | Allow.STR`) specifying which
   *                                            types of partial JSON are permissible. Defaults to `Allow.ALL`
   *                                            as per the `partial-json` library.
   * @param {RequestContext} [context] - Optional `RequestContext` for logging and error correlation.
   *                                     If a <think> block is processed, its content is logged with this context.
   * @returns {T} The parsed JavaScript value.
   * @throws {McpError} Throws an `McpError` with `BaseErrorCode.VALIDATION_ERROR` if:
   *                    - The string is empty after removing a <think> block and trimming.
   *                    - The `partial-json` library encounters a parsing error (e.g., malformed JSON
   *                      beyond what `allowPartial` permits).
   *                    The error will include details about the original content and the raw parsing error.
   * @public
   */
  parse<T = any>(
    jsonString: string,
    allowPartial: number = Allow.ALL,
    context?: RequestContext,
  ): T {
    let stringToParse = jsonString;
    const match = jsonString.match(thinkBlockRegex);

    if (match) {
      const thinkContent = match[1].trim();
      const restOfString = match[2];

      if (thinkContent) {
        const logContext = context
          ? { ...context, thinkContent }
          : requestContextService.createRequestContext({
              operation: "JsonParser.thinkBlock",
              thinkContent,
            });
        logger.debug("LLM <think> block detected and logged.", logContext);
      } else {
        logger.debug("Empty LLM <think> block detected.", context);
      }
      stringToParse = restOfString;
    }

    stringToParse = stringToParse.trim();

    if (!stringToParse) {
      // If after removing think block and trimming, the string is empty, it's not valid JSON.
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        "JSON string is empty after removing <think> block and trimming.",
        context,
      );
    }

    try {
      // Let partial-json handle the parsing directly. It will throw an error
      // if the string is malformed beyond what `allowPartial` permits.
      return parsePartialJson(stringToParse, allowPartial) as T;
    } catch (error: any) {
      const errorLogContext = context
        ? {
            ...context,
            errorDetails: error.message,
            contentAttempted: stringToParse.substring(0, 200),
          }
        : requestContextService.createRequestContext({
            operation: "JsonParser.parseError",
            errorDetails: error.message,
            contentAttempted: stringToParse.substring(0, 200),
          });
      logger.error("Failed to parse JSON content.", errorLogContext);

      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        `Failed to parse JSON: ${error.message}`, // Include original error message
        {
          ...context,
          originalContentSample:
            stringToParse.substring(0, 200) +
            (stringToParse.length > 200 ? "..." : ""),
          rawError: error instanceof Error ? error.stack : String(error), // Include raw error info
        },
      );
    }
  }
}

/**
 * Singleton instance of the `JsonParser`.
 * Use this instance to parse JSON strings, with support for partial JSON and <think> blocks.
 * @type {JsonParser}
 * @example
 * import { jsonParser, Allow, requestContextService } from './utils'; // Assuming utils/index.js exports these
 * const context = requestContextService.createRequestContext({ operation: 'TestJsonParsing' });
 *
 * const fullJson = '{"key": "value"}';
 * const parsedFull = jsonParser.parse(fullJson, Allow.ALL, context);
 * console.log(parsedFull); // Output: { key: 'value' }
 *
 * const partialObject = '<think>This is a thought.</think>{"key": "value", "arr": [1,';
 * try {
 *   // Allow partial objects and arrays. partial-json defaults allowPartial to Allow.ALL
 *   const parsedPartial = jsonParser.parse(partialObject, undefined, context); // Use default Allow.ALL
 *   console.log(parsedPartial); // Output might be: { key: 'value', arr: [ 1, undefined ] } (behavior of partial-json)
 * } catch (e) {
 *   console.error("Parsing partial object failed:", e);
 * }
 *
 * const partialString = '"abc';
 * try {
 *   // Explicitly allow only partial strings
 *   const parsedString = jsonParser.parse(partialString, Allow.STR, context);
 *   console.log(parsedString); // Output: "abc" (behavior of partial-json)
 * } catch (e) {
 *  console.error("Parsing partial string failed:", e);
 * }
 *
 *  const malformed = "wrong";
 * try {
 *   jsonParser.parse(malformed, Allow.ALL, context);
 * } catch (e) {
 *   console.error("Parsing malformed failed:", e); // Will throw McpError
 * }
 */
export const jsonParser = new JsonParser();
