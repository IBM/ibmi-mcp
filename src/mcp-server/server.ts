/**
 * @fileoverview Main entry point for the MCP (Model Context Protocol) server.
 * This file orchestrates the server's lifecycle:
 * 1. Initializes the core `McpServer` instance (from `@modelcontextprotocol/sdk`) with its identity and capabilities.
 * 2. Registers available resources and tools, making them discoverable and usable by clients.
 * 3. Selects and starts the appropriate communication transport (stdio or Streamable HTTP)
 *    based on configuration.
 * 4. Handles top-level error management during startup.
 *
 * MCP Specification References:
 * - Lifecycle: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/basic/lifecycle.mdx
 * - Overview (Capabilities): https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/basic/index.mdx
 * - Transports: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/basic/transports.mdx
 * @module src/mcp-server/server
 */

import http from "http";
import { config, environment } from "../config/index.js";
import { ErrorHandler, logger, requestContextService } from "../utils/index.js";
import { ManagedMcpServer } from "./core/managedMcpServer.js";
// import { registerEchoResource } from "./resources/echoResource/index.js";
// import { registerCatFactFetcherTool } from "./tools/catFactFetcher/index.js";
// import { registerEchoTool } from "./tools/echoTool/index.js";
// import { registerFetchImageTestTool } from "./tools/imageTest/index.js";
import { registerToolsetsResource } from "./resources/toolsetsResource/index.js";
import { startHttpTransport } from "./transports/http/index.js";
import { startStdioTransport } from "./transports/stdio/index.js";
import { YamlToolsLoader } from "../utils/yaml/yamlToolsLoader.js";

/**
 * Lazy initialization of YAML tools dependencies
 * Only loads when YAML tools are actually needed
 */
async function initializeYamlDependencies() {
  const { SourceManager } = await import(
    "../services/yaml-sources/sourceManager.js"
  );
  const { ToolsetManager } = await import("../utils/yaml/toolsetManager.js");
  const { YamlToolFactory } = await import("../utils/yaml/yamlToolFactory.js");

  return {
    sourceManager: SourceManager.getInstance(),
    toolsetManager: ToolsetManager.getInstance(),
    toolFactory: YamlToolFactory.getInstance(),
  };
}

/**
 * Creates and configures a new instance of the `McpServer`.
 *
 * @returns A promise resolving with the configured `ManagedMcpServer` instance.
 * @throws {McpError} If any resource or tool registration fails.
 * @private
 */
async function createMcpServerInstance(): Promise<ManagedMcpServer> {
  const context = requestContextService.createRequestContext({
    operation: "createMcpServerInstance",
  });
  logger.info("Initializing MCP server instance", context);

  requestContextService.configure({
    appName: config.mcpServerName,
    appVersion: config.mcpServerVersion,
    environment,
  });

  const server = new ManagedMcpServer(
    { name: config.mcpServerName, version: config.mcpServerVersion },
    {
      capabilities: {
        logging: {},
        resources: { listChanged: true },
        tools: { listChanged: true },
      },
    },
  );

  try {
    logger.debug("Registering resources and tools...", context);
    // await registerEchoResource(server);
    // await registerEchoTool(server);
    // await registerCatFactFetcherTool(server);
    // await registerFetchImageTestTool(server);

    // Load YAML tools if configured
    if (process.env.TOOLS_YAML_PATH) {
      logger.debug("Loading YAML tools from server instance...", context);

      // Import required dependencies
      const dependencies = await initializeYamlDependencies();

      // Create loader with dependencies
      const yamlLoader = YamlToolsLoader.createInstance({
        sourceManager: dependencies.sourceManager,
        toolsetManager: dependencies.toolsetManager,
        toolFactory: dependencies.toolFactory,
      });

      const loadingResult = await yamlLoader.loadAndRegisterTools(
        server,
        context,
      );

      if (!loadingResult.success) {
        logger.error("Failed to load YAML tools in server instance.", {
          ...context,
          error: loadingResult.error,
        });
      } else {
        logger.info("YAML tools loaded successfully in server instance.", {
          ...context,
          stats: loadingResult.stats,
        });
      }
    }

    // Register toolsets resource (only if YAML tools are loaded)
    if (process.env.TOOLS_YAML_PATH) {
      await registerToolsetsResource(server);
    }

    logger.info("Resources and tools registered successfully", context);
  } catch (err) {
    logger.error("Failed to register resources/tools", {
      ...context,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  }

  return server;
}

/**
 * Selects, sets up, and starts the appropriate MCP transport layer based on configuration.
 *
 * @returns Resolves with `McpServer` for 'stdio' or `http.Server` for 'http'.
 * @throws {Error} If transport type is unsupported or setup fails.
 * @private
 */
async function startTransport(): Promise<ManagedMcpServer | http.Server> {
  const transportType = config.mcpTransportType;
  const context = requestContextService.createRequestContext({
    operation: "startTransport",
    transport: transportType,
  });
  logger.info(`Starting transport: ${transportType}`, context);

  if (transportType === "http") {
    const { server } = await startHttpTransport(
      createMcpServerInstance,
      context,
    );
    return server as http.Server;
  }

  if (transportType === "stdio") {
    const server = await createMcpServerInstance();
    await startStdioTransport(server, context);
    return server;
  }

  logger.crit(
    `Unsupported transport type configured: ${transportType}`,
    context,
  );
  throw new Error(
    `Unsupported transport type: ${transportType}. Must be 'stdio' or 'http'.`,
  );
}

/**
 * Main application entry point. Initializes and starts the MCP server.
 */
export async function initializeAndStartServer(): Promise<
  ManagedMcpServer | http.Server
> {
  const context = requestContextService.createRequestContext({
    operation: "initializeAndStartServer",
  });
  logger.info("MCP Server initialization sequence started.", context);
  try {
    const result = await startTransport();
    logger.info(
      "MCP Server initialization sequence completed successfully.",
      context,
    );
    return result;
  } catch (err) {
    logger.crit("Critical error during MCP server initialization.", {
      ...context,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    ErrorHandler.handleError(err, {
      ...context,
      operation: "initializeAndStartServer_Catch",
      critical: true,
    });
    logger.info(
      "Exiting process due to critical initialization error.",
      context,
    );
    process.exit(1);
  }
}
