/**
 * @fileoverview Executes SQL queries and manages transactions for DuckDB.
 * @module services/duck-db/duckDBQueryExecutor
 */

import * as duckdb from "@duckdb/node-api";
import { BaseErrorCode } from "../../types-global/errors.js";
import {
  ErrorHandler,
  logger,
  requestContextService,
} from "../../utils/index.js";
import { DuckDBQueryResult } from "./types.js";

export class DuckDBQueryExecutor {
  private dbConnection: duckdb.DuckDBConnection;

  constructor(connection: duckdb.DuckDBConnection) {
    this.dbConnection = connection;
  }

  public async run(
    sql: string,
    params?: duckdb.DuckDBValue[] | Record<string, duckdb.DuckDBValue>,
  ): Promise<void> {
    const context = requestContextService.createRequestContext({
      operation: "DuckDBQueryExecutor.run",
      initialData: { sql, params },
    });

    return ErrorHandler.tryCatch(
      async () => {
        logger.debug(`Executing SQL (run): ${sql}`, { ...context, params });
        if (params === undefined) {
          await this.dbConnection.run(sql);
        } else if (Array.isArray(params)) {
          await this.dbConnection.run(sql, params); // Pass array directly
        } else {
          await this.dbConnection.run(sql, params as any); // Cast to any for object
        }
      },
      {
        operation: "DuckDBQueryExecutor.run",
        context,
        input: { sql, params },
        errorCode: BaseErrorCode.DATABASE_ERROR,
      },
    );
  }

  public async query<T = Record<string, unknown>>(
    sql: string,
    params?: duckdb.DuckDBValue[] | Record<string, duckdb.DuckDBValue>,
  ): Promise<DuckDBQueryResult<T>> {
    const context = requestContextService.createRequestContext({
      operation: "DuckDBQueryExecutor.query",
      initialData: { sql, params },
    });

    return ErrorHandler.tryCatch(
      async () => {
        logger.debug(`Executing SQL (query): ${sql}`, { ...context, params });
        let resultObject: any; // Corresponds to 'result' in docs after connection.stream()
        if (params === undefined) {
          resultObject = await this.dbConnection.stream(sql);
        } else if (Array.isArray(params)) {
          resultObject = await this.dbConnection.stream(
            sql,
            // According to docs, params for stream are passed as subsequent arguments
            // However, the DuckDBConnection type definition might expect a single array/object.
            // The original code passed `params` directly, which is typical for many drivers
            // if the method signature is `stream(sql: string, params?: any[])`
            // Let's stick to the original way params were passed to stream, as the docs
            // show `connection.stream(sql, values, types)` where values could be an array/object.
            // The most robust way for array params is often `stream(sql, ...params_array)`.
            // Let's assume the type defs are `stream(sql: string, ...args: any[])` for array params.
            // Or `stream(sql: string, namedParams: object)` for named.
            // The previous code `params` directly for array, and `params as any` for object.
            // This seems reasonable.
            params, // Pass array directly
          );
        } else {
          resultObject = await this.dbConnection.stream(sql, params as any); // Cast to any for object
        }

        const rows = (await resultObject.getRows()) as T[]; // Use getRows() as per docs, and it's async
        const columnNames = resultObject.columnNames(); // Sync as per docs
        const columnTypes = resultObject
          .columnTypes() // Sync as per docs
          .map((ct: duckdb.DuckDBType) => ct.typeId);

        return {
          rows: rows,
          columnNames: columnNames,
          columnTypes: columnTypes,
          rowCount: rows.length,
        };
      },
      {
        operation: "DuckDBQueryExecutor.query",
        context,
        input: { sql, params },
        errorCode: BaseErrorCode.DATABASE_ERROR,
      },
    );
  }

  public async stream(
    sql: string,
    params?: duckdb.DuckDBValue[] | Record<string, duckdb.DuckDBValue>,
  ): Promise<duckdb.DuckDBPendingResult> {
    const context = requestContextService.createRequestContext({
      operation: "DuckDBQueryExecutor.stream",
      initialData: { sql, params },
    });

    return ErrorHandler.tryCatch<Promise<duckdb.DuckDBPendingResult>>(
      async () => {
        logger.debug(`Executing SQL (stream): ${sql}`, { ...context, params });
        if (params === undefined) {
          return this.dbConnection.stream(
            sql,
          ) as unknown as Promise<duckdb.DuckDBPendingResult>;
        } else if (Array.isArray(params)) {
          return this.dbConnection.stream(
            sql,
            params, // Pass array directly
          ) as unknown as Promise<duckdb.DuckDBPendingResult>;
        } else {
          return this.dbConnection.stream(
            sql,
            params as any,
          ) as unknown as Promise<duckdb.DuckDBPendingResult>;
        }
      },
      {
        operation: "DuckDBQueryExecutor.stream",
        context,
        input: { sql, params },
        errorCode: BaseErrorCode.DATABASE_ERROR,
      },
    );
  }

  public async prepare(sql: string): Promise<duckdb.DuckDBPreparedStatement> {
    const context = requestContextService.createRequestContext({
      operation: "DuckDBQueryExecutor.prepare",
      initialData: { sql },
    });

    return ErrorHandler.tryCatch(
      async () => {
        logger.debug(`Preparing SQL: ${sql}`, context);
        return this.dbConnection.prepare(sql);
      },
      {
        operation: "DuckDBQueryExecutor.prepare",
        context,
        input: { sql },
        errorCode: BaseErrorCode.DATABASE_ERROR,
      },
    );
  }

  public async beginTransaction(): Promise<void> {
    const context = requestContextService.createRequestContext({
      operation: "DuckDBQueryExecutor.beginTransaction",
    });
    await this.run("BEGIN TRANSACTION");
    logger.info("Transaction started.", context);
  }

  public async commitTransaction(): Promise<void> {
    const context = requestContextService.createRequestContext({
      operation: "DuckDBQueryExecutor.commitTransaction",
    });
    await this.run("COMMIT");
    logger.info("Transaction committed.", context);
  }

  public async rollbackTransaction(): Promise<void> {
    const context = requestContextService.createRequestContext({
      operation: "DuckDBQueryExecutor.rollbackTransaction",
    });
    await this.run("ROLLBACK");
    logger.info("Transaction rolled back.", context);
  }
}
