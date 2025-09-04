/**
 * @fileoverview YAML Configuration Builder for flexible configuration loading
 * Replaces rigid initialization chain with a flexible builder pattern
 *
 * @module src/utils/yaml/yamlConfigBuilder
 */

import { resolve, join, dirname } from "path";
import { existsSync, watch, FSWatcher } from "fs";
import { glob } from "glob";
import { YamlParser } from "./yamlParser.js";
import { YamlToolsConfig } from "./types.js";
import { ErrorHandler, logger } from "@/utils/internal/index.js";
import {
  requestContextService,
  RequestContext,
} from "@/utils/internal/requestContext.js";
import { JsonRpcErrorCode, McpError } from "@/types-global/errors.js";
import { config } from "@/config/index.js";

/**
 * Configuration source interface
 */
export interface ConfigSource {
  /** Source type identifier */
  type: "file" | "directory" | "glob";
  /** Path or pattern */
  path: string;
  /** Optional base directory for relative paths */
  baseDir?: string;
  /** Whether this source is required */
  required?: boolean;
}

/**
 * Configuration merging options
 */
export interface ConfigMergeOptions {
  /** Whether to merge arrays (true) or replace them (false) */
  mergeArrays?: boolean;
  /** Whether to allow duplicate tool names */
  allowDuplicateTools?: boolean;
  /** Whether to allow duplicate source names */
  allowDuplicateSources?: boolean;
  /** Whether to validate merged config */
  validateMerged?: boolean;
}

/**
 * Configuration build result
 */
export interface ConfigBuildResult {
  /** Whether build was successful */
  success: boolean;
  /** Merged configuration */
  config?: YamlToolsConfig;
  /** Build errors */
  errors?: string[];
  /** Build warnings */
  warnings?: string[];
  /** Build statistics */
  stats?: {
    sourcesLoaded: number;
    sourcesMerged: number;
    toolsTotal: number;
    toolsetsTotal: number;
    sourcesTotal: number;
  };
}

/**
 * YAML Configuration Builder
 * Provides flexible configuration loading with support for multiple sources
 */
export class YamlConfigBuilder {
  private sources: ConfigSource[] = [];
  private mergeOptions: ConfigMergeOptions;
  private context?: RequestContext;

  // --- Static cache and watchers ---
  private static cache: Map<
    string,
    {
      success: boolean;
      config?: YamlToolsConfig;
      errors?: string[];
      warnings?: string[];
      stats?: {
        sourcesLoaded: number;
        sourcesMerged: number;
        toolsTotal: number;
        toolsetsTotal: number;
        sourcesTotal: number;
      };
      filePaths: string[];
      valid: boolean;
      lastBuilt: number;
    }
  > = new Map();
  private static fileToKeys: Map<string, Set<string>> = new Map();
  private static watchers: Map<string, FSWatcher> = new Map();
  // --- End static cache and watchers ---

  /**
   * Create a new configuration builder
   * @param context - Request context for logging
   */
  constructor(context?: RequestContext) {
    this.context =
      context ||
      requestContextService.createRequestContext({
        operation: "YamlConfigBuilder",
      });

    // Initialize merge options from environment configuration
    this.mergeOptions = {
      mergeArrays: config.yamlMergeOptions.mergeArrays,
      allowDuplicateTools: config.yamlMergeOptions.allowDuplicateTools,
      allowDuplicateSources: config.yamlMergeOptions.allowDuplicateSources,
      validateMerged: config.yamlMergeOptions.validateMerged,
    };
  }

  /**
   * Add a file source
   * @param filePath - Path to YAML file
   * @param required - Whether this source is required
   * @returns This builder instance
   */
  addFile(filePath: string, required: boolean = true): YamlConfigBuilder {
    this.sources.push({
      type: "file",
      path: filePath,
      required,
    });
    return this;
  }

  /**
   * Add a directory source (loads all .yaml/.yml files)
   * @param directoryPath - Path to directory containing YAML files
   * @param required - Whether this source is required
   * @returns This builder instance
   */
  addDirectory(
    directoryPath: string,
    required: boolean = true,
  ): YamlConfigBuilder {
    this.sources.push({
      type: "directory",
      path: directoryPath,
      required,
    });
    return this;
  }

  /**
   * Add a glob pattern source
   * @param pattern - Glob pattern for YAML files
   * @param baseDir - Base directory for relative patterns
   * @param required - Whether this source is required
   * @returns This builder instance
   */
  addGlob(
    pattern: string,
    baseDir?: string,
    required: boolean = true,
  ): YamlConfigBuilder {
    this.sources.push({
      type: "glob",
      path: pattern,
      baseDir,
      required,
    });
    return this;
  }

  /**
   * Add multiple file sources
   * @param filePaths - Array of file paths
   * @param required - Whether these sources are required
   * @returns This builder instance
   */
  addFiles(filePaths: string[], required: boolean = true): YamlConfigBuilder {
    filePaths.forEach((filePath) => this.addFile(filePath, required));
    return this;
  }

  /**
   * Configure merge options
   * @param options - Merge options
   * @returns This builder instance
   */
  configureMerging(options: Partial<ConfigMergeOptions>): YamlConfigBuilder {
    this.mergeOptions = { ...this.mergeOptions, ...options };
    return this;
  }

  /**
   * Build the configuration from all sources
   * @returns Configuration build result
   */
  async build(): Promise<ConfigBuildResult> {
    return ErrorHandler.tryCatch(
      async () => {
        logger.info(
          this.context || {},
          `Building YAML configuration from sources: ${this.sources.length} sources`,
        );

        const filePaths = await this.resolveAllFilePaths();

        // Compute a stable cache key based on resolved file paths and merge options
        const cacheKey = this.computeCacheKey(filePaths, this.mergeOptions);

        // Return cached result if valid
        const cached = YamlConfigBuilder.cache.get(cacheKey);
        if (cached && cached.valid && cached.config) {
          logger.debug(this.context || {}, `Using cached YAML configuration`);
          return {
            success: true,
            config: cached.config,
            stats: cached.stats,
          };
        }

        const configs = await this.loadAllConfigurations(filePaths);
        const mergedConfig = await this.mergeConfigurations(configs);

        const stats = {
          sourcesLoaded: filePaths.length,
          sourcesMerged: configs.length,
          toolsTotal: Object.keys(mergedConfig.tools || {}).length,
          toolsetsTotal: Object.keys(mergedConfig.toolsets || {}).length,
          sourcesTotal: Object.keys(mergedConfig.sources || {}).length,
        };

        logger.info(
          this.context || {},
          `YAML configuration built successfully: ${stats.toolsTotal} tools, ${stats.sourcesTotal} sources`,
        );

        // Update cache and establish watchers for invalidation-on-save
        YamlConfigBuilder.cache.set(cacheKey, {
          success: true,
          config: mergedConfig,
          stats,
          filePaths,
          valid: true,
          lastBuilt: Date.now(),
        });
        this.ensureWatchers(filePaths, cacheKey);

        return { success: true, config: mergedConfig, stats };
      },
      {
        operation: "BuildYamlConfig",
        context: this.context,
        errorCode: JsonRpcErrorCode.ConfigurationError,
      },
    );
  }

  /**
   * Compute a stable cache key from file paths and merge options
   */
  private computeCacheKey(
    filePaths: string[],
    options: ConfigMergeOptions,
  ): string {
    const sorted = [...filePaths].sort();
    return JSON.stringify({ files: sorted, options });
  }

  /**
   * Ensure watchers are created for the resolved YAML file paths.
   * Any change will invalidate the cache for all associated keys.
   */
  private ensureWatchers(filePaths: string[], cacheKey: string): void {
    for (const fp of filePaths) {
      // Map file -> cache keys
      if (!YamlConfigBuilder.fileToKeys.has(fp)) {
        YamlConfigBuilder.fileToKeys.set(fp, new Set());
      }
      YamlConfigBuilder.fileToKeys.get(fp)!.add(cacheKey);

      // Create file watcher if not present
      if (!YamlConfigBuilder.watchers.has(fp)) {
        try {
          const watcher = watch(fp, { persistent: false }, (eventType) => {
            const affectedKeys = YamlConfigBuilder.fileToKeys.get(fp);
            if (!affectedKeys) return;
            for (const key of affectedKeys) {
              const entry = YamlConfigBuilder.cache.get(key);
              if (entry) {
                entry.valid = false;
                entry.lastBuilt = 0;
              }
            }
            logger.info(
              this.context || {},
              `YAML changed (${eventType}) at ${fp}. Invalidated ${affectedKeys.size} cache entr${affectedKeys.size === 1 ? "y" : "ies"}.`,
            );
          });
          YamlConfigBuilder.watchers.set(fp, watcher);
        } catch (err) {
          logger.warning(
            this.context || {},
            `Failed to watch YAML file: ${fp}. ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // For directory-type sources, also watch the parent directory for adds/removes
      const dir = dirname(fp);
      const dirKey = `__dir__:${dir}`;
      if (!YamlConfigBuilder.watchers.has(dirKey)) {
        try {
          const watcher = watch(dir, { persistent: false }, () => {
            // On directory change, mark all cache entries that include any file within as invalid.
            for (const [, entry] of YamlConfigBuilder.cache.entries()) {
              if (entry.filePaths.some((p) => p.startsWith(dir))) {
                entry.valid = false;
                entry.lastBuilt = 0;
              }
            }
            logger.info(
              this.context || {},
              `Directory changed (${dir}). Invalidated YAML cache entries referencing this directory.`,
            );
          });
          YamlConfigBuilder.watchers.set(dirKey, watcher);
        } catch (err) {
          logger.debug(
            this.context || {},
            `Skipping directory watcher for ${dir}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  /**
   * Clear cache and close watchers (useful for tests)
   */
  static clearCacheAndWatchers(): void {
    for (const w of YamlConfigBuilder.watchers.values()) {
      try {
        w.close();
      } catch {
        /* empty */
      }
    }
    YamlConfigBuilder.watchers.clear();
    YamlConfigBuilder.fileToKeys.clear();
    YamlConfigBuilder.cache.clear();
  }

  /**
   * Resolve all file paths from sources
   * @private
   */
  private async resolveAllFilePaths(): Promise<string[]> {
    const allPaths: string[] = [];

    for (const source of this.sources) {
      try {
        const paths = await this.resolveSourcePaths(source);
        allPaths.push(...paths);
      } catch (error) {
        if (source.required) {
          throw error;
        }
        logger.warning(
          this.context || {},
          `Optional source not found: ${source.path} (${source.type})`,
        );
      }
    }

    // Remove duplicates
    return [...new Set(allPaths)];
  }

  /**
   * Resolve paths for a single source
   * @private
   */
  private async resolveSourcePaths(source: ConfigSource): Promise<string[]> {
    switch (source.type) {
      case "file":
        return this.resolveFilePath(source.path);

      case "directory":
        return this.resolveDirectoryPaths(source.path);

      case "glob":
        return this.resolveGlobPaths(source.path, source.baseDir);

      default:
        throw new McpError(
          JsonRpcErrorCode.ConfigurationError,
          `Unknown source type: ${(source as unknown as { type: string }).type}`,
        );
    }
  }

  /**
   * Resolve a single file path
   * @private
   */
  private resolveFilePath(filePath: string): string[] {
    const resolvedPath = resolve(filePath);
    if (!existsSync(resolvedPath)) {
      throw new McpError(
        JsonRpcErrorCode.ConfigurationError,
        `Configuration file not found: ${resolvedPath}`,
      );
    }
    return [resolvedPath];
  }

  /**
   * Resolve directory paths
   * @private
   */
  private resolveDirectoryPaths(directoryPath: string): string[] {
    const resolvedDir = resolve(directoryPath);
    if (!existsSync(resolvedDir)) {
      throw new McpError(
        JsonRpcErrorCode.ConfigurationError,
        `Configuration directory not found: ${resolvedDir}`,
      );
    }

    const pattern = join(resolvedDir, "**/*.{yaml,yml}");
    return glob.sync(pattern, { absolute: true });
  }

  /**
   * Resolve glob paths
   * @private
   */
  private resolveGlobPaths(pattern: string, baseDir?: string): string[] {
    const searchPattern = baseDir ? join(baseDir, pattern) : pattern;
    const paths = glob.sync(searchPattern, { absolute: true });

    if (paths.length === 0) {
      throw new McpError(
        JsonRpcErrorCode.ConfigurationError,
        `No files found matching pattern: ${searchPattern}`,
      );
    }

    return paths;
  }

  /**
   * Load all configurations from file paths
   * @private
   */
  private async loadAllConfigurations(
    filePaths: string[],
  ): Promise<YamlToolsConfig[]> {
    const configs: YamlToolsConfig[] = [];

    for (const filePath of filePaths) {
      try {
        logger.debug(
          this.context || {},
          `Loading configuration from: ${filePath}`,
        );
        const result = await YamlParser.parseYamlFile(filePath, this.context);

        if (result.success && result.config) {
          configs.push(result.config);
        } else {
          logger.error(
            this.context || {},
            `Failed to load configuration from: ${filePath}`,
          );
        }
      } catch (error) {
        logger.error(
          this.context || {},
          `Error loading configuration from: ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    }

    return configs;
  }

  /**
   * Merge multiple configurations
   * @private
   */
  private async mergeConfigurations(
    configs: YamlToolsConfig[],
  ): Promise<YamlToolsConfig> {
    if (configs.length === 0) {
      throw new McpError(
        JsonRpcErrorCode.ConfigurationError,
        "No valid configurations to merge",
      );
    }

    if (configs.length === 1) {
      return configs[0]!;
    }

    logger.debug(
      this.context || {},
      `Merging ${configs.length} configurations`,
    );

    const mergedConfig: YamlToolsConfig = {
      sources: {},
      tools: {},
      toolsets: {},
      metadata: {},
    };

    // Merge each configuration
    for (const config of configs) {
      await this.mergeIntoTarget(mergedConfig, config);
    }

    // Validate merged configuration if requested
    if (this.mergeOptions.validateMerged) {
      await this.validateMergedConfiguration(mergedConfig);
    }

    return mergedConfig;
  }

  /**
   * Merge a configuration into the target
   * @private
   */
  private async mergeIntoTarget(
    target: YamlToolsConfig,
    source: YamlToolsConfig,
  ): Promise<void> {
    // Merge sources
    if (source.sources) {
      if (!target.sources) {
        target.sources = {};
      }
      for (const [sourceName, sourceConfig] of Object.entries(source.sources)) {
        if (target.sources[sourceName]) {
          if (!this.mergeOptions.allowDuplicateSources) {
            throw new McpError(
              JsonRpcErrorCode.ConfigurationError,
              `Duplicate source name: ${sourceName}`,
            );
          }
          logger.warning(
            this.context || {},
            `Overriding existing source: ${sourceName}`,
          );
        }
        target.sources[sourceName] = sourceConfig;
      }
    }

    // Merge tools
    if (source.tools) {
      if (!target.tools) {
        target.tools = {};
      }
      for (const [toolName, toolConfig] of Object.entries(source.tools)) {
        if (target.tools[toolName]) {
          if (!this.mergeOptions.allowDuplicateTools) {
            throw new McpError(
              JsonRpcErrorCode.ConfigurationError,
              `Duplicate tool name: ${toolName}`,
            );
          }
          logger.warning(
            this.context || {},
            `Overriding existing tool: ${toolName}`,
          );
        }
        target.tools[toolName] = toolConfig;
      }
    }

    // Merge toolsets
    if (source.toolsets) {
      if (!target.toolsets) {
        target.toolsets = {};
      }
      for (const [toolsetName, toolsetConfig] of Object.entries(
        source.toolsets,
      )) {
        if (target.toolsets[toolsetName]) {
          if (this.mergeOptions.mergeArrays) {
            // Merge tool arrays
            target.toolsets[toolsetName].tools = [
              ...target.toolsets[toolsetName].tools,
              ...toolsetConfig.tools,
            ];
          } else {
            // Replace with new toolset
            target.toolsets[toolsetName] = toolsetConfig;
          }
        } else {
          target.toolsets[toolsetName] = toolsetConfig;
        }
      }
    }

    // Merge metadata
    if (source.metadata) {
      if (!target.metadata) {
        target.metadata = {};
      }
      target.metadata = { ...target.metadata, ...source.metadata };
    }
  }

  /**
   * Validate the merged configuration
   * @private
   */
  private async validateMergedConfiguration(
    config: YamlToolsConfig,
  ): Promise<void> {
    // Validate that all tool sources exist (only if both sections exist)
    if (config.tools && config.sources) {
      for (const [toolName, toolConfig] of Object.entries(config.tools)) {
        if (!config.sources[toolConfig.source]) {
          throw new McpError(
            JsonRpcErrorCode.ConfigurationError,
            `Tool '${toolName}' references non-existent source '${toolConfig.source}'`,
          );
        }
      }
    }

    // Validate that all toolset tools exist (only if both sections exist)
    if (config.toolsets && config.tools) {
      for (const [toolsetName, toolsetConfig] of Object.entries(
        config.toolsets,
      )) {
        for (const toolName of toolsetConfig.tools) {
          if (!config.tools[toolName]) {
            throw new McpError(
              JsonRpcErrorCode.ConfigurationError,
              `Toolset '${toolsetName}' references non-existent tool '${toolName}'`,
            );
          }
        }
      }
    }

    logger.debug(
      this.context || {},
      "Merged configuration validated successfully",
    );
  }

  /**
   * Static factory method for simple single-file loading
   * @param filePath - Path to YAML file
   * @param context - Request context
   * @returns Built configuration
   */
  static async fromFile(
    filePath: string,
    context?: RequestContext,
  ): Promise<ConfigBuildResult> {
    return new YamlConfigBuilder(context).addFile(filePath).build();
  }

  /**
   * Static factory method for multiple files
   * @param filePaths - Array of file paths
   * @param context - Request context
   * @returns Built configuration
   */
  static async fromFiles(
    filePaths: string[],
    context?: RequestContext,
  ): Promise<ConfigBuildResult> {
    return new YamlConfigBuilder(context).addFiles(filePaths).build();
  }

  /**
   * Static factory method for directory loading
   * @param directoryPath - Path to directory
   * @param context - Request context
   * @returns Built configuration
   */
  static async fromDirectory(
    directoryPath: string,
    context?: RequestContext,
  ): Promise<ConfigBuildResult> {
    return new YamlConfigBuilder(context).addDirectory(directoryPath).build();
  }

  /**
   * Static factory method for glob pattern loading
   * @param pattern - Glob pattern
   * @param baseDir - Base directory
   * @param context - Request context
   * @returns Built configuration
   */
  static async fromGlob(
    pattern: string,
    baseDir?: string,
    context?: RequestContext,
  ): Promise<ConfigBuildResult> {
    return new YamlConfigBuilder(context).addGlob(pattern, baseDir).build();
  }
}
