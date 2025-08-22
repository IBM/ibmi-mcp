/**
 * @fileoverview Configuration resolver that combines base config with CLI arguments
 * Implements configuration precedence: CLI arguments > environment variables > defaults
 *
 * @module src/config/resolver
 */

import { config } from "./index.js";
import type { CliArguments } from "../utils/cli/argumentParser.js";

// Extract the config type from the existing config object
type BaseConfig = typeof config;

// Create a resolved configuration type that includes the CLI-overridable fields
export interface ResolvedConfig extends Omit<BaseConfig, "mcpTransportType"> {
  toolsYamlPath: string | undefined;
  mcpTransportType: "stdio" | "http";
}

/**
 * Resolves the final configuration by combining base config with CLI arguments
 * CLI arguments take precedence over environment variables and defaults
 *
 * @param cliArgs - Parsed CLI arguments
 * @returns Resolved configuration with CLI precedence applied
 */
export function resolveConfiguration(cliArgs: CliArguments): ResolvedConfig {
  // Start with base config as foundation
  const resolvedConfig: ResolvedConfig = {
    ...config,
    // Apply CLI argument precedence for specific fields
    toolsYamlPath:
      cliArgs.tools || process.env.TOOLS_YAML_PATH || config.toolsYamlPath,
    mcpTransportType:
      cliArgs.transport ||
      (config.mcpTransportType as "stdio" | "http") ||
      "stdio",
  };

  return resolvedConfig;
}
