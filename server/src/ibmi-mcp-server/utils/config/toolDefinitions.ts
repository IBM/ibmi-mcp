/**
 * @fileoverview Defines the standard structure for a declarative tool definition.
 * This interface ensures that all tools provide the necessary metadata (name, schemas)
 * and logic in a consistent, self-contained format, aligned with MCP specifications.
 * @module src/mcp-server/tools/utils/toolDefinition
 */
import {
  CallToolResult,
  type ContentBlock,
} from "@modelcontextprotocol/sdk/types.js";
import { z, type ZodObject, type ZodRawShape } from "zod";

import type { RequestContext } from "@/utils/index.js";
import {
  ErrorHandler,
  getRequestContext,
  measureToolExecution,
  requestContextService,
  withRequestContext,
} from "@/utils/internal/index.js";
import { JsonRpcErrorCode, McpError } from "@/types-global/errors.js";

// Import shared schemas from centralized location
import {
  StandardSqlToolOutputSchema,
  ToolAnnotations,
  StandardSqlToolOutput,
} from "@/ibmi-mcp-server/schemas/index.js";

/**
 * Represents the complete, self-contained definition of an MCP tool.
 */
export interface ToolDefinition<
  TInputSchema extends ZodObject<ZodRawShape>,
  TOutputSchema extends ZodObject<ZodRawShape>,
> {
  /**
   * The programmatic, unique name for the tool (e.g., 'echo_message').
   */
  name: string;
  /**
   * An optional, human-readable title for the tool. This is preferred for display in UIs.
   * If not provided, the `name` or `annotations.title` may be used as a fallback.
   */
  title?: string;
  /**
   * A clear, concise description of what the tool does.
   * This is sent to the LLM to help it decide when to use the tool.
   */
  description: string;
  /**
   * The Zod schema for validating the tool's input parameters.
   */
  inputSchema: TInputSchema;
  /**
   * The Zod schema for validating the tool's successful output structure.
   */
  outputSchema: TOutputSchema;
  /**
   * Optional metadata providing hints about the tool's behavior.
   */
  annotations?: ToolAnnotations;
  /**
   * The core business logic function for the tool.
   * It receives validated input and returns a structured output or throws an McpError.
   * @param input The validated tool input.
   * @param context The request context for logging and tracing.
   * @returns A promise that resolves with the structured output.
   */
  logic: (
    input: z.infer<TInputSchema>,
    context: RequestContext,
  ) => Promise<z.infer<TOutputSchema>>;
  /**
   * An optional function to format the successful output into an array of ContentBlocks
   * for the `CallToolResult`. If not provided, a default JSON stringifier is used.
   * @param result The successful output from the logic function.
   * @returns An array of ContentBlocks to be sent to the client.
   */
  responseFormatter?: (result: z.infer<TOutputSchema>) => ContentBlock[];
}

// Re-export standardized SQL tool output schema from centralized schemas
export const standardSqlToolOutputSchema = StandardSqlToolOutputSchema;

/**
 * Formats SQL tool output into a well-formatted markdown table with metadata.
 * Provides a user-friendly representation of database query results.
 */
export const sqlResponseFormatter = (
  result: StandardSqlToolOutput,
): ContentBlock[] => {
  if (!result.success || !result.data) {
    // Handle error cases
    const errorMessage = result.error || "Unknown error occurred";
    const { metadata } = result;

    let errorResponse = `❌ **SQL Query Failed**\n\n`;

    if (metadata?.toolName) {
      errorResponse += `**Tool:** ${metadata.toolName}\n\n`;
    }

    errorResponse += `**Error:** ${errorMessage}`;

    if (result.errorCode) {
      errorResponse += `\n**Error Code:** ${result.errorCode}`;
    }

    if (metadata?.sqlStatement) {
      const truncatedSql =
        metadata.sqlStatement.length > 200
          ? metadata.sqlStatement.substring(0, 197) + "..."
          : metadata.sqlStatement;
      errorResponse += `\n\n**SQL Statement:**\n\`\`\`sql\n${truncatedSql}\n\`\`\``;
    }

    return [{ type: "text", text: errorResponse }];
  }

  const { data, metadata } = result;
  const rowCount = data.length;
  const columnCount = metadata?.columns?.length || 0;

  // Build structured response
  let response = "";

  // Tool header
  if (metadata?.toolName) {
    response += `## ${metadata.toolName}\n\n`;
  }

  // Success indicator and row count
  response += `✅ **Query completed successfully**\n\n`;
  response += `Found **${rowCount} row${rowCount !== 1 ? "s" : ""}** from the database query\n\n`;

  // SQL Statement section
  if (metadata?.sqlStatement) {
    const truncatedSql =
      metadata.sqlStatement.length > 500
        ? metadata.sqlStatement.substring(0, 497) + "..."
        : metadata.sqlStatement;
    response += `**SQL Statement:**\n\`\`\`sql\n${truncatedSql}\n\`\`\`\n\n`;
  }

  // Parameters section
  if (metadata?.parameters && Object.keys(metadata.parameters).length > 0) {
    response += `**Parameters:**\n`;
    Object.entries(metadata.parameters).forEach(([key, value]) => {
      const displayValue =
        value === null || value === undefined
          ? "NULL"
          : typeof value === "string" && value.length > 100
            ? `${String(value).substring(0, 97)}...`
            : String(value);
      response += `- \`${key}\`: ${displayValue}\n`;
    });
    response += `\n`;
  }

  // Handle empty results
  if (rowCount === 0) {
    response += `No rows returned from the query.\n\n`;
    response += `**Execution Summary:**\n`;
    response += `- Execution time: ${metadata?.executionTime ? `${metadata.executionTime}ms` : "N/A"}\n`;
    response += `- Parameters used: ${metadata?.parameterCount || 0}\n`;
    return [{ type: "text", text: response }];
  }

  // Extract column information
  const columns = metadata?.columns || [];
  const firstRow = data[0] || {};
  const allColumns =
    columns.length > 0
      ? columns
      : Object.keys(firstRow).map((key) => ({
          name: key,
          type: undefined,
          label: key,
        }));

  // Build markdown table
  let tableMarkdown = "";

  // Header row with cleaner formatting
  const headers = allColumns.map((col) => {
    const header = col.label || col.name;
    return col.type ? `${header} (${col.type})` : header;
  });
  tableMarkdown += `| ${headers.join(" | ")} |\n`;

  // Separator row
  tableMarkdown += `|${headers.map(() => "----------").join("|")}|\n`;

  // Data rows (limit to first 500 rows for better performance)
  const maxDisplayRows = 500;
  const displayRows = data.slice(0, maxDisplayRows);

  displayRows.forEach((row) => {
    const values = allColumns.map((col) => {
      const value = row[col.name];
      if (value === null || value === undefined) return "NULL";
      return String(value);
    });
    tableMarkdown += `| ${values.join(" | ")} |\n`;
  });

  // Show row limitation notice if applicable
  if (displayRows.length < rowCount) {
    response += `*Showing first ${displayRows.length} of ${rowCount} rows*\n\n`;
  }

  response += `**Results:**\n\n${tableMarkdown}\n`;

  // Count null values across all displayed data
  let nullCount = 0;
  displayRows.forEach((row) => {
    allColumns.forEach((col) => {
      if (row[col.name] === null || row[col.name] === undefined) {
        nullCount++;
      }
    });
  });

  // Execution summary
  response += `**Summary:**\n`;
  response += `- Total rows: ${rowCount}\n`;
  response += `- Columns: ${columnCount}\n`;
  response += `- Null values: ${nullCount}\n`;

  if (metadata?.executionTime) {
    response += `- Execution time: ${metadata.executionTime}ms\n`;
  }

  if (metadata?.affectedRows !== undefined) {
    response += `- Affected rows: ${metadata.affectedRows}\n`;
  }

  if (metadata?.parameterCount) {
    response += `- Parameters processed: ${metadata.parameterCount}\n`;
  }

  return [{ type: "text", text: response }];
};

/**
 * Formats successful SQL tool output into a text block that highlights
 * row counts and execution timing for quick operator feedback.
 */
// Default formatter for successful responses (fallback)
export const defaultResponseFormatter = (result: unknown): ContentBlock[] => [
  { type: "text", text: JSON.stringify(result, null, 2) },
];

/**
 * Creates an MCP-compatible handler from a declarative tool definition.
 * Handles input validation, performance measurement, standardized error
 * formatting, and context propagation.
 */
export function createHandlerFromDefinition<
  TInputSchema extends ZodObject<ZodRawShape>,
  TOutputSchema extends ZodObject<ZodRawShape>,
>(definition: ToolDefinition<TInputSchema, TOutputSchema>) {
  return async (
    rawParams: unknown,
    mcpContext: Record<string, unknown>,
  ): Promise<CallToolResult> => {
    const handlerContext = requestContextService.createRequestContext({
      parentContext: mcpContext,
      operation: `tool:${definition.name}`,
      toolName: definition.name,
    });

    return withRequestContext(handlerContext, async () => {
      try {
        const validatedInput = definition.inputSchema.parse(
          rawParams ?? {},
        ) as z.infer<TInputSchema>;

        const result = await measureToolExecution(
          definition.name,
          () => definition.logic(validatedInput, handlerContext),
          validatedInput,
        );

        const output = definition.outputSchema.parse(result);
        const contentBlocks = definition.responseFormatter
          ? definition.responseFormatter(output)
          : defaultResponseFormatter(output);

        return {
          content: contentBlocks,
          structuredContent: output,
        } satisfies CallToolResult;
      } catch (error) {
        const capturedContext =
          getRequestContext() ?? handlerContext ?? undefined;
        const handledError = ErrorHandler.handleError(error, {
          operation: `tool:${definition.name}`,
          context: capturedContext,
          input: rawParams,
          errorCode: error instanceof McpError ? error.code : undefined,
        });

        const mcpError =
          handledError instanceof McpError
            ? handledError
            : new McpError(
                JsonRpcErrorCode.InternalError,
                handledError instanceof Error
                  ? handledError.message
                  : String(handledError),
              );

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error executing '${definition.name}': ${mcpError.message}`,
            },
          ],
          structuredContent: {
            success: false,
            data: [],
            error: mcpError.message,
            errorCode: mcpError.code,
            errorDetails: mcpError.details,
          },
        } satisfies CallToolResult;
      }
    });
  };
}
