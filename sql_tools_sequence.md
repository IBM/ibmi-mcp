# MCP Server SQL Tools Loading Sequence

This document provides a comprehensive end-to-end sequence diagram showing how SQL tools are loaded, processed, and registered in the IBM i MCP Server.

## Overview

The SQL tools loading process follows a systematic 3-step workflow:

1. **Parse & Validate** - YAML configurations are loaded and validated
2. **Process & Cache** - Tools are processed into standardized configurations
3. **Register & Activate** - Tools are registered with the MCP server

## Architecture Components

- **ToolProcessor**: Orchestrates the entire SQL tool loading workflow
- **ToolConfigBuilder**: Builds and merges YAML configurations from multiple sources
- **ConfigParser**: Parses and validates individual YAML files
- **ToolConfigCache**: Caches processed tool configurations for performance
- **SourceManager**: Manages database connection pools for SQL execution
- **SQLToolFactory**: Executes SQL statements with parameter binding

## Sequence Diagram

```mermaid
sequenceDiagram
    participant Main as index.ts
    participant Server as mcp-server/server.ts
    participant IBM as ibmi-mcp-server/index.ts
    participant TP as ToolProcessor
    participant TCB as ToolConfigBuilder
    participant CP as ConfigParser
    participant TCC as ToolConfigCache
    participant SM as SourceManager
    participant TSM as ToolsetManager
    participant STF as SQLToolFactory
    participant MCP as McpServer

    Note over Main,MCP: 🚀 Application Startup

    Main->>+Server: initializeAndStartServer()
    Server->>+Server: createMcpServerInstance()

    Note over Server: Initialize MCP Server with capabilities

    Server->>+IBM: registerSQLTools(server)

    Note over IBM,TP: 🔄 Cache Check (Fast Path)

    IBM->>IBM: Check cachedToolConfigs.isEmpty()

    alt Cache Hit (Fast Path)
        IBM->>+TCC: registerCachedTools(server, context)
        Note over TCC: Register pre-processed tools instantly
        TCC->>MCP: server.registerTool() for each cached tool
        TCC-->>-IBM: Registration complete
    else Cache Miss (Processing Path)
        Note over IBM,TP: 🏗️ Full Processing Workflow

        IBM->>+TP: new ToolProcessor()
        IBM->>TP: initialize(context)

        Note over TP: Validate configuration & initialize dependencies

        TP->>+SM: SourceManager.getInstance()
        SM-->>-TP: Source manager ready
        TP->>+TSM: ToolsetManager.getInstance()
        TSM-->>-TP: Toolset manager ready

        IBM->>+TP: processTools(context)

        Note over TP,TCB: 📋 Configuration Building Phase

        TP->>+TCB: ToolConfigBuilder.getInstance()
        TCB-->>-TP: Builder instance

        TP->>+TCB: buildFromSources(sources, options, context)

        Note over TCB: Resolve file paths from config sources

        loop For each YAML file
            TCB->>+CP: parseYamlFile(filePath, context)

            Note over CP: 🔍 File Processing

            CP->>CP: readFileSync(filePath)
            CP->>CP: yamlLoad(fileContent)
            CP->>CP: interpolateEnvironmentVariables()
            CP->>CP: SQLToolsConfigSchema.safeParse()
            CP->>CP: validateToolRequirements()
            CP->>CP: processTools() - Create ProcessedSQLTool[]

            CP-->>-TCB: { success: true, config: SQLToolsConfig }
        end

        TCB->>TCB: mergeConfigurations(configs)
        TCB->>TCB: validateMergedConfig()

        TCB-->>-TP: { success: true, config: mergedConfig }

        Note over TP: 🛠️ Tool Generation Phase

        TP->>TP: generateToolConfigurations(yamlConfig)

        loop For each SQL tool in config
            TP->>TP: createToolDefinition(toolName, toolConfig)
            Note over TP: Generate Zod schemas, handlers, annotations
        end

        TP-->>-IBM: { success: true, toolConfigs: CachedToolConfig[] }

        Note over IBM,TCC: 💾 Caching Phase

        IBM->>+TCC: ToolConfigCache.getInstance()
        TCC-->>-IBM: Cache instance

        IBM->>+TCC: cacheToolConfigs(toolConfigs, context)
        TCC->>TCC: Store processed configurations
        TCC-->>-IBM: { success: true, toolCount, toolsetCount }

        Note over IBM,TP: 📝 Registration Phase

        IBM->>+TP: registerWithServer(server, context)

        loop For each cached tool config
            TP->>TP: createHandlerFromDefinition(config)

            Note over TP: Create runtime handler with SQLToolFactory integration

            TP->>+MCP: server.registerTool(name, definition, handler)

            Note over MCP: Tool available for client requests

            MCP-->>-TP: Tool registered
        end

        TP-->>-IBM: All tools registered

        Note over IBM: 🔄 Auto-reload Setup (if enabled)

        opt YAML Auto-reload Enabled
            IBM->>TP: setupAutoReload(server, context)
            Note over TP: Watch YAML files for changes
        end

    end

    IBM-->>-Server: SQL tools registered
    Server-->>-Main: MCP server initialized with SQL tools

    Note over Main,MCP: 🎯 Runtime Tool Execution

    Note over MCP: Client makes tool request

    MCP->>MCP: Route to registered tool handler
    MCP->>+TP: Execute tool handler

    Note over TP: 🔧 SQL Execution Phase

    TP->>TP: Validate parameters against Zod schema
    TP->>+STF: executeStatementWithParameters()

    STF->>STF: Process parameters with ParameterProcessor
    STF->>STF: Apply security validation

    STF->>+SM: executeQuery(source, sql, params)
    SM->>SM: Route to appropriate connection pool
    SM->>SM: Execute SQL via Mapepire
    SM-->>-STF: QueryResult<T>

    STF->>STF: Format response with metadata
    STF-->>-TP: SQLToolExecutionResult<T>

    TP->>TP: Format final MCP response
    TP-->>-MCP: CallToolResult

    MCP-->>MCP: Return result to client

    Note over Main,MCP: ✅ SQL Tool Ready for Use
```

## Key Phases Breakdown

### 1. **Startup & Cache Check**

- Application starts and initializes MCP server
- Checks for cached tool configurations for fast startup
- Falls back to full processing if cache is empty

### 2. **Configuration Processing** (Cache Miss Path)

- **File Discovery**: Resolves YAML file paths from configuration
- **Parsing**: Each YAML file is loaded, validated, and parsed
- **Merging**: Multiple configurations are merged into a unified config
- **Validation**: Ensures all tool references and dependencies are valid

### 3. **Tool Generation**

- **Schema Generation**: Creates Zod input/output schemas for each tool
- **Handler Creation**: Builds runtime handlers that integrate with SQLToolFactory
- **Metadata Processing**: Applies annotations, toolset assignments, security configs

### 4. **Caching & Registration**

- **Caching**: Stores processed configurations for future fast startup
- **Registration**: Registers each tool with the MCP server instance
- **Auto-reload**: Sets up file watching for development workflow

### 5. **Runtime Execution**

- **Request Routing**: MCP server routes client requests to appropriate handlers
- **Parameter Processing**: Validates and processes SQL parameters
- **SQL Execution**: Executes queries via connection pools with security validation
- **Response Formatting**: Returns structured results to clients

## Performance Optimizations

- **Caching**: Processed tool configurations are cached to avoid reprocessing
- **Lazy Initialization**: Database connections are created only when needed
- **Batch Processing**: Multiple YAML files are processed efficiently
- **Connection Pooling**: Database connections are pooled and reused

## Error Handling

- **Graceful Degradation**: Failed tools don't prevent others from loading
- **Detailed Logging**: Comprehensive logging throughout the entire process
- **Validation**: Multiple validation layers prevent runtime errors
- **Recovery**: Auto-reload functionality handles configuration changes

This sequence represents the complete lifecycle from server startup to ready-to-use SQL tools accessible via the MCP protocol.
