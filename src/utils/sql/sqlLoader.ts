/**
 * @fileoverview SQL template loader and processor for IBM i MCP tools
 * This module handles loading SQL files and processing template placeholders
 *
 * @module src/utils/sql/sqlLoader
 */

import fs from "fs/promises";
import { logger } from "../internal/logger.js";
import { requestContextService } from "../internal/requestContext.js";
import { SqlTemplateProcessor } from "./sqlTemplateProcessor.js";

/**
 * SQL template loader with caching and template processing
 */
export class SqlLoader {
  private static cache: Map<string, string> = new Map();

  /**
   * Load a SQL template file with caching
   */
  static async loadTemplate(filePath: string): Promise<string> {
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath)!;
    }

    const context = requestContextService.createRequestContext({
      operation: "LoadSqlTemplate",
      filePath,
    });

    try {
      const sql = await fs.readFile(filePath, "utf-8");
      this.cache.set(filePath, sql);

      logger.debug("SQL template loaded", {
        ...context,
        filePath,
        sqlLength: sql.length,
      });

      return sql;
    } catch (error) {
      logger.error("Failed to load SQL template", {
        ...context,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Load and process a SQL template with parameter substitution
   */
  static async loadAndProcess(
    filePath: string,
    params: Record<string, unknown>,
  ): Promise<string> {
    const template = await this.loadTemplate(filePath);
    return SqlTemplateProcessor.process(template, params, {
      detailedLogging: false,
      validateSyntax: true,
    });
  }

  /**
   * Clear the template cache (useful for development)
   */
  static clearCache(): void {
    this.cache.clear();
    logger.debug("SQL template cache cleared");
  }
}

/**
 * Convenience instance for direct use
 */
export const sqlLoader = SqlLoader;
