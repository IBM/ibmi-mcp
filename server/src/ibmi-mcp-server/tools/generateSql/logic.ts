/**
 * @fileoverview Defines the core logic, schemas, and types for the `generate_sql` tool.
 * This module is the single source of truth for the tool's data contracts (Zod schemas)
 * and its pure business logic for generating SQL DDL statements from IBM i database objects.
 * @module src/mcp-server/tools/generateSql/logic
 * @see {@link src/mcp-server/tools/generateSql/registration.ts} for the handler and registration logic.
 */

import { z } from "zod";
import { JsonRpcErrorCode, McpError } from "../../../types-global/errors.js";
import { getRequestContext } from "../../../utils/index.js";
import { logger } from "../../../utils/internal/logger.js";
import { IBMiConnectionPool } from "../../services/connectionPool.js";

/**
 * Supported IBM i database object types for DDL generation.
 * These correspond to the valid values for the DATABASE_OBJECT_TYPE parameter
 * of the QSYS2.GENERATE_SQL stored procedure.
 */
const OBJECT_TYPES = [
  "ALIAS",
  "CONSTRAINT",
  "FUNCTION",
  "INDEX",
  "MASK",
  "PERMISSION",
  "PROCEDURE",
  "SCHEMA",
  "SEQUENCE",
  "TABLE",
  "TRIGGER",
  "TYPE",
  "VARIABLE",
  "VIEW",
  "XSR",
] as const;

/**
 * Zod schema defining the input parameters for the `generate_sql` tool.
 */
export const GenerateSqlInputSchema = z
  .object({
    object_name: z
      .string()
      .min(1, "Object name cannot be empty.")
      .max(128, "Object name cannot exceed 128 characters.")
      .describe("The name of the IBM i database object to generate DDL for."),
    object_library: z
      .string()
      .min(1, "Library name cannot be empty.")
      .max(128, "Library name cannot exceed 128 characters.")
      .default("QSYS2")
      .describe(
        "The library where the database object is located. Defaults to QSYS2.",
      ),
    object_type: z
      .enum(OBJECT_TYPES)
      .default("TABLE")
      .describe(
        "The type of database object to generate DDL for. Valid types include TABLE, VIEW, INDEX, PROCEDURE, FUNCTION, etc.",
      ),
  })
  .describe("Input schema for generating SQL DDL");

/**
 * Zod schema for the successful response of the `generate_sql` tool.
 * Contains the generated DDL along with metadata about the source object.
 */
export const GenerateSqlOutputSchema = z
  .object({
    sql: z
      .string()
      .min(1, "Generated SQL cannot be empty.")
      .describe(
        "The generated DDL SQL statements for the specified database object.",
      ),
    object_name: z
      .string()
      .describe("The name of the object the DDL was generated for."),
    object_library: z
      .string()
      .describe("The library of the object the DDL was generated for."),
    object_type: z
      .string()
      .describe("The type of the object the DDL was generated for."),
  })
  .describe("Output schema for generated SQL DDL");

/**
 * TypeScript type inferred from the input schema.
 * Represents the validated parameters passed to the generate SQL logic.
 */
export type GenerateSqlInput = z.infer<typeof GenerateSqlInputSchema>;

/**
 * TypeScript type inferred from the output schema.
 * Represents the structured response returned by the generate SQL logic.
 */
export type GenerateSqlOutput = z.infer<typeof GenerateSqlOutputSchema>;

/**
 * Processes the core logic for the `generate_sql` tool.
 * This function calls the QSYS2.GENERATE_SQL procedure to generate DDL for IBM i database objects.
 *
 * @param params - The validated input parameters containing object details
 * @returns A promise resolving with the generated SQL DDL
 * @throws {McpError} If the SQL generation encounters an unrecoverable issue
 */
export async function generateSqlLogic(
  params: GenerateSqlInput,
): Promise<GenerateSqlOutput> {
  const context = getRequestContext();
  logger.debug(
    { ...context, toolInput: params },
    "Processing generate SQL DDL logic.",
  );

  const sql = `CALL QSYS2.GENERATE_SQL(
    DATABASE_OBJECT_NAME => ?,
    DATABASE_OBJECT_LIBRARY_NAME => ?,
    DATABASE_OBJECT_TYPE => ?,
    CREATE_OR_REPLACE_OPTION => '1',
    PRIVILEGES_OPTION => '0',
    STATEMENT_FORMATTING_OPTION => '0',
    SOURCE_STREAM_FILE_END_OF_LINE => 'LF',
    SOURCE_STREAM_FILE_CCSID => 1208
  )`;

  const startTime = Date.now();

  try {
    // Execute the GENERATE_SQL procedure using pagination to get all results
    const result = await IBMiConnectionPool.executeQueryWithPagination(
      sql,
      [params.object_name, params.object_library, params.object_type],
      context,
      500, // Fetch 500 rows at a time
    );

    const executionTime = Date.now() - startTime;

    if (!result.success) {
      throw new McpError(
        JsonRpcErrorCode.DatabaseError,
        "SQL DDL generation failed",
        {
          objectName: params.object_name,
          objectLibrary: params.object_library,
          objectType: params.object_type,
          sqlReturnCode: result.sql_rc,
          executionTime,
        },
      );
    }

    // Process the result data to extract the generated DDL
    let generatedSql = "";

    if (result.data && Array.isArray(result.data)) {
      logger.debug(
        {
          ...context,
          totalRows: result.data.length,
          firstRowKeys: result.data[0] ? Object.keys(result.data[0]) : [],
        },
        "Processing GENERATE_SQL result data.",
      );

      // Build the result string from the SRCDTA column
      // Results are already in correct order from the paginated query
      const resultStrings: string[] = [];
      for (const res of result.data) {
        if (res && typeof res === "object" && "SRCDTA" in res) {
          const srcData = (res as Record<string, unknown>).SRCDTA;
          if (srcData && typeof srcData === "string") {
            resultStrings.push(srcData);
          }
        }
      }
      generatedSql = resultStrings.join("\n");

      logger.debug(
        {
          ...context,
          processedRows: resultStrings.length,
          totalDdlLength: generatedSql.length,
          avgRowLength:
            resultStrings.length > 0
              ? Math.round(generatedSql.length / resultStrings.length)
              : 0,
        },
        "DDL extraction completed.",
      );
    }

    if (!generatedSql || generatedSql.trim().length === 0) {
      throw new McpError(
        JsonRpcErrorCode.DatabaseError,
        "No SQL DDL generated for the specified object",
        {
          objectName: params.object_name,
          objectLibrary: params.object_library,
          objectType: params.object_type,
          resultRowCount: result.data?.length || 0,
        },
      );
    }

    const response: GenerateSqlOutput = {
      sql: generatedSql.trim(),
      object_name: params.object_name,
      object_library: params.object_library,
      object_type: params.object_type,
    };

    logger.debug(
      {
        ...context,
        objectName: params.object_name,
        objectLibrary: params.object_library,
        objectType: params.object_type,
        sqlLength: response.sql.length,
        executionTime,
        rowCount: result.data?.length || 0,
      },
      "SQL DDL generated successfully.",
    );

    return response;
  } catch (error) {
    const executionTime = Date.now() - startTime;

    logger.error(
      {
        ...context,
        error: error instanceof Error ? error.message : String(error),
        objectName: params.object_name,
        objectLibrary: params.object_library,
        objectType: params.object_type,
        executionTime,
      },
      "SQL DDL generation failed.",
    );

    // Re-throw McpErrors as-is, wrap other errors
    if (error instanceof McpError) {
      throw error;
    }

    throw new McpError(
      JsonRpcErrorCode.DatabaseError,
      `SQL DDL generation failed: ${error instanceof Error ? error.message : String(error)}`,
      {
        objectName: params.object_name,
        objectLibrary: params.object_library,
        objectType: params.object_type,
        executionTime,
        originalError: error instanceof Error ? error.name : "Unknown",
      },
    );
  }
}
