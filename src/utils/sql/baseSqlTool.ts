/**
 * @fileoverview Base SQL tool utility for consistent SQL-based MCP tools
 * This utility provides a standardized way to create SQL-based tools with metadata and query files.
 *
 * @module src/utils/sql/baseSqlTool
 */

import path from "path";
import { fileURLToPath } from "url";
import { sqlLoader } from "./sqlLoader.js";
import { IBMiConnectionPool } from "../../services/mapepire/connectionPool.js";
import { RequestContext } from "../internal/requestContext.js";

export interface SqlToolMetadata {
  name: string;
  description: string;
  sqlFile: string;
  domain?: string;
  category?: string;
}

/**
 * Execute a SQL tool with standardized metadata and query loading
 * @param toolDirectory - The directory containing the tool files (use import.meta.url)
 * @param metadata - Tool metadata containing SQL file path
 * @param params - Parameters to pass to the SQL template
 * @param context - Request context for logging and error handling
 * @returns Query results data array
 */
export async function executeSqlTool<
  TRow = unknown,
  TParams extends Record<string, unknown> = Record<string, unknown>,
>(
  toolDirectory: string,
  metadata: SqlToolMetadata,
  params: TParams,
  context: RequestContext,
): Promise<TRow[]> {
  // Convert import.meta.url to directory path
  const toolDir = path.dirname(fileURLToPath(toolDirectory));

  // Resolve SQL file path relative to tool directory
  const sqlFilePath = path.join(toolDir, metadata.sqlFile);

  // Load and process SQL template
  const sql = await sqlLoader.loadAndProcess(sqlFilePath, params);

  // Execute query
  const result = await IBMiConnectionPool.executeQuery<TRow>(sql, [], context);

  // Return just the data array
  return result.data;
}
