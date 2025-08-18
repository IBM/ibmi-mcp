/**
 * @fileoverview YAML Tools Loader - Main orchestrator for YAML-based MCP tools
 * Coordinates parsing, source management, and tool generation from YAML configuration
 *
 * @module src/utils/yaml/yamlToolsLoader
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "../../config/index.js";
import { YamlConfigBuilder } from "./yamlConfigBuilder.js";
import { SourceManager } from "../../services/yaml-sources/sourceManager.js";
import { YamlSqlExecutor } from "./yamlSqlExecutor.js";
import { ToolsetManager } from "./toolsetManager.js";
import { YamlToolFactory } from "./yamlToolFactory.js";
import { ErrorHandler, logger } from "../internal/index.js";
import {
  requestContextService,
  RequestContext,
} from "../internal/requestContext.js";
import { BaseErrorCode, McpError } from "../../types-global/errors.js";
import {
  YamlToolsConfig,
  ProcessedYamlTool,
} from "../../types-global/yaml-tools.js";
import { existsSync, statSync } from "fs";
import { resolve } from "path";

/**
 * YAML tools loading result
 */
export interface YamlToolsLoadingResult {
  /** Whether loading was successful */
  success: boolean;
  /** Total number of tools loaded */
  toolCount: number;
  /** Total number of sources loaded */
  sourceCount: number;
  /** Total number of toolsets loaded */
  toolsetCount: number;
  /** Error message if loading failed */
  error?: string;
  /** Loading statistics */
  stats?: {
    toolsRegistered: number;
    parametersTotal: number;
    sourcesRegistered: number;
    toolsetMappings: number;
  };
}

/**
 * Dependencies for YamlToolsLoader
 */
export interface YamlToolsLoaderDependencies {
  sourceManager: SourceManager;
  toolsetManager: ToolsetManager;
  toolFactory: YamlToolFactory;
}

/**
 * YAML Tools Loader
 * Main orchestrator for the entire YAML tools system
 * Refactored to use dependency injection instead of singletons
 */
export class YamlToolsLoader {
  private static instance: YamlToolsLoader | undefined;
  private sourceManager: SourceManager;
  private toolsetManager: ToolsetManager;
  private toolFactory: YamlToolFactory;
  private isInitialized: boolean = false;

  /**
   * Get the singleton instance of the YamlToolsLoader (legacy support)
   * @deprecated Use createInstance() with dependencies instead
   */
  static getInstance(): YamlToolsLoader {
    if (!YamlToolsLoader.instance) {
      YamlToolsLoader.instance = new YamlToolsLoader();
    }
    return YamlToolsLoader.instance;
  }

  /**
   * Create a new instance with explicit dependencies
   * @param dependencies - Dependencies for the loader
   */
  static createInstance(
    dependencies: YamlToolsLoaderDependencies,
  ): YamlToolsLoader {
    return new YamlToolsLoader(dependencies);
  }

  /**
   * Create a new instance with default dependencies (for backward compatibility)
   */
  static createWithDefaults(): YamlToolsLoader {
    return new YamlToolsLoader();
  }

  constructor(dependencies?: YamlToolsLoaderDependencies) {
    if (dependencies) {
      // Use provided dependencies
      this.sourceManager = dependencies.sourceManager;
      this.toolsetManager = dependencies.toolsetManager;
      this.toolFactory = dependencies.toolFactory;
    } else {
      // Fall back to singletons (for backward compatibility)
      this.sourceManager = SourceManager.getInstance();
      this.toolsetManager = ToolsetManager.getInstance();
      this.toolFactory = YamlToolFactory.getInstance();
    }
  }

  /**
   * Load and register all YAML tools from configuration
   * @param server - MCP server instance
   * @param context - Request context for logging
   * @returns Loading result
   */
  async loadAndRegisterTools(
    server: McpServer,
    context?: RequestContext,
  ): Promise<YamlToolsLoadingResult> {
    const operationContext =
      context ||
      requestContextService.createRequestContext({
        operation: "LoadAndRegisterYamlTools",
      });

    return ErrorHandler.tryCatch(
      async () => {
        logger.info("Starting YAML tools loading process", operationContext);

        // Check if tools YAML path is configured
        if (!config.toolsYamlPath) {
          throw new McpError(
            BaseErrorCode.CONFIGURATION_ERROR,
            "YAML tools path not configured. Please set TOOLS_YAML_PATH.",
            { toolsYamlPath: config.toolsYamlPath },
          );
        }

        // Use YamlConfigBuilder for flexible configuration loading
        logger.info(
          `Loading YAML configuration from: ${config.toolsYamlPath}`,
          operationContext,
        );

        // Support both single file and multiple files/patterns
        // Constructor automatically applies environment-configured merge options
        const configBuilder = new YamlConfigBuilder(operationContext);

        // Check if toolsYamlPath is a string or array
        if (Array.isArray(config.toolsYamlPath)) {
          configBuilder.addFiles(config.toolsYamlPath);
        } else {
          // Check if the path is a directory or file
          const resolvedPath = resolve(config.toolsYamlPath);
          if (existsSync(resolvedPath)) {
            const stats = statSync(resolvedPath);
            if (stats.isDirectory()) {
              logger.debug(
                `Detected directory path: ${config.toolsYamlPath}`,
                operationContext,
              );
              configBuilder.addDirectory(config.toolsYamlPath);
            } else {
              logger.debug(
                `Detected file path: ${config.toolsYamlPath}`,
                operationContext,
              );
              configBuilder.addFile(config.toolsYamlPath);
            }
          } else {
            // Path doesn't exist, treat as file (will error appropriately in YamlConfigBuilder)
            configBuilder.addFile(config.toolsYamlPath);
          }
        }

        // Build configuration with merging support
        const configResult = await configBuilder.build();

        if (!configResult.success || !configResult.config) {
          const errorMessage = configResult.errors
            ? configResult.errors.join(", ")
            : "Unknown build error";
          throw new McpError(
            BaseErrorCode.CONFIGURATION_ERROR,
            `Failed to build YAML configuration: ${errorMessage}`,
            {
              toolsYamlPath: config.toolsYamlPath,
              errors: configResult.errors,
            },
          );
        }

        const yamlConfig = configResult.config;
        const stats = configResult.stats;

        logger.info("YAML configuration built successfully", {
          ...operationContext,
          sourcesTotal: stats?.sourcesTotal || 0,
          toolsTotal: stats?.toolsTotal || 0,
          toolsetsTotal: stats?.toolsetsTotal || 0,
        });

        // Process tools for registration
        const processedTools =
          await this.processToolsForRegistration(yamlConfig);

        // Initialize source manager
        if (yamlConfig.sources) {
          logger.info("Registering sources", operationContext);
          for (const [sourceName, sourceConfig] of Object.entries(
            yamlConfig.sources,
          )) {
            await this.sourceManager.registerSource(
              sourceName,
              sourceConfig,
              operationContext,
            );
          }
        } else {
          logger.info("No sources to register", operationContext);
        }

        // Initialize SQL executor
        YamlSqlExecutor.initialize(this.sourceManager);

        // Initialize toolset manager
        logger.info("Initializing toolset manager", operationContext);
        await this.toolsetManager.initialize(yamlConfig, operationContext);

        // Generate and register all tools
        logger.info("Generating and registering tools", operationContext);
        await this.toolFactory.generateAndRegisterAllTools(
          processedTools!,
          server,
          operationContext,
        );

        // Mark as initialized
        this.isInitialized = true;

        // Get final statistics
        const toolFactoryStats = this.toolFactory.getStats();
        const sourceManagerStatus = this.sourceManager.getSourcesStatus();
        const toolsetStats = this.toolsetManager.getToolsetStats();

        const result: YamlToolsLoadingResult = {
          success: true,
          toolCount: stats?.toolsTotal || 0,
          sourceCount: stats?.sourcesTotal || 0,
          toolsetCount: stats?.toolsetsTotal || 0,
          stats: {
            toolsRegistered: toolFactoryStats.totalRegistered,
            parametersTotal: toolFactoryStats.totalParameters,
            sourcesRegistered: Object.keys(sourceManagerStatus).length,
            toolsetMappings: toolsetStats.totalTools,
          },
        };

        logger.info("YAML tools loaded and registered successfully", {
          ...operationContext,
          result,
        });

        return result;
      },
      {
        operation: "LoadAndRegisterYamlTools",
        context: operationContext,
        errorCode: BaseErrorCode.INITIALIZATION_FAILED,
      },
    );
  }

  /**
   * Get the current status of the YAML tools system
   * @returns Status information
   */
  getStatus(): {
    initialized: boolean;
    sourceManager: Record<string, unknown>;
    toolsetManager: Record<string, unknown>;
    toolFactory: Record<string, unknown>;
  } {
    return {
      initialized: this.isInitialized,
      sourceManager: this.sourceManager.getSourcesStatus(),
      toolsetManager: this.toolsetManager.getSummary(),
      toolFactory: this.toolFactory.getSummary(),
    };
  }

  /**
   * Get health status of all sources
   * @param context - Request context
   * @returns Health status for all sources
   */
  async getSourcesHealth(context?: RequestContext): Promise<unknown[]> {
    const operationContext =
      context ||
      requestContextService.createRequestContext({
        operation: "GetSourcesHealth",
      });

    return this.sourceManager.getAllSourcesHealth(operationContext);
  }

  /**
   * Get detailed statistics about the YAML tools system
   * @returns Detailed statistics
   */
  getDetailedStats() {
    return {
      system: this.getStatus(),
      sources: this.sourceManager.getSourcesStatus(),
      toolsets: this.toolsetManager.getToolsetStats(),
      tools: this.toolFactory.getStats(),
    };
  }

  /**
   * Process tools for registration by creating ProcessedYamlTool objects
   * @param yamlConfig - The YAML configuration
   * @param context - Request context for logging
   * @returns Array of processed tools
   * @private
   */
  private async processToolsForRegistration(
    yamlConfig: YamlToolsConfig,
  ): Promise<ProcessedYamlTool[]> {
    const processedTools: ProcessedYamlTool[] = [];

    // Return empty array if no tools to process
    if (!yamlConfig.tools) {
      return processedTools;
    }

    for (const [toolName, toolConfig] of Object.entries(yamlConfig.tools)) {
      const sourceConfig = yamlConfig.sources?.[toolConfig.source];
      if (!sourceConfig) {
        throw new McpError(
          BaseErrorCode.CONFIGURATION_ERROR,
          `Tool '${toolName}' references non-existent source '${toolConfig.source}'`,
        );
      }

      // Find toolsets that contain this tool
      const toolsets: string[] = [];
      if (yamlConfig.toolsets) {
        for (const [toolsetName, toolsetConfig] of Object.entries(
          yamlConfig.toolsets,
        )) {
          if (toolsetConfig.tools.includes(toolName)) {
            toolsets.push(toolsetName);
          }
        }
      }

      const processedTool: ProcessedYamlTool = {
        name: toolName,
        config: toolConfig,
        source: sourceConfig,
        toolsets,
        metadata: {
          name: toolName,
          description: toolConfig.description,
          domain: toolConfig.domain,
          category: toolConfig.category,
          toolsets,
        },
      };

      processedTools.push(processedTool);
    }

    return processedTools;
  }

  /**
   * Validate the YAML configuration file
   * @param yamlPath - The file path to the YAML tools configuration
   * @param context - Request context for logging
   * @returns Validation result
   */
  async validateYamlConfiguration(yamlPath: string, context?: RequestContext) {
    const operationContext =
      context ||
      requestContextService.createRequestContext({
        operation: "ValidateYamlConfiguration",
        yamlPath: yamlPath,
      });

    return ErrorHandler.tryCatch(
      async () => {
        const result = await YamlConfigBuilder.fromFile(
          yamlPath,
          operationContext,
        );
        if (!result.success) {
          return {
            valid: false,
            errors: result.errors,
            stats: result.stats,
          };
        }
        return {
          valid: true,
          errors: [],
          stats: result.stats,
        };
      },
      {
        operation: "ValidateYamlConfiguration",
        context: operationContext,
        errorCode: BaseErrorCode.CONFIGURATION_ERROR,
      },
    );
  }

  /**
   * Clear all data and reset (for testing)
   */
  clearAll(): void {
    this.sourceManager.clearAllSources();
    this.toolsetManager.clearAll();
    this.toolFactory.clearAll();
    this.isInitialized = false;
  }

  /**
   * Check if the system is initialized
   * @returns True if initialized
   */
  isSystemInitialized(): boolean {
    return this.isInitialized;
  }

  //   private getSystemStatus() {
  //     return {
  //       initialized: this.isInitialized,
  //       pid: process.pid,
  //       uptime: process.uptime(),
  //       memoryUsage: process.memoryUsage(),
  //       nodeVersion: process.version,
  //       platform: process.platform,
  //       toolsYamlPath: config.toolsYamlPath,
  //     };
  //   }
}
