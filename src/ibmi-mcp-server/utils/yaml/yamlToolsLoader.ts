/**
 * @fileoverview YAML Tools Loader - Main orchestrator for YAML-based MCP tools
 * Coordinates parsing, source management, and tool generation from YAML configuration
 *
 * @module src/utils/yaml/yamlToolsLoader
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { YamlConfigBuilder } from "./yamlConfigBuilder.js";
import { SourceManager } from "../../services/sourceManager.js";
import { YamlSqlExecutor } from "./yamlSqlExecutor.js";
import { ToolsetManager } from "./toolsetManager.js";
import { YamlToolFactory } from "./yamlToolFactory.js";
import { ErrorHandler, logger } from "@/utils/internal/index.js";
import {
  requestContextService,
  RequestContext,
} from "@/utils/internal/requestContext.js";
import { JsonRpcErrorCode, McpError } from "@/types-global/errors.js";
import { YamlToolsConfig, ProcessedYamlTool } from "./types.js";
import { existsSync, statSync } from "fs";
import { resolve } from "path";
import {
  registerExecuteSqlTool,
  setExecuteSqlConfig,
  type ExecuteSqlToolConfig,
} from "../../tools/executeSql/index.js";
import { config } from "@/config/index.js";

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
   * @param resolvedConfig - Resolved configuration with CLI precedence applied
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
        logger.info(operationContext, "Starting YAML tools loading process");
        logger.info(
          operationContext,
          `current config: ${JSON.stringify(config, null, 2)}`,
        );

        const yamlToolsPath = config.toolsYamlPath;
        // Check if tools YAML path is configured
        if (!yamlToolsPath) {
          throw new McpError(
            JsonRpcErrorCode.InvalidParams,
            "YAML tools path not configured. Please set TOOLS_YAML_PATH.",
            { toolsYamlPath: yamlToolsPath },
          );
        }

        // Use YamlConfigBuilder for flexible configuration loading
        logger.info(
          operationContext,
          `Loading YAML configuration from: ${yamlToolsPath}`,
        );

        // Support both single file and multiple files/patterns
        // Constructor automatically applies environment-configured merge options
        const configBuilder = new YamlConfigBuilder(operationContext);

        // Add sources using helper to keep this method concise
        this.configureBuilderSources(
          configBuilder,
          yamlToolsPath,
          operationContext,
        );

        // Build configuration with merging support
        const configResult = await configBuilder.build();

        if (!configResult.success || !configResult.config) {
          const errorMessage = configResult.errors
            ? configResult.errors.join(", ")
            : "Unknown build error";
          throw new McpError(
            JsonRpcErrorCode.InvalidParams,
            `Failed to build YAML configuration: ${errorMessage}`,
            {
              toolsYamlPath: yamlToolsPath,
              errors: configResult.errors,
            },
          );
        }

        const yamlConfig = configResult.config;
        const stats = configResult.stats;

        logger.info(
          {
            ...operationContext,
            sourcesTotal: stats?.sourcesTotal || 0,
            toolsTotal: stats?.toolsTotal || 0,
            toolsetsTotal: stats?.toolsetsTotal || 0,
          },
          "YAML configuration built successfully",
        );

        // Process tools for registration
        const processedTools =
          await this.processToolsForRegistration(yamlConfig);

        // Initialize source manager
        if (yamlConfig.sources) {
          if (
            Object.keys(yamlConfig.sources).length > 0 &&
            config.mcpSessionMode === "stateless"
          ) {
            logger.error(
              operationContext,
              "Multiple sources detected in non-stateful mode",
            );
          }
          logger.info(operationContext, "Registering sources");
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
          logger.info(operationContext, "No sources to register");
        }

        // Initialize SQL executor
        YamlSqlExecutor.initialize(this.sourceManager);

        // Initialize toolset manager
        logger.info(operationContext, "Initializing toolset manager");
        await this.toolsetManager.initialize(yamlConfig, operationContext);

        // Register conditional TypeScript tools (like execute_sql) when found in YAML
        logger.info(
          operationContext,
          "Processing conditional TypeScript tools",
        );
        await this.processConditionalTypeScriptTools(
          yamlConfig,
          server,
          operationContext,
        );

        // Generate and register all tools
        logger.info(operationContext, "Generating and registering tools");
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

        logger.info(
          {
            ...operationContext,
            result,
          },
          "YAML tools loaded and registered successfully",
        );

        return result;
      },
      {
        operation: "LoadAndRegisterYamlTools",
        context: operationContext,
        errorCode: JsonRpcErrorCode.InternalError,
      },
    );
  }

  /**
   * Adds YAML sources (files/dirs/globs) to the builder based on the configured path(s).
   * @private
   */
  private configureBuilderSources(
    configBuilder: YamlConfigBuilder,
    yamlToolsPath: string | string[],
    ctx: RequestContext,
  ): void {
    if (Array.isArray(yamlToolsPath)) {
      configBuilder.addFiles(yamlToolsPath);
      return;
    }

    const resolvedPath = resolve(yamlToolsPath);
    if (existsSync(resolvedPath)) {
      const stats = statSync(resolvedPath);
      if (stats.isDirectory()) {
        logger.debug(ctx, `Detected directory path: ${yamlToolsPath}`);
        configBuilder.addDirectory(yamlToolsPath);
      } else {
        logger.debug(ctx, `Detected file path: ${yamlToolsPath}`);
        configBuilder.addFile(yamlToolsPath);
      }
    } else {
      // Path doesn't exist, treat as file (YamlConfigBuilder will validate appropriately)
      configBuilder.addFile(yamlToolsPath);
    }
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
   * Process and register conditional TypeScript tools (like execute_sql) when found in YAML tools
   * @param yamlConfig - YAML configuration containing tools
   * @param server - MCP server instance for registration
   * @param context - Request context for logging
   * @private
   */
  private async processConditionalTypeScriptTools(
    yamlConfig: YamlToolsConfig,
    server: McpServer,
    context: RequestContext,
  ): Promise<void> {
    if (!yamlConfig.tools) {
      logger.debug(
        context,
        "No tools to check for conditional TypeScript tools",
      );
      return;
    }

    // Check if execute_sql is in the tools list
    if (yamlConfig.tools.execute_sql) {
      const executeSqlConfig = yamlConfig.tools.execute_sql;

      logger.info(
        {
          ...context,
          toolName: "execute_sql",
          source: executeSqlConfig.source,
          securityConfig: {
            readOnly: executeSqlConfig.security?.readOnly ?? true,
            maxQueryLength: executeSqlConfig.security?.maxQueryLength ?? 10000,
            forbiddenKeywordsCount:
              executeSqlConfig.security?.forbiddenKeywords?.length ?? 0,
          },
        },
        "Found execute_sql in YAML tools - registering TypeScript implementation",
      );

      // Validate source exists
      if (!yamlConfig.sources?.[executeSqlConfig.source]) {
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          `Tool 'execute_sql' references non-existent source '${executeSqlConfig.source}'`,
          { toolName: "execute_sql", sourceName: executeSqlConfig.source },
        );
      }

      // Configure the execute SQL tool from YAML
      const toolConfig: ExecuteSqlToolConfig = {
        enabled: true,
        description:
          executeSqlConfig.description ||
          "Execute arbitrary SQL statements against the IBM i database",
        security: {
          readOnly: executeSqlConfig.security?.readOnly ?? true, // Default to read-only for safety
          maxQueryLength: executeSqlConfig.security?.maxQueryLength ?? 10000,
          forbiddenKeywords: executeSqlConfig.security?.forbiddenKeywords ?? [],
        },
      };

      // Set the configuration and register the TypeScript tool
      setExecuteSqlConfig(toolConfig);
      await registerExecuteSqlTool(server);

      logger.info(
        {
          ...context,
          toolName: "execute_sql",
        },
        "TypeScript execute_sql tool registered successfully",
      );
    }
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
      // Skip execute_sql as it's handled by conditional TypeScript tool registration
      if (toolName === "execute_sql") {
        continue;
      }

      const sourceConfig = yamlConfig.sources?.[toolConfig.source];
      if (!sourceConfig) {
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
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
        errorCode: JsonRpcErrorCode.InvalidParams,
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
