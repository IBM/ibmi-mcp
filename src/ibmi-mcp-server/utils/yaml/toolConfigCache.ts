/**
 * @fileoverview Tool Configuration Cache - Caches pre-processed YAML tool configurations for fast server registration
 * Separates expensive YAML parsing from fast server registration to improve connection performance
 *
 * @module src/ibmi-mcp-server/utils/yaml/toolConfigCache
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger, RequestContext } from "@/utils/internal/index.js";

/**
 * Cached tool configuration that contains all pre-processed data needed for fast registration
 */
export interface CachedToolConfig {
  /** Tool name/identifier */
  name: string;
  /** Tool title for display */
  title: string;
  /** Tool description */
  description: string;
  /** Pre-built Zod input schema */
  inputSchema: Record<string, z.ZodTypeAny>;
  /** Output schema shape */
  outputSchema: Record<string, z.ZodTypeAny>;
  /** Tool annotations including toolsets */
  annotations: {
    title: string;
    domain?: string;
    category?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
    toolsets: string[];
    customMetadata?: Record<string, unknown>;
  };
  /** Pre-built tool handler function */
  handler: (
    params: Record<string, unknown>,
    mcpContext: Record<string, unknown>,
  ) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    structuredContent: Record<string, unknown>;
    isError?: boolean;
  }>;
}

/**
 * Statistics about the cached tools
 */
export interface ToolCacheStats {
  /** Number of cached tools */
  toolCount: number;
  /** Number of toolsets */
  toolsetCount: number;
  /** Last cache build timestamp */
  lastBuilt?: Date;
  /** Cache build duration in milliseconds */
  buildDurationMs?: number;
  /** Whether cache is currently being rebuilt */
  isRebuilding: boolean;
}

/**
 * Tool Configuration Cache - Singleton class that manages cached tool configurations
 * Provides fast tool registration by pre-processing YAML configurations during startup
 */
export class ToolConfigCache {
  private static instance: ToolConfigCache | null = null;
  private cache: Map<string, CachedToolConfig> = new Map();
  private stats: ToolCacheStats = {
    toolCount: 0,
    toolsetCount: 0,
    isRebuilding: false,
  };

  /**
   * Get or create the singleton instance
   */
  static getInstance(): ToolConfigCache {
    if (!ToolConfigCache.instance) {
      ToolConfigCache.instance = new ToolConfigCache();
    }
    return ToolConfigCache.instance;
  }

  /**
   * Cache pre-built tool configurations
   * @param toolConfigs - Array of already-created tool configurations
   * @param context - Request context
   */
  cacheToolConfigs(
    toolConfigs: CachedToolConfig[],
    context?: RequestContext,
  ): {
    success: boolean;
    error?: string;
    toolCount: number;
    toolsetCount: number;
  } {
    const cacheContext = context
      ? {
          ...context,
          operation: "ToolConfigCache.cacheToolConfigs",
        }
      : { operation: "ToolConfigCache.cacheToolConfigs" };

    logger.info(
      cacheContext,
      `Caching ${toolConfigs.length} pre-built tool configurations`,
    );

    const cacheStart = Date.now();
    this.stats.isRebuilding = true;

    try {
      // Clear existing cache
      this.cache.clear();

      let cachedToolCount = 0;
      const toolsetNames = new Set<string>();

      for (const toolConfig of toolConfigs) {
        try {
          this.cache.set(toolConfig.name, toolConfig);
          cachedToolCount++;

          // Collect toolset names
          toolConfig.annotations.toolsets.forEach((ts) => toolsetNames.add(ts));
        } catch (error) {
          logger.error(
            cacheContext,
            `Failed to cache tool ${toolConfig.name}: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Continue with other tools
        }
      }

      // Update stats
      const cacheDuration = Date.now() - cacheStart;
      this.stats = {
        toolCount: cachedToolCount,
        toolsetCount: toolsetNames.size,
        lastBuilt: new Date(),
        buildDurationMs: cacheDuration,
        isRebuilding: false,
      };

      logger.info(
        cacheContext,
        `Tool configurations cached successfully: ${cachedToolCount} tools, ${toolsetNames.size} toolsets in ${cacheDuration}ms`,
      );

      return {
        success: true,
        toolCount: cachedToolCount,
        toolsetCount: toolsetNames.size,
      };
    } catch (error) {
      this.stats.isRebuilding = false;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        cacheContext,
        `Failed to cache tool configurations: ${errorMessage}`,
      );

      return {
        success: false,
        error: errorMessage,
        toolCount: 0,
        toolsetCount: 0,
      };
    }
  }

  /**
   * Register all cached tools with an MCP server
   * This is extremely fast since all preprocessing is done
   */
  async registerCachedTools(
    server: McpServer,
    context: RequestContext,
  ): Promise<void> {
    const registrationContext = {
      ...context,
      operation: "ToolConfigCache.registerCachedTools",
    };

    if (this.cache.size === 0) {
      logger.warning(
        registrationContext,
        "No cached tools available for registration",
      );
      return;
    }

    logger.info(
      registrationContext,
      `Registering ${this.cache.size} cached tools`,
    );

    const registrationStart = Date.now();
    let registeredCount = 0;

    for (const [toolName, config] of this.cache) {
      try {
        server.registerTool(
          toolName,
          {
            title: config.title,
            description: config.description,
            inputSchema: config.inputSchema,
            outputSchema: config.outputSchema,
            annotations: config.annotations,
          },
          config.handler,
        );
        registeredCount++;
      } catch (error) {
        logger.error(
          registrationContext,
          `Failed to register cached tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const registrationDuration = Date.now() - registrationStart;
    logger.info(
      registrationContext,
      `Registered ${registeredCount} cached tools in ${registrationDuration}ms`,
    );
  }

  /**
   * Get cache statistics
   */
  getStats(): ToolCacheStats {
    return { ...this.stats };
  }

  /**
   * Get all cached tool names
   */
  getCachedToolNames(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Check if cache has any tools
   */
  isEmpty(): boolean {
    return this.cache.size === 0;
  }

  /**
   * Clear the cache (for testing)
   */
  clear(): void {
    this.cache.clear();
    this.stats = {
      toolCount: 0,
      toolsetCount: 0,
      isRebuilding: false,
    };
  }
}
