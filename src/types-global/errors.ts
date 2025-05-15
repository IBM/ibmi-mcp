/**
 * @fileoverview Defines standardized error codes, a custom error class, and related schemas
 * for handling errors within the Model Context Protocol (MCP) server and its components.
 * This module provides a structured way to represent and communicate errors, ensuring
 * consistency and clarity for both server-side operations and client-side error handling.
 * @module types-global/errors
 */

import { z } from "zod";

/**
 * Defines a comprehensive set of standardized error codes for common issues encountered
 * within MCP servers, tools, or related operations. These codes are designed to help
 * clients and developers programmatically understand the nature of an error, facilitating
 * more precise error handling and debugging.
 *
 * @property {string} UNAUTHORIZED - Access denied due to invalid credentials or lack of authentication.
 * @property {string} FORBIDDEN - Access denied despite valid authentication, due to insufficient permissions.
 * @property {string} NOT_FOUND - The requested resource, entity, or path could not be found.
 * @property {string} CONFLICT - The request could not be completed due to a conflict with the current state of the resource (e.g., version mismatch, resource already exists).
 * @property {string} VALIDATION_ERROR - The request failed because input parameters, data, or payload did not meet validation criteria.
 * @property {string} PARSING_ERROR - An error occurred while parsing input data, such as a malformed JSON string, an invalid date format, or incorrect data structure.
 * @property {string} RATE_LIMITED - The request was rejected because the client has exceeded predefined rate limits for API calls or resource usage.
 * @property {string} TIMEOUT - The request timed out before a response could be generated or the operation could complete.
 * @property {string} SERVICE_UNAVAILABLE - The service is temporarily unavailable, possibly due to maintenance, overload, or other transient issues.
 * @property {string} INTERNAL_ERROR - An unexpected error occurred on the server side that prevented the request from being fulfilled. This usually indicates a bug or unhandled exception.
 * @property {string} UNKNOWN_ERROR - An error occurred, but the specific cause is unknown or cannot be categorized under other defined error codes.
 * @property {string} CONFIGURATION_ERROR - An error occurred during the loading, validation, or processing of configuration data for the server or a specific module.
 * @property {string} INITIALIZATION_FAILED - An error occurred during the initialization phase of a service, module, or the server itself.
 */
export enum BaseErrorCode {
  /** Access denied due to invalid credentials or lack of authentication. */
  UNAUTHORIZED = "UNAUTHORIZED",
  /** Access denied despite valid authentication, due to insufficient permissions. */
  FORBIDDEN = "FORBIDDEN",
  /** The requested resource or entity could not be found. */
  NOT_FOUND = "NOT_FOUND",
  /** The request could not be completed due to a conflict with the current state of the resource. */
  CONFLICT = "CONFLICT",
  /** The request failed due to invalid input parameters or data. */
  VALIDATION_ERROR = "VALIDATION_ERROR",
  /** An error occurred while parsing input data (e.g., date string, JSON). */
  PARSING_ERROR = "PARSING_ERROR",
  /** The request was rejected because the client has exceeded rate limits. */
  RATE_LIMITED = "RATE_LIMITED",
  /** The request timed out before a response could be generated. */
  TIMEOUT = "TIMEOUT",
  /** The service is temporarily unavailable, possibly due to maintenance or overload. */
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  /** An unexpected error occurred on the server side. */
  INTERNAL_ERROR = "INTERNAL_ERROR",
  /** An error occurred, but the specific cause is unknown or cannot be categorized. */
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
  /** An error occurred during the loading or validation of configuration data. */
  CONFIGURATION_ERROR = "CONFIGURATION_ERROR",
  /** An error occurred during the initialization phase of a service or module. */
  INITIALIZATION_FAILED = "INITIALIZATION_FAILED",
}

/**
 * Custom error class for MCP-specific errors, extending the built-in `Error` class.
 * It standardizes error reporting by encapsulating a `BaseErrorCode`, a descriptive
 * human-readable message, and optional structured details for more context.
 *
 * This class is central to error handling within the MCP framework, allowing for
 * consistent error creation and propagation.
 *
 * @class McpError
 */
export class McpError extends Error {
  /**
   * The standardized error code from {@link BaseErrorCode}.
   * This property is public and read-only after instantiation.
   * @public
   * @readonly
   * @type {BaseErrorCode}
   */
  public readonly code: BaseErrorCode;

  /**
   * Optional additional details or context about the error.
   * This can be any structured data that helps in understanding or debugging the error.
   * This property is public and read-only after instantiation.
   * @public
   * @readonly
   * @type {Record<string, unknown> | undefined}
   */
  public readonly details?: Record<string, unknown>;

  /**
   * Creates an instance of McpError.
   *
   * @param {BaseErrorCode} code - The standardized error code (from {@link BaseErrorCode}) that categorizes the error.
   * @param {string} message - A human-readable description of the error. This message will be the `Error.message` property.
   * @param {Record<string, unknown>} [details] - Optional. A record containing additional structured details about the error,
   *                                              useful for debugging or providing more context to the client.
   */
  constructor(
    code: BaseErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    // Call the parent Error constructor with the message
    super(message);

    // Assign the custom properties
    this.code = code;
    this.details = details;

    // Set the error name for easier identification and type checking (e.g., `error instanceof McpError`)
    this.name = "McpError";

    // Maintain a proper prototype chain. This is important for `instanceof` checks and stack trace correctness.
    // It ensures that instances of McpError are correctly identified as such.
    Object.setPrototypeOf(this, McpError.prototype);

    // Capture the stack trace, excluding the constructor call from it, if available.
    // This is more common in Node.js environments.
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, McpError);
    }
  }

  // Note: The toResponse() method was previously here.
  // As per the .clinerules and modern SDK design, error formatting for JSON-RPC
  // or other transport-specific responses is typically handled by the MCP SDK
  // or the transport layer itself, not by the error class. This keeps the error
  // class focused on representing the error state.
}

/**
 * Zod schema for validating error objects. This schema can be used for:
 * - Validating error structures when parsing error responses from external services.
 * - Ensuring consistency when creating or handling error objects internally.
 * - Generating TypeScript types for error objects.
 *
 * The schema enforces the presence of a `code` (from {@link BaseErrorCode}) and a `message`,
 * and allows for optional `details`.
 *
 * @constant {z.ZodObject} ErrorSchema
 */
export const ErrorSchema = z
  .object({
    /**
     * The error code, corresponding to one of the {@link BaseErrorCode} enum values.
     * This field is required and helps in programmatically identifying the error type.
     */
    code: z
      .nativeEnum(BaseErrorCode)
      .describe("Standardized error code from BaseErrorCode enum"),
    /**
     * A human-readable, descriptive message explaining the error.
     * This field is required and provides context to developers or users.
     */
    message: z
      .string()
      .min(1, "Error message cannot be empty.")
      .describe("Detailed human-readable error message"),
    /**
     * Optional. A record containing additional structured details or context about the error.
     * This can include things like invalid field names, specific values that caused issues, or other relevant data.
     */
    details: z
      .record(z.unknown())
      .optional()
      .describe(
        "Optional structured details providing more context about the error",
      ),
  })
  .describe(
    "Schema for validating structured error objects, ensuring consistency in error reporting.",
  );

/**
 * TypeScript type inferred from the {@link ErrorSchema}.
 * This type represents the structure of a validated error object, commonly used
 * for error responses or when passing error information within the application.
 *
 * @typedef {z.infer<typeof ErrorSchema>} ErrorResponse
 * @property {BaseErrorCode} code - The standardized error code.
 * @property {string} message - A human-readable description of the error.
 * @property {Record<string, unknown>} [details] - Optional additional details about the error.
 */
export type ErrorResponse = z.infer<typeof ErrorSchema>;
