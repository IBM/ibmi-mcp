/**
 * @fileoverview IBM i connection pool management using mapepire-js
 * This module provides a singleton connection pool for IBM i DB2 database operations.
 * Credentials are provided by the MCP client via environment variables.
 *
 * @module src/services/mapepire/connectionPool
 */

import pkg, { DaemonServer, BindingValue, QueryResult } from "@ibm/mapepire-js";
const { Pool, getCertificate } = pkg;
import { config } from "../../config/index.js";
import { logger } from "../../utils/internal/logger.js";
import { ErrorHandler } from "../../utils/internal/errorHandler.js";
import {
  requestContextService,
  RequestContext,
} from "../../utils/internal/requestContext.js";
import { BaseErrorCode, McpError } from "../../types-global/errors.js";

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
          BaseErrorCode.CONFIGURATION_ERROR,
          "DB2i configuration not found. Please ensure DB2i_HOST, DB2i_USER, and DB2i_PASS environment variables are set.",
          { configSection: "db2i" },
        );
      }

      const { host, user, password, ignoreUnauthorized } = config.db2i;

      logger.info("Initializing IBM i connection pool", {
        ...context,
        host,
        user: user.substring(0, 3) + "***", // Mask username for security
        ignoreUnauthorized,
      });

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

      logger.info("IBM i connection pool initialized successfully", context);
    } catch (error) {
      this.isInitialized = false;
      this.pool = undefined;

      const handledError = ErrorHandler.handleError(error, {
        operation: "InitializeIBMiConnectionPool",
        context,
        errorCode: BaseErrorCode.INITIALIZATION_FAILED,
        critical: true,
      });

      throw handledError;
    } finally {
      this.isConnecting = false;
    }
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
            BaseErrorCode.SERVICE_NOT_INITIALIZED,
            "Connection pool is not available",
          );
        }

        logger.debug("Executing SQL query with parameters", {
          ...operationContext,
          queryLength: query.length,
          hasParameters: !!params && params.length > 0,
          paramCount: params?.length || 0,
          parameterTypes: params?.map((p) =>
            Array.isArray(p) ? "array" : typeof p,
          ),
        });

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
                  `Parameter ${i} has invalid type for mapepire binding`,
                  {
                    ...operationContext,
                    paramIndex: i,
                    paramType: typeof param,
                    paramValue: param,
                  },
                );
              }
            }
          }
        }

        const result = await this.pool.execute(query, { parameters: params });

        logger.debug("Query executed successfully", {
          ...operationContext,
          rowCount: result.data?.length || 0,
          success: result.success,
          sqlReturnCode: result.sql_rc,
          executionTime: result.execution_time,
        });

        return result;
      },
      {
        operation: "ExecuteQuery",
        context: operationContext,
        errorCode: BaseErrorCode.DATABASE_ERROR,
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

      logger.debug("Connection health check passed", context);
      return true;
    } catch (error) {
      logger.error("Connection health check failed", {
        ...context,
        error: error instanceof Error ? error.message : String(error),
      });
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
      logger.info("Closing IBM i connection pool", context);

      try {
        await this.pool.end();
        this.pool = undefined;
        this.isInitialized = false;

        logger.info("IBM i connection pool closed successfully", context);
      } catch (error) {
        logger.error("Error closing connection pool", {
          ...context,
          error: error instanceof Error ? error.message : String(error),
        });
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
