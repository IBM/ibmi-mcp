/**
 * @fileoverview Command-line argument parser for MCP server
 * Handles --tools argument and sets environment variables accordingly
 * @module src/utils/cli/argumentParser
 */

import { existsSync, statSync } from "fs";
import { resolve } from "path";

type mcpTransportType = "stdio" | "http";

export interface CliArguments {
  tools?: string;
  transport?: mcpTransportType;
  help?: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 *
 * This function should:
 * 1. Parse process.argv.slice(2) to get command line arguments
 * 2. Look for --tools flag and capture the next argument as the path
 * 3. Look for --help or -h flags
 * 5. Return a CliArguments object with the parsed values
 *
 * Handle edge cases like:
 * - Missing value after --tools
 * - Unknown arguments (should warn but not fail)
 * - Multiple --tools arguments (use the last one)
 */
export function parseCliArguments(): CliArguments {
  const args = process.argv.slice(2);
  const parsed: CliArguments = {
    errors: [],
    warnings: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--tools") {
      if (i + 1 < args.length) {
        const toolsPath = args[i + 1];
        parsed.tools = toolsPath;
        i++; // Skip the next argument as it's the tools path
      } else {
        parsed.errors?.push("--tools flag requires a path argument");
      }
    } else if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--transport" || arg === "-t") {
      if (i + 1 < args.length) {
        const transport = args[i + 1] as mcpTransportType;
        if (transport === "stdio" || transport === "http") {
          parsed.transport = transport;
          i++; // Skip the next argument as it's the transport type
        } else {
          parsed.errors?.push(`Invalid transport type: ${transport}`);
        }
      } else {
        parsed.errors?.push("--transport flag requires a type argument");
      }
    } else if (arg?.startsWith("--")) {
      parsed.warnings?.push(`Unknown argument detected: ${arg}`);
      i++;
    }
  }

  return parsed;
}

/**
 * Validates that a tools path exists and is accessible
 */
export function validateToolsPath(path: string): {
  valid: boolean;
  message?: string;
} {
  try {
    const resolvedPath = resolve(path);

    if (existsSync(resolvedPath)) {
      const stats = statSync(resolvedPath);
      if (stats.isFile()) {
        return {
          valid: true,
          message: `Using tools file: ${resolvedPath}`,
        };
      } else if (stats.isDirectory()) {
        return {
          valid: true,
          message: `Using tools directory: ${resolvedPath}`,
        };
      }
    }

    // For glob patterns or remote paths, let the YAML loader handle validation
    return {
      valid: true,
      message: `Tools path "${path}" will be validated by YAML tools loader`,
    };
  } catch (error) {
    return {
      valid: false,
      message: `Cannot access tools path "${path}": ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Shows help information for CLI usage
 */
export function showHelp(): void {
  console.log(`
IBM i MCP Server

Usage: npx ibmi-mcp-server [options]

Options:
  --tools <path>    Path to YAML tools configuration
                    Supports:
                      - Files: performance.yaml, config.yml
                      - Directories: prebuiltconfigs/, tools/
                      - Globs: "**/*.yaml" (quote for shell safety)
  --transport, -t <type>   Transport type: "stdio" or "http"

  -h, --help        Show this help message

Examples:
  npx ibmi-mcp-server --tools prebuiltconfigs
  npx ibmi-mcp-server --tools prebuiltconfigs/performance.yaml
  npx ibmi-mcp-server --tools ../custom-tools/
  npx ibmi-mcp-server --tools "configs/**/*.yaml"

Environment Variables:
  TOOLS_YAML_PATH         Path to YAML tools (CLI --tools takes precedence)
  MCP_TRANSPORT_TYPE      Transport mode: 'stdio' (default) or 'http'
  MCP_LOG_LEVEL           Log level: debug, info, warning, error
  
  See .env.example for complete environment variable reference.

Note: The server runs in stdio mode by default for MCP client integration.
Use MCP_TRANSPORT_TYPE=http for HTTP mode testing.
`);
}
