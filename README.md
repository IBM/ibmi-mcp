<div align="center">

# ibmi-mcp-server

**Build production-grade Model Context Protocol (MCP) servers with a powerful, type-safe, and extensible foundation.**

[![TypeScript](https://img.shields.io/badge/TypeScript-^5.8.3-blue?style=flat-square)](https://www.typescriptlang.org/)
[![Model Context Protocol SDK](https://img.shields.io/badge/MCP%20SDK-^1.17.1-green?style=flat-square)](https://github.com/modelcontextprotocol/typescript-sdk)
[![MCP Spec Version](https://img.shields.io/badge/MCP%20Spec-2025--06--18-lightgrey?style=flat-square)](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-06-18/changelog.mdx)
[![Version](https://img.shields.io/badge/Version-1.8.1-blue?style=flat-square)](./CHANGELOG.md)
[![Coverage](https://img.shields.io/badge/Coverage-64.67%25-brightgreen?style=flat-square)](./vitest.config.ts)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue?style=flat-square)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Stable-green?style=flat-square)](https://github.com/ajshedivy/ibmi-mcp-server)
[![GitHub](https://img.shields.io/github/stars/cyanheads/mcp-ts-template?style=social)](https://github.com/cyanheads/mcp-ts-template)

</div>

This repository provides a robust MCP server implementation for IBM i. 

## ✨ Key Features

| Feature Area                | Description                                                                                                                                          | Key Components / Location                                            |
| :-------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------- |
| **🔌 MCP Server**           | A functional server with example tools and resources. Supports `stdio` and a **Streamable HTTP** transport built with [**Hono**](https://hono.dev/). | `src/mcp-server/`, `src/mcp-server/transports/`                      |
| **🔭 Observability**        | Built-in **OpenTelemetry** for distributed tracing and metrics. Auto-instrumentation for core modules and custom tracing for all tool executions.    | `src/utils/telemetry/`                                               |
| **🚀 Production Utilities** | Logging, Error Handling, ID Generation, Rate Limiting, Request Context tracking, Input Sanitization.                                                 | `src/utils/`                                                         |
| **🔒 Type Safety/Security** | Strong type checking via TypeScript & Zod validation. Built-in security utilities (sanitization, auth middleware for HTTP).                          | Throughout, `src/utils/security/`, `src/mcp-server/transports/auth/` |
| **⚙️ Error Handling**       | Consistent error categorization (`BaseErrorCode`), detailed logging, centralized handling (`ErrorHandler`).                                          | `src/utils/internal/errorHandler.ts`, `src/types-global/`            |
| **📚 Documentation**        | Comprehensive `README.md`, structured JSDoc comments, API references.                                                                                | `README.md`, Codebase, `tsdoc.json`, `docs/api-references/`          |
| **🕵️ Interaction Logging**  | Captures raw requests and responses for all external LLM provider interactions to a dedicated `interactions.log` file for full traceability.         | `src/utils/internal/logger.ts`                                       |
| **🤖 Agent Ready**          | Includes a [.clinerules](./.clinerules/clinerules.md) developer cheatsheet tailored for LLM coding agents.                                           | `.clinerules/`                                                       |
| **🛠️ Utility Scripts**      | Scripts for cleaning builds, setting executable permissions, generating directory trees, and fetching OpenAPI specs.                                 | `scripts/`                                                           |
| **🧩 Services**             | Reusable modules for LLM (OpenRouter) and data storage (DuckDB) integration, with examples.                                                          | `src/services/`, `src/storage/duckdbExample.ts`                      |
| **🧪 Integration Testing**  | Integrated with Vitest for fast and reliable integration testing. Includes example tests for core logic and a coverage reporter.                     | `vitest.config.ts`, `tests/`                                         |
| **⏱️ Performance Metrics**  | Built-in utility to automatically measure and log the execution time and payload size of every tool call.                                            | `src/utils/internal/performance.ts`                                  |

## Architecture Overview

This template is built on a set of architectural principles to ensure modularity, testability, and operational clarity.

- **Core Server (`src/mcp-server/server.ts`)**: The central point where tools and resources are registered. It uses a `ManagedMcpServer` wrapper to provide enhanced introspection capabilities. It acts the same way as the native McpServer, but with additional features like introspection and enhanced error handling.
- **Transports (`src/mcp-server/transports/`)**: The transport layer connects the core server to the outside world. It supports both `stdio` for direct process communication and a streamable **Hono**-based `http` server.
- **"Logic Throws, Handler Catches"**: This is the immutable cornerstone of our error-handling strategy.
  - **Core Logic (`logic.ts`)**: This layer is responsible for pure, self-contained business logic. It **throws** a structured `McpError` on any failure.
  - **Handlers (`registration.ts`)**: This layer interfaces with the server, invokes the core logic, and **catches** any errors. It is the exclusive location where errors are processed and formatted into a final response.
- **Structured, Traceable Operations**: Every operation is traced from initiation to completion via a `RequestContext` that is passed through the entire call stack, ensuring comprehensive and structured logging.

## Quick Start

### 1. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/ajshedivy/ibmi-mcp-server.git
cd ibmi-mcp-server
npm install
```

### 2. Build the Project

```bash
npm run build
# Or use 'npm run rebuild' for a clean install
```

### 3. Create Server .env File
```bash
cp .env.example .env
```

Fill out the Db2 for i connection details in the `.env` file:
```bash
# IBM i DB2 for i Connection Settings
# Required for YAML SQL tools to connect to IBM i systems
DB2i_HOST=
DB2i_USER=
DB2i_PASS=
DB2i_PORT=8076
DB2i_IGNORE_UNAUTHORIZED=true
```

### 4. Running the Server

- **Via Stdio (Default):**
  ```bash
  npm run start:stdio
  ```
- **Via Streamable HTTP:**
  ```bash
  npm run start:http
  ```

### 5. Run Example Agent

Make sure that the server is running in `http` mode:
```bash
npm run start:http
```

In another terminal, navigate to the `tests/agents` directory and follow the setup instructions in the [README](./tests/agents/README.md).

#### Run the example Agent:
```bash
cd tests/agents
uv run agent.py -p "What is my system status?"
```

#### Run the Example Scripts:
```bash
cd tests/agents

# See a list of configured tools:
uv run test_tool_annotations.py -d

# see a list of server resources:
uv run test_toolset_resources.py
```

### 6. Running Tests

This template uses [Vitest](https://vitest.dev/) for testing, with a strong emphasis on **integration testing** to ensure all components work together correctly.

- **Run all tests once:**
  ```bash
  npm test
  ```
- **Run tests in watch mode:**
  ```bash
  npm run test:watch
  ```
- **Run tests and generate a coverage report:**
  ```bash
  npm run test:coverage
  ```

## ⚙️ Configuration

Configure the server using these environment variables (or a `.env` file):

| Variable                              | Description                                                                               | Default                                |
| :------------------------------------ | :---------------------------------------------------------------------------------------- | :------------------------------------- |
| `MCP_TRANSPORT_TYPE`                  | Server transport: `stdio` or `http`.                                                      | `stdio`                                |
| `MCP_SESSION_MODE`                    | Session mode for HTTP: `stateless`, `stateful`, or `auto`.                                | `auto`                                 |
| `MCP_HTTP_PORT`                       | Port for the HTTP server.                                                                 | `3010`                                 |
| `MCP_HTTP_HOST`                       | Host address for the HTTP server.                                                         | `127.0.0.1`                            |
| `MCP_ALLOWED_ORIGINS`                 | Comma-separated allowed origins for CORS.                                                 | (none)                                 |
| `MCP_AUTH_MODE`                       | Authentication mode for HTTP: `jwt`, `oauth`, or `none`.                                  | `none`                                 |
| `MCP_AUTH_SECRET_KEY`                 | **Required for `jwt` mode.** Secret key (min 32 chars) for signing/verifying auth tokens. | (none - **MUST be set in production**) |
| `OAUTH_ISSUER_URL`                    | **Required for `oauth` mode.** The issuer URL of your authorization server.               | (none)                                 |
| `OAUTH_AUDIENCE`                      | **Required for `oauth` mode.** The audience identifier for this MCP server.               | (none)                                 |
| `OPENROUTER_API_KEY`                  | API key for OpenRouter.ai service.                                                        | (none)                                 |
| `OTEL_ENABLED`                        | Set to `true` to enable OpenTelemetry instrumentation.                                    | `false`                                |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`  | The OTLP endpoint for exporting traces (e.g., `http://localhost:4318/v1/traces`).         | (none; logs to file)                   |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | The OTLP endpoint for exporting metrics (e.g., `http://localhost:4318/v1/metrics`).       | (none)                                 |
| `TOOLS_YAML_PATH`                     | Path to YAML tool definitions (file or directory). Supports directories or globs.         | (none)                                 |
| `YAML_MERGE_ARRAYS`                   | When merging multiple YAML files, merge arrays (`true`) instead of replacing them.         | `false`                                |
| `YAML_ALLOW_DUPLICATE_TOOLS`          | Allow duplicate tool names across merged YAML files.                                       | `false`                                |
| `YAML_ALLOW_DUPLICATE_SOURCES`        | Allow duplicate source names across merged YAML files.                                     | `false`                                |
| `YAML_VALIDATE_MERGED`                | Validate the merged YAML configuration before use.                                         | `true`                                 |
| `DB2i_HOST`                           | IBM i Db2 for i host (Mapepire daemon or gateway host).                                    | (none)                                 |
| `DB2i_USER`                           | IBM i user profile for Db2 for i connections.                                              | (none)                                 |
| `DB2i_PASS`                           | Password for the IBM i user profile.                                                       | (none)                                 |
| `DB2i_PORT`                           | Port for the Mapepire daemon/gateway used for Db2 for i.                                   | `8076`                                 |
| `DB2i_IGNORE_UNAUTHORIZED`            | If `true`, skip TLS certificate verification for Mapepire (self-signed certs, etc.).       | `true`                                 |



## Docker & Podman Deployment

The project includes a comprehensive `docker-compose.yml` that sets up the complete MCP gateway with the IBM i MCP Server.

ContextForge MCP Gateway is a feature-rich gateway, proxy and MCP Registry that federates MCP and REST services - unifying discovery, auth, rate-limiting, observability, virtual servers, multi-transport protocols, and an optional Admin UI into one clean endpoint for your AI clients.

Read more about it [here](https://github.com/IBM/mcp-context-forge).

### Prerequisites

Choose one of the following container platforms:

#### Docker
- **Docker Desktop** (macOS/Windows): [Download here](https://www.docker.com/products/docker-desktop/)
- **Docker Engine** (Linux): [Installation guide](https://docs.docker.com/engine/install/)

#### Podman (Alternative to Docker)
- **Podman Desktop** (macOS/Windows): [Download here](https://podman-desktop.io/)
- **Podman CLI** (Linux): [Installation guide](https://podman.io/docs/installation)
- **podman-compose**: `pip install podman-compose`

### Quick Start with Docker

1. **Clone and navigate to the project:**
   ```bash
   git clone https://github.com/ajshedivy/ibmi-mcp-server.git
   cd ibmi-mcp-server
   ```

2. **Create your environment file:**
   ```bash
   cp .env.example .env
   # Edit .env with your IBM i connection details
   ```

3. **Start the complete stack:**
   ```bash
   # Start all services in background
   docker-compose up -d
   
   # Or start specific services
   docker-compose up -d gateway ibmi-mcp-server postgres redis
   ```

4. **Verify services are running:**
   ```bash
   docker-compose ps
   ```

### Quick Start with Podman

1. **Clone and navigate to the project:**
   ```bash
   git clone https://github.com/ajshedivy/ibmi-mcp-server.git
   cd ibmi-mcp-server
   ```

2. **Create your environment file:**
   ```bash
   cp .env.example .env
   # Edit .env with your IBM i connection details
   ```

3. **Start the complete stack:**
   ```bash
   # Start all services in background
   podman-compose up -d
   
   # Or start specific services
   podman-compose up -d gateway ibmi-mcp-server postgres redis
   ```

4. **Verify services are running:**
   ```bash
   podman-compose ps
   ```

### Container Architecture

The docker-compose setup includes these services:

| Service | Port | Description | Access URL |
|---------|------|-------------|------------|
| **gateway** | 4444 | MCP Context Forge main API | http://localhost:4444 |
| **ibmi-mcp-server** | 3010 | IBM i SQL tools MCP server | http://localhost:3010 |
| **postgres** | - | PostgreSQL database (internal) | - |
| **redis** | 6379 | Cache service | redis://localhost:6379 |
| **pgadmin** | 5050 | Database admin UI | http://localhost:5050 |
| **redis_insight** | 5540 | Cache admin UI | http://localhost:5540 |

### 🔧 Service Management

#### Start Services
```bash
# Docker
docker-compose up -d                    # Start all services
docker-compose up -d gateway            # Start specific service
docker-compose up --no-deps gateway     # Start without dependencies

# Podman
podman-compose up -d                    # Start all services
podman-compose up -d gateway            # Start specific service
podman-compose up --no-deps gateway     # Start without dependencies
```

#### Stop Services
```bash
# Docker
docker-compose down                     # Stop all services
docker-compose stop gateway             # Stop specific service

# Podman
podman-compose down                     # Stop all services
podman-compose stop gateway             # Stop specific service
```

#### View Logs
```bash
# Docker
docker-compose logs -f gateway          # Follow gateway logs
docker-compose logs --tail=100 ibmi-mcp-server

# Podman
podman-compose logs -f gateway          # Follow gateway logs
podman-compose logs --tail=100 ibmi-mcp-server
```

#### Rebuild Services
```bash
# Docker
docker-compose build ibmi-mcp-server    # Rebuild specific service
docker-compose up --build -d            # Rebuild and restart all

# Podman
podman-compose build ibmi-mcp-server    # Rebuild specific service
podman-compose up --build -d            # Rebuild and restart all
```

### MCP Context Forge UI:

![alt text](images/image.png)

After the Containers are up and running, you can access the MCP Context Forge UI at http://localhost:4444

Enter the demo credentials:
- User: `admin`
- Password: `changeme`

To Configure the IBM i MCP server is the admin ui, navigate to the "Gateways/MCP Servers" tab. and enter the mcp server endpoint:
- IBM i mcp server endpoint: `http://ibmi-mcp-server:3010`

![alt text](images/image-1.png)

Once the MCP server is connect, you can then manage the tools provided by the server:

![alt text](images/image-2.png)

### Virtual Server Catalog Demo (Comming soon!!)

## 🏗️ Project Structure

- **`src/mcp-server/`**: Contains the core MCP server, tools, resources, and transport handlers.
- **`src/config/`**: Handles loading and validation of environment variables.
- **`src/services/`**: Reusable modules for integrating with external services (DuckDB, OpenRouter).
- **`src/types-global/`**: Defines shared TypeScript interfaces and type definitions.
- **`src/utils/`**: Core utilities (logging, error handling, security, etc.).
- **`src/index.ts`**: The main entry point that initializes and starts the server.

**Explore the full structure yourself:**

See the current file tree in [docs/tree.md](docs/tree.md) or generate it dynamically:

```bash
npm run tree
```

## 🧩 Extending the System

The template enforces a strict, modular pattern for adding new tools and resources, as mandated by the [Architectural Standard](./.clinerules/clinerules.md). The `echoTool` (`src/mcp-server/tools/echoTool/`) serves as the canonical example.

### The "Logic Throws, Handler Catches" Pattern

This is the cornerstone of the architecture:

1.  **`logic.ts`**: This file contains the pure business logic.
    - It defines the Zod schemas for input and output, which serve as the single source of truth for the tool's data contract.
    - The core logic function is pure: it takes validated parameters and a request context, and either returns a result or **throws** a structured `McpError`.
    - It **never** contains `try...catch` blocks for formatting a final response.

2.  **`registration.ts`**: This file is the "handler" that connects the logic to the MCP server.
    - It imports the schemas and logic function from `logic.ts`.
    - It calls `server.registerTool()`, providing the tool's metadata and the runtime handler.
    - The runtime handler **always** wraps the call to the logic function in a `try...catch` block. This is the **only** place where errors are caught, processed by the `ErrorHandler`, and formatted into a standardized error response.

This pattern ensures that core logic remains decoupled, pure, and easily testable, while the registration layer handles all transport-level concerns, side effects, and response formatting.

## 🌍 Explore More MCP Resources

Looking for more examples, guides, and pre-built MCP servers? Check out the companion repository:

➡️ **[cyanheads/model-context-protocol-resources](https://github.com/cyanheads/model-context-protocol-resources)**

## 📜 License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.
