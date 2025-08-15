/**
 * @fileoverview SQL execution engine for YAML-defined tools
 * Processes SQL parameters and executes queries using SourceManager
 *
 * @module src/utils/yaml/yamlSqlExecutor
 */

import { SourceManager } from "../../services/yaml-sources/sourceManager.js";
import {
  YamlToolExecutionResult,
  YamlToolParameter,
} from "../../types-global/yaml-tools.js";
import { ErrorHandler, logger } from "../internal/index.js";
import {
  requestContextService,
  RequestContext,
} from "../internal/requestContext.js";
import { BaseErrorCode, McpError } from "../../types-global/errors.js";
import { ParameterProcessor } from "../sql/parameterProcessor.js";

/**
 * SQL execution engine for YAML-defined tools
 * Handles parameter binding and multi-source query execution
 */
export class YamlSqlExecutor {
  private static sourceManager: SourceManager;

  /**
   * Initialize the SQL executor with a source manager
   * @param sourceManager - Source manager instance
   */
  static initialize(sourceManager: SourceManager): void {
    this.sourceManager = sourceManager;
    logger.info("YAML SQL Executor initialized successfully", {
      requestId: "sql-executor-init",
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Validate SQL statement for common issues
   * @param statement - SQL statement to validate
   * @param toolName - Tool name for error reporting
   * @param context - Request context
   * @private
   */
  static async validateSqlStatement(
    statement: string,
    toolName: string,
    context: RequestContext,
  ): Promise<void> {
    logger.debug(`Validating SQL statement for tool: ${toolName}`, {
      ...context,
      statementLength: statement.length,
    });

    // Basic SQL validation
    if (!statement?.trim()) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        `SQL statement cannot be empty for tool: ${toolName}`,
        { toolName },
      );
    }

    // Check for potential SQL injection patterns
    const suspiciousPatterns = [
      /;\s*(drop|delete|truncate|alter)\s+/i,
      /union\s+select/i,
      /exec\s*\(/i,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(statement)) {
        logger.warning(
          `Potentially unsafe SQL pattern detected in tool: ${toolName}`,
          {
            ...context,
            pattern: pattern.source,
          },
        );
      }
    }
  }

  /**
   * Execute a SQL statement with parameter binding
   * @param toolName - Name of the tool
   * @param sourceName - Source to execute against
   * @param sqlStatement - SQL statement with parameter placeholders
   * @param parameters - Parameters for processing
   * @param parameterDefinitions - Parameter definitions for validation
   * @param context - Request context
   * @returns Execution result
   */
  static async executeStatementWithParameters<T = Record<string, unknown>>(
    toolName: string,
    sourceName: string,
    sqlStatement: string,
    parameters: Record<string, unknown>,
    parameterDefinitions: YamlToolParameter[] = [],
    context?: RequestContext,
  ): Promise<YamlToolExecutionResult<T>> {
    const operationContext =
      context ||
      requestContextService.createRequestContext({
        operation: "ExecuteYamlStatementWithParameters",
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

        logger.debug(
          `Processing SQL statement with parameters for tool: ${toolName}`,
          {
            ...operationContext,
            sqlLength: sqlStatement.length,
            parameterCount: Object.keys(parameters).length,
            definitionCount: parameterDefinitions.length,
          },
        );

        let processedSql: string;
        let bindingParameters: (string | number | (string | number)[])[] = [];

        if (parameterDefinitions.length > 0) {
          // Process with unified parameter validation and binding
          const result = await ParameterProcessor.process(
            sqlStatement,
            parameters,
            parameterDefinitions,
            {
              detailedLogging: true,
              validateSyntax: true,
              context: operationContext,
              strictTypeValidation: true,
            },
          );

          processedSql = result.sql;
          bindingParameters = result.parameters;

          if (result.missingParameters.length > 0) {
            logger.warning(`Missing parameters for tool ${toolName}`, {
              ...operationContext,
              missingParameters: result.missingParameters,
            });
          }

          logger.debug(`SQL processed with parameter binding`, {
            ...operationContext,
            mode: result.mode,
            parameterCount: bindingParameters.length,
            parametersUsed: result.parameterNames,
          });
        } else {
          // No parameter definitions - use SQL as-is
          processedSql = sqlStatement;
          bindingParameters = [];
          logger.debug(`SQL used as-is (no parameters defined)`, {
            ...operationContext,
            sqlLength: sqlStatement.length,
          });
        }

        // Execute the query
        const result = await this.sourceManager.executeQuery<T>(
          sourceName,
          processedSql,
          bindingParameters,
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
            parameterMode:
              parameterDefinitions.length > 0 ? "parameters" : "none",
            parameterCount: bindingParameters.length,
          },
        };
      },
      {
        operation: "ExecuteYamlStatementWithParameters",
        context: operationContext,
        errorCode: BaseErrorCode.DATABASE_ERROR,
      },
    );
  }

  /**
   * Get initialized state
   * @returns Whether the executor is initialized
   */
  static isInitialized(): boolean {
    return !!this.sourceManager;
  }

  /**
   * Get the source manager instance (for testing)
   * @returns Source manager instance
   * @internal
   */
  static getSourceManager(): SourceManager | undefined {
    return this.sourceManager;
  }
}
