/**
 * @fileoverview Loads and validates MCP client configuration from a JSON file.
 * This module defines Zod schemas for the configuration structure, provides functions
 * to load configuration from `mcp-config.json`, and retrieves specific server
 * configurations.
 * @module src/mcp-client/client-config/configLoader
 */
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { BaseErrorCode, McpError } from "../../types-global/errors.js";
import {
  logger,
  RequestContext,
  requestContextService,
} from "../../utils/index.js";

// --- Zod Schemas for Configuration Validation ---

/**
 * Zod schema for environment variables passed to an MCP server process.
 * Allows defining specific environment variables for each server.
 * @private
 */
const EnvSchema = z
  .record(z.string())
  .optional()
  .describe(
    "Optional key-value pairs for environment variables specific to the server process.",
  );

/**
 * Zod schema for a single MCP server's configuration entry.
 * Defines the command, arguments, environment variables, and transport type for an MCP server.
 * For HTTP transport, `command` holds the base URL.
 */
export const McpServerConfigEntrySchema = z.object({
  command: z.string().min(1, "Server command or HTTP base URL cannot be empty"),
  args: z
    .array(z.string())
    .default([])
    .describe("Arguments for the server command (stdio transport only)."),
  env: EnvSchema.describe(
    "Optional environment variables for this server (merged with client's env).",
  ),
  transportType: z
    .enum(["stdio", "http"])
    .default("stdio")
    .describe("Communication transport type ('stdio' or 'http')."),
  disabled: z
    .boolean()
    .optional()
    .describe("If true, this server configuration is ignored."),
  autoApprove: z
    .boolean()
    .optional()
    .describe(
      "If true, skip user approval prompts for this server (use with caution).",
    ),
});

/**
 * Represents the configuration for a single MCP server.
 * This type is inferred from the {@link McpServerConfigEntrySchema}.
 */
export type McpServerConfigEntry = z.infer<typeof McpServerConfigEntrySchema>;

/**
 * Zod schema for the root structure of the `mcp-config.json` file.
 * It expects a top-level key `mcpServers` containing a map of server names to their configurations.
 */
export const McpClientConfigFileSchema = z.object({
  mcpServers: z
    .record(McpServerConfigEntrySchema)
    .describe("A map of server names to their configurations."),
});

/**
 * Represents the entire structure of the MCP client configuration file (`mcp-config.json`).
 * This type is inferred from the {@link McpClientConfigFileSchema}.
 */
export type McpClientConfigFile = z.infer<typeof McpClientConfigFileSchema>;

// --- Configuration Loading Logic ---

const __dirname = dirname(fileURLToPath(import.meta.url));
// Path when running from dist: __dirname is .../dist/mcp-client/client-config
// We want to reach: .../src/mcp-client/client-config/mcp-config.json
const primaryConfigPath = join(
  __dirname,
  "../../../src/mcp-client/client-config/mcp-config.json",
);

let loadedConfig: McpClientConfigFile | null = null;
let loadedConfigPath: string | null = null;

/**
 * Loads, validates, and caches the MCP client configuration from `mcp-config.json`.
 * The configuration is validated against {@link McpClientConfigFileSchema}.
 *
 * @param parentContext - Optional parent request context for logging and tracing.
 * @returns The loaded and validated MCP server configurations object.
 * @throws {McpError} If the config file cannot be read, or if parsing or validation fails.
 */
export function loadMcpClientConfig(
  parentContext?: RequestContext | null,
): McpClientConfigFile {
  const context = requestContextService.createRequestContext({
    ...(parentContext ?? {}),
    operation: "loadMcpClientConfig",
  });

  if (loadedConfig && loadedConfigPath) {
    logger.debug(
      `Returning cached MCP client config from: ${loadedConfigPath}`,
      context,
    );
    return loadedConfig;
  }

  let fileContent: string;
  const configPathToLog = primaryConfigPath; // Only attempt to load the primary config

  if (!existsSync(primaryConfigPath)) {
    logger.error(`MCP client config file not found at ${primaryConfigPath}.`, {
      ...context,
      filePath: primaryConfigPath,
    });
    throw new McpError(
      BaseErrorCode.CONFIGURATION_ERROR,
      `MCP client config file not found: ${primaryConfigPath} does not exist.`,
      context,
    );
  }

  logger.info(
    `Attempting to load MCP config from: ${primaryConfigPath}`,
    context,
  );
  try {
    fileContent = readFileSync(primaryConfigPath, "utf-8");
    logger.info(`Successfully read config file: ${primaryConfigPath}`, {
      ...context,
      filePath: configPathToLog,
    });
  } catch (readError) {
    logger.error(
      `Failed to read MCP client config file: ${primaryConfigPath}`,
      {
        ...context,
        filePath: primaryConfigPath,
        error:
          readError instanceof Error ? readError.message : String(readError),
      },
    );
    throw new McpError(
      BaseErrorCode.CONFIGURATION_ERROR,
      `Failed to read MCP client config file ${primaryConfigPath}: ${
        readError instanceof Error ? readError.message : String(readError)
      }`,
      { originalError: readError, ...context },
    );
  }

  try {
    const parsedJson = JSON.parse(fileContent);
    const validationResult = McpClientConfigFileSchema.safeParse(parsedJson);

    if (!validationResult.success) {
      logger.error("MCP client configuration validation failed.", {
        ...context,
        filePath: configPathToLog,
        errors: validationResult.error.errors,
      });
      const errorMessages = validationResult.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("; ");
      // The comment about ErrorHandlerOption was here, removing it.
      throw new Error(`Validation failed: ${errorMessages}`);
    }

    loadedConfig = validationResult.data;
    loadedConfigPath = configPathToLog;

    logger.info(
      `MCP client configuration loaded and validated successfully from: ${loadedConfigPath}`,
      {
        ...context,
        serversFound: Object.keys(loadedConfig.mcpServers).length,
      },
    );
    return loadedConfig;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to parse or validate MCP client configuration", {
      ...context,
      filePath: configPathToLog,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new McpError(
      BaseErrorCode.CONFIGURATION_ERROR,
      `Failed to load/validate MCP client config from ${configPathToLog}: ${errorMessage}`,
      { originalError: error, ...context },
    );
  }
}

/**
 * Retrieves a copy of the configuration entry for a specific MCP server by its name.
 * This function ensures the main configuration is loaded before accessing server details.
 *
 * @param serverName - The name/identifier of the server as defined in the configuration file.
 * @param parentContext - Optional parent request context for consistent logging.
 * @returns A copy of the configuration for the specified server.
 * @throws {McpError} If the main configuration cannot be loaded, or if the specified `serverName` is not found.
 */
export function getMcpServerConfig(
  serverName: string,
  parentContext?: RequestContext | null,
): McpServerConfigEntry {
  const context = requestContextService.createRequestContext({
    ...(parentContext ?? {}),
    operation: "getMcpServerConfig",
    targetServer: serverName,
  });

  const config = loadMcpClientConfig(context);
  const configPath = loadedConfigPath || "unknown (cached or error)";

  const serverConfig = config.mcpServers[serverName];

  if (!serverConfig) {
    logger.error(
      `Configuration for MCP server "${serverName}" not found in ${configPath}.`,
      context,
    );
    throw new McpError(
      BaseErrorCode.CONFIGURATION_ERROR,
      `Configuration for MCP server "${serverName}" not found in ${configPath}.`,
      context, // Pass context to McpError
    );
  }

  logger.debug(
    `Retrieved configuration for server "${serverName}" from ${configPath}`,
    context,
  );
  // Return a deep copy to prevent accidental modification of the cached config
  return JSON.parse(JSON.stringify(serverConfig));
}
