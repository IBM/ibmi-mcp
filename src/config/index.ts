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
 * @module src/config/index
 */

import dotenv from "dotenv";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(__dirname, "../../package.json");
let pkg = { name: "mcp-ts-template", version: "0.0.0" };

try {
  pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
} catch (error) {
  if (process.stdout.isTTY) {
    console.error(
      "Warning: Could not read package.json for default config values. Using hardcoded defaults.",
      error,
    );
  }
}

/**
 * Zod schema for validating environment variables.
 * Provides type safety, validation, defaults, and clear error messages.
 * @private
 */
const EnvSchema = z.object({
  /** Optional. The desired name for the MCP server. Defaults to `package.json` name. */
  MCP_SERVER_NAME: z.string().optional(),
  /** Optional. The version of the MCP server. Defaults to `package.json` version. */
  MCP_SERVER_VERSION: z.string().optional(),
  /** Minimum logging level. See `McpLogLevel` in logger utility. Default: "debug". */
  MCP_LOG_LEVEL: z.string().default("debug"),
  /** Runtime environment (e.g., "development", "production"). Default: "development". */
  NODE_ENV: z.string().default("development"),
  /** MCP communication transport ("stdio" or "http"). Default: "stdio". */
  MCP_TRANSPORT_TYPE: z.enum(["stdio", "http"]).default("stdio"),
  /** HTTP server port (if MCP_TRANSPORT_TYPE is "http"). Default: 3010. */
  MCP_HTTP_PORT: z.coerce.number().int().positive().default(3010),
  /** HTTP server host (if MCP_TRANSPORT_TYPE is "http"). Default: "127.0.0.1". */
  MCP_HTTP_HOST: z.string().default("127.0.0.1"),
  /** Optional. Comma-separated allowed origins for CORS (HTTP transport). */
  MCP_ALLOWED_ORIGINS: z.string().optional(),
  /** Optional. Secret key (min 32 chars) for auth tokens (HTTP transport). CRITICAL for production. */
  MCP_AUTH_SECRET_KEY: z
    .string()
    .min(
      32,
      "MCP_AUTH_SECRET_KEY must be at least 32 characters long for security reasons.",
    )
    .optional(),

  /** Optional. Application URL for OpenRouter integration. */
  OPENROUTER_APP_URL: z
    .string()
    .url("OPENROUTER_APP_URL must be a valid URL (e.g., http://localhost:3000)")
    .optional(),
  /** Optional. Application name for OpenRouter. Defaults to MCP_SERVER_NAME or package name. */
  OPENROUTER_APP_NAME: z.string().optional(),
  /** Optional. API key for OpenRouter services. */
  OPENROUTER_API_KEY: z.string().optional(),
  /** Default LLM model. Default: "google/gemini-2.5-flash-preview:thinking". */
  LLM_DEFAULT_MODEL: z
    .string()
    .default("google/gemini-2.5-flash-preview:thinking"),
  /** Optional. Default LLM temperature (0.0-2.0). */
  LLM_DEFAULT_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
  /** Optional. Default LLM top_p (0.0-1.0). */
  LLM_DEFAULT_TOP_P: z.coerce.number().min(0).max(1).optional(),
  /** Optional. Default LLM max tokens (positive integer). */
  LLM_DEFAULT_MAX_TOKENS: z.coerce.number().int().positive().optional(),
  /** Optional. Default LLM top_k (non-negative integer). */
  LLM_DEFAULT_TOP_K: z.coerce.number().int().nonnegative().optional(),
  /** Optional. Default LLM min_p (0.0-1.0). */
  LLM_DEFAULT_MIN_P: z.coerce.number().min(0).max(1).optional(),

  /** Optional. OAuth provider authorization endpoint URL. */
  OAUTH_PROXY_AUTHORIZATION_URL: z
    .string()
    .url("OAUTH_PROXY_AUTHORIZATION_URL must be a valid URL.")
    .optional(),
  /** Optional. OAuth provider token endpoint URL. */
  OAUTH_PROXY_TOKEN_URL: z
    .string()
    .url("OAUTH_PROXY_TOKEN_URL must be a valid URL.")
    .optional(),
  /** Optional. OAuth provider revocation endpoint URL. */
  OAUTH_PROXY_REVOCATION_URL: z
    .string()
    .url("OAUTH_PROXY_REVOCATION_URL must be a valid URL.")
    .optional(),
  /** Optional. OAuth provider issuer URL. */
  OAUTH_PROXY_ISSUER_URL: z
    .string()
    .url("OAUTH_PROXY_ISSUER_URL must be a valid URL.")
    .optional(),
  /** Optional. OAuth service documentation URL. */
  OAUTH_PROXY_SERVICE_DOCUMENTATION_URL: z
    .string()
    .url("OAUTH_PROXY_SERVICE_DOCUMENTATION_URL must be a valid URL.")
    .optional(),
  /** Optional. Comma-separated default OAuth client redirect URIs. */
  OAUTH_PROXY_DEFAULT_CLIENT_REDIRECT_URIS: z.string().optional(),
});

const parsedEnv = EnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  if (process.stdout.isTTY) {
    console.error(
      "❌ Invalid environment variables found:",
      parsedEnv.error.flatten().fieldErrors,
    );
  }
  // Consider throwing an error in production for critical misconfigurations.
}

const env = parsedEnv.success ? parsedEnv.data : EnvSchema.parse({});

/**
 * Main application configuration object.
 * Aggregates settings from validated environment variables and `package.json`.
 */
export const config = {
  /** MCP server name. Env `MCP_SERVER_NAME` > `package.json` name > "mcp-ts-template". */
  mcpServerName: env.MCP_SERVER_NAME || pkg.name,
  /** MCP server version. Env `MCP_SERVER_VERSION` > `package.json` version > "0.0.0". */
  mcpServerVersion: env.MCP_SERVER_VERSION || pkg.version,
  /** Logging level. From `MCP_LOG_LEVEL` env var. Default: "debug". */
  logLevel: env.MCP_LOG_LEVEL,
  /** Runtime environment. From `NODE_ENV` env var. Default: "development". */
  environment: env.NODE_ENV,
  /** MCP transport type ('stdio' or 'http'). From `MCP_TRANSPORT_TYPE` env var. Default: "stdio". */
  mcpTransportType: env.MCP_TRANSPORT_TYPE,
  /** HTTP server port (if http transport). From `MCP_HTTP_PORT` env var. Default: 3010. */
  mcpHttpPort: env.MCP_HTTP_PORT,
  /** HTTP server host (if http transport). From `MCP_HTTP_HOST` env var. Default: "127.0.0.1". */
  mcpHttpHost: env.MCP_HTTP_HOST,
  /** Array of allowed CORS origins (http transport). From `MCP_ALLOWED_ORIGINS` (comma-separated). */
  mcpAllowedOrigins: env.MCP_ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  /** Auth secret key (JWTs, http transport). From `MCP_AUTH_SECRET_KEY`. CRITICAL. */
  mcpAuthSecretKey: env.MCP_AUTH_SECRET_KEY,

  /** OpenRouter App URL. From `OPENROUTER_APP_URL`. Default: "http://localhost:3000". */
  openrouterAppUrl: env.OPENROUTER_APP_URL || "http://localhost:3000",
  /** OpenRouter App Name. From `OPENROUTER_APP_NAME`. Defaults to `mcpServerName`. */
  openrouterAppName: env.OPENROUTER_APP_NAME || pkg.name || "MCP TS App",
  /** OpenRouter API Key. From `OPENROUTER_API_KEY`. */
  openrouterApiKey: env.OPENROUTER_API_KEY,
  /** Default LLM model. From `LLM_DEFAULT_MODEL`. */
  llmDefaultModel: env.LLM_DEFAULT_MODEL,
  /** Default LLM temperature. From `LLM_DEFAULT_TEMPERATURE`. */
  llmDefaultTemperature: env.LLM_DEFAULT_TEMPERATURE,
  /** Default LLM top_p. From `LLM_DEFAULT_TOP_P`. */
  llmDefaultTopP: env.LLM_DEFAULT_TOP_P,
  /** Default LLM max tokens. From `LLM_DEFAULT_MAX_TOKENS`. */
  llmDefaultMaxTokens: env.LLM_DEFAULT_MAX_TOKENS,
  /** Default LLM top_k. From `LLM_DEFAULT_TOP_K`. */
  llmDefaultTopK: env.LLM_DEFAULT_TOP_K,
  /** Default LLM min_p. From `LLM_DEFAULT_MIN_P`. */
  llmDefaultMinP: env.LLM_DEFAULT_MIN_P,

  /** OAuth Proxy configurations. Undefined if no related env vars are set. */
  oauthProxy:
    env.OAUTH_PROXY_AUTHORIZATION_URL ||
    env.OAUTH_PROXY_TOKEN_URL ||
    env.OAUTH_PROXY_REVOCATION_URL ||
    env.OAUTH_PROXY_ISSUER_URL ||
    env.OAUTH_PROXY_SERVICE_DOCUMENTATION_URL ||
    env.OAUTH_PROXY_DEFAULT_CLIENT_REDIRECT_URIS
      ? {
          authorizationUrl: env.OAUTH_PROXY_AUTHORIZATION_URL,
          tokenUrl: env.OAUTH_PROXY_TOKEN_URL,
          revocationUrl: env.OAUTH_PROXY_REVOCATION_URL,
          issuerUrl: env.OAUTH_PROXY_ISSUER_URL,
          serviceDocumentationUrl: env.OAUTH_PROXY_SERVICE_DOCUMENTATION_URL,
          defaultClientRedirectUris:
            env.OAUTH_PROXY_DEFAULT_CLIENT_REDIRECT_URIS?.split(",")
              .map((uri) => uri.trim())
              .filter(Boolean),
        }
      : undefined,
};

/**
 * Configured logging level for the application.
 * Exported for convenience.
 */
export const logLevel: string = config.logLevel;

/**
 * Configured runtime environment ("development", "production", etc.).
 * Exported for convenience.
 */
export const environment: string = config.environment;
