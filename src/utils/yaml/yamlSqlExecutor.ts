/**
 * @fileoverview SQL execution engine for YAML-defined tools
 * Processes SQL templates and executes queries using SourceManager
 *
 * @module src/utils/yaml/yamlSqlExecutor
 */

import { SourceManager } from "../../services/yaml-sources/sourceManager.js";
import { YamlToolExecutionResult } from "../../types-global/yaml-tools.js";
import { ErrorHandler, logger } from "../internal/index.js";
import {
  requestContextService,
  RequestContext,
} from "../internal/requestContext.js";
import { BaseErrorCode, McpError } from "../../types-global/errors.js";
import { SqlTemplateProcessor } from "../sql/sqlTemplateProcessor.js";

/**
 * SQL execution engine for YAML-defined tools
 * Handles template processing and multi-source query execution
 */
export class YamlSqlExecutor {
  private static sourceManager: SourceManager;

  /**
   * Initialize the SQL executor with a source manager
   * @param sourceManager - Source manager instance
   */
  static initialize(sourceManager: SourceManager): void {
    this.sourceManager = sourceManager;
  }

  // /**
  //  * Execute a YAML-defined SQL tool
  //  * @param executionContext - Tool execution context
  //  * @param context - Request context for logging
  //  * @returns Execution result with data and metadata
  //  */
  // static async executeTool<T = any>(
  //   executionContext: YamlToolExecutionContext,
  //   context?: RequestContext
  // ): Promise<YamlToolExecutionResult<T>> {
  //   const operationContext = context || requestContextService.createRequestContext({
  //     operation: 'ExecuteYamlTool',
  //     toolName: executionContext.toolName,
  //     sourceName: executionContext.sourceName
  //   });

  //   const startTime = Date.now();

  //   return ErrorHandler.tryCatch(
  //     async () => {
  //       if (!this.sourceManager) {
  //         throw new McpError(
  //           BaseErrorCode.SERVICE_NOT_INITIALIZED,
  //           'YAML SQL executor not initialized. Call YamlSqlExecutor.initialize() first.'
  //         );
  //       }

  //       logger.info(`Executing YAML tool: ${executionContext.toolName}`, {
  //         ...operationContext,
  //         sourceName: executionContext.sourceName,
  //         parameterCount: Object.keys(executionContext.parameters).length
  //       });

  //       // This method is not used anymore - executeTool is deprecated
  //       // Use executeStatement instead
  //       throw new McpError(
  //         BaseErrorCode.INTERNAL_ERROR,
  //         'executeTool is deprecated. Use executeStatement instead.'
  //       );

  //       // Execute the query
  //       const result = await this.sourceManager.executeQuery<T>(
  //         executionContext.sourceName,
  //         processedSql,
  //         [], // No parameters needed since we process templates
  //         operationContext
  //       );

  //       const executionTime = Date.now() - startTime;

  //       logger.info(`YAML tool executed successfully: ${executionContext.toolName}`, {
  //         ...operationContext,
  //         executionTime,
  //         rowCount: result.data?.length || 0,
  //         success: result.success
  //       });

  //       return {
  //         success: true,
  //         data: result.data,
  //         metadata: {
  //           executionTime,
  //           rowCount: result.data?.length || 0,
  //           affectedRows: result.metadata?.affectedRows
  //         }
  //       };
  //     },
  //     {
  //       operation: 'ExecuteYamlTool',
  //       context: operationContext,
  //       errorCode: BaseErrorCode.DATABASE_ERROR
  //     }
  //   );
  // }

  /**
   * Process SQL template using shared template processor
   * @param template - SQL template string
   * @param parameters - Parameters for template processing
   * @param context - Request context
   * @returns Processed SQL string
   * @private
   */
  private static async processTemplate(
    template: string,
    parameters: Record<string, unknown>,
    context: RequestContext,
  ): Promise<string> {
    return SqlTemplateProcessor.process(template, parameters, {
      detailedLogging: true,
      validateSyntax: true,
      context,
    });
  }

  /**
   * Execute a specific SQL statement with template processing
   * @param toolName - Name of the tool
   * @param sourceName - Source to execute against
   * @param sqlStatement - SQL statement template
   * @param parameters - Parameters for template processing
   * @param context - Request context
   * @returns Execution result
   */
  static async executeStatement<T = Record<string, unknown>>(
    toolName: string,
    sourceName: string,
    sqlStatement: string,
    parameters: Record<string, unknown>,
    context?: RequestContext,
  ): Promise<YamlToolExecutionResult<T>> {
    const operationContext =
      context ||
      requestContextService.createRequestContext({
        operation: "ExecuteYamlStatement",
        toolName,
        sourceName,
      });

    const startTime = Date.now();

    return ErrorHandler.tryCatch(
      async () => {
        if (!this.sourceManager) {
          throw new McpError(
            BaseErrorCode.SERVICE_NOT_INITIALIZED,
            "YAML SQL executor not initialized. Call YamlSqlExecutor.initialize() first.",
          );
        }

        logger.debug(`Processing SQL template for tool: ${toolName}`, {
          ...operationContext,
          sqlLength: sqlStatement.length,
          parameterCount: Object.keys(parameters).length,
        });

        // Process the SQL template using shared template processor
        const processedSql = await this.processTemplate(
          sqlStatement,
          parameters,
          operationContext,
        );

        logger.debug(`SQL template processed for tool: ${toolName}`, {
          ...operationContext,
          originalLength: sqlStatement.length,
          processedLength: processedSql.length,
        });

        // Execute the query
        const result = await this.sourceManager.executeQuery<T>(
          sourceName,
          processedSql,
          [], // No parameters needed since we process templates
          operationContext,
        );

        const executionTime = Date.now() - startTime;

        logger.debug(`SQL executed successfully for tool: ${toolName}`, {
          ...operationContext,
          executionTime,
          rowCount: result.data?.length || 0,
          success: result.success,
        });

        return {
          success: true,
          data: result.data,
          metadata: {
            executionTime,
            rowCount: result.data?.length || 0,
            affectedRows: (result.metadata as { affectedRows?: number })
              ?.affectedRows,
          },
        };
      },
      {
        operation: "ExecuteYamlStatement",
        context: operationContext,
        errorCode: BaseErrorCode.DATABASE_ERROR,
      },
    );
  }

  /**
   * Validate SQL statement for security
   * @param sqlStatement - SQL statement to validate
   * @param toolName - Tool name for logging
   * @param context - Request context
   * @returns True if valid, throws error if invalid
   * @private
   */
  static async validateSqlStatement(
    sqlStatement: string,
    toolName: string,
    context?: RequestContext,
  ): Promise<boolean> {
    const operationContext =
      context ||
      requestContextService.createRequestContext({
        operation: "ValidateSqlStatement",
        toolName,
      });

    // Basic SQL validation - prevent obvious injection attempts
    const sql = sqlStatement.toUpperCase().trim();

    // Disallow multiple statements
    if (sql.includes(";") && !sql.endsWith(";")) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        `Tool '${toolName}' contains multiple SQL statements which is not allowed`,
        { toolName, sqlStatement },
      );
    }

    // Disallow potentially dangerous operations
    const dangerousPatterns = [
      "DROP ",
      "DELETE ",
      "UPDATE ",
      "INSERT ",
      "CREATE ",
      "ALTER ",
      "TRUNCATE ",
      "EXEC ",
      "EXECUTE ",
      "CALL ",
      "GRANT ",
      "REVOKE ",
      "COMMIT ",
      "ROLLBACK ",
    ];

    for (const pattern of dangerousPatterns) {
      if (sql.includes(pattern)) {
        throw new McpError(
          BaseErrorCode.VALIDATION_ERROR,
          `Tool '${toolName}' contains potentially dangerous SQL operation: ${pattern.trim()}`,
          { toolName, sqlStatement, pattern },
        );
      }
    }

    // Must be a SELECT statement
    if (!sql.startsWith("SELECT ")) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        `Tool '${toolName}' must contain a SELECT statement only`,
        { toolName, sqlStatement },
      );
    }

    logger.debug(`SQL statement validated for tool: ${toolName}`, {
      ...operationContext,
      sqlLength: sqlStatement.length,
      isValid: true,
    });

    return true;
  }

  /**
   * Get source manager instance
   * @returns Source manager instance
   */
  static getSourceManager(): SourceManager {
    if (!this.sourceManager) {
      throw new McpError(
        BaseErrorCode.SERVICE_NOT_INITIALIZED,
        "YAML SQL executor not initialized. Call YamlSqlExecutor.initialize() first.",
      );
    }
    return this.sourceManager;
  }
}
