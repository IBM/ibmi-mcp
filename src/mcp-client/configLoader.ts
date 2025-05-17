/**
 * @fileoverview Loads and validates MCP client configuration from JSON files.
 * This module defines Zod schemas for the configuration structure, provides functions
 * to load configuration from `mcp-config.json` (with a fallback to `mcp-config.json.example`),
 * and retrieves specific server configurations.
 * @module src/mcp-client/configLoader
 */
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { BaseErrorCode, McpError } from "../types-global/errors.js";
import {
  logger,
  RequestContext,
  requestContextService,
} from "../utils/index.js";

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
  // disabled: z.boolean().optional().describe("If true, this server configuration is ignored."),
  // autoApprove: z.boolean().optional().describe("If true, skip user approval prompts for this server (use with caution)."),
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
const primaryConfigPath = join(__dirname, "mcp-config.json");
const exampleConfigPath = join(__dirname, "mcp-config.json.example");

let loadedConfig: McpClientConfigFile | null = null;
let loadedConfigPath: string | null = null;

/**
 * Loads, validates, and caches the MCP client configuration from `mcp-config.json`
 * or `mcp-config.json.example`.
 * The configuration is validated against {@link McpClientConfigFileSchema}.
 *
 * @param parentContext - Optional parent request context for logging and tracing.
 * @returns The loaded and validated MCP server configurations object.
 * @throws {McpError} If neither config file can be read, or if parsing or validation fails.
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

  let fileContent: string | null = null;
  let configPathToLog = "";

  if (existsSync(primaryConfigPath)) {
    logger.info(
      `Attempting to load primary MCP config: ${primaryConfigPath}`,
      context,
    );
    try {
      fileContent = readFileSync(primaryConfigPath, "utf-8");
      configPathToLog = primaryConfigPath;
      logger.info(`Successfully read primary config file.`, {
        ...context,
        filePath: configPathToLog,
      });
    } catch (readError) {
      logger.warning(
        `Failed to read primary config file at ${primaryConfigPath}, attempting fallback.`,
        {
          ...context,
          filePath: primaryConfigPath,
          error:
            readError instanceof Error ? readError.message : String(readError),
        },
      );
    }
  } else {
    logger.info(
      `Primary config file not found at ${primaryConfigPath}, attempting fallback.`,
      {
        ...context,
        filePath: primaryConfigPath,
      },
    );
  }

  if (!fileContent) {
    if (existsSync(exampleConfigPath)) {
      logger.info(
        `Attempting to load example MCP config: ${exampleConfigPath}`,
        context,
      );
      try {
        fileContent = readFileSync(exampleConfigPath, "utf-8");
        configPathToLog = exampleConfigPath;
        logger.info(`Successfully read example config file.`, {
          ...context,
          filePath: configPathToLog,
        });
      } catch (readError) {
        logger.error(`Failed to read example config file as well.`, {
          ...context,
          filePath: exampleConfigPath,
          error:
            readError instanceof Error ? readError.message : String(readError),
        });
        throw new McpError(
          BaseErrorCode.CONFIGURATION_ERROR,
          `Failed to read MCP client config: Neither ${primaryConfigPath} nor ${exampleConfigPath} could be read.`,
          { originalError: readError },
        );
      }
    } else {
      logger.error(`Neither primary nor example config file found.`, {
        ...context,
        primaryPath: primaryConfigPath,
        examplePath: exampleConfigPath,
      });
      throw new McpError(
        BaseErrorCode.CONFIGURATION_ERROR,
        `MCP client config file not found: Looked for ${primaryConfigPath} and ${exampleConfigPath}.`,
      );
    }
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
      { originalError: error },
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
    );
  }

  logger.debug(
    `Retrieved configuration for server "${serverName}" from ${configPath}`,
    context,
  );
  return { ...serverConfig }; // Return a copy
}
