/**
 * @fileoverview Defines the core logic, schemas, and types for the `execute_sql` tool.
 * This module provides dynamic SQL execution capabilities for the IBM i database.
 * Unlike YAML tools with predefined statements, this tool accepts arbitrary SQL at runtime.
 * @module src/mcp-server/tools/executeSql/logic
 * @see {@link src/mcp-server/tools/executeSql/registration.ts} for the handler and registration logic.
 */

import { z } from "zod";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { logger, type RequestContext } from "../../../utils/index.js";
import { IBMiConnectionPool } from "../../../services/mapepire/connectionPool.js";

/**
 * Restricted SQL keywords that are not allowed in execute-sql tool
 * This provides basic protection against destructive operations
 */
const RESTRICTED_KEYWORDS = [
  "DROP",
  "DELETE",
  "TRUNCATE",
  "ALTER",
  "CREATE",
  "INSERT",
  "UPDATE",
  "GRANT",
  "REVOKE",
  "COMMIT",
  "ROLLBACK",
] as const;

/**
 * Maximum allowed SQL statement length to prevent abuse
 */
const MAX_SQL_LENGTH = 10000;

/**
 * Zod schema defining the input parameters for the `execute_sql` tool.
 * CRITICAL: The descriptions are sent to the LLM and must be clear.
 */
export const ExecuteSqlInputSchema = z.object({
  sql: z
    .string()
    .min(1, "SQL statement cannot be empty.")
    .max(
      MAX_SQL_LENGTH,
      `SQL statement cannot exceed ${MAX_SQL_LENGTH} characters.`,
    )
    .describe("The SQL statement to execute against the IBM i database."),
});

/**
 * Zod schema for the successful response of the `execute_sql` tool.
 */
export const ExecuteSqlResponseSchema = z.object({
  data: z
    .array(z.record(z.unknown()))
    .describe("Array of result rows returned by the SQL query."),
  rowCount: z
    .number()
    .int()
    .min(0)
    .describe("Number of rows returned by the query."),
  executionTimeMs: z
    .number()
    .optional()
    .describe("Query execution time in milliseconds."),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe("Additional metadata about the query execution."),
});

// Inferred TypeScript types
export type ExecuteSqlInput = z.infer<typeof ExecuteSqlInputSchema>;
export type ExecuteSqlResponse = z.infer<typeof ExecuteSqlResponseSchema>;

/**
 * Validates SQL statement for security and safety
 * @param sql - SQL statement to validate
 * @param context - Request context for logging
 * @throws {McpError} If the SQL statement contains restricted keywords or patterns
 * @private
 */
function validateSqlSecurity(sql: string, context: RequestContext): void {
  const normalizedSql = sql.trim().toUpperCase();

  // Check for restricted keywords at the beginning of statements
  for (const keyword of RESTRICTED_KEYWORDS) {
    if (normalizedSql.startsWith(keyword)) {
      logger.warning("Restricted SQL keyword detected", {
        ...context,
        keyword,
        sqlPrefix: sql.substring(0, 50),
      });
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        `SQL statement cannot start with restricted keyword: ${keyword}. Only SELECT and read-only operations are allowed.`,
        { keyword, sqlPrefix: sql.substring(0, 50) },
      );
    }
  }

  // Check for potentially dangerous patterns
  const dangerousPatterns = [
    /;\s*(DROP|DELETE|TRUNCATE|ALTER|CREATE|INSERT|UPDATE)\s+/i,
    /UNION\s+SELECT.*INTO\s+/i,
    /EXEC\s*\(/i,
    /(CALL|EXECUTE)\s+/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(sql)) {
      logger.warning("Potentially dangerous SQL pattern detected", {
        ...context,
        pattern: pattern.source,
        sqlPrefix: sql.substring(0, 100),
      });
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        "SQL statement contains potentially dangerous patterns. Only safe, read-only queries are allowed.",
        {
          pattern: pattern.source,
          sqlPrefix: sql.substring(0, 100),
        },
      );
    }
  }

  logger.debug("SQL security validation passed", {
    ...context,
    sqlLength: sql.length,
    sqlPrefix: sql.substring(0, 50),
  });
}

/**
 * Processes the core logic for the `execute_sql` tool.
 * This function executes arbitrary SQL statements against the IBM i database.
 * Only read-only operations are allowed for security.
 *
 * @param params - The validated input parameters containing the SQL statement
 * @param context - The request context for logging and tracing
 * @returns A promise resolving with the structured response data
 * @throws {McpError} If the SQL execution encounters an unrecoverable issue
 */
export async function executeSqlLogic(
  params: ExecuteSqlInput,
  context: RequestContext,
): Promise<ExecuteSqlResponse> {
  logger.debug("Processing execute SQL logic", {
    ...context,
    sqlLength: params.sql.length,
    sqlPrefix: params.sql.substring(0, 50),
  });

  // Validate SQL security before execution
  validateSqlSecurity(params.sql, context);

  const startTime = Date.now();

  try {
    // Execute the SQL query using the existing connection pool
    const result = await IBMiConnectionPool.executeQuery(
      params.sql,
      [], // No parameters for dynamic SQL
      context,
    );

    const executionTime = Date.now() - startTime;

    if (!result.success) {
      throw new McpError(
        BaseErrorCode.DATABASE_ERROR,
        "SQL query execution failed",
        {
          sql: params.sql.substring(0, 100),
          sqlReturnCode: (result as unknown as Record<string, unknown>).sql_rc,
          executionTime,
        },
      );
    }

    const response: ExecuteSqlResponse = {
      data: (result.data as Record<string, unknown>[]) || [],
      rowCount: result.data?.length || 0,
      executionTimeMs: executionTime,
    };

    // Add metadata if available from the query result
    if (result.metadata) {
      response.metadata = result.metadata as Record<string, unknown>;
    }

    logger.debug("SQL query executed successfully", {
      ...context,
      rowCount: response.rowCount,
      executionTime: response.executionTimeMs,
      sqlPrefix: params.sql.substring(0, 50),
    });

    return response;
  } catch (error) {
    const executionTime = Date.now() - startTime;

    logger.error("SQL execution failed", {
      ...context,
      error: error instanceof Error ? error.message : String(error),
      executionTime,
      sqlPrefix: params.sql.substring(0, 100),
    });

    // Re-throw McpErrors as-is, wrap other errors
    if (error instanceof McpError) {
      throw error;
    }

    throw new McpError(
      BaseErrorCode.DATABASE_ERROR,
      `SQL execution failed: ${error instanceof Error ? error.message : String(error)}`,
      {
        sql: params.sql.substring(0, 100),
        executionTime,
        originalError: error instanceof Error ? error.name : "Unknown",
      },
    );
  }
}
