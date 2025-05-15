/**
 * @fileoverview Loads, validates, and exports application configuration.
 * This module centralizes configuration management, sourcing values from
 * environment variables and `package.json`. It uses Zod for schema validation
 * to ensure type safety and correctness of configuration parameters.
 *
 * Key responsibilities:
 * - Load environment variables from a `.env` file.
 * - Read `package.json` for default server name and version.
 * - Define a Zod schema for all expected environment variables.
 * - Validate environment variables against the schema.
 * - Construct and export a comprehensive `config` object.
 * - Export individual configuration values like `logLevel` and `environment` for convenience.
 *
 * @module config/index
 */

import dotenv from "dotenv";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

// Load environment variables from .env file at the earliest stage.
// dotenv.config() will read the .env file in the root of the project,
// parse its contents, and assign them to process.env.
dotenv.config();

// --- Determine Package Information ---
// Get the directory name of the current module using ES module equivalents.
// import.meta.url gives the URL of the current module file.
// fileURLToPath converts this file URL to an absolute path.
// dirname gets the directory part of that path.
const __dirname = dirname(fileURLToPath(import.meta.url));

// Construct the absolute path to package.json, assuming it's two levels up from this config file.
// This makes the path resolution robust to where the script is run from.
const pkgPath = join(__dirname, "../../package.json");

// Default package information to be used if package.json is unreadable or missing.
// This prevents the application from crashing if package.json is not found.
let pkg = { name: "mcp-ts-template", version: "0.0.0" };

try {
  // Attempt to read and parse package.json to get actual server name and version.
  // These values can serve as defaults if not overridden by environment variables.
  pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
} catch (error) {
  // Silently use default pkg info if reading fails.
  // In a production environment, more robust error handling or logging might be desired.
  // For example, logging this error to a file or a monitoring service.
  if (process.stdout.isTTY) {
    // Guarded console.error: Only log to console if it's an interactive terminal.
    // This avoids polluting stdout/stderr in scripted environments.
    console.error(
      "Warning: Could not read package.json for default config values. Using hardcoded defaults.",
      error,
    );
  }
}

// --- Define Environment Variable Schema ---
// Zod schema for validating environment variables. This provides:
// 1. Type safety: Ensures variables are of the expected type.
// 2. Validation: Checks for required fields, min/max values, formats (e.g., URL).
// 3. Defaults: Provides default values for optional variables.
// 4. Clear error messages: Zod's error reporting is helpful for debugging.
const EnvSchema = z.object({
  /**
   * Optional. The desired name for the MCP server.
   * If not set, the 'name' field from `package.json` will be used.
   * @type {string | undefined}
   */
  MCP_SERVER_NAME: z.string().optional(),
  /**
   * Optional. The version of the MCP server.
   * If not set, the 'version' field from `package.json` will be used.
   * @type {string | undefined}
   */
  MCP_SERVER_VERSION: z.string().optional(),
  /**
   * The minimum logging level for the application.
   * Affects both file logging and MCP notifications.
   * See `McpLogLevel` in logger utility for possible values.
   * @type {string}
   * @default "info"
   */
  MCP_LOG_LEVEL: z.string().default("debug"), // Forced to debug for testing
  /**
   * The runtime environment of the application (e.g., "development", "production", "test").
   * @type {string}
   * @default "development"
   */
  NODE_ENV: z.string().default("development"),
  /**
   * Specifies the transport mechanism for MCP communication.
   * - "stdio": Uses standard input/output.
   * - "http": Uses HTTP (typically with Server-Sent Events).
   * @type {"stdio" | "http"}
   * @default "stdio"
   */
  MCP_TRANSPORT_TYPE: z.enum(["stdio", "http"]).default("stdio"),
  /**
   * The port number for the HTTP server to listen on.
   * Only applicable if `MCP_TRANSPORT_TYPE` is "http".
   * Must be a positive integer.
   * @type {number}
   * @default 3010
   */
  MCP_HTTP_PORT: z.coerce.number().int().positive().default(3010),
  /**
   * The host address for the HTTP server to bind to.
   * Only applicable if `MCP_TRANSPORT_TYPE` is "http".
   * @type {string}
   * @default "127.0.0.1" (localhost)
   */
  MCP_HTTP_HOST: z.string().default("127.0.0.1"),
  /**
   * Optional. A comma-separated string of allowed origins for CORS (Cross-Origin Resource Sharing)
   * when `MCP_TRANSPORT_TYPE` is "http". E.g., "http://localhost:8080,https://my-frontend.com".
   * If not set, the HTTP transport layer might enforce stricter default CORS policies.
   * @type {string | undefined}
   */
  MCP_ALLOWED_ORIGINS: z.string().optional(),
  /**
   * Optional but **HIGHLY RECOMMENDED for HTTP transport in production**.
   * A secret key (minimum 32 characters) used for signing and verifying authentication tokens (e.g., JWTs).
   * If not set for HTTP transport, the authentication middleware should ideally prevent startup in production.
   * @type {string | undefined}
   */
  MCP_AUTH_SECRET_KEY: z
    .string()
    .min(
      32,
      "MCP_AUTH_SECRET_KEY must be at least 32 characters long for security reasons.",
    )
    .optional(),

  // --- OpenRouter and LLM Specific Configurations ---
  /**
   * Optional. The application URL for OpenRouter integration, typically your frontend URL.
   * Used for constructing callback URLs or identifying the application.
   * @type {string | undefined}
   */
  OPENROUTER_APP_URL: z
    .string()
    .url("OPENROUTER_APP_URL must be a valid URL (e.g., http://localhost:3000)")
    .optional(),
  /**
   * Optional. The application name for OpenRouter integration.
   * Defaults to the `MCP_SERVER_NAME` or `package.json` name if not set.
   * @type {string | undefined}
   */
  OPENROUTER_APP_NAME: z.string().optional(),
  /**
   * Optional. The API key for accessing OpenRouter services.
   * If not provided, features requiring OpenRouter authentication will be disabled or may fail.
   * @type {string | undefined}
   */
  OPENROUTER_API_KEY: z.string().optional(),
  /**
   * The default language model to be used for LLM operations if not specified otherwise.
   * The format is typically `provider/model-name:version-tag`.
   * @type {string}
   * @default "google/gemini-2.5-flash-preview:thinking"
   */
  LLM_DEFAULT_MODEL: z
    .string()
    .default("google/gemini-2.5-flash-preview:thinking"), // Example model
  /**
   * Optional. The default temperature for LLM sampling (controls randomness).
   * Must be between 0.0 and 2.0.
   * @type {number | undefined}
   */
  LLM_DEFAULT_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
  /**
   * Optional. The default top_p for LLM sampling (nucleus sampling).
   * Must be between 0.0 and 1.0.
   * @type {number | undefined}
   */
  LLM_DEFAULT_TOP_P: z.coerce.number().min(0).max(1).optional(),
  /**
   * Optional. The default maximum number of tokens to generate in LLM responses.
   * Must be a positive integer.
   * @type {number | undefined}
   */
  LLM_DEFAULT_MAX_TOKENS: z.coerce.number().int().positive().optional(),
  /**
   * Optional. The default top_k for LLM sampling.
   * Must be a non-negative integer (0 means it's not used).
   * @type {number | undefined}
   */
  LLM_DEFAULT_TOP_K: z.coerce.number().int().nonnegative().optional(),
  /**
   * Optional. The default min_p for LLM sampling.
   * Must be between 0.0 and 1.0.
   * @type {number | undefined}
   */
  LLM_DEFAULT_MIN_P: z.coerce.number().min(0).max(1).optional(),
});

// --- Parse and Validate Environment Variables ---
// `safeParse` attempts to parse `process.env` against `EnvSchema`.
// It returns a result object indicating success or failure, along with parsed data or error details.
const parsedEnv = EnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  // If parsing fails, log the specific validation errors to the console if it's an interactive TTY.
  // This helps developers quickly identify misconfigured environment variables.
  if (process.stdout.isTTY) {
    console.error(
      "❌ Invalid environment variables found:",
      // `flatten().fieldErrors` provides a user-friendly structure of errors per field.
      parsedEnv.error.flatten().fieldErrors,
    );
  }
  // Decision point: How to handle invalid configuration?
  // - For critical configurations (e.g., database URL in production), throwing an error and exiting is safer.
  // - For less critical ones, or in development, proceeding with defaults (as done here) might be acceptable.
  // This template currently logs the error and attempts to use defaults.
  // Consider `throw new Error("Invalid or missing critical environment configuration.");` for production.
}

// If parsing was successful, use `parsedEnv.data`.
// Otherwise, `EnvSchema.parse({})` will parse an empty object, effectively applying all default values
// defined in the schema. This ensures `env` is always a valid object according to `EnvSchema`.
const env = parsedEnv.success ? parsedEnv.data : EnvSchema.parse({});

/**
 * Main application configuration object.
 * This object aggregates settings from validated environment variables (`env`)
 * and `package.json` (`pkg`), providing a single source of truth for configuration
 * throughout the application.
 *
 * @constant {object} config
 */
export const config = {
  /**
   * The name of the MCP server.
   * Prioritizes the `MCP_SERVER_NAME` environment variable.
   * If `MCP_SERVER_NAME` is not set, it falls back to the `name` property from `package.json`.
   * If `package.json` is also unavailable, it uses the hardcoded default 'mcp-ts-template'.
   * @type {string}
   */
  mcpServerName: env.MCP_SERVER_NAME || pkg.name,

  /**
   * The version of the MCP server.
   * Prioritizes the `MCP_SERVER_VERSION` environment variable.
   * If `MCP_SERVER_VERSION` is not set, it falls back to the `version` property from `package.json`.
   * If `package.json` is also unavailable, it uses the hardcoded default '0.0.0'.
   * @type {string}
   */
  mcpServerVersion: env.MCP_SERVER_VERSION || pkg.version,

  /**
   * Logging level for the application (e.g., "debug", "info", "warning", "error").
   * Sourced from the `MCP_LOG_LEVEL` environment variable.
   * Defaults to "info" if `MCP_LOG_LEVEL` is not set (as defined in `EnvSchema`).
   * @type {string}
   */
  logLevel: env.MCP_LOG_LEVEL,

  /**
   * The runtime environment of the application (e.g., "development", "production").
   * Sourced from the `NODE_ENV` environment variable.
   * Defaults to "development" if `NODE_ENV` is not set (as defined in `EnvSchema`).
   * @type {string}
   */
  environment: env.NODE_ENV,

  /**
   * Specifies the transport mechanism for MCP server communication ('stdio' or 'http').
   * Sourced from the `MCP_TRANSPORT_TYPE` environment variable.
   * Defaults to "stdio" if `MCP_TRANSPORT_TYPE` is not set (as defined in `EnvSchema`).
   * @type {"stdio" | "http"}
   */
  mcpTransportType: env.MCP_TRANSPORT_TYPE,

  /**
   * The port number for the HTTP server to listen on.
   * Only applicable if `mcpTransportType` is 'http'.
   * Sourced from the `MCP_HTTP_PORT` environment variable.
   * Defaults to 3010 if `MCP_HTTP_PORT` is not set (as defined in `EnvSchema`).
   * @type {number}
   */
  mcpHttpPort: env.MCP_HTTP_PORT,

  /**
   * The host address for the HTTP server to bind to (e.g., "127.0.0.1", "0.0.0.0").
   * Only applicable if `mcpTransportType` is 'http'.
   * Sourced from the `MCP_HTTP_HOST` environment variable.
   * Defaults to "127.0.0.1" if `MCP_HTTP_HOST` is not set (as defined in `EnvSchema`).
   * @type {string}
   */
  mcpHttpHost: env.MCP_HTTP_HOST,

  /**
   * An array of allowed origins for CORS requests when using the 'http' transport.
   * Derived from the `MCP_ALLOWED_ORIGINS` environment variable (comma-separated string).
   * Each origin string is trimmed. Empty strings resulting from multiple commas are filtered out.
   * If `MCP_ALLOWED_ORIGINS` is not set, this will be `undefined`.
   * The HTTP transport layer should handle the `undefined` case appropriately (e.g., by applying default CORS policies).
   * @type {string[] | undefined}
   */
  mcpAllowedOrigins: env.MCP_ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim()) // Trim whitespace from each origin
    .filter(Boolean), // Remove any empty strings that might result from "foo,,bar"

  /**
   * The secret key used for signing and verifying authentication tokens (e.g., JWTs).
   * This is critical for securing the HTTP transport if authentication is enabled.
   * Sourced from the `MCP_AUTH_SECRET_KEY` environment variable.
   * It's crucial that this key is kept confidential and is sufficiently complex.
   * The `EnvSchema` enforces a minimum length of 32 characters.
   * If not set, this will be `undefined`. The authentication middleware should handle this,
   * potentially throwing an error if it's required but missing, especially in production.
   * @type {string | undefined}
   */
  mcpAuthSecretKey: env.MCP_AUTH_SECRET_KEY,

  // --- OpenRouter and LLM Specific Properties ---
  /**
   * The application URL for OpenRouter integration.
   * Defaults to "http://localhost:3000" if `OPENROUTER_APP_URL` is not set.
   * @type {string}
   */
  openrouterAppUrl: env.OPENROUTER_APP_URL || "http://localhost:3000",
  /**
   * The application name for OpenRouter integration.
   * Defaults to `mcpServerName` (which itself defaults to `pkg.name` or "MCP TS App") if `OPENROUTER_APP_NAME` is not set.
   * @type {string}
   */
  openrouterAppName: env.OPENROUTER_APP_NAME || pkg.name || "MCP TS App",
  /**
   * The API key for OpenRouter services.
   * Sourced from `OPENROUTER_API_KEY` environment variable. No default is provided here;
   * the service using this key should handle its absence (e.g., by disabling features or erroring).
   * @type {string | undefined}
   */
  openrouterApiKey: env.OPENROUTER_API_KEY,
  /**
   * Default model for LLM operations.
   * @type {string}
   */
  llmDefaultModel: env.LLM_DEFAULT_MODEL,
  /**
   * Default temperature for LLM sampling.
   * @type {number | undefined}
   */
  llmDefaultTemperature: env.LLM_DEFAULT_TEMPERATURE,
  /**
   * Default top_p for LLM sampling.
   * @type {number | undefined}
   */
  llmDefaultTopP: env.LLM_DEFAULT_TOP_P,
  /**
   * Default maximum tokens for LLM responses.
   * @type {number | undefined}
   */
  llmDefaultMaxTokens: env.LLM_DEFAULT_MAX_TOKENS,
  /**
   * Default top_k for LLM sampling.
   * @type {number | undefined}
   */
  llmDefaultTopK: env.LLM_DEFAULT_TOP_K,
  /**
   * Default min_p for LLM sampling.
   * @type {number | undefined}
   */
  llmDefaultMinP: env.LLM_DEFAULT_MIN_P,

  // Note: MCP Client specific configuration (e.g., for connecting to other MCP servers)
  // is typically loaded separately, for instance, via `src/mcp-client/configLoader.ts`
  // or a similar mechanism, as it might involve more complex structures or multiple client profiles.

  // Note: Logger-specific configurations that are internal to the logger utility
  // (e.g., LOG_FILE_PATH, LOG_MAX_FILES, log rotation settings) are generally handled
  // directly within the logger utility itself (e.g., `src/utils/internal/logger.ts`)
  // rather than being exposed in this global application config object, unless they
  // need to be dynamically configurable via environment variables at this top level.
};

/**
 * The configured logging level for the application (e.g., "debug", "info").
 * This is exported separately from the main `config` object for convenience,
 * allowing direct import where only the log level is needed (e.g., during logger initialization).
 * @type {string}
 */
export const logLevel: string = config.logLevel;

/**
 * The configured runtime environment for the application (e.g., "development", "production").
 * Exported separately for convenience, useful for conditional logic based on the environment.
 * @type {string}
 */
export const environment: string = config.environment;

// Final reminder: Logger initialization and any validation logic that depends on the fully
// constructed `config` object should typically occur at the application's main entry point
// (e.g., `src/index.ts`) after this configuration module has been imported and processed.
