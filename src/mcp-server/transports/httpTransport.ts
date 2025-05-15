/**
 * @fileoverview Handles the setup and management of the Streamable HTTP MCP transport.
 * Implements the MCP Specification 2025-03-26 for Streamable HTTP.
 * This includes creating an Express server, configuring middleware (CORS, Authentication),
 * defining request routing for the single MCP endpoint (POST/GET/DELETE),
 * managing server-side sessions, handling Server-Sent Events (SSE) for streaming,
 * and binding to a network port with retry logic for port conflicts.
 *
 * Specification Reference:
 * https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/basic/transports.mdx#streamable-http
 * @module mcp-server/transports/httpTransport
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express, { NextFunction, Request, Response } from "express";
import http from "http";
import { randomUUID } from "node:crypto";
import { config } from "../../config/index.js"; // Validated application configuration
import {
  logger,
  RequestContext,
  requestContextService,
} from "../../utils/index.js"; // Core utilities
import { mcpAuthMiddleware } from "./authentication/authMiddleware.js"; // MCP authentication middleware

// --- Configuration Constants (Derived from imported config) ---

/**
 * The port number for the HTTP transport, configured via `MCP_HTTP_PORT` environment variable.
 * Defaults to 3010 if not specified (default is managed by the config module).
 * @constant {number} HTTP_PORT
 * @private
 */
const HTTP_PORT = config.mcpHttpPort;

/**
 * The host address for the HTTP transport, configured via `MCP_HTTP_HOST` environment variable.
 * Defaults to '127.0.0.1' if not specified (default is managed by the config module).
 * MCP Spec Security Note: Recommends binding to localhost for local servers to minimize exposure.
 * @constant {string} HTTP_HOST
 * @private
 */
const HTTP_HOST = config.mcpHttpHost;

/**
 * The single HTTP endpoint path for all MCP communication, as required by the MCP specification.
 * This endpoint supports POST, GET, DELETE, and OPTIONS methods.
 * @constant {string} MCP_ENDPOINT_PATH
 * @private
 */
const MCP_ENDPOINT_PATH = "/mcp";

/**
 * Maximum number of attempts to find an available port if the initial `HTTP_PORT` is in use.
 * The server will try ports sequentially: `HTTP_PORT`, `HTTP_PORT + 1`, ..., up to `MAX_PORT_RETRIES`.
 * @constant {number} MAX_PORT_RETRIES
 * @private
 */
const MAX_PORT_RETRIES = 15;

/**
 * Stores active `StreamableHTTPServerTransport` instances from the SDK, keyed by their session ID.
 * This is essential for routing subsequent HTTP requests (GET, DELETE, non-initialize POST)
 * to the correct stateful session transport instance.
 * @type {Record<string, StreamableHTTPServerTransport>}
 * @private
 */
const httpTransports: Record<string, StreamableHTTPServerTransport> = {};

/**
 * Checks if an incoming HTTP request's `Origin` header is permissible based on configuration.
 * MCP Spec Security: Servers MUST validate the `Origin` header for cross-origin requests.
 * This function checks the request's origin against the `config.mcpAllowedOrigins` list.
 * If the server is bound to localhost, requests from localhost or with no/null origin are also permitted.
 * Sets appropriate CORS headers (`Access-Control-Allow-Origin`, etc.) if the origin is allowed.
 *
 * @param {Request} req - The Express request object.
 * @param {Response} res - The Express response object.
 * @returns {boolean} True if the origin is allowed, false otherwise.
 * @private
 */
function isOriginAllowed(req: Request, res: Response): boolean {
  const origin = req.headers.origin;
  const host = req.hostname;
  const isLocalhostBinding = ["127.0.0.1", "::1", "localhost"].includes(host);
  const allowedOrigins = config.mcpAllowedOrigins || [];
  const context = requestContextService.createRequestContext({
    operation: "isOriginAllowed",
    origin,
    host,
    isLocalhostBinding,
    allowedOrigins,
  });
  logger.debug("Checking origin allowance", context);

  const allowed =
    (origin && allowedOrigins.includes(origin)) ||
    (isLocalhostBinding && (!origin || origin === "null"));

  if (allowed && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Mcp-Session-Id, Last-Event-ID, Authorization",
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else if (!allowed && origin) {
    logger.warning(`Origin denied: ${origin}`, context);
  }
  logger.debug(`Origin check result: ${allowed}`, { ...context, allowed });
  return allowed;
}

/**
 * Proactively checks if a specific network port is already in use on a given host.
 * This is an asynchronous operation.
 * @param {number} port - The port number to check.
 * @param {string} host - The host address to check the port on.
 * @param {RequestContext} parentContext - Logging context from the caller.
 * @returns {Promise<boolean>} A promise that resolves to `true` if the port is in use (EADDRINUSE),
 *                             or `false` if it's available or if a non-EADDRINUSE error occurs.
 * @private
 */
async function isPortInUse(
  port: number,
  host: string,
  parentContext: RequestContext,
): Promise<boolean> {
  const checkContext = requestContextService.createRequestContext({
    ...parentContext,
    operation: "isPortInUse",
    port,
    host,
  });
  logger.debug(`Proactively checking port usability...`, checkContext);
  return new Promise((resolve) => {
    const tempServer = http.createServer();
    tempServer
      .once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          logger.debug(
            `Proactive check: Port confirmed in use (EADDRINUSE).`,
            checkContext,
          );
          resolve(true);
        } else {
          logger.debug(
            `Proactive check: Non-EADDRINUSE error encountered: ${err.message}`,
            { ...checkContext, errorCode: err.code },
          );
          resolve(false);
        }
      })
      .once("listening", () => {
        logger.debug(`Proactive check: Port is available.`, checkContext);
        tempServer.close(() => resolve(false));
      })
      .listen(port, host);
  });
}

/**
 * Attempts to start the provided HTTP server instance, retrying on incrementing ports
 * if an `EADDRINUSE` (address already in use) error occurs.
 * Uses proactive checks with `isPortInUse` before attempting to bind the main server.
 *
 * @param {http.Server} serverInstance - The Node.js HTTP server instance to start.
 * @param {number} initialPort - The initial port number to try.
 * @param {string} host - The host address to bind to.
 * @param {number} maxRetries - The maximum number of additional ports to attempt (initialPort + 1, initialPort + 2, ...).
 * @param {RequestContext} parentContext - Logging context from the caller.
 * @returns {Promise<number>} A promise that resolves with the port number the server successfully bound to.
 * @throws {Error} Rejects if binding fails after all retries or for a non-EADDRINUSE error during a bind attempt.
 * @private
 */
function startHttpServerWithRetry(
  serverInstance: http.Server,
  initialPort: number,
  host: string,
  maxRetries: number,
  parentContext: RequestContext,
): Promise<number> {
  const startContext = requestContextService.createRequestContext({
    ...parentContext,
    operation: "startHttpServerWithRetry",
    initialPort,
    host,
    maxRetries,
  });
  logger.debug(`Attempting to start HTTP server...`, startContext);
  return new Promise(async (resolve, reject) => {
    let lastError: Error | null = null;
    for (let i = 0; i <= maxRetries; i++) {
      const currentPort = initialPort + i;
      const attemptContext = requestContextService.createRequestContext({
        ...startContext,
        port: currentPort,
        attempt: i + 1,
        maxAttempts: maxRetries + 1,
      });
      logger.debug(
        `Attempting port ${currentPort} (${attemptContext.attempt}/${attemptContext.maxAttempts})`,
        attemptContext,
      );

      if (await isPortInUse(currentPort, host, attemptContext)) {
        logger.warning(
          `Proactive check detected port ${currentPort} is in use, retrying...`,
          attemptContext,
        );
        lastError = new Error(
          `EADDRINUSE: Port ${currentPort} detected as in use by proactive check.`,
        );
        await new Promise((res) => setTimeout(res, 100));
        continue;
      }

      try {
        await new Promise<void>((listenResolve, listenReject) => {
          serverInstance
            .listen(currentPort, host, () => {
              const serverAddress = `http://${host}:${currentPort}${MCP_ENDPOINT_PATH}`;
              logger.info(
                `HTTP transport successfully listening on host ${host} at ${serverAddress}`,
                { ...attemptContext, address: serverAddress },
              );
              listenResolve();
            })
            .on("error", (err: NodeJS.ErrnoException) => {
              listenReject(err);
            });
        });
        resolve(currentPort);
        return;
      } catch (err: any) {
        lastError = err;
        logger.debug(
          `Listen error on port ${currentPort}: Code=${err.code}, Message=${err.message}`,
          { ...attemptContext, errorCode: err.code, errorMessage: err.message },
        );
        if (err.code === "EADDRINUSE") {
          logger.warning(
            `Port ${currentPort} already in use (EADDRINUSE), retrying...`,
            attemptContext,
          );
          await new Promise((res) => setTimeout(res, 100));
        } else {
          logger.error(
            `Failed to bind to port ${currentPort} due to non-EADDRINUSE error: ${err.message}`,
            { ...attemptContext, error: err.message },
          );
          reject(err);
          return;
        }
      }
    }
    logger.error(
      `Failed to bind to any port after ${maxRetries + 1} attempts. Last error: ${lastError?.message}`,
      { ...startContext, error: lastError?.message },
    );
    reject(
      lastError ||
        new Error("Failed to bind to any port after multiple retries."),
    );
  });
}

/**
 * Sets up and starts the Streamable HTTP transport layer for the MCP server.
 * This involves:
 * - Creating an Express application.
 * - Configuring middleware: JSON body parsing, CORS handling (via `isOriginAllowed`),
 *   standard security headers, and MCP authentication (via `mcpAuthMiddleware`).
 * - Defining route handlers for the single MCP endpoint (`/mcp`) to manage POST (initialize, messages),
 *   GET (SSE stream), and DELETE (session termination) requests.
 * - Managing server-side sessions, creating a new `McpServer` instance per session using the provided factory.
 * - Starting the Node.js HTTP server with retry logic for port binding.
 *
 * @param {() => Promise<McpServer>} createServerInstanceFn - An asynchronous factory function that returns a new
 *                                                            `McpServer` instance. This is called for each new client session.
 * @param {RequestContext} parentContext - Logging context from the main server startup process.
 * @returns {Promise<void>} A promise that resolves when the HTTP server is successfully listening.
 *                          It typically does not reject from this function directly if the server starts;
 *                          critical errors during startup (like port binding failure) will cause process exit.
 * @throws {Error} If the server fails to start after all port retries (propagated from `startHttpServerWithRetry`).
 * @public
 */
export async function startHttpTransport(
  createServerInstanceFn: () => Promise<McpServer>,
  parentContext: RequestContext,
): Promise<void> {
  const app = express();
  const transportContext = requestContextService.createRequestContext({
    ...parentContext,
    transportType: "HTTP",
    component: "HttpTransportSetup",
  });
  logger.debug(
    "Setting up Express app for HTTP transport...",
    transportContext,
  );

  app.use(express.json());

  app.options(MCP_ENDPOINT_PATH, (req, res) => {
    const optionsContext = requestContextService.createRequestContext({
      ...transportContext,
      operation: "handleOptions",
      origin: req.headers.origin,
      method: req.method,
      path: req.path,
    });
    logger.debug(
      `Received OPTIONS request for ${MCP_ENDPOINT_PATH}`,
      optionsContext,
    );
    if (isOriginAllowed(req, res)) {
      logger.debug(
        "OPTIONS request origin allowed, sending 204.",
        optionsContext,
      );
      res.sendStatus(204);
    } else {
      logger.debug(
        "OPTIONS request origin denied, sending 403.",
        optionsContext,
      );
      res.status(403).send("Forbidden: Invalid Origin");
    }
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const securityContext = requestContextService.createRequestContext({
      ...transportContext,
      operation: "securityMiddleware",
      path: req.path,
      method: req.method,
      origin: req.headers.origin,
    });
    logger.debug(`Applying security middleware...`, securityContext);
    if (!isOriginAllowed(req, res)) {
      logger.debug("Origin check failed, sending 403.", securityContext);
      res.status(403).send("Forbidden: Invalid Origin");
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; object-src 'none'; style-src 'self'; img-src 'self'; media-src 'self'; frame-src 'none'; font-src 'self'; connect-src 'self'",
    );
    logger.debug("Security middleware passed.", securityContext);
    next();
  });

  app.use(mcpAuthMiddleware);

  app.post(MCP_ENDPOINT_PATH, async (req, res) => {
    const basePostContext = requestContextService.createRequestContext({
      ...transportContext,
      operation: "handlePost",
      method: "POST",
      path: req.path,
      origin: req.headers.origin,
    });
    logger.debug(`Received POST request on ${MCP_ENDPOINT_PATH}`, {
      ...basePostContext,
      headers: req.headers,
      bodyPreview: JSON.stringify(req.body).substring(0, 100),
    });

    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    logger.debug(`Extracted session ID: ${sessionId}`, {
      ...basePostContext,
      sessionId,
    });

    let transport = sessionId ? httpTransports[sessionId] : undefined;
    logger.debug(`Found existing transport for session ID: ${!!transport}`, {
      ...basePostContext,
      sessionId,
    });

    const isInitReq = isInitializeRequest(req.body);
    logger.debug(`Is InitializeRequest: ${isInitReq}`, {
      ...basePostContext,
      sessionId,
    });
    const requestId = (req.body as any)?.id || null;

    try {
      if (isInitReq) {
        if (transport) {
          logger.warning(
            "Received InitializeRequest on an existing session ID. Closing old session and creating new.",
            { ...basePostContext, sessionId },
          );
          await transport.close();
          delete httpTransports[sessionId!];
        }
        logger.info("Handling Initialize Request: Creating new session...", {
          ...basePostContext,
          sessionId,
        });

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => {
            const newId = randomUUID();
            logger.debug(`Generated new session ID: ${newId}`, basePostContext);
            return newId;
          },
          onsessioninitialized: (newId) => {
            logger.debug(
              `Session initialized callback triggered for ID: ${newId}`,
              { ...basePostContext, newSessionId: newId },
            );
            httpTransports[newId] = transport!;
            logger.info(`HTTP Session created: ${newId}`, {
              ...basePostContext,
              newSessionId: newId,
            });
          },
        });

        transport.onclose = () => {
          const closedSessionId = transport!.sessionId;
          if (closedSessionId) {
            logger.debug(
              `onclose handler triggered for session ID: ${closedSessionId}`,
              { ...basePostContext, closedSessionId },
            );
            delete httpTransports[closedSessionId];
            logger.info(`HTTP Session closed: ${closedSessionId}`, {
              ...basePostContext,
              closedSessionId,
            });
          } else {
            logger.debug(
              "onclose handler triggered for transport without session ID (likely init failure).",
              basePostContext,
            );
          }
        };

        logger.debug(
          "Creating McpServer instance for new session...",
          basePostContext,
        );
        const server = await createServerInstanceFn();
        logger.debug(
          "Connecting McpServer to new transport...",
          basePostContext,
        );
        await server.connect(transport);
        logger.debug("McpServer connected to transport.", basePostContext);
      } else if (!transport) {
        logger.warning(
          "Invalid or missing session ID for non-initialize POST request.",
          { ...basePostContext, sessionId },
        );
        res.status(404).json({
          jsonrpc: "2.0",
          error: { code: -32004, message: "Invalid or expired session ID" },
          id: requestId,
        });
        return;
      }

      const currentSessionId = transport.sessionId;
      logger.debug(
        `Processing POST request content for session ${currentSessionId}...`,
        { ...basePostContext, sessionId: currentSessionId, isInitReq },
      );
      await transport.handleRequest(req, res, req.body);
      logger.debug(
        `Finished processing POST request content for session ${currentSessionId}.`,
        { ...basePostContext, sessionId: currentSessionId },
      );
    } catch (err) {
      const errorSessionId = transport?.sessionId || sessionId;
      logger.error("Error handling POST request", {
        ...basePostContext,
        sessionId: errorSessionId,
        isInitReq,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error during POST handling",
          },
          id: requestId,
        });
      }
      if (isInitReq && transport && !transport.sessionId) {
        logger.debug("Cleaning up transport after initialization failure.", {
          ...basePostContext,
          sessionId: errorSessionId,
        });
        await transport.close().catch((closeErr) =>
          logger.error("Error closing transport after init failure", {
            ...basePostContext,
            sessionId: errorSessionId,
            closeError: closeErr,
          }),
        );
      }
    }
  });

  const handleSessionReq = async (req: Request, res: Response) => {
    const method = req.method;
    const baseSessionReqContext = requestContextService.createRequestContext({
      ...transportContext,
      operation: `handle${method}`,
      method,
      path: req.path,
      origin: req.headers.origin,
    });
    logger.debug(`Received ${method} request on ${MCP_ENDPOINT_PATH}`, {
      ...baseSessionReqContext,
      headers: req.headers,
    });

    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    logger.debug(`Extracted session ID: ${sessionId}`, {
      ...baseSessionReqContext,
      sessionId,
    });

    const transport = sessionId ? httpTransports[sessionId] : undefined;
    logger.debug(`Found existing transport for session ID: ${!!transport}`, {
      ...baseSessionReqContext,
      sessionId,
    });

    if (!transport) {
      logger.warning(`Session not found for ${method} request`, {
        ...baseSessionReqContext,
        sessionId,
      });
      res.status(404).send("Session not found or expired");
      return;
    }

    try {
      logger.debug(
        `Delegating ${method} request to transport for session ${sessionId}...`,
        { ...baseSessionReqContext, sessionId },
      );
      await transport.handleRequest(req, res);
      logger.info(
        `Successfully handled ${method} request for session ${sessionId}`,
        { ...baseSessionReqContext, sessionId },
      );
    } catch (err) {
      logger.error(
        `Error handling ${method} request for session ${sessionId}`,
        {
          ...baseSessionReqContext,
          sessionId,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        },
      );
      if (!res.headersSent) {
        res.status(500).send("Internal Server Error");
      }
    }
  };
  app.get(MCP_ENDPOINT_PATH, handleSessionReq);
  app.delete(MCP_ENDPOINT_PATH, handleSessionReq);

  logger.debug("Creating HTTP server instance...", transportContext);
  const serverInstance = http.createServer(app);
  try {
    logger.debug(
      "Attempting to start HTTP server with retry logic...",
      transportContext,
    );
    const actualPort = await startHttpServerWithRetry(
      serverInstance,
      config.mcpHttpPort,
      config.mcpHttpHost,
      MAX_PORT_RETRIES,
      transportContext,
    );
    const protocol = config.environment === "production" ? "https" : "http"; // Basic assumption
    const serverAddress = `${protocol}://${config.mcpHttpHost}:${actualPort}${MCP_ENDPOINT_PATH}`;
    if (process.stdout.isTTY) {
      console.log(
        `\n🚀 MCP Server running in HTTP mode at: ${serverAddress}\n   (MCP Spec: 2025-03-26 Streamable HTTP Transport)\n`,
      );
    }
  } catch (err) {
    logger.fatal("HTTP server failed to start after multiple port retries.", {
      ...transportContext,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
