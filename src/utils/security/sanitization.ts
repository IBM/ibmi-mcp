/**
 * @fileoverview Provides a comprehensive `Sanitization` class for various input cleaning and validation tasks.
 * This module includes utilities for sanitizing HTML, strings, URLs, file paths, JSON, numbers,
 * and for redacting sensitive information from data intended for logging.
 * @module utils/security/sanitization
 */
import path from "path";
import sanitizeHtml from "sanitize-html";
import validator from "validator";
import { BaseErrorCode, McpError } from "../../types-global/errors.js";
import { logger, requestContextService } from "../index.js"; // Centralized internal imports

/**
 * Defines options for path sanitization to control how file paths are processed and validated.
 * @typedef {object} PathSanitizeOptions
 * @property {string} [rootDir] - If provided, restricts sanitized paths to be relative to this directory, preventing traversal above it.
 * @property {boolean} [toPosix=false] - If true, normalizes Windows-style backslashes (`\\`) to POSIX-style forward slashes (`/`).
 * @property {boolean} [allowAbsolute=false] - If true, absolute paths are permitted (subject to `rootDir` constraints).
 *                                            If false (default), absolute paths are converted to relative paths.
 */
export interface PathSanitizeOptions {
  rootDir?: string;
  toPosix?: boolean;
  allowAbsolute?: boolean;
}

/**
 * Contains information about a path sanitization operation, including the original input,
 * the sanitized path, and details about transformations applied.
 * @typedef {object} SanitizedPathInfo
 * @property {string} sanitizedPath - The final sanitized and normalized path string.
 * @property {string} originalInput - The original path string before any processing.
 * @property {boolean} wasAbsolute - True if the input path was absolute after initial normalization.
 * @property {boolean} convertedToRelative - True if an absolute path was converted to relative due to `allowAbsolute: false`.
 * @property {PathSanitizeOptions} optionsUsed - The effective options used for sanitization, including defaults.
 */
export interface SanitizedPathInfo {
  sanitizedPath: string;
  originalInput: string;
  wasAbsolute: boolean;
  convertedToRelative: boolean;
  optionsUsed: PathSanitizeOptions;
}

/**
 * Defines options for context-specific string sanitization.
 * @typedef {object} SanitizeStringOptions
 * @property {'text' | 'html' | 'attribute' | 'url' | 'javascript'} [context] - The context in which the string will be used, guiding sanitization.
 *                                                                              Note: 'javascript' context is disallowed.
 * @property {string[]} [allowedTags] - Custom allowed HTML tags if `context` is 'html'.
 * @property {Record<string, string[]>} [allowedAttributes] - Custom allowed HTML attributes if `context` is 'html'.
 */
export interface SanitizeStringOptions {
  context?: "text" | "html" | "attribute" | "url" | "javascript";
  allowedTags?: string[];
  allowedAttributes?: Record<string, string[]>;
}

/**
 * Configuration options for HTML sanitization, mirroring `sanitize-html` library options.
 * @typedef {object} HtmlSanitizeConfig
 * @property {string[]} [allowedTags] - An array of allowed HTML tag names.
 * @property {sanitizeHtml.IOptions['allowedAttributes']} [allowedAttributes] - Specifies allowed attributes, either globally or per tag.
 * @property {boolean} [preserveComments=false] - If true, HTML comments are preserved (by adding '!--' to allowedTags).
 * @property {sanitizeHtml.IOptions['transformTags']} [transformTags] - Custom functions to transform tags during sanitization.
 */
export interface HtmlSanitizeConfig {
  allowedTags?: string[];
  allowedAttributes?: sanitizeHtml.IOptions["allowedAttributes"];
  preserveComments?: boolean;
  transformTags?: sanitizeHtml.IOptions["transformTags"];
}

/**
 * A singleton class providing various methods for input sanitization.
 * It aims to protect against common vulnerabilities like XSS, path traversal,
 * and invalid data formats.
 * @class Sanitization
 */
export class Sanitization {
  /**
   * Singleton instance of the Sanitization class.
   * @private
   * @static
   * @type {Sanitization}
   */
  private static instance: Sanitization;

  /**
   * Default list of field names considered sensitive and targeted for redaction during log sanitization.
   * Case-insensitive matching is typically applied to these fields.
   * @private
   * @type {string[]}
   */
  private sensitiveFields: string[] = [
    "password",
    "token",
    "secret",
    "key",
    "apiKey",
    "auth",
    "credential",
    "jwt",
    "ssn",
    "credit",
    "card",
    "cvv",
    "authorization",
  ];

  /**
   * Default configuration for HTML sanitization using the `sanitize-html` library.
   * @private
   * @type {HtmlSanitizeConfig}
   */
  private defaultHtmlSanitizeConfig: HtmlSanitizeConfig = {
    allowedTags: [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "a",
      "ul",
      "ol",
      "li",
      "b",
      "i",
      "strong",
      "em",
      "strike",
      "code",
      "hr",
      "br",
      "div",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "pre",
    ],
    allowedAttributes: {
      a: ["href", "name", "target"],
      img: ["src", "alt", "title", "width", "height"],
      "*": ["class", "id", "style"], // Allow class, id, style on any allowed tag
    },
    preserveComments: false,
  };

  /**
   * Private constructor to enforce the singleton pattern.
   * @private
   */
  private constructor() {
    // Constructor intentionally left blank for singleton.
  }

  /**
   * Retrieves the singleton instance of the `Sanitization` class.
   * @returns {Sanitization} The singleton `Sanitization` instance.
   * @public
   * @static
   */
  public static getInstance(): Sanitization {
    if (!Sanitization.instance) {
      Sanitization.instance = new Sanitization();
    }
    return Sanitization.instance;
  }

  /**
   * Sets or extends the list of field names considered sensitive for log sanitization.
   * Provided fields are added to the existing list, ensuring uniqueness.
   * @param {string[]} fields - An array of field names to add to the sensitive list.
   * @public
   */
  public setSensitiveFields(fields: string[]): void {
    this.sensitiveFields = [
      ...new Set([
        ...this.sensitiveFields,
        ...fields.map((f) => f.toLowerCase()),
      ]),
    ];
    const logContext = requestContextService.createRequestContext({
      operation: "Sanitization.setSensitiveFields",
      newSensitiveFieldCount: this.sensitiveFields.length,
    });
    logger.debug(
      "Updated sensitive fields list for log sanitization",
      logContext,
    );
  }

  /**
   * Gets a copy of the current list of sensitive field names used for log sanitization.
   * @returns {string[]} An array of sensitive field names.
   * @public
   */
  public getSensitiveFields(): string[] {
    return [...this.sensitiveFields];
  }

  /**
   * Sanitizes an HTML string by removing potentially malicious tags and attributes.
   * Uses the `sanitize-html` library with a default or custom configuration.
   * @param {string} input - The HTML string to sanitize.
   * @param {HtmlSanitizeConfig} [config] - Optional custom configuration for `sanitize-html`.
   *                                        Merges with `defaultHtmlSanitizeConfig`.
   * @returns {string} The sanitized HTML string. Returns an empty string if input is falsy.
   * @public
   */
  public sanitizeHtml(input: string, config?: HtmlSanitizeConfig): string {
    if (!input) return "";
    const effectiveConfig = { ...this.defaultHtmlSanitizeConfig, ...config };
    const options: sanitizeHtml.IOptions = {
      allowedTags: effectiveConfig.allowedTags,
      allowedAttributes: effectiveConfig.allowedAttributes,
      transformTags: effectiveConfig.transformTags,
    };
    if (effectiveConfig.preserveComments) {
      options.allowedTags = [...(options.allowedTags || []), "!--"];
    }
    return sanitizeHtml(input, options);
  }

  /**
   * Sanitizes a string based on its intended context (e.g., HTML, URL, text).
   * **Important:** Using `context: 'javascript'` is explicitly disallowed and will throw an `McpError`
   * due to the complexities and risks of JavaScript sanitization.
   *
   * @param {string} input - The string to sanitize.
   * @param {SanitizeStringOptions} [options={}] - Options specifying the sanitization context and any relevant parameters.
   * @returns {string} The sanitized string. Returns an empty string if input is falsy (except for 'javascript' context).
   * @throws {McpError} If `options.context` is 'javascript', or if URL validation fails in 'url' context.
   * @public
   */
  public sanitizeString(
    input: string,
    options: SanitizeStringOptions = {},
  ): string {
    if (!input) return "";

    switch (options.context) {
      case "html":
        return this.sanitizeHtml(input, {
          allowedTags: options.allowedTags,
          allowedAttributes: options.allowedAttributes
            ? this.convertAttributesFormat(options.allowedAttributes)
            : undefined,
        });
      case "attribute": // For HTML attribute values, strip all HTML tags.
        return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
      case "url":
        // Uses validator.isURL for basic validation. For more robust sanitization, use sanitizeUrl.
        if (
          !validator.isURL(input, {
            protocols: ["http", "https"],
            require_protocol: true,
            require_host: true,
          })
        ) {
          const logContext = requestContextService.createRequestContext({
            operation: "Sanitization.sanitizeString.urlWarning",
            invalidUrlAttempt: input,
          });
          logger.warning(
            "Potentially invalid URL detected during string sanitization (context: url)",
            logContext,
          );
          // Return empty or throw, depending on desired strictness. Here, returning empty.
          return "";
        }
        return validator.trim(input); // Basic trim, assumes validator handled major issues.
      case "javascript":
        const logContextJs = requestContextService.createRequestContext({
          operation: "Sanitization.sanitizeString.jsAttempt",
          inputSnippet: input.substring(0, 50),
        });
        logger.error(
          "Attempted JavaScript sanitization via sanitizeString, which is disallowed.",
          logContextJs,
        );
        throw new McpError(
          BaseErrorCode.VALIDATION_ERROR,
          "JavaScript sanitization is not supported through sanitizeString due to security risks.",
        );
      case "text":
      default: // Default to stripping all HTML tags for general text.
        return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
    }
  }

  /**
   * Converts an attribute format from `Record<string, string[]>` to `sanitizeHtml.IOptions['allowedAttributes']`.
   * This is a helper for `sanitizeString` when `context: 'html'`.
   * @param {Record<string, string[]>} attrs - Attributes in the format `{ tagName: ['attr1', 'attr2'] }`.
   * @returns {sanitizeHtml.IOptions['allowedAttributes']} Attributes in the format expected by `sanitize-html`.
   * @private
   */
  private convertAttributesFormat(
    attrs: Record<string, string[]>,
  ): sanitizeHtml.IOptions["allowedAttributes"] {
    return attrs; // sanitize-html directly supports Record<string, string[]> for allowedAttributes
  }

  /**
   * Sanitizes a URL string by validating its format and protocol.
   * Throws an error if the URL is invalid or uses a disallowed protocol (e.g., 'javascript:').
   * @param {string} input - The URL string to sanitize.
   * @param {string[]} [allowedProtocols=['http', 'https']] - An array of allowed URL protocols (e.g., ['http', 'https', 'ftp']).
   * @returns {string} The sanitized and trimmed URL string.
   * @throws {McpError} If the URL is invalid, uses a disallowed protocol, or is malformed.
   * @public
   */
  public sanitizeUrl(
    input: string,
    allowedProtocols: string[] = ["http", "https"],
  ): string {
    try {
      const trimmedInput = input.trim();
      if (
        !validator.isURL(trimmedInput, {
          protocols: allowedProtocols,
          require_protocol: true,
          require_host: true,
        })
      ) {
        throw new Error("Invalid URL format or protocol not in allowed list.");
      }
      // Double-check for javascript: pseudo-protocol, as validator might miss some edge cases or allow it if not explicitly denied.
      if (trimmedInput.toLowerCase().startsWith("javascript:")) {
        throw new Error("JavaScript pseudo-protocol is not allowed in URLs.");
      }
      return trimmedInput;
    } catch (error) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        error instanceof Error
          ? error.message
          : "Invalid or unsafe URL provided.",
        { input },
      );
    }
  }

  /**
   * Sanitizes a file path to prevent path traversal attacks and normalize its format.
   * @param {string} input - The file path string to sanitize.
   * @param {PathSanitizeOptions} [options={}] - Options to control sanitization behavior (e.g., `rootDir`, `toPosix`).
   * @returns {SanitizedPathInfo} An object containing the sanitized path and metadata about the sanitization.
   * @throws {McpError} If the path is invalid (e.g., empty, contains null bytes) or unsafe (e.g., attempts path traversal).
   * @public
   */
  public sanitizePath(
    input: string,
    options: PathSanitizeOptions = {},
  ): SanitizedPathInfo {
    const originalInput = input;
    const effectiveOptions: PathSanitizeOptions = {
      toPosix: options.toPosix ?? false,
      allowAbsolute: options.allowAbsolute ?? false,
      rootDir: options.rootDir ? path.resolve(options.rootDir) : undefined, // Resolve rootDir upfront
    };

    let wasAbsoluteInitially = false;
    let convertedToRelative = false;

    try {
      if (!input || typeof input !== "string") {
        throw new Error("Invalid path input: must be a non-empty string.");
      }
      if (input.includes("\0")) {
        throw new Error("Path contains null byte, which is disallowed.");
      }

      let normalized = path.normalize(input); // Step 1: Normalize (collapses '..', '.', handles slashes)
      wasAbsoluteInitially = path.isAbsolute(normalized);

      if (effectiveOptions.toPosix) {
        normalized = normalized.replace(/\\/g, "/");
      }

      let finalSanitizedPath: string;

      if (effectiveOptions.rootDir) {
        // If path is absolute, resolve it directly. If relative, resolve against rootDir.
        const fullPath = path.resolve(effectiveOptions.rootDir, normalized);

        // Check if the resolved full path is within the root directory
        if (
          !fullPath.startsWith(effectiveOptions.rootDir + path.sep) &&
          fullPath !== effectiveOptions.rootDir
        ) {
          throw new Error(
            "Path traversal detected: attempts to escape the defined root directory.",
          );
        }
        // Make path relative to rootDir for the final output
        finalSanitizedPath = path.relative(effectiveOptions.rootDir, fullPath);
        finalSanitizedPath =
          finalSanitizedPath === "" ? "." : finalSanitizedPath; // Ensure '.' for root itself
        if (
          path.isAbsolute(finalSanitizedPath) &&
          !effectiveOptions.allowAbsolute
        ) {
          // This case should ideally not be hit if logic is correct, but as a safeguard
          throw new Error(
            "Path resolved to absolute outside root when absolute paths are disallowed.",
          );
        }
      } else {
        // No rootDir specified
        if (path.isAbsolute(normalized)) {
          if (!effectiveOptions.allowAbsolute) {
            // Convert to relative by removing leading slash/drive. This is a simple approach.
            finalSanitizedPath = normalized.replace(
              /^(?:[A-Za-z]:)?[/\\]+/,
              "",
            );
            convertedToRelative = true;
          } else {
            finalSanitizedPath = normalized; // Absolute path allowed
          }
        } else {
          // Path is relative, and no rootDir
          // For relative paths without a rootDir, ensure they don't traverse "above" the conceptual CWD.
          // path.resolve will base it on CWD.
          const resolvedAgainstCwd = path.resolve(normalized);
          const currentWorkingDir = path.resolve(".");
          if (
            !resolvedAgainstCwd.startsWith(currentWorkingDir + path.sep) &&
            resolvedAgainstCwd !== currentWorkingDir
          ) {
            throw new Error(
              "Relative path traversal detected (escapes current working directory context).",
            );
          }
          finalSanitizedPath = normalized; // Keep it as a relative path
        }
      }

      return {
        sanitizedPath: finalSanitizedPath,
        originalInput,
        wasAbsolute: wasAbsoluteInitially,
        convertedToRelative:
          wasAbsoluteInitially &&
          !path.isAbsolute(finalSanitizedPath) &&
          !effectiveOptions.allowAbsolute,
        optionsUsed: effectiveOptions,
      };
    } catch (error) {
      const logContext = requestContextService.createRequestContext({
        operation: "Sanitization.sanitizePath.error",
        originalPathInput: originalInput,
        pathOptionsUsed: effectiveOptions,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      logger.warning("Path sanitization error", logContext);

      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        error instanceof Error
          ? error.message
          : "Invalid or unsafe path provided.",
        { input: originalInput },
      );
    }
  }

  /**
   * Sanitizes a JSON string by parsing it to validate its format.
   * Optionally checks if the JSON string exceeds a maximum allowed size.
   * @template T - The expected type of the parsed JSON object. Defaults to `unknown`.
   * @param {string} input - The JSON string to sanitize/validate.
   * @param {number} [maxSize] - Optional maximum allowed size of the JSON string in bytes.
   * @returns {T} The parsed JavaScript object.
   * @throws {McpError} If the input is not a string, is too large, or is not valid JSON.
   * @public
   */
  public sanitizeJson<T = unknown>(input: string, maxSize?: number): T {
    try {
      if (typeof input !== "string") {
        throw new Error("Invalid input: expected a JSON string.");
      }
      if (maxSize !== undefined && Buffer.byteLength(input, "utf8") > maxSize) {
        throw new McpError(
          BaseErrorCode.VALIDATION_ERROR,
          `JSON string exceeds maximum allowed size of ${maxSize} bytes.`,
          { actualSize: Buffer.byteLength(input, "utf8"), maxSize },
        );
      }
      const parsed = JSON.parse(input);
      return parsed as T;
    } catch (error) {
      if (error instanceof McpError) throw error; // Re-throw McpError if already one
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        error instanceof Error ? error.message : "Invalid JSON format.",
        {
          inputPreview:
            input.length > 100 ? `${input.substring(0, 100)}...` : input,
        },
      );
    }
  }

  /**
   * Validates and sanitizes a numeric input. Converts string representations of numbers to actual numbers.
   * If `min` and/or `max` are provided, the number will be clamped to this range.
   * @param {number | string} input - The number or string to validate and sanitize.
   * @param {number} [min] - Minimum allowed value (inclusive).
   * @param {number} [max] - Maximum allowed value (inclusive).
   * @returns {number} The sanitized (and potentially clamped) number.
   * @throws {McpError} If the input is not a valid number, is NaN, or is Infinity.
   * @public
   */
  public sanitizeNumber(
    input: number | string,
    min?: number,
    max?: number,
  ): number {
    let value: number;
    if (typeof input === "string") {
      const trimmedInput = input.trim();
      if (trimmedInput === "" || !validator.isNumeric(trimmedInput)) {
        // Check for empty string after trim
        throw new McpError(
          BaseErrorCode.VALIDATION_ERROR,
          "Invalid number format: input is empty or not numeric.",
          { input },
        );
      }
      value = parseFloat(trimmedInput);
    } else if (typeof input === "number") {
      value = input;
    } else {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        "Invalid input type: expected number or string.",
        { input: String(input) },
      );
    }

    if (isNaN(value) || !isFinite(value)) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        "Invalid number value (NaN or Infinity).",
        { input },
      );
    }

    let clamped = false;
    let originalValueForLog = value; // Store value before clamping for logging
    if (min !== undefined && value < min) {
      value = min;
      clamped = true;
    }
    if (max !== undefined && value > max) {
      value = max;
      clamped = true;
    }
    if (clamped) {
      const logContext = requestContextService.createRequestContext({
        operation: "Sanitization.sanitizeNumber.clamped",
        originalInput: String(input), // Log original input string/number
        parsedValue: originalValueForLog, // Log value after parsing but before clamping
        minValue: min,
        maxValue: max,
        clampedValue: value,
      });
      logger.debug("Number clamped to range.", logContext);
    }
    return value;
  }

  /**
   * Sanitizes an input (typically an object or array) for logging purposes by redacting sensitive fields.
   * It creates a deep clone of the input and replaces values of fields matching `this.sensitiveFields`
   * (case-insensitive substring match) with "[REDACTED]".
   * @param {unknown} input - The input data to sanitize for logging.
   * @returns {unknown} A sanitized (deep cloned) version of the input, safe for logging.
   *                    Returns the original input if it's not an object or array.
   *                    Returns "[Log Sanitization Failed]" if an error occurs during cloning or redaction.
   * @public
   */
  public sanitizeForLogging(input: unknown): unknown {
    try {
      if (!input || typeof input !== "object") {
        // Handles null, undefined, primitives
        return input;
      }

      // structuredClone is generally preferred for deep cloning if available (Node.js >= 17)
      const clonedInput =
        typeof structuredClone === "function"
          ? structuredClone(input)
          : JSON.parse(JSON.stringify(input)); // Fallback for older Node versions or complex objects not supported by structuredClone

      this.redactSensitiveFields(clonedInput);
      return clonedInput;
    } catch (error) {
      const logContext = requestContextService.createRequestContext({
        operation: "Sanitization.sanitizeForLogging.error",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      logger.error(
        "Error during log sanitization, returning placeholder.",
        logContext,
      );
      return "[Log Sanitization Failed]"; // Return a placeholder on error
    }
  }

  /**
   * Recursively traverses an object or array and redacts fields whose keys
   * (case-insensitively) contain any of the strings listed in `this.sensitiveFields`.
   * This method modifies the input object/array in place.
   * @param {unknown} obj - The object or array to redact sensitive fields from.
   * @private
   */
  private redactSensitiveFields(obj: unknown): void {
    if (!obj || typeof obj !== "object") {
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach((item) => {
        // No need to check 'item && typeof item === 'object'' here,
        // redactSensitiveFields itself handles non-object items by returning early.
        this.redactSensitiveFields(item);
      });
      return;
    }

    // It's an object
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = (obj as Record<string, unknown>)[key];
        const lowerKey = key.toLowerCase();
        const isSensitive = this.sensitiveFields.some(
          (field) => lowerKey.includes(field), // sensitiveFields are already lowercased in setSensitiveFields
        );

        if (isSensitive) {
          (obj as Record<string, unknown>)[key] = "[REDACTED]";
        } else if (value && typeof value === "object") {
          // Recurse only if value is an object/array
          this.redactSensitiveFields(value);
        }
      }
    }
  }
}

/**
 * Singleton instance of the `Sanitization` class.
 * Use this instance for all input sanitization tasks.
 * @type {Sanitization}
 */
export const sanitization = Sanitization.getInstance();

/**
 * A convenience function that directly calls `sanitization.sanitizeForLogging`.
 * Sanitizes an input for logging by redacting sensitive fields.
 * @param {unknown} input - The input data to sanitize.
 * @returns {unknown} A sanitized version of the input, safe for logging.
 * @public
 */
export const sanitizeInputForLogging = (input: unknown): unknown =>
  sanitization.sanitizeForLogging(input);
