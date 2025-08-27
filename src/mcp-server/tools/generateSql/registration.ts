/**
 * @fileoverview Handles registration and error handling for the `generate_sql` tool.
 * This module acts as the "handler" layer, connecting the pure business logic to the
 * MCP server and ensuring all outcomes (success or failure) are handled gracefully.
 * @module src/mcp-server/tools/generateSql/registration
 * @see {@link src/mcp-server/tools/generateSql/logic.ts} for the core business logic and schemas.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  ErrorHandler,
  logger,
  requestContextService,
} from "../../../utils/index.js";
import {
  GenerateSqlInput,
  GenerateSqlInputSchema,
  generateSqlLogic,
  GenerateSqlOutputSchema,
} from "./logic.js";

// The unique name for the tool, used for registration and identification.
const TOOL_NAME = "generate_sql";

// A concise description for the LLM. More detailed guidance should be in the
// parameter descriptions within the Zod schema in `logic.ts`.
const TOOL_DESCRIPTION = `Generates SQL DDL statements for IBM i database objects using QSYS2.GENERATE_SQL.`;

/**
 * Registers the 'generate_sql' tool and its handler with the provided MCP server instance.
 * This function uses ErrorHandler.tryCatch to ensure that any failure during the
 * registration process itself is caught and logged, preventing server startup failures.
 *
 * @param server - The MCP server instance to register the tool with.
 */
export const registerGenerateSqlTool = async (
  server: McpServer,
): Promise<void> => {
  const registrationContext = requestContextService.createRequestContext({
    operation: "RegisterTool",
    toolName: TOOL_NAME,
  });

  logger.info(`Registering tool: '${TOOL_NAME}'`, registrationContext);

  await ErrorHandler.tryCatch(
    async () => {
      server.registerTool(
        TOOL_NAME,
        {
          title: "Generate SQL DDL",
          description: TOOL_DESCRIPTION,
          inputSchema: GenerateSqlInputSchema.shape,
          outputSchema: GenerateSqlOutputSchema.shape,
          annotations: {
            readOnlyHint: false, // This tool generates DDL which could be used for schema changes
            openWorldHint: false, // This tool interacts with the IBM i database system
          },
        },
        // This is the runtime handler for the tool.
        async (
          params: GenerateSqlInput,
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
            const result = await generateSqlLogic(params, handlerContext);

            // 2. FORMAT the SUCCESS response.
            return {
              structuredContent: result,
              content: [
                {
                  type: "text",
                  text: `Successfully generated SQL DDL for ${result.object_type} '${result.object_name}' in library '${result.object_library}':\n\n${result.sql}`,
                },
              ],
            };
          } catch (error) {
            // 3. CATCH and PROCESS any error from the logic layer.
            const mcpError = ErrorHandler.handleError(error, {
              operation: `tool:${TOOL_NAME}`,
              context: handlerContext,
              input: params,
            }) as McpError;

            // 4. FORMAT the ERROR response.
            return {
              isError: true,
              content: [{ type: "text", text: `Error: ${mcpError.message}` }],
              structuredContent: {
                code: mcpError.code,
                message: mcpError.message,
                details: mcpError.details,
              },
            };
          }
        },
      );

      logger.info(
        `Tool '${TOOL_NAME}' registered successfully.`,
        registrationContext,
      );
    },
    {
      operation: `RegisteringTool_${TOOL_NAME}`,
      context: registrationContext,
      errorCode: BaseErrorCode.INITIALIZATION_FAILED,
      critical: true, // A failure to register a tool is a critical startup error.
    },
  );
};
