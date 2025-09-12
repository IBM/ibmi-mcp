/**
 * @fileoverview Tool Configuration Builder - Standardized tool configuration creation
 * Unifies all tool configuration creation logic into a single, consistent class
 * Eliminates duplicate logic between cached and regular tool creation paths
 *
 * @module src/ibmi-mcp-server/utils/yaml/toolConfigBuilder
 */

import { z } from "zod";
import { YamlTool, YamlToolParameter, ProcessedYamlTool } from "./types.js";
import { YamlSqlExecutor } from "./yamlSqlExecutor.js";
import { ErrorHandler, logger } from "@/utils/internal/index.js";
import {
  requestContextService,
  RequestContext,
} from "@/utils/internal/requestContext.js";
import { JsonRpcErrorCode, McpError } from "@/types-global/errors.js";
import { CachedToolConfig } from "./toolConfigCache.js";

/**
 * Standardized YAML tool output schema
 * This schema is used by all YAML-generated tools to ensure consistency
 */
export const standardYamlToolOutputSchema = z
  .object({
    success: z.boolean().describe("Whether the SQL execution was successful"),
    columns: z
      .array(z.any())
      .optional()
      .describe("Column metadata for the query result"),
    data: z
      .array(z.record(z.any()))
      .describe(
        "Query result rows as an array of objects with mixed data types",
      ),
    error: z.string().optional().describe("Error message if execution failed"),
    metadata: z
      .object({
        executionTime: z
          .number()
          .optional()
          .describe("Execution time in milliseconds"),
        rowCount: z.number().optional().describe("Number of rows returned"),
        columnsTypes: z
          .array(z.any())
          .optional()
          .describe("Column type information"),
        affectedRows: z.number().optional().describe("Number of affected rows"),
        parameterMode: z
          .string()
          .optional()
          .describe("Parameter binding mode used"),
        parameterCount: z
          .number()
          .optional()
          .describe("Number of parameters bound"),
      })
      .optional()
      .describe(
        "Execution metadata including performance and column information",
      ),
  })
  .strict()
  .describe("SQL query execution result with dynamic column structure");

/**
 * Tool Configuration Builder
 * Standardized tool configuration creation with consistent error handling,
 * schema generation, and handler creation logic
 */
export class ToolConfigBuilder {
  private static instance: ToolConfigBuilder;

  /**
   * Get the singleton instance
   */
  static getInstance(): ToolConfigBuilder {
    if (!ToolConfigBuilder.instance) {
      ToolConfigBuilder.instance = new ToolConfigBuilder();
    }
    return ToolConfigBuilder.instance;
  }

  /**
   * Generate a Zod schema from YAML parameter definitions
   * @param parameters - YAML parameter definitions
   * @param toolName - Tool name for error reporting
   * @returns Generated Zod schema
   */
  generateZodSchema(
    parameters: YamlToolParameter[],
    toolName: string,
  ): z.ZodObject<Record<string, z.ZodTypeAny>> {
    const schemaShape: Record<string, z.ZodTypeAny> = {};

    // Process parameters
    for (const param of parameters) {
      let zodType: z.ZodTypeAny;

      // Generate Zod type based on parameter type
      switch (param.type) {
        case "string":
          zodType = z.string();
          break;
        case "number":
          zodType = z.number();
          break;
        case "integer":
          zodType = z.number().int();
          break;
        case "float":
          zodType = z.number();
          break;
        case "boolean":
          zodType = z.boolean();
          break;
        case "array":
          // For array parameters, create array of the specified item type
          if (param.itemType === "string") {
            zodType = z.array(z.string());
          } else if (
            param.itemType === "number" ||
            param.itemType === "integer" ||
            param.itemType === "float"
          ) {
            zodType = z.array(z.number());
          } else if (param.itemType === "boolean") {
            zodType = z.array(z.boolean());
          } else {
            zodType = z.array(z.unknown());
          }
          break;
        default:
          throw new McpError(
            JsonRpcErrorCode.InvalidParams,
            `Unsupported parameter type '${param.type}' for parameter '${param.name}' in tool '${toolName}'`,
            { toolName, parameterName: param.name, parameterType: param.type },
          );
      }

      // Add default value if provided
      if (param.default !== undefined) {
        zodType = zodType.default(param.default);
      }

      // Add description if provided
      if (param.description) {
        zodType = zodType.describe(param.description);
      }

      schemaShape[param.name] = zodType;
    }

    return z.object(schemaShape);
  }

  /**
   * Filter processed tools by allowed toolsets
   * @param processedTools - Array of processed tools to filter
   * @param allowedToolsets - List of toolset names to include
   * @returns Filtered array containing only tools that belong to allowed toolsets
   */
  filterToolsByToolsets(
    processedTools: ProcessedYamlTool[],
    allowedToolsets: string[],
  ): ProcessedYamlTool[] {
    if (!allowedToolsets || allowedToolsets.length === 0) {
      return processedTools;
    }

    return processedTools.filter(
      (tool) =>
        tool.toolsets &&
        tool.toolsets.some((toolset: string) =>
          allowedToolsets.includes(toolset),
        ),
    );
  }

  /**
   * Build a complete tool configuration
   * This is the single, unified method for creating all tool configurations
   * @param toolName - Name of the tool
   * @param config - Tool configuration from YAML
   * @param toolsets - Toolsets this tool belongs to
   * @param context - Request context
   * @returns Complete cached tool configuration
   */
  async buildToolConfig(
    toolName: string,
    config: YamlTool,
    toolsets: string[],
    context: RequestContext,
  ): Promise<CachedToolConfig> {
    const buildContext = requestContextService.createRequestContext({
      parentRequestId: context.requestId,
      operation: "ToolConfigBuilder.buildToolConfig",
      toolName,
    });

    return ErrorHandler.tryCatch(
      async () => {
        logger.debug(
          {
            ...buildContext,
            description: config.description,
            toolsets,
            domain: config.domain,
            category: config.category,
          },
          `Building tool configuration: ${toolName}`,
        );

        // Generate Zod schema for parameters
        const zodSchema = this.generateZodSchema(
          config.parameters || [],
          toolName,
        );

        // Create the unified tool handler
        const handler = this.createToolHandler(toolName, config, buildContext);

        // Build complete tool configuration
        const toolConfig: CachedToolConfig = {
          name: toolName,
          title: this.formatToolTitle(toolName),
          description: config.description,
          inputSchema: zodSchema.shape,
          outputSchema: standardYamlToolOutputSchema.shape,
          annotations: {
            title: this.formatToolTitle(toolName),
            domain: config.domain,
            category: config.category,
            readOnlyHint: config.readOnlyHint ?? true,
            destructiveHint: config.destructiveHint,
            idempotentHint: config.idempotentHint,
            openWorldHint: config.openWorldHint,
            toolsets: toolsets,
            ...(config.metadata ? { customMetadata: config.metadata } : {}),
          },
          handler,
        };

        logger.debug(
          buildContext,
          `Tool configuration built successfully: ${toolName}`,
        );

        return toolConfig;
      },
      {
        operation: "ToolConfigBuilder.buildToolConfig",
        context: buildContext,
        errorCode: JsonRpcErrorCode.InternalError,
      },
    );
  }

  /**
   * Create a unified tool handler function
   * This replaces the duplicate handler logic in yamlToolFactory
   * @param toolName - Name of the tool
   * @param config - Tool configuration
   * @param context - Request context
   * @returns Tool handler function
   * @private
   */
  private createToolHandler(
    toolName: string,
    config: YamlTool,
    context: RequestContext,
  ) {
    return async (
      params: Record<string, unknown>,
      mcpContext: Record<string, unknown>,
    ) => {
      const handlerContext = requestContextService.createRequestContext({
        parentRequestId: context.requestId,
        operation: `ExecuteYamlTool_${toolName}`,
        toolName,
        input: params,
        mcpToolContext: mcpContext,
      });

      try {
        // Execute SQL statement using unified execution infrastructure
        const result = await YamlSqlExecutor.executeStatementWithParameters(
          toolName,
          config.source,
          config.statement,
          params,
          config.parameters || [],
          config.security,
          handlerContext,
        );

        // Return consistent response format
        return {
          content: [
            {
              type: "text" as const,
              text: `Tool execution successful: ${JSON.stringify(result, null, 2)}`,
            },
          ],
          structuredContent: {
            success: result.success,
            columns: result.metadata?.columnsTypes,
            data: result.data,
            error: result.error,
            metadata: result.metadata,
          },
        };
      } catch (error) {
        // Unified error handling
        const mcpError = ErrorHandler.handleError(error, {
          operation: `tool:${toolName}`,
          context: handlerContext,
          input: params,
        }) as McpError;

        return {
          content: [
            { type: "text" as const, text: `Error: ${mcpError.message}` },
          ],
          structuredContent: {
            success: false,
            columns: [],
            data: [],
            error: mcpError.message,
            code: mcpError.code,
            details: mcpError.details,
          },
          isError: true,
        };
      }
    };
  }

  /**
   * Format tool name into a human-readable title
   * @param toolName - Tool name
   * @returns Formatted title
   * @private
   */
  private formatToolTitle(toolName: string): string {
    return toolName
      .split(/[_-]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
}
