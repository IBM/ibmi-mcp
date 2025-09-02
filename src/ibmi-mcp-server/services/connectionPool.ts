/**
 * @fileoverview IBM i connection pool management using mapepire-js
 * This module provides a singleton connection pool for IBM i DB2 database operations.
 * Credentials are provided by the MCP client via environment variables.
 *
 * @module src/services/mapepire/connectionPool
 */

import pkg, { DaemonServer, BindingValue, QueryResult } from "@ibm/mapepire-js";
const { Pool, getCertificate } = pkg;
import { config } from "@/config/index.js";
import { logger } from "@/utils/internal/logger.js";
import { ErrorHandler } from "@/utils/internal/errorHandler.js";
import {
  requestContextService,
  RequestContext,
} from "@/utils/internal/requestContext.js";
import { JsonRpcErrorCode, McpError } from "@/types-global/errors.js";

/**
 * Query result structure from mapepire-js
 */
// export interface QueryResult<T = unknown> {
//   data: T[];
//   metadata?: unknown;
//   success: boolean;
//   is_done: boolean;
// }

/**
 * IBM i connection pool manager with lazy initialization
 * Credentials are provided by MCP client via environment variables
 */
export class IBMiConnectionPool {
  private static pool: InstanceType<typeof Pool> | undefined;
  private static isInitialized: boolean = false;
  private static isConnecting: boolean = false;

  /**
   * Initialize the connection pool using credentials from config
   * Called automatically on first query if not already initialized
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized || this.isConnecting) {
      return;
    }

    const context = requestContextService.createRequestContext({
      operation: "InitializeIBMiConnectionPool",
    });

    this.isConnecting = true;

    try {
      // Check if DB2i configuration is available
      if (!config.db2i) {
        throw new McpError(
          JsonRpcErrorCode.ConfigurationError,
          "DB2i configuration not found. Please ensure DB2i_HOST, DB2i_USER, and DB2i_PASS environment variables are set.",
          { configSection: "db2i" },
        );
      }

      const { host, user, password, ignoreUnauthorized } = config.db2i;

      logger.info(
        {
          ...context,
          host,
          user: user.substring(0, 3) + "***", // Mask username for security
          ignoreUnauthorized,
        },
        "Initializing IBM i connection pool",
      );

      // Create daemon server configuration
      const server: DaemonServer = {
        host,
        user,
        password,
        rejectUnauthorized: !ignoreUnauthorized,
      };

      // Get SSL certificate if needed
      if (!ignoreUnauthorized) {
        const ca = await getCertificate(server);
        server.ca = ca.raw;
      }

      // Create and initialize connection pool
      this.pool = new Pool({
        creds: server,
        maxSize: 10,
        startingSize: 2,
      });

      await this.pool.init();
      this.isInitialized = true;

      logger.info(context, "IBM i connection pool initialized successfully");
    } catch (error) {
      this.isInitialized = false;
      this.pool = undefined;

      const handledError = ErrorHandler.handleError(error, {
        operation: "InitializeIBMiConnectionPool",
        context,
        errorCode: JsonRpcErrorCode.InitializationFailed,
        critical: true,
      });

      throw handledError;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Execute a SQL query with automatic pagination to fetch all results
   * Uses the query/execute/fetchMore pattern for large result sets
   */
  static async executeQueryWithPagination(
    query: string,
    params?: BindingValue[],
    context?: RequestContext,
    fetchSize: number = 300,
  ): Promise<{
    data: unknown[];
    success: boolean;
    sql_rc?: unknown;
    execution_time?: number;
  }> {
    const operationContext =
      context ||
      requestContextService.createRequestContext({
        operation: "ExecuteQueryWithPagination",
      });

    return ErrorHandler.tryCatch(
      async () => {
        // Initialize pool if needed
        if (!this.isInitialized) {
          await this.initialize();
        }

        if (!this.pool) {
          throw new McpError(
            JsonRpcErrorCode.InternalError,
            "Connection pool is not available",
          );
        }

        logger.debug(
          {
            ...operationContext,
            queryLength: query.length,
            hasParameters: !!params && params.length > 0,
            paramCount: params?.length || 0,
            fetchSize,
          },
          "Executing SQL query with pagination",
        );

        // Create query object with parameters
        const queryObj = this.pool.query(query, { parameters: params });

        // Execute initial query
        let result = await queryObj.execute();
        const allData: unknown[] = [];

        if (result.success && result.data) {
          allData.push(...result.data);
        }

        // Fetch more results until done
        let fetchCount = 1;
        while (!result.is_done && fetchCount < 100) {
          // Safety limit
          logger.debug(
            {
              ...operationContext,
              fetchCount,
              currentDataLength: allData.length,
            },
            "Fetching more results",
          );

          result = await queryObj.fetchMore(fetchSize);

          if (result.success && result.data) {
            allData.push(...result.data);
          }

          fetchCount++;
        }

        // Close the query
        await queryObj.close();

        logger.debug(
          {
            ...operationContext,
            totalRows: allData.length,
            fetchCount,
            success: result.success,
            sqlReturnCode: result.sql_rc,
            executionTime: result.execution_time,
          },
          "Paginated query completed",
        );

        return {
          data: allData,
          success: result.success,
          sql_rc: result.sql_rc,
          execution_time: result.execution_time,
        };
      },
      {
        operation: "ExecuteQueryWithPagination",
        context: operationContext,
        errorCode: JsonRpcErrorCode.DatabaseError,
      },
    );
  }

  /**
   * Execute a SQL query against the IBM i database
   * Automatically initializes the pool if not already done
   */
  static async executeQuery(
    query: string,
    params?: BindingValue[],
    context?: RequestContext,
  ): Promise<QueryResult<unknown>> {
    const operationContext =
      context ||
      requestContextService.createRequestContext({
        operation: "ExecuteQuery",
      });

    return ErrorHandler.tryCatch(
      async () => {
        // Initialize pool if needed
        if (!this.isInitialized) {
          await this.initialize();
        }

        if (!this.pool) {
          throw new McpError(
            JsonRpcErrorCode.InternalError,
            "Connection pool is not available",
          );
        }

        logger.debug(
          {
            ...operationContext,
            queryLength: query.length,
            hasParameters: !!params && params.length > 0,
            paramCount: params?.length || 0,
            parameterTypes: params?.map((p) =>
              Array.isArray(p) ? "array" : typeof p,
            ),
          },
          "Executing SQL query with parameters",
        );

        // Validate parameter types for mapepire compatibility
        if (params && params.length > 0) {
          for (let i = 0; i < params.length; i++) {
            const param = params[i];
            if (param !== null && param !== undefined) {
              const isValidType =
                typeof param === "string" ||
                typeof param === "number" ||
                (Array.isArray(param) &&
                  param.every(
                    (item) =>
                      typeof item === "string" || typeof item === "number",
                  ));
              if (!isValidType) {
                logger.warning(
                  {
                    ...operationContext,
                    paramIndex: i,
                    paramType: typeof param,
                    paramValue: param,
                  },
                  `Parameter ${i} has invalid type for mapepire binding`,
                );
              }
            }
          }
        }

        const result = await this.pool.execute(query, { parameters: params });

        logger.debug(
          {
            ...operationContext,
            rowCount: result.data?.length || 0,
            success: result.success,
            sqlReturnCode: result.sql_rc,
            executionTime: result.execution_time,
          },
          "Query executed successfully",
        );

        return result;
      },
      {
        operation: "ExecuteQuery",
        context: operationContext,
        errorCode: JsonRpcErrorCode.DatabaseError,
      },
    );
  }

  /**
   * Check the health of the connection pool
   */
  static async healthCheck(): Promise<boolean> {
    const context = requestContextService.createRequestContext({
      operation: "ConnectionHealthCheck",
    });

    try {
      if (!this.isInitialized || !this.pool) {
        return false;
      }

      // Execute a simple query to test connection
      await this.executeQuery("SELECT 1 FROM SYSIBM.SYSDUMMY1", [], context);

      logger.debug(context, "Connection health check passed");
      return true;
    } catch (error) {
      logger.error(
        {
          ...context,
          error: error instanceof Error ? error.message : String(error),
        },
        "Connection health check failed",
      );
      return false;
    }
  }

  /**
   * Close the connection pool gracefully
   */
  static async close(): Promise<void> {
    const context = requestContextService.createRequestContext({
      operation: "CloseConnectionPool",
    });

    if (this.pool) {
      logger.info(context, "Closing IBM i connection pool");

      try {
        await this.pool.end();
        this.pool = undefined;
        this.isInitialized = false;

        logger.info(context, "IBM i connection pool closed successfully");
      } catch (error) {
        logger.error(
          {
            ...context,
            error: error instanceof Error ? error.message : String(error),
          },
          "Error closing connection pool",
        );
      }
    }
  }

  /**
   * Get connection pool status for monitoring
   */
  static getStatus(): {
    initialized: boolean;
    connecting: boolean;
    poolExists: boolean;
  } {
    return {
      initialized: this.isInitialized,
      connecting: this.isConnecting,
      poolExists: !!this.pool,
    };
  }
}
