/**
 * @fileoverview SQL execution engine for YAML-defined tools
 * Processes SQL parameters and executes queries using SourceManager
 *
 * @module src/utils/yaml/yamlSqlExecutor
 */

import { SourceManager } from "../../services/sourceManager.js";
import { AuthenticatedPoolManager } from "../../services/authenticatedPoolManager.js";
import {
  YamlToolExecutionResult,
  YamlToolParameter,
  YamlToolSecurityConfig,
} from "./types.js";
import { ErrorHandler, logger } from "@/utils/internal/index.js";
import {
  requestContextService,
  RequestContext,
} from "@/utils/internal/requestContext.js";
import { JsonRpcErrorCode, McpError } from "@/types-global/errors.js";
import { ParameterProcessor } from "../sql/parameterProcessor.js";
import { authContext } from "@/mcp-server/transports/auth/index.js";
import { QueryResult } from "@ibm/mapepire-js";

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
    logger.info(
      {
        requestId: "sql-executor-init",
        timestamp: new Date().toISOString(),
      },
      "YAML SQL Executor initialized successfully",
    );
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
    logger.debug(
      {
        ...context,
        statementLength: statement.length,
      },
      `Validating SQL statement for tool: ${toolName}`,
    );

    // Basic SQL validation
    if (!statement?.trim()) {
      throw new McpError(
        JsonRpcErrorCode.ValidationError,
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
          {
            ...context,
            pattern: pattern.source,
          },
          `Potentially unsafe SQL pattern detected in tool: ${toolName}`,
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
   * @param context - Request context (optional)
   * @param securityConfig - Security configuration for validation (optional)
   * @returns Execution result
   */
  static async executeStatementWithParameters<T = Record<string, unknown>>(
    toolName: string,
    sourceName: string,
    sqlStatement: string,
    parameters: Record<string, unknown>,
    parameterDefinitions: YamlToolParameter[] = [],
    context?: RequestContext,
    securityConfig?: YamlToolSecurityConfig,
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
            JsonRpcErrorCode.InternalError,
            "YAML SQL executor not initialized. Call YamlSqlExecutor.initialize() first.",
          );
        }

        logger.debug(
          {
            ...operationContext,
            sqlLength: sqlStatement.length,
            parameterCount: Object.keys(parameters).length,
            definitionCount: parameterDefinitions.length,
          },
          `Processing SQL statement with parameters for tool: ${toolName}`,
        );

        let processedSql: string;
        let bindingParameters: (string | number | (string | number)[])[] = [];

        // Special handling for direct SQL substitution (e.g., execute_sql tool)
        if (
          parameterDefinitions.length === 1 &&
          parameterDefinitions[0] &&
          sqlStatement.trim() === `:${parameterDefinitions[0].name}`
        ) {
          // This is a direct SQL substitution case (like execute_sql)
          const paramName = parameterDefinitions[0].name;
          if (
            paramName in parameters &&
            typeof parameters[paramName] === "string"
          ) {
            processedSql = parameters[paramName] as string;
            bindingParameters = [];

            logger.debug(
              {
                ...operationContext,
                originalStatement: sqlStatement,
                substitutedSql:
                  processedSql.substring(0, 100) +
                  (processedSql.length > 100 ? "..." : ""),
                parameterName: paramName,
              },
              `Applied direct SQL substitution for tool: ${toolName}`,
            );
          } else {
            throw new McpError(
              JsonRpcErrorCode.ValidationError,
              `Missing or invalid SQL parameter '${paramName}' for direct substitution`,
              { paramName, toolName },
            );
          }
        } else if (parameterDefinitions.length > 0) {
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
            logger.warning(
              {
                ...operationContext,
                missingParameters: result.missingParameters,
              },
              `Missing parameters for tool ${toolName}`,
            );
          }

          logger.debug(
            {
              ...operationContext,
              mode: result.mode,
              parameterCount: bindingParameters.length,
              parametersUsed: result.parameterNames,
            },
            `SQL processed with parameter binding`,
          );
        } else {
          // No parameter definitions - use SQL as-is
          processedSql = sqlStatement;
          bindingParameters = [];
          logger.debug(
            {
              ...operationContext,
              sqlLength: sqlStatement.length,
            },
            `SQL used as-is (no parameters defined)`,
          );
        }

        // Execute the query with auth-aware routing
        const result = await this.executeWithAuthRouting<T>(
          processedSql,
          bindingParameters,
          sourceName,
          operationContext,
          securityConfig,
        );

        const executionTime = Date.now() - startTime;

        logger.debug(
          {
            ...operationContext,
            executionTime,
            rowCount: result.data?.length || 0,
            success: result.success,
          },
          `SQL executed successfully for tool: ${toolName}`,
        );

        return {
          success: result.success,
          data: result.data,
          metadata: {
            executionTime,
            rowCount: result.data?.length || 0,
            columnsTypes: result.metadata.columns,
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
        errorCode: JsonRpcErrorCode.InternalError,
      },
    );
  }

  /**
   * Execute a query with auth-aware routing
   * Routes to authenticated pools when IBM i tokens are present, otherwise uses source manager
   * @param sql - Processed SQL statement
   * @param parameters - Binding parameters
   * @param sourceName - Source name for fallback routing
   * @param context - Request context
   * @param securityConfig - Optional security configuration
   * @returns Query execution result
   * @private
   */
  private static async executeWithAuthRouting<T>(
    sql: string,
    parameters: (string | number | (string | number)[])[],
    sourceName: string,
    context: RequestContext,
    securityConfig?: YamlToolSecurityConfig,
  ): Promise<QueryResult<T>> {
    // Check for IBM i authentication context
    const authInfo = authContext.getStore()?.authInfo;

    if (authInfo?.ibmiToken) {
      // Use authenticated pool manager when IBM i token is present
      logger.debug(
        {
          ...context,
          authClientId: authInfo.clientId,
          ibmiHost: authInfo.ibmiHost,
          routingMode: "authenticated",
        },
        "Executing SQL via authenticated pool",
      );

      const poolManager = AuthenticatedPoolManager.getInstance();
      return poolManager.executeQuery<T>(
        authInfo.ibmiToken,
        sql,
        parameters,
        context,
      );
    } else {
      // Fall back to regular source manager (environment credentials)
      logger.debug(
        {
          ...context,
          sourceName,
          routingMode: "environment",
        },
        "Executing SQL via source manager",
      );

      return securityConfig
        ? this.sourceManager.executeQuery<T>(
            sourceName,
            sql,
            parameters,
            context,
            securityConfig,
          )
        : this.sourceManager.executeQuery<T>(
            sourceName,
            sql,
            parameters,
            context,
          );
    }
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
