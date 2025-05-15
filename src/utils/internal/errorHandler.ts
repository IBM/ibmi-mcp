/**
 * @fileoverview This module provides utilities for robust error handling.
 * It defines structures for error context, options for handling errors,
 * and mappings for classifying errors. The main `ErrorHandler` class
 * offers static methods for consistent error processing, logging, and transformation.
 * @module utils/internal/errorHandler
 */
import { BaseErrorCode, McpError } from "../../types-global/errors.js";
import { generateUUID, sanitizeInputForLogging } from "../index.js"; // generateUUID for fallback request IDs
import { logger } from "./logger.js";
import { RequestContext } from "./requestContext.js";

/**
 * Defines a generic structure for providing context with errors.
 * This context can include identifiers like `requestId` or any other relevant
 * key-value pairs that aid in debugging or understanding the error's circumstances.
 * @typedef {object} ErrorContext
 * @property {string} [requestId] - A unique identifier for the request or operation during which the error occurred.
 *                                  Useful for tracing errors through logs and distributed systems.
 * @property {unknown} [key] - Allows for arbitrary additional context information. Keys are strings, and values can be of any type.
 */
export interface ErrorContext {
  /**
   * A unique identifier for the request or operation during which the error occurred.
   * Useful for tracing errors through logs and distributed systems.
   */
  requestId?: string;

  /**
   * Allows for arbitrary additional context information.
   * Keys are strings, and values can be of any type.
   */
  [key: string]: unknown;
}

/**
 * Configuration options for the `ErrorHandler.handleError` method.
 * These options control how an error is processed, logged, and whether it's rethrown.
 * @typedef {object} ErrorHandlerOptions
 * @property {ErrorContext} [context] - The context of the operation that caused the error.
 * @property {string} operation - A descriptive name of the operation being performed.
 * @property {unknown} [input] - The input data being processed when the error occurred; sanitized before logging.
 * @property {boolean} [rethrow=false] - If true, the (potentially transformed) error will be rethrown.
 * @property {BaseErrorCode} [errorCode] - A specific `BaseErrorCode` to assign, overriding automatic determination.
 * @property {(error: unknown) => Error} [errorMapper] - Custom function to transform the original error.
 * @property {boolean} [includeStack=true] - If true, stack traces are included in logs.
 * @property {boolean} [critical=false] - If true, indicates the error is critical.
 */
export interface ErrorHandlerOptions {
  /**
   * The context of the operation that caused the error.
   * This can include `requestId` and other relevant debugging information.
   */
  context?: ErrorContext;

  /**
   * A descriptive name of the operation being performed when the error occurred.
   * This helps in identifying the source or nature of the error in logs.
   * Example: "UserLogin", "ProcessPayment", "FetchUserProfile".
   */
  operation: string;

  /**
   * The input data or parameters that were being processed when the error occurred.
   * This input will be sanitized before logging to prevent sensitive data exposure.
   */
  input?: unknown;

  /**
   * If true, the (potentially transformed) error will be rethrown after handling.
   * Defaults to `false`.
   */
  rethrow?: boolean;

  /**
   * A specific `BaseErrorCode` to assign to the error, overriding any
   * automatically determined error code.
   */
  errorCode?: BaseErrorCode;

  /**
   * A custom function to map or transform the original error into a new `Error` instance.
   * If provided, this function is used instead of the default `McpError` creation.
   * @param {unknown} error - The original error that occurred.
   * @returns {Error} The transformed error.
   */
  errorMapper?: (error: unknown) => Error;

  /**
   * If true, stack traces will be included in the logs.
   * Defaults to `true`.
   */
  includeStack?: boolean;

  /**
   * If true, indicates that the error is critical and might require immediate attention
   * or could lead to system instability. This is primarily for logging and alerting.
   * Defaults to `false`.
   */
  critical?: boolean;
}

/**
 * Defines a basic rule for mapping errors based on patterns.
 * Used internally by `COMMON_ERROR_PATTERNS` and as a base for `ErrorMapping`.
 * @typedef {object} BaseErrorMapping
 * @property {string | RegExp} pattern - String or RegExp to match against the error message (case-insensitive for strings).
 * @property {BaseErrorCode} errorCode - The `BaseErrorCode` to assign if the pattern matches.
 * @property {string} [messageTemplate] - Optional custom message template (Note: not directly used by `determineErrorCode`).
 */
export interface BaseErrorMapping {
  /**
   * A string or regular expression to match against the error message.
   * If a string is provided, it's typically used for substring matching (case-insensitive).
   */
  pattern: string | RegExp;

  /**
   * The `BaseErrorCode` to assign if the pattern matches.
   */
  errorCode: BaseErrorCode;

  /**
   * An optional custom message template for the mapped error.
   * (Note: This property is defined but not directly used by `ErrorHandler.determineErrorCode`
   * which focuses on `errorCode`. It's more relevant for custom mapping logic.)
   */
  messageTemplate?: string;
}

/**
 * Extends `BaseErrorMapping` to include a factory function for creating
 * specific error instances and additional context for the mapping.
 * Used by `ErrorHandler.mapError`.
 * @template T - The type of `Error` this mapping will produce, defaults to `Error`.
 * @typedef {object} ErrorMapping
 * @property {(error: unknown, context?: Record<string, unknown>) => T} factory - Creates the mapped error instance.
 * @property {Record<string, unknown>} [additionalContext] - Static context for the factory function.
 */
export interface ErrorMapping<T extends Error = Error>
  extends BaseErrorMapping {
  /**
   * A factory function that creates and returns an instance of the mapped error type `T`.
   * @param {unknown} error - The original error that occurred.
   * @param {Record<string, unknown>} [context] - Optional additional context provided in the mapping rule.
   * @returns {T} The newly created error instance.
   */
  factory: (error: unknown, context?: Record<string, unknown>) => T;

  /**
   * Additional static context to be merged or passed to the `factory` function
   * when this mapping rule is applied.
   */
  additionalContext?: Record<string, unknown>;
}

/**
 * Maps standard JavaScript error constructor names to `BaseErrorCode` values.
 * This allows for quick classification of common built-in error types.
 * @type {Readonly<Record<string, BaseErrorCode>>}
 * @private
 */
const ERROR_TYPE_MAPPINGS: Readonly<Record<string, BaseErrorCode>> = {
  SyntaxError: BaseErrorCode.VALIDATION_ERROR,
  TypeError: BaseErrorCode.VALIDATION_ERROR,
  ReferenceError: BaseErrorCode.INTERNAL_ERROR,
  RangeError: BaseErrorCode.VALIDATION_ERROR,
  URIError: BaseErrorCode.VALIDATION_ERROR,
  EvalError: BaseErrorCode.INTERNAL_ERROR,
};

/**
 * An array of `BaseErrorMapping` rules used to automatically classify
 * errors based on keywords or patterns found in their messages or names.
 * These patterns are typically case-insensitive.
 * **IMPORTANT**: The order of patterns matters. More specific patterns should generally come
 * before more generic ones if there's a possibility of overlap, as the first match is used.
 * @type {ReadonlyArray<Readonly<BaseErrorMapping>>}
 * @private
 */
const COMMON_ERROR_PATTERNS: ReadonlyArray<Readonly<BaseErrorMapping>> = [
  {
    pattern:
      /auth|unauthorized|unauthenticated|not.*logged.*in|invalid.*token|expired.*token/i,
    errorCode: BaseErrorCode.UNAUTHORIZED,
  },
  {
    pattern: /permission|forbidden|access.*denied|not.*allowed/i,
    errorCode: BaseErrorCode.FORBIDDEN,
  },
  {
    pattern: /not found|missing|no such|doesn't exist|couldn't find/i,
    errorCode: BaseErrorCode.NOT_FOUND,
  },
  {
    pattern:
      /invalid|validation|malformed|bad request|wrong format|missing required/i,
    errorCode: BaseErrorCode.VALIDATION_ERROR,
  },
  {
    pattern: /conflict|already exists|duplicate|unique constraint/i,
    errorCode: BaseErrorCode.CONFLICT,
  },
  {
    pattern: /rate limit|too many requests|throttled/i,
    errorCode: BaseErrorCode.RATE_LIMITED,
  },
  {
    pattern: /timeout|timed out|deadline exceeded/i,
    errorCode: BaseErrorCode.TIMEOUT,
  },
  {
    pattern: /service unavailable|bad gateway|gateway timeout|upstream error/i,
    errorCode: BaseErrorCode.SERVICE_UNAVAILABLE,
  },
];

/**
 * Creates a "safe" RegExp for testing error messages.
 * Ensures case-insensitivity if not already specified and removes the global flag.
 * @param {string | RegExp} pattern - The string or RegExp pattern.
 * @returns {RegExp} A new RegExp instance, typically case-insensitive and non-global.
 * @private
 */
function createSafeRegex(pattern: string | RegExp): RegExp {
  if (pattern instanceof RegExp) {
    let flags = pattern.flags.replace("g", ""); // Remove global flag
    if (!flags.includes("i")) {
      flags += "i"; // Add case-insensitive if not present
    }
    return new RegExp(pattern.source, flags);
  }
  return new RegExp(pattern, "i"); // Default to case-insensitive for string patterns
}

/**
 * Retrieves a descriptive name for an error object or value.
 * Handles various types including `Error` instances, `null`, `undefined`, and other primitives/objects.
 *
 * @param {unknown} error - The error object or value.
 * @returns {string} A string representing the error's name or type (e.g., "TypeError", "NullValueEncountered").
 * @private
 */
function getErrorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name || "Error";
  }
  if (error === null) {
    return "NullValueEncountered";
  }
  if (error === undefined) {
    return "UndefinedValueEncountered";
  }
  if (
    typeof error === "object" &&
    error !== null &&
    error.constructor &&
    typeof error.constructor.name === "string" &&
    error.constructor.name !== "Object"
  ) {
    return `${error.constructor.name}Encountered`;
  }
  return `${typeof error}Encountered`;
}

/**
 * Extracts a message string from an error object or value.
 * Handles `Error` instances, primitives, and converts other types to a string representation.
 *
 * @param {unknown} error - The error object or value.
 * @returns {string} The error message string.
 * @private
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error === null) {
    return "Null value encountered as error";
  }
  if (error === undefined) {
    return "Undefined value encountered as error";
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    const str = String(error);
    if (str === "[object Object]" && error !== null) {
      try {
        return `Non-Error object encountered: ${JSON.stringify(error)}`;
      } catch (stringifyError) {
        return `Unstringifyable non-Error object encountered (constructor: ${error.constructor?.name || "Unknown"})`;
      }
    }
    return str;
  } catch (e) {
    return `Error converting error to string: ${e instanceof Error ? e.message : "Unknown conversion error"}`;
  }
}

/**
 * A utility class providing static methods for comprehensive error handling.
 * @class ErrorHandler
 */
export class ErrorHandler {
  /**
   * Determines an appropriate `BaseErrorCode` for a given error.
   * It checks if the error is an `McpError` instance, then consults
   * `ERROR_TYPE_MAPPINGS` by error name, and finally `COMMON_ERROR_PATTERNS`
   * by error message or name. Defaults to `BaseErrorCode.INTERNAL_ERROR`.
   * @param {unknown} error - The error instance or value to classify.
   * @returns {BaseErrorCode} The determined error code for the input error.
   * @public
   * @static
   */
  public static determineErrorCode(error: unknown): BaseErrorCode {
    if (error instanceof McpError) {
      return error.code;
    }

    const errorName = getErrorName(error);
    const errorMessage = getErrorMessage(error);

    if (errorName in ERROR_TYPE_MAPPINGS) {
      return ERROR_TYPE_MAPPINGS[errorName as keyof typeof ERROR_TYPE_MAPPINGS];
    }

    for (const mapping of COMMON_ERROR_PATTERNS) {
      const regex = createSafeRegex(mapping.pattern);
      if (regex.test(errorMessage) || regex.test(errorName)) {
        return mapping.errorCode;
      }
    }
    return BaseErrorCode.INTERNAL_ERROR;
  }

  /**
   * Handles an error with consistent logging and optional transformation.
   * It sanitizes input, determines an error code, logs the error details,
   * and can rethrow a (potentially mapped) `Error` instance.
   * @param {unknown} error - The error instance or value that occurred.
   * @param {ErrorHandlerOptions} options - Configuration for handling the error.
   * @returns {Error} The handled (and potentially transformed) error instance. This is the error that would be rethrown if `options.rethrow` is true.
   * @public
   * @static
   */
  public static handleError(
    error: unknown,
    options: ErrorHandlerOptions,
  ): Error {
    const {
      context = {},
      operation,
      input,
      rethrow = false,
      errorCode: explicitErrorCode,
      includeStack = true,
      critical = false,
      errorMapper,
    } = options;

    const sanitizedInput =
      input !== undefined ? sanitizeInputForLogging(input) : undefined;
    const originalErrorName = getErrorName(error);
    const originalErrorMessage = getErrorMessage(error);
    const originalStack = error instanceof Error ? error.stack : undefined;

    let finalError: Error;
    let loggedErrorCode: BaseErrorCode;

    const errorDetailsSeed =
      error instanceof McpError &&
      typeof error.details === "object" &&
      error.details !== null
        ? { ...error.details }
        : {};

    const consolidatedDetails: Record<string, unknown> = {
      ...errorDetailsSeed,
      ...context,
      originalErrorName,
      originalMessage: originalErrorMessage,
    };
    if (
      originalStack &&
      !(error instanceof McpError && error.details?.originalStack)
    ) {
      consolidatedDetails.originalStack = originalStack;
    }

    if (error instanceof McpError) {
      loggedErrorCode = error.code;
      // Pass consolidatedDetails directly to the constructor if not using errorMapper.
      // If errorMapper is used, it's responsible for handling details.
      finalError = errorMapper
        ? errorMapper(error)
        : new McpError(error.code, error.message, consolidatedDetails);
      // If errorMapper returned an McpError without details, and we want to ensure
      // consolidatedDetails are present, this would be a design choice.
      // However, with 'details' being readonly, it must be set at construction.
      // The current McpError constructor already takes details.
    } else {
      loggedErrorCode =
        explicitErrorCode || ErrorHandler.determineErrorCode(error);
      const message = `Error in ${operation}: ${originalErrorMessage}`;
      // Pass consolidatedDetails directly to the constructor if not using errorMapper.
      finalError = errorMapper
        ? errorMapper(error)
        : new McpError(loggedErrorCode, message, consolidatedDetails);
    }

    if (
      finalError !== error &&
      error instanceof Error &&
      finalError instanceof Error &&
      !finalError.stack &&
      error.stack
    ) {
      finalError.stack = error.stack;
    }

    const logRequestId =
      typeof context.requestId === "string" && context.requestId
        ? context.requestId
        : generateUUID();

    const logTimestamp =
      typeof context.timestamp === "string" && context.timestamp
        ? context.timestamp
        : new Date().toISOString();

    const logPayload: Record<string, unknown> = {
      requestId: logRequestId,
      timestamp: logTimestamp,
      operation,
      input: sanitizedInput,
      critical,
      errorCode: loggedErrorCode,
      originalErrorType: originalErrorName,
      finalErrorType: getErrorName(finalError),
      ...Object.fromEntries(
        Object.entries(context).filter(
          ([key]) => key !== "requestId" && key !== "timestamp",
        ),
      ),
    };

    if (finalError instanceof McpError && finalError.details) {
      logPayload.errorDetails = finalError.details;
    } else {
      logPayload.errorDetails = consolidatedDetails;
    }

    if (includeStack) {
      const stack =
        finalError instanceof Error ? finalError.stack : originalStack;
      if (stack) {
        logPayload.stack = stack;
      }
    }

    logger.error(
      `Error in ${operation}: ${finalError.message || originalErrorMessage}`,
      logPayload as unknown as RequestContext,
    );

    if (rethrow) {
      throw finalError;
    }
    return finalError;
  }

  /**
   * Maps an error to a specific error type `T` based on a list of `ErrorMapping` rules.
   * If no mapping matches, it returns the original error (if it's an `Error` instance),
   * a new `Error` wrapping the original value, or the result of `defaultFactory` if provided.
   * @template T - The target error type, extending `Error`.
   * @param {unknown} error - The error instance or value to map.
   * @param {ReadonlyArray<ErrorMapping<T>>} mappings - An array of mapping rules to apply.
   * @param {(error: unknown, context?: Record<string, unknown>) => T} [defaultFactory] - An optional factory to create a default error if no mapping matches.
   * @returns {T | Error} The mapped error of type `T`, or the original/defaulted error.
   * @public
   * @static
   */
  public static mapError<T extends Error>(
    error: unknown,
    mappings: ReadonlyArray<ErrorMapping<T>>,
    defaultFactory?: (error: unknown, context?: Record<string, unknown>) => T,
  ): T | Error {
    const errorMessage = getErrorMessage(error);
    const errorName = getErrorName(error);

    for (const mapping of mappings) {
      const regex = createSafeRegex(mapping.pattern);
      if (regex.test(errorMessage) || regex.test(errorName)) {
        return mapping.factory(error, mapping.additionalContext);
      }
    }

    if (defaultFactory) {
      return defaultFactory(error);
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  /**
   * Formats an error into a consistent object structure, suitable for API responses or structured logging.
   * If the error is an `McpError`, its `code`, `message`, and `details` are used.
   * Otherwise, a `code` is determined, and `message` and `errorType` are extracted.
   * @param {unknown} error - The error instance or value to format.
   * @returns {Record<string, unknown>} A structured representation of the error.
   * @public
   * @static
   */
  public static formatError(error: unknown): Record<string, unknown> {
    if (error instanceof McpError) {
      return {
        code: error.code,
        message: error.message,
        details:
          typeof error.details === "object" && error.details !== null
            ? error.details
            : {},
      };
    }

    if (error instanceof Error) {
      return {
        code: ErrorHandler.determineErrorCode(error),
        message: error.message,
        details: { errorType: error.name || "Error" },
      };
    }

    return {
      code: BaseErrorCode.UNKNOWN_ERROR,
      message: getErrorMessage(error),
      details: { errorType: getErrorName(error) },
    };
  }

  /**
   * Safely executes a function (synchronous or asynchronous) and handles any errors
   * that occur using `ErrorHandler.handleError`. The error is always rethrown.
   * This is a convenient wrapper for common try/catch blocks.
   * @template T - The expected return type of the function `fn`.
   * @param {() => Promise<T> | T} fn - The function to execute.
   * @param {Omit<ErrorHandlerOptions, 'rethrow'>} options - Error handling options, excluding `rethrow` (as it's always true).
   * @returns {Promise<T>} A promise that resolves with the result of `fn` if successful.
   * @throws {McpError | Error} The error processed by `ErrorHandler.handleError` if `fn` throws.
   * @public
   * @static
   * @example
   * async function fetchData(userId: string, context: RequestContext) {
   *   return ErrorHandler.tryCatch(
   *     async () => {
   *       const response = await fetch(`/api/users/${userId}`);
   *       if (!response.ok) throw new Error(`Failed to fetch user: ${response.status}`);
   *       return response.json();
   *     },
   *     { operation: 'fetchUserData', context, input: { userId } }
   *   );
   * }
   */
  public static async tryCatch<T>(
    fn: () => Promise<T> | T,
    options: Omit<ErrorHandlerOptions, "rethrow">,
  ): Promise<T> {
    try {
      return await Promise.resolve(fn());
    } catch (error) {
      throw ErrorHandler.handleError(error, { ...options, rethrow: true });
    }
  }
}
