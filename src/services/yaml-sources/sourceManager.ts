/**
 * @fileoverview Multi-source connection manager for YAML-based tools
 * Manages multiple named IBM i connection pools based on YAML source configurations
 *
 * @module src/services/yaml-sources/sourceManager
 */

import pkg, { BindingValue } from "@ibm/mapepire-js";
const { Pool, getCertificate } = pkg;
import { DaemonServer } from "@ibm/mapepire-js";
import { YamlSource } from "../../types-global/yaml-tools.js";
import { QueryResult } from "../mapepire/connectionPool.js";
import { ErrorHandler, logger } from "../../utils/internal/index.js";
import {
  requestContextService,
  RequestContext,
} from "../../utils/internal/requestContext.js";
import { BaseErrorCode, McpError } from "../../types-global/errors.js";

/**
 * Connection pool configuration for a single source
 */
interface SourcePoolConfig {
  source: YamlSource;
  pool: InstanceType<typeof Pool> | null;
  isInitialized: boolean;
  isConnecting: boolean;
  lastHealthCheck?: Date;
  healthStatus: "healthy" | "unhealthy" | "unknown";
}

/**
 * Source health information
 */
export interface SourceHealth {
  sourceName: string;
  status: "healthy" | "unhealthy" | "unknown";
  lastCheck?: Date;
  lastError?: string;
  initialized: boolean;
  connecting: boolean;
}

/**
 * Multi-source connection manager
 * Manages multiple named IBM i connection pools for YAML-based tools
 */
export class SourceManager {
  private static instance: SourceManager | undefined;
  private sourcePools: Map<string, SourcePoolConfig> = new Map();
  private initializationPromises: Map<string, Promise<void>> = new Map();

  /**
   * Get the singleton instance of the SourceManager
   */
  static getInstance(): SourceManager {
    if (!SourceManager.instance) {
      SourceManager.instance = new SourceManager();
    }
    return SourceManager.instance;
  }

  /**
   * Register a new source configuration
   * @param sourceName - Name of the source
   * @param sourceConfig - Source configuration from YAML
   * @param context - Request context for logging
   */
  async registerSource(
    sourceName: string,
    sourceConfig: YamlSource,
    context?: RequestContext,
  ): Promise<void> {
    const operationContext =
      context ||
      requestContextService.createRequestContext({
        operation: "RegisterSource",
        sourceName,
      });

    return ErrorHandler.tryCatch(
      async () => {
        logger.info(`Registering source: ${sourceName}`, {
          ...operationContext,
          host: sourceConfig.host,
          port: sourceConfig.port || 8471,
          user: sourceConfig.user.substring(0, 3) + "***", // Mask username for security
        });

        // Create pool configuration but don't initialize yet (lazy initialization)
        const poolConfig: SourcePoolConfig = {
          source: sourceConfig,
          pool: null, // Will be created during initialization
          isInitialized: false,
          isConnecting: false,
          healthStatus: "unknown",
        };

        this.sourcePools.set(sourceName, poolConfig);

        logger.info(
          `Source registered successfully: ${sourceName}`,
          operationContext,
        );
      },
      {
        operation: "RegisterSource",
        context: operationContext,
        errorCode: BaseErrorCode.CONFIGURATION_ERROR,
      },
    );
  }

  /**
   * Initialize a specific source's connection pool
   * @param sourceName - Name of the source to initialize
   * @param context - Request context for logging
   */
  private async initializeSource(
    sourceName: string,
    context?: RequestContext,
  ): Promise<void> {
    const operationContext =
      context ||
      requestContextService.createRequestContext({
        operation: "InitializeSource",
        sourceName,
      });

    // Check if there's already an initialization in progress
    const existingPromise = this.initializationPromises.get(sourceName);
    if (existingPromise) {
      logger.debug(
        `Waiting for existing initialization of source: ${sourceName}`,
        operationContext,
      );
      return existingPromise;
    }

    const poolConfig = this.sourcePools.get(sourceName);
    if (!poolConfig) {
      throw new McpError(
        BaseErrorCode.CONFIGURATION_ERROR,
        `Source '${sourceName}' not found. Please register the source first.`,
        { sourceName },
      );
    }

    // Check if already initialized
    if (poolConfig.isInitialized && poolConfig.pool) {
      logger.debug(
        `Source '${sourceName}' already initialized`,
        operationContext,
      );
      return;
    }

    // Create initialization promise and store it
    const initPromise = this._performInitialization(
      sourceName,
      poolConfig,
      operationContext,
    );
    this.initializationPromises.set(sourceName, initPromise);

    try {
      await initPromise;
    } finally {
      // Clean up the promise from the map
      this.initializationPromises.delete(sourceName);
    }
  }

  /**
   * Perform the actual initialization of a source
   * @private
   */
  private async _performInitialization(
    sourceName: string,
    poolConfig: SourcePoolConfig,
    operationContext: RequestContext,
  ): Promise<void> {
    // Double-check if already initialized (in case another thread completed it)
    if (poolConfig.isInitialized && poolConfig.pool) {
      return;
    }

    if (poolConfig.isConnecting) {
      logger.debug(
        `Source '${sourceName}' is already connecting, waiting...`,
        operationContext,
      );
      // Wait a bit and check again
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (poolConfig.isInitialized && poolConfig.pool) {
        return;
      }
    }

    poolConfig.isConnecting = true;

    try {
      const {
        host,
        user,
        password,
        port,
        "ignore-unauthorized": ignoreUnauthorized,
      } = poolConfig.source;

      logger.info(`Initializing connection pool for source: ${sourceName}`, {
        ...operationContext,
        host,
        port: port || 8471,
        user: user.substring(0, 3) + "***",
        ignoreUnauthorized: ignoreUnauthorized ?? true,
      });

      // Create daemon server configuration
      const server: DaemonServer = {
        host,
        user,
        password,
        rejectUnauthorized: !(ignoreUnauthorized ?? true),
      };

      // Get SSL certificate if needed
      if (!(ignoreUnauthorized ?? true)) {
        const ca = await getCertificate(server);
        server.ca = ca.raw;
      }

      // Create and initialize connection pool
      poolConfig.pool = new Pool({
        creds: server,
        maxSize: 10,
        startingSize: 2,
      });

      await poolConfig.pool.init();
      poolConfig.isInitialized = true;
      poolConfig.healthStatus = "healthy";
      poolConfig.lastHealthCheck = new Date();

      logger.info(
        `Connection pool initialized successfully for source: ${sourceName}`,
        operationContext,
      );
    } catch (error) {
      poolConfig.isInitialized = false;
      poolConfig.healthStatus = "unhealthy";
      poolConfig.pool = null;

      const handledError = ErrorHandler.handleError(error, {
        operation: "_performInitialization",
        context: operationContext,
        errorCode: BaseErrorCode.INITIALIZATION_FAILED,
        critical: true,
      });

      throw handledError;
    } finally {
      poolConfig.isConnecting = false;
    }
  }

  /**
   * Execute a SQL query on a specific source
   * @param sourceName - Name of the source to query
   * @param query - SQL query string
   * @param params - Query parameters
   * @param context - Request context for logging
   */
  async executeQuery<T = unknown>(
    sourceName: string,
    query: string,
    params?: BindingValue[],
    context?: RequestContext,
  ): Promise<QueryResult<T>> {
    const operationContext =
      context ||
      requestContextService.createRequestContext({
        operation: "ExecuteQuery",
        sourceName,
      });

    return ErrorHandler.tryCatch(
      async () => {
        // Ensure source is initialized
        await this.initializeSource(sourceName, operationContext);

        const poolConfig = this.sourcePools.get(sourceName);
        if (!poolConfig || !poolConfig.pool) {
          throw new McpError(
            BaseErrorCode.SERVICE_NOT_INITIALIZED,
            `Connection pool for source '${sourceName}' is not available`,
            { sourceName },
          );
        }

        // Additional check to ensure pool is properly initialized
        if (!poolConfig.isInitialized) {
          throw new McpError(
            BaseErrorCode.SERVICE_NOT_INITIALIZED,
            `Connection pool for source '${sourceName}' is not fully initialized`,
            {
              sourceName,
              isInitialized: poolConfig.isInitialized,
              isConnecting: poolConfig.isConnecting,
            },
          );
        }

        logger.debug(`Executing SQL query on source: ${sourceName}`, {
          ...operationContext,
          queryLength: query.length,
          hasParameters: !!params && params.length > 0,
          paramCount: params?.length || 0,
        });

        const result = await poolConfig.pool.execute(query, {
          parameters: params,
        });

        logger.debug(`Query executed successfully on source: ${sourceName}`, {
          ...operationContext,
          rowCount: result.data?.length || 0,
          success: result.success,
        });

        // Update health status on successful query
        poolConfig.healthStatus = "healthy";
        poolConfig.lastHealthCheck = new Date();

        return result as QueryResult<T>;
      },
      {
        operation: "ExecuteQuery",
        context: operationContext,
        errorCode: BaseErrorCode.DATABASE_ERROR,
      },
    );
  }

  /**
   * Check the health of a specific source
   * @param sourceName - Name of the source to check
   * @param context - Request context for logging
   */
  async checkSourceHealth(
    sourceName: string,
    context?: RequestContext,
  ): Promise<SourceHealth> {
    const operationContext =
      context ||
      requestContextService.createRequestContext({
        operation: "CheckSourceHealth",
        sourceName,
      });

    const poolConfig = this.sourcePools.get(sourceName);
    if (!poolConfig) {
      return {
        sourceName,
        status: "unknown",
        initialized: false,
        connecting: false,
      };
    }

    try {
      if (!poolConfig.isInitialized || !poolConfig.pool) {
        return {
          sourceName,
          status: "unknown",
          initialized: false,
          connecting: poolConfig.isConnecting,
        };
      }

      // Execute a simple query to test connection
      await this.executeQuery(
        sourceName,
        "SELECT 1 FROM SYSIBM.SYSDUMMY1",
        [],
        operationContext,
      );

      poolConfig.healthStatus = "healthy";
      poolConfig.lastHealthCheck = new Date();

      logger.debug(
        `Health check passed for source: ${sourceName}`,
        operationContext,
      );

      return {
        sourceName,
        status: "healthy",
        lastCheck: poolConfig.lastHealthCheck,
        initialized: true,
        connecting: false,
      };
    } catch (error) {
      poolConfig.healthStatus = "unhealthy";
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      logger.error(`Health check failed for source: ${sourceName}`, {
        ...operationContext,
        error: errorMessage,
      });

      return {
        sourceName,
        status: "unhealthy",
        lastError: errorMessage,
        lastCheck: new Date(),
        initialized: poolConfig.isInitialized,
        connecting: poolConfig.isConnecting,
      };
    }
  }

  /**
   * Get health status for all registered sources
   * @param context - Request context for logging
   */
  async getAllSourcesHealth(context?: RequestContext): Promise<SourceHealth[]> {
    const operationContext =
      context ||
      requestContextService.createRequestContext({
        operation: "GetAllSourcesHealth",
      });

    const healthPromises = Array.from(this.sourcePools.keys()).map(
      (sourceName) => this.checkSourceHealth(sourceName, operationContext),
    );

    return Promise.all(healthPromises);
  }

  /**
   * Close a specific source's connection pool
   * @param sourceName - Name of the source to close
   * @param context - Request context for logging
   */
  async closeSource(
    sourceName: string,
    context?: RequestContext,
  ): Promise<void> {
    const operationContext =
      context ||
      requestContextService.createRequestContext({
        operation: "CloseSource",
        sourceName,
      });

    const poolConfig = this.sourcePools.get(sourceName);
    if (!poolConfig || !poolConfig.pool) {
      return;
    }

    try {
      logger.info(
        `Closing connection pool for source: ${sourceName}`,
        operationContext,
      );

      await poolConfig.pool.end();
      poolConfig.pool = null;
      poolConfig.isInitialized = false;
      poolConfig.healthStatus = "unknown";

      logger.info(
        `Connection pool closed successfully for source: ${sourceName}`,
        operationContext,
      );
    } catch (error) {
      logger.error(`Error closing connection pool for source: ${sourceName}`, {
        ...operationContext,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Close all connection pools gracefully
   * @param context - Request context for logging
   */
  async closeAllSources(context?: RequestContext): Promise<void> {
    const operationContext =
      context ||
      requestContextService.createRequestContext({
        operation: "CloseAllSources",
      });

    const closePromises = Array.from(this.sourcePools.keys()).map(
      (sourceName) => this.closeSource(sourceName, operationContext),
    );

    const results = await Promise.allSettled(closePromises);

    logger.info("All source connection pools closed", {
      ...operationContext,
      closedCount: results.length,
    });
  }

  /**
   * Get list of registered source names
   */
  getRegisteredSources(): string[] {
    return Array.from(this.sourcePools.keys());
  }

  /**
   * Get detailed status of all sources
   */
  getSourcesStatus(): Record<
    string,
    { initialized: boolean; connecting: boolean; healthStatus: string }
  > {
    const status: Record<
      string,
      { initialized: boolean; connecting: boolean; healthStatus: string }
    > = {};

    for (const [sourceName, poolConfig] of this.sourcePools) {
      status[sourceName] = {
        initialized: poolConfig.isInitialized,
        connecting: poolConfig.isConnecting,
        healthStatus: poolConfig.healthStatus,
      };
    }

    return status;
  }

  /**
   * Clear all registered sources (for testing)
   */
  clearAllSources(): void {
    this.sourcePools.clear();
  }
}
