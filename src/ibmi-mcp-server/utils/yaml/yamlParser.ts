/**
 * @fileoverview YAML configuration parser with validation and environment variable interpolation
 * Handles parsing, validation, and processing of YAML tool configurations
 *
 * @module src/utils/yaml/yamlParser
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { load as yamlLoad } from "js-yaml";
import { z } from "zod";
import {
  YamlToolsConfig,
  YamlToolParameter,
  YamlParsingResult,
  ProcessedYamlTool,
} from "./types.js";
import { ErrorHandler, logger } from "@/utils/internal/index.js";
import {
  requestContextService,
  RequestContext,
} from "@/utils/internal/requestContext.js";
import { JsonRpcErrorCode, McpError } from "@/types-global/errors.js";

/**
 * Zod schema for validating YAML tool parameters
 */
const YamlToolParameterSchema = z.object({
  name: z.string().min(1, "Parameter name cannot be empty"),
  type: z.enum(["string", "number", "boolean", "integer"]),
  description: z.string().optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

/**
 * Zod schema for validating YAML source configurations
 */
const YamlSourceSchema = z.object({
  host: z.string().min(1, "Host cannot be empty"),
  user: z.string().min(1, "User cannot be empty"),
  password: z.string().min(1, "Password cannot be empty"),
  port: z.number().int().positive().optional(),
  "ignore-unauthorized": z.boolean().optional(),
});

/**
 * Zod schema for validating YAML tool definitions
 */
const YamlToolSchema = z.object({
  source: z.string().min(1, "Source reference cannot be empty"),
  description: z.string().min(1, "Tool description cannot be empty"),
  statement: z.string().min(1, "SQL statement cannot be empty"),
  parameters: z.array(YamlToolParameterSchema).optional(),
  domain: z.string().optional(),
  category: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  // MCP Tool annotation hints
  readOnlyHint: z.boolean().optional(),
  destructiveHint: z.boolean().optional(),
  idempotentHint: z.boolean().optional(),
  openWorldHint: z.boolean().optional(),
  // Security configuration for execute_sql tool
  security: z
    .object({
      readOnly: z.boolean().optional(),
      maxQueryLength: z.number().optional(),
      forbiddenKeywords: z.array(z.string()).optional(),
    })
    .optional(),
});

/**
 * Zod schema for validating YAML toolset definitions
 */
const YamlToolsetSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  tools: z
    .array(z.string().min(1, "Tool name cannot be empty"))
    .min(1, "Toolset must contain at least one tool"),
  metadata: z.record(z.any()).optional(),
});

/**
 * Zod schema for validating the complete YAML configuration
 */
const YamlToolsConfigSchema = z
  .object({
    sources: z
      .record(
        z.string().min(1, "Source name cannot be empty"),
        YamlSourceSchema,
      )
      .optional(),
    tools: z
      .record(z.string().min(1, "Tool name cannot be empty"), YamlToolSchema)
      .optional(),
    toolsets: z
      .record(
        z.string().min(1, "Toolset name cannot be empty"),
        YamlToolsetSchema,
      )
      .optional(),
    metadata: z.record(z.any()).optional(),
  })
  .refine(
    (data) => {
      // Ensure at least one section exists
      return data.sources || data.tools || data.toolsets;
    },
    {
      message:
        "YAML file must contain at least one section: sources, tools, or toolsets",
    },
  );

/**
 * YAML configuration parser with validation and environment variable interpolation
 */
export class YamlParser {
  /**
   * Parse and validate a YAML tools configuration file
   * @param filePath - Path to the YAML configuration file
   * @param context - Request context for logging
   * @returns Parsing result with validation information
   */
  static async parseYamlFile(
    filePath: string,
    context?: RequestContext,
  ): Promise<YamlParsingResult> {
    const operationContext =
      context ||
      requestContextService.createRequestContext({
        operation: "ParseYamlFile",
        filePath,
      });

    return ErrorHandler.tryCatch(
      async () => {
        logger.info(
          {
            ...operationContext,
            filePath,
          },
          "Parsing YAML configuration file",
        );

        // Check if file exists
        const resolvedPath = resolve(filePath);
        if (!existsSync(resolvedPath)) {
          throw new McpError(
            JsonRpcErrorCode.ValidationError,
            `YAML configuration file not found: ${resolvedPath}`,
          );
        }

        // Read file content
        const fileContent = readFileSync(resolvedPath, "utf8");
        logger.debug(
          {
            ...operationContext,
            contentLength: fileContent.length,
          },
          "YAML file content loaded",
        );

        // Interpolate environment variables at startup
        // TODO: In the future, this should use client-provided environment variables
        // instead of server-side environment variables
        const interpolatedContent = this.interpolateEnvironmentVariables(
          fileContent,
          operationContext,
        );

        // Parse YAML
        const parsedYaml = yamlLoad(interpolatedContent);

        // Validate against schema
        const validationResult = YamlToolsConfigSchema.safeParse(parsedYaml);

        if (!validationResult.success) {
          const errors = validationResult.error.errors.map(
            (err) => `${err.path.join(".")}: ${err.message}`,
          );

          logger.error(
            {
              ...operationContext,
              errors,
            },
            "YAML validation failed",
          );

          return {
            success: false,
            errors,
          };
        }

        const config = validationResult.data as YamlToolsConfig;

        // Additional validation - check tool source references
        const sourceValidationErrors =
          this.validateToolSourceReferences(config);
        if (sourceValidationErrors.length > 0) {
          logger.error(
            {
              ...operationContext,
              errors: sourceValidationErrors,
            },
            "Source reference validation failed",
          );

          return {
            success: false,
            errors: sourceValidationErrors,
          };
        }

        // Additional validation - check toolset tool references
        const toolsetValidationErrors = this.validateToolsetReferences(config);
        if (toolsetValidationErrors.length > 0) {
          logger.error(
            {
              ...operationContext,
              errors: toolsetValidationErrors,
            },
            "Toolset reference validation failed",
          );

          return {
            success: false,
            errors: toolsetValidationErrors,
          };
        }

        // Process tools
        const processedTools = this.processTools(config);

        // Generate statistics
        const stats = {
          sourceCount: config.sources ? Object.keys(config.sources).length : 0,
          toolCount: config.tools ? Object.keys(config.tools).length : 0,
          toolsetCount: config.toolsets
            ? Object.keys(config.toolsets).length
            : 0,
          totalParameterCount: config.tools
            ? Object.values(config.tools).reduce(
                (sum, tool) => sum + (tool.parameters?.length || 0),
                0,
              )
            : 0,
        };

        logger.info(
          {
            ...operationContext,
            stats,
          },
          "YAML configuration parsed successfully",
        );

        return {
          success: true,
          config,
          processedTools,
          stats,
        };
      },
      {
        operation: "ParseYamlFile",
        context: operationContext,
        errorCode: JsonRpcErrorCode.ConfigurationError,
      },
    );
  }

  /**
   * Interpolate environment variables in YAML content
   * Supports ${VAR_NAME} syntax
   * @param content - YAML content string
   * @param context - Request context for logging
   * @returns Content with environment variables interpolated
   * @private
   */
  private static interpolateEnvironmentVariables(
    content: string,
    context: RequestContext,
  ): string {
    return content.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      const envValue = process.env[varName];
      if (envValue === undefined) {
        logger.debug(
          {
            ...context,
            varName,
          },
          `Environment variable ${varName} not found, keeping placeholder`,
        );
        return match;
      }
      logger.debug(
        {
          ...context,
          varName,
          envValue: envValue.substring(0, 10) + "...", // Only show first 10 chars for security
        },
        `Environment variable ${varName} found and substituted`,
      );
      return envValue;
    });
  }

  /**
   * Interpolate environment variables using client-provided environment
   * Supports ${VAR_NAME} syntax
   *
   * NOT USED CURRENTLY
   * @param content - Content string with environment variable placeholders
   * @param clientEnvironment - Environment variables provided by the client
   * @param context - Request context for logging
   * @returns Content with environment variables interpolated
   */
  static interpolateClientEnvironmentVariables(
    content: string,
    clientEnvironment: Record<string, string> = {},
    context?: RequestContext,
  ): string {
    const operationContext =
      context ||
      requestContextService.createRequestContext({
        operation: "InterpolateClientEnvironmentVariables",
      });

    logger.debug(
      {
        ...operationContext,
        contentLength: content.length,
        availableClientVars: Object.keys(clientEnvironment),
      },
      "Starting client environment variable interpolation",
    );

    return content.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      const envValue = clientEnvironment[varName];
      if (envValue === undefined) {
        logger.debug(
          {
            ...operationContext,
            match,
            varName,
            availableClientVars: Object.keys(clientEnvironment),
          },
          `Client environment variable ${varName} not found, keeping placeholder`,
        );
        return match;
      }
      logger.debug(
        {
          ...operationContext,
          varName,
          envValue: envValue.substring(0, 10) + "...", // Only show first 10 chars for security
        },
        `Client environment variable ${varName} found and substituted`,
      );
      return envValue;
    });
  }

  /**
   * Validate that all tool source references exist in the sources section
   * @param config - Parsed YAML configuration
   * @returns Array of validation errors
   * @private
   */
  private static validateToolSourceReferences(
    config: YamlToolsConfig,
  ): string[] {
    const errors: string[] = [];

    // Skip validation if either section is missing
    if (!config.sources || !config.tools) {
      return errors;
    }

    const sourceNames = Object.keys(config.sources);

    Object.entries(config.tools).forEach(([toolName, tool]) => {
      if (!sourceNames.includes(tool.source)) {
        errors.push(
          `Tool '${toolName}' references unknown source '${tool.source}'. Available sources: ${sourceNames.join(", ")}`,
        );
      }
    });

    return errors;
  }

  /**
   * Validate that all toolset tool references exist in the tools section
   * @param config - Parsed YAML configuration
   * @returns Array of validation errors
   * @private
   */
  private static validateToolsetReferences(config: YamlToolsConfig): string[] {
    const errors: string[] = [];

    // Skip validation if either section is missing
    if (!config.toolsets || !config.tools) {
      return errors;
    }

    const toolNames = Object.keys(config.tools);

    Object.entries(config.toolsets).forEach(([toolsetName, toolset]) => {
      toolset.tools.forEach((toolName) => {
        if (!toolNames.includes(toolName)) {
          errors.push(
            `Toolset '${toolsetName}' references unknown tool '${toolName}'. Available tools: ${toolNames.join(", ")}`,
          );
        }
      });
    });

    return errors;
  }

  /**
   * Process tools from YAML configuration into runtime format
   * @param config - Validated YAML configuration
   * @returns Array of processed tools
   * @private
   */
  private static processTools(config: YamlToolsConfig): ProcessedYamlTool[] {
    const processedTools: ProcessedYamlTool[] = [];

    // Return empty array if tools section is missing
    if (!config.tools) {
      return processedTools;
    }

    // Build toolset membership map
    const toolToToolsets: Record<string, string[]> = {};
    if (config.toolsets) {
      Object.entries(config.toolsets).forEach(([toolsetName, toolset]) => {
        toolset.tools.forEach((toolName) => {
          if (!toolToToolsets[toolName]) {
            toolToToolsets[toolName] = [];
          }
          toolToToolsets[toolName].push(toolsetName);
        });
      });
    }

    // Process each tool
    Object.entries(config.tools).forEach(([toolName, tool]) => {
      const source = config.sources?.[tool.source];
      const toolsets = toolToToolsets[toolName] || [];

      processedTools.push({
        name: toolName,
        config: tool,
        source: source!,
        toolsets,
        metadata: {
          name: toolName,
          description: tool.description,
          domain: tool.domain,
          category: tool.category,
          toolsets,
        },
      });
    });

    return processedTools;
  }

  /**
   * Validate a single tool parameter definition
   * @param parameter - Parameter definition to validate
   * @returns Validation result
   */
  static validateParameter(parameter: YamlToolParameter): {
    valid: boolean;
    errors: string[];
  } {
    const result = YamlToolParameterSchema.safeParse(parameter);

    if (result.success) {
      return { valid: true, errors: [] };
    }

    const errors = result.error.errors.map((err) => err.message);
    return { valid: false, errors };
  }

  /**
   * Get available parameter types
   * @returns Array of supported parameter types
   */
  static getAvailableParameterTypes(): string[] {
    return ["string", "number", "boolean", "integer"];
  }
}
