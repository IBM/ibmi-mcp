/**
 * @fileoverview Handles registration and error handling for the `generate_sql` tool.
 * This module acts as the "handler" layer, connecting the pure business logic to the
 * MCP server and ensuring all outcomes (success or failure) are handled gracefully.
 * @module src/mcp-server/tools/generateSql/registration
 * @see {@link src/mcp-server/tools/generateSql/logic.ts} for the core business logic and schemas.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JsonRpcErrorCode } from "../../../types-global/errors.js";
import { ErrorHandler, requestContextService } from "../../../utils/index.js";
import {
  logOperationStart,
  logOperationSuccess,
} from "../../../utils/internal/logging-helpers.js";
import {
  createToolHandler,
  ResponseFormatter,
} from "../../../mcp-server/tools/utils/tool-utils.js";
import {
  GenerateSqlInputSchema,
  generateSqlLogic,
  GenerateSqlOutput,
  GenerateSqlOutputSchema,
} from "./logic.js";

// The unique name for the tool, used for registration and identification.
const TOOL_NAME = "generate_sql";

// A concise description for the LLM. More detailed guidance should be in the
// parameter descriptions within the Zod schema in `logic.ts`.
const TOOL_DESCRIPTION =
  "Generates SQL DDL statements for IBM i database objects using QSYS2.GENERATE_SQL.";

const responseFormatter: ResponseFormatter<GenerateSqlOutput> = (
  result: GenerateSqlOutput,
) => ({
  structuredContent: result,
  content: [
    {
      type: "text",
      text: `Successfully generated SQL DDL for ${result.object_type} '${result.object_name}' in library '${result.object_library}':\n\n${result.sql}`,
    },
  ],
});

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

  logOperationStart(registrationContext, `Registering tool: '${TOOL_NAME}'`);

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
        createToolHandler(TOOL_NAME, generateSqlLogic, responseFormatter),
      );

      logOperationSuccess(
        registrationContext,
        `Tool '${TOOL_NAME}' registered successfully.`,
      );
    },
    {
      operation: `RegisteringTool_${TOOL_NAME}`,
      context: registrationContext,
      errorCode: JsonRpcErrorCode.InitializationFailed,
      critical: true, // A failure to register a tool is a critical startup error.
    },
  );
};
