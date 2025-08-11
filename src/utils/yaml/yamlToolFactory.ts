/**
 * @fileoverview YAML Tool Factory - Dynamic MCP tool generation from YAML
 * Converts YAML tool definitions into MCP tools with proper validation and registration
 *
 * @module src/utils/yaml/yamlToolFactory
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  ProcessedYamlTool,
  YamlTool,
  YamlToolParameter,
} from "../../types-global/yaml-tools.js";
import { YamlSqlExecutor } from "./yamlSqlExecutor.js";
import { ToolsetManager } from "./toolsetManager.js";
import { ErrorHandler, logger } from "../internal/index.js";
import {
  requestContextService,
  RequestContext,
} from "../internal/requestContext.js";
import { BaseErrorCode, McpError } from "../../types-global/errors.js";

/**
 * Generated tool information for tracking
 */
export interface GeneratedToolInfo {
  /** Tool name */
  toolName: string;
  /** Source name */
  sourceName: string;
  /** Generated Zod schema */
  zodSchema: z.ZodObject<Record<string, z.ZodTypeAny>>;
  /** Parameter count */
  parameterCount: number;
  /** Toolsets this tool belongs to */
  toolsets: string[];
  /** Registration status */
  registered: boolean;
}

/**
 * Tool factory statistics
 */
export interface ToolFactoryStats {
  /** Total tools generated */
  totalGenerated: number;
  /** Total tools registered */
  totalRegistered: number;
  /** Tools by source */
  toolsBySource: Record<string, number>;
  /** Tools by toolset */
  toolsByToolset: Record<string, number>;
  /** Total parameters across all tools */
  totalParameters: number;
}

/**
 * YAML Tool Factory
 * Generates MCP tools dynamically from YAML definitions
 */
export class YamlToolFactory {
  private static instance: YamlToolFactory | undefined;
  private generatedTools: Map<string, GeneratedToolInfo> = new Map();
  private toolsetManager: ToolsetManager;

  /**
   * Get the singleton instance of the YamlToolFactory
   */
  static getInstance(): YamlToolFactory {
    if (!YamlToolFactory.instance) {
      YamlToolFactory.instance = new YamlToolFactory();
    }
    return YamlToolFactory.instance;
  }

  constructor() {
    this.toolsetManager = ToolsetManager.getInstance();
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
        case "boolean":
          zodType = z.boolean();
          break;
        default:
          throw new McpError(
            BaseErrorCode.VALIDATION_ERROR,
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
   * Generate and register a single MCP tool from YAML definition
   * @param processedTool - Processed YAML tool definition
   * @param server - MCP server instance
   * @param context - Request context for logging
   */
  async generateAndRegisterTool(
    processedTool: ProcessedYamlTool,
    server: McpServer,
    context?: RequestContext,
  ): Promise<void> {
    const operationContext =
      context ||
      requestContextService.createRequestContext({
        operation: "GenerateAndRegisterTool",
        toolName: processedTool.name,
      });

    return ErrorHandler.tryCatch(
      async () => {
        const { name: toolName, config, source, toolsets } = processedTool;

        logger.info(`Generating MCP tool: ${toolName}`, {
          ...operationContext,
          sourceName: source.host,
          toolsetCount: toolsets.length,
          parameterCount: config.parameters?.length || 0,
        });

        // Validate SQL statement
        await YamlSqlExecutor.validateSqlStatement(
          config.statement,
          toolName,
          operationContext,
        );

        // Generate Zod schema for parameters
        const zodSchema = this.generateZodSchema(
          config.parameters || [],
          toolName,
        );

        // Get toolset metadata
        const toolsetInfo = this.toolsetManager.getToolsetInfo(toolName);

        // Store generated tool info
        const generatedToolInfo: GeneratedToolInfo = {
          toolName,
          sourceName: source.host,
          zodSchema,
          parameterCount: config.parameters?.length || 0,
          toolsets,
          registered: false,
        };

        this.generatedTools.set(toolName, generatedToolInfo);

        // Register the tool with MCP server
        await this.registerMcpTool(
          server,
          toolName,
          config,
          zodSchema,
          toolsetInfo.toolsets,
          operationContext,
        );

        // Mark as registered
        generatedToolInfo.registered = true;
        this.generatedTools.set(toolName, generatedToolInfo);

        logger.info(
          `MCP tool generated and registered successfully: ${toolName}`,
          {
            ...operationContext,
            toolsets: toolsetInfo.toolsets,
            parameterCount: config.parameters?.length || 0,
          },
        );
      },
      {
        operation: "GenerateAndRegisterTool",
        context: operationContext,
        errorCode: BaseErrorCode.INITIALIZATION_FAILED,
      },
    );
  }

  /**
   * Register a generated tool with the MCP server
   * @param server - MCP server instance
   * @param toolName - Name of the tool
   * @param config - Tool configuration
   * @param zodSchema - Generated Zod schema
   * @param toolsets - Toolsets this tool belongs to
   * @param context - Request context
   * @private
   */
  private async registerMcpTool(
    server: McpServer,
    toolName: string,
    config: YamlTool,
    zodSchema: z.ZodObject<Record<string, z.ZodTypeAny>>,
    toolsets: string[],
    context: RequestContext,
  ): Promise<void> {
    const registrationContext = requestContextService.createRequestContext({
      parentRequestId: context.requestId,
      operation: "RegisterMcpTool",
      toolName,
    });

    logger.info(`Registering MCP tool: ${toolName}`, {
      ...registrationContext,
      description: config.description,
      toolsets,
      domain: config.domain,
      category: config.category,
    });

    // Register the tool using the same pattern as existing tools
    server.tool(
      toolName,
      config.description,
      zodSchema.shape,
      {
        title: this.formatToolTitle(toolName),
        toolsets,
        domain: config.domain,
        category: config.category,
        readOnlyHint: true, // YAML tools are read-only by design
      },
      async (
        params: Record<string, unknown>,
        mcpContext: unknown,
      ): Promise<CallToolResult> => {
        const handlerContext = requestContextService.createRequestContext({
          parentRequestId: registrationContext.requestId,
          operation: "HandleYamlToolRequest",
          toolName,
          mcpToolContext: mcpContext,
          input: params,
        });

        try {
          // Execute the SQL statement
          const result = await YamlSqlExecutor.executeStatement(
            toolName,
            config.source,
            config.statement,
            params,
            handlerContext,
          );

          return {
            content: [
              { type: "text", text: JSON.stringify(result.data, null, 2) },
            ],
            isError: false,
          };
        } catch (error) {
          const handledError = ErrorHandler.handleError(error, {
            operation: `${toolName}Handler`,
            context: handlerContext,
            input: params,
          });

          const mcpError =
            handledError instanceof McpError
              ? handledError
              : new McpError(
                  BaseErrorCode.INTERNAL_ERROR,
                  `An unexpected error occurred in the ${toolName} tool.`,
                  { originalErrorName: handledError.name },
                );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: {
                    code: mcpError.code,
                    message: mcpError.message,
                    details: mcpError.details,
                  },
                }),
              },
            ],
            isError: true,
          };
        }
      },
    );

    logger.info(
      `MCP tool registered successfully: ${toolName}`,
      registrationContext,
    );
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

  /**
   * Generate and register all tools from processed YAML tools
   * @param processedTools - Array of processed YAML tools
   * @param server - MCP server instance
   * @param context - Request context for logging
   */
  async generateAndRegisterAllTools(
    processedTools: ProcessedYamlTool[],
    server: McpServer,
    context?: RequestContext,
  ): Promise<void> {
    const operationContext =
      context ||
      requestContextService.createRequestContext({
        operation: "GenerateAndRegisterAllTools",
      });

    return ErrorHandler.tryCatch(
      async () => {
        logger.info("Generating and registering all YAML tools", {
          ...operationContext,
          toolCount: processedTools.length,
        });

        // Clear existing generated tools
        this.generatedTools.clear();

        // Generate and register each tool
        for (const processedTool of processedTools) {
          await this.generateAndRegisterTool(
            processedTool,
            server,
            operationContext,
          );
        }

        const stats = this.getStats();
        logger.info("All YAML tools generated and registered successfully", {
          ...operationContext,
          totalGenerated: stats.totalGenerated,
          totalRegistered: stats.totalRegistered,
          totalParameters: stats.totalParameters,
        });
      },
      {
        operation: "GenerateAndRegisterAllTools",
        context: operationContext,
        errorCode: BaseErrorCode.INITIALIZATION_FAILED,
      },
    );
  }

  /**
   * Get information about a generated tool
   * @param toolName - Name of the tool
   * @returns Generated tool information or undefined
   */
  getGeneratedToolInfo(toolName: string): GeneratedToolInfo | undefined {
    return this.generatedTools.get(toolName);
  }

  /**
   * Get all generated tool names
   * @returns Array of generated tool names
   */
  getAllGeneratedToolNames(): string[] {
    return Array.from(this.generatedTools.keys());
  }

  /**
   * Get factory statistics
   * @returns Tool factory statistics
   */
  getStats(): ToolFactoryStats {
    const toolsBySource: Record<string, number> = {};
    const toolsByToolset: Record<string, number> = {};
    let totalParameters = 0;
    let totalRegistered = 0;

    for (const toolInfo of this.generatedTools.values()) {
      // Count by source
      toolsBySource[toolInfo.sourceName] =
        (toolsBySource[toolInfo.sourceName] || 0) + 1;

      // Count by toolset
      for (const toolset of toolInfo.toolsets) {
        toolsByToolset[toolset] = (toolsByToolset[toolset] || 0) + 1;
      }

      // Count parameters
      totalParameters += toolInfo.parameterCount;

      // Count registered
      if (toolInfo.registered) {
        totalRegistered++;
      }
    }

    return {
      totalGenerated: this.generatedTools.size,
      totalRegistered,
      toolsBySource,
      toolsByToolset,
      totalParameters,
    };
  }

  /**
   * Clear all generated tools (for testing)
   */
  clearAll(): void {
    this.generatedTools.clear();
  }

  /**
   * Get a summary of the tool factory state
   * @returns Summary object with current state
   */
  getSummary(): {
    totalTools: number;
    registeredTools: number;
    pendingTools: number;
    totalParameters: number;
    sourceCount: number;
    toolsetCount: number;
  } {
    const stats = this.getStats();

    return {
      totalTools: stats.totalGenerated,
      registeredTools: stats.totalRegistered,
      pendingTools: stats.totalGenerated - stats.totalRegistered,
      totalParameters: stats.totalParameters,
      sourceCount: Object.keys(stats.toolsBySource).length,
      toolsetCount: Object.keys(stats.toolsByToolset).length,
    };
  }
}
