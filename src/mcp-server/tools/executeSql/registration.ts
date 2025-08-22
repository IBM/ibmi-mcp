/**
 * @fileoverview Handles registration and error handling for the `execute_sql` tool.
 * This module acts as the "handler" layer, connecting the pure business logic to the
 * MCP server and ensuring all outcomes (success or failure) are handled gracefully.
 * @module src/mcp-server/tools/executeSql/registration
 * @see {@link src/mcp-server/tools/executeSql/logic.ts} for the core business logic and schemas.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  ErrorHandler,
  logger,
  requestContextService,
} from "../../../utils/index.js";
import {
  ExecuteSqlInput,
  ExecuteSqlInputSchema,
  executeSqlLogic,
  ExecuteSqlResponseSchema,
} from "./logic.js";

// The unique name for the tool, used for registration and identification.
const TOOL_NAME = "execute_sql";

// A concise description for the LLM. More detailed guidance should be in the
// parameter descriptions within the Zod schema in `logic.ts`.
const TOOL_DESCRIPTION = `Execute SQL statements against the IBM i database. Only SELECT and read-only operations are allowed for security.`;

/**
 * Configuration interface for the execute SQL tool
 * This allows the tool to be enabled/disabled and configured via YAML
 */
export interface ExecuteSqlToolConfig {
  /** Whether the tool is enabled */
  enabled: boolean;
  /** Tool description override */
  description?: string;
  /** Security configuration */
  security?: {
    /** Whether to enforce read-only mode (default: true) */
    readOnly?: boolean;
    /** Maximum query length (default: 10000) */
    maxQueryLength?: number;
    /** Additional forbidden keywords */
    forbiddenKeywords?: string[];
  };
}

/**
 * Default configuration for the execute SQL tool
 */
const DEFAULT_CONFIG: ExecuteSqlToolConfig = {
  enabled: true,
  security: {
    readOnly: true,
    maxQueryLength: 10000,
    forbiddenKeywords: [],
  },
};

/**
 * Internal configuration storage
 */
let toolConfig: ExecuteSqlToolConfig = DEFAULT_CONFIG;

/**
 * Set the configuration for the execute SQL tool
 * This is called by the YAML configuration system
 * @param config - Tool configuration
 */
export function setExecuteSqlConfig(
  config: Partial<ExecuteSqlToolConfig>,
): void {
  toolConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    security: {
      ...DEFAULT_CONFIG.security,
      ...config.security,
    },
  };

  logger.info("Execute SQL tool configuration updated", {
    requestId: "config-update",
    timestamp: new Date().toISOString(),
    enabled: toolConfig.enabled,
    readOnly: toolConfig.security?.readOnly,
    maxQueryLength: toolConfig.security?.maxQueryLength,
  });
}

/**
 * Get the current configuration for the execute SQL tool
 * @returns Current tool configuration
 */
export function getExecuteSqlConfig(): ExecuteSqlToolConfig {
  return toolConfig;
}

/**
 * Check if the execute SQL tool is enabled
 * @returns True if the tool is enabled
 */
export function isExecuteSqlEnabled(): boolean {
  return toolConfig.enabled;
}

/**
 * Registers the 'execute_sql' tool and its handler with the provided MCP server instance.
 * This function uses ErrorHandler.tryCatch to ensure that any failure during the
 * registration process itself is caught and logged, preventing server startup failures.
 *
 * @param server - The MCP server instance to register the tool with.
 */
export const registerExecuteSqlTool = async (
  server: McpServer,
): Promise<void> => {
  const registrationContext = requestContextService.createRequestContext({
    operation: "RegisterTool",
    toolName: TOOL_NAME,
  });

  logger.info(`Checking if tool should be registered: '${TOOL_NAME}'`, {
    ...registrationContext,
    enabled: toolConfig.enabled,
  });

  // Only register if the tool is enabled
  if (!toolConfig.enabled) {
    logger.info(
      `Tool '${TOOL_NAME}' is disabled, skipping registration`,
      registrationContext,
    );
    return;
  }

  logger.info(`Registering tool: '${TOOL_NAME}'`, registrationContext);

  await ErrorHandler.tryCatch(
    async () => {
      const description = toolConfig.description || TOOL_DESCRIPTION;

      server.registerTool(
        TOOL_NAME,
        {
          title: "Execute SQL",
          description,
          inputSchema: ExecuteSqlInputSchema.shape,
          outputSchema: ExecuteSqlResponseSchema.shape,
          annotations: {
            readOnlyHint: toolConfig.security?.readOnly, // Default to true for safety
            openWorldHint: !(toolConfig.security?.readOnly ?? true), // Open world if not read-only
            // Additional security annotations
            dangerous: !(toolConfig.security?.readOnly ?? true), // Dangerous if not read-only
            requiresAuth: true, // Requires database authentication
          },
        },
        // This is the runtime handler for the tool.
        async (
          params: ExecuteSqlInput,
          callContext: Record<string, unknown>,
        ) => {
          const handlerContext = requestContextService.createRequestContext({
            parentContext: callContext,
            operation: "HandleToolRequest",
            toolName: TOOL_NAME,
            input: params,
          });

          try {
            // 1. INVOKE the core logic within the try block.
            const result = await executeSqlLogic(params, handlerContext);

            // 2. FORMAT the SUCCESS response.
            return {
              structuredContent: result,
              content: [
                {
                  type: "text",
                  text: `SQL Query executed successfully. Returned ${result.rowCount} rows.\n\n${JSON.stringify(result.data, null, 2)}`,
                },
              ],
            };
          } catch (error) {
            // 3. CATCH and PROCESS any error from the logic
            const mcpError = ErrorHandler.handleError(error, {
              operation: `tool:${TOOL_NAME}`,
              context: handlerContext,
              input: params,
            }) as McpError;

            // 4. FORMAT the ERROR response.
            return {
              isError: true,
              content: [
                { type: "text", text: `SQL Error: ${mcpError.message}` },
              ],
              structuredContent: {
                code: mcpError.code,
                message: mcpError.message,
                details: mcpError.details,
              },
            };
          }
        },
      );

      logger.info(`Tool '${TOOL_NAME}' registered successfully.`, {
        ...registrationContext,
        enabled: toolConfig.enabled,
        readOnly: toolConfig.security?.readOnly,
      });
    },
    {
      operation: `RegisteringTool_${TOOL_NAME}`,
      context: registrationContext,
      errorCode: BaseErrorCode.INITIALIZATION_FAILED,
      critical: true, // A failure to register a tool is a critical startup error.
    },
  );
};
