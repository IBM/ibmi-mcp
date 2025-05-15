/**
 * @fileoverview Provides utility functions for parsing natural language date strings
 * into Date objects or detailed parsing results using the `chrono-node` library.
 * @module utils/parsing/dateParser
 */
import * as chrono from "chrono-node";
import { BaseErrorCode, McpError } from "../../types-global/errors.js";
import { ErrorHandler, logger, RequestContext } from "../index.js"; // Centralized internal imports

/**
 * Parses a natural language date string into a JavaScript Date object.
 * It uses `chrono.parseDate` for lenient parsing of various date formats.
 *
 * @param {string} text - The natural language date string to parse (e.g., "tomorrow", "in 5 days", "2024-01-15").
 * @param {RequestContext} context - The request context for logging and error tracking.
 * @param {Date} [refDate] - Optional reference date for parsing relative dates. Defaults to the current date and time if not provided.
 * @returns {Promise<Date | null>} A promise that resolves with a Date object representing the parsed date,
 *                                 or `null` if the string cannot be parsed into a valid date.
 * @throws {McpError} Throws an `McpError` if an unexpected error occurs during parsing (e.g., issues within `chrono-node` or `ErrorHandler`).
 * @private
 */
async function parseDateString(
  text: string,
  context: RequestContext,
  refDate?: Date,
): Promise<Date | null> {
  const operation = "parseDateString";
  const logContext = { ...context, operation, inputText: text, refDate };
  logger.debug(`Attempting to parse date string: "${text}"`, logContext);

  return await ErrorHandler.tryCatch(
    async () => {
      const parsedDate = chrono.parseDate(text, refDate, { forwardDate: true });
      if (parsedDate) {
        logger.debug(
          `Successfully parsed "${text}" to ${parsedDate.toISOString()}`,
          logContext,
        );
        return parsedDate;
      } else {
        logger.warning(`Failed to parse date string: "${text}"`, logContext);
        return null;
      }
    },
    {
      operation,
      context: logContext,
      input: { text, refDate },
      errorCode: BaseErrorCode.PARSING_ERROR,
    },
  );
}

/**
 * Parses a natural language date string and returns detailed parsing results
 * from `chrono-node`. This provides more information than just the Date object,
 * including the matched text, index, and components of the date.
 *
 * @param {string} text - The natural language date string to parse.
 * @param {RequestContext} context - The request context for logging and error tracking.
 * @param {Date} [refDate] - Optional reference date for parsing relative dates. Defaults to the current date and time if not provided.
 * @returns {Promise<chrono.ParsedResult[]>} A promise that resolves with an array of `chrono.ParsedResult` objects.
 *                                          The array will be empty if no dates are found in the string.
 * @throws {McpError} Throws an `McpError` if an unexpected error occurs during parsing.
 * @private
 */
async function parseDateStringDetailed(
  text: string,
  context: RequestContext,
  refDate?: Date,
): Promise<chrono.ParsedResult[]> {
  const operation = "parseDateStringDetailed";
  const logContext = { ...context, operation, inputText: text, refDate };
  logger.debug(
    `Attempting detailed parse of date string: "${text}"`,
    logContext,
  );

  return await ErrorHandler.tryCatch(
    async () => {
      const results = chrono.parse(text, refDate, { forwardDate: true });
      logger.debug(
        `Detailed parse of "${text}" resulted in ${results.length} result(s)`,
        logContext,
      );
      return results;
    },
    {
      operation,
      context: logContext,
      input: { text, refDate },
      errorCode: BaseErrorCode.PARSING_ERROR,
    },
  );
}

/**
 * An object providing date parsing functionalities.
 * @type {object}
 * @property {function(string, RequestContext, Date=): Promise<chrono.ParsedResult[]>} parse - Parses a natural language date string and returns detailed parsing results.
 * @property {function(string, RequestContext, Date=): Promise<Date | null>} parseDate - Parses a natural language date string into a single Date object.
 * @example
 * import { dateParser, requestContextService } from './utils'; // Assuming utils/index.js exports these
 * const context = requestContextService.createRequestContext({ operation: 'TestDateParsing' });
 *
 * async function testParsing() {
 *   const dateObj = await dateParser.parseDate("next Friday at 3pm", context);
 *   if (dateObj) {
 *     console.log("Parsed Date:", dateObj.toISOString());
 *   }
 *
 *   const detailedResults = await dateParser.parse("Meeting on 2024-12-25 and another one tomorrow", context);
 *   detailedResults.forEach(result => {
 *     console.log("Detailed Result:", result.text, result.start.date());
 *   });
 * }
 * testParsing();
 */
export const dateParser = {
  parse: parseDateStringDetailed,
  parseDate: parseDateString,
};
