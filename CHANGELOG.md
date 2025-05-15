# Changelog

All notable changes to this project will be documented in this file.

## [1.2.1] - 2025-05-15

### Added

- **Development Tooling**:
  - Added `prettier` as a dev dependency for consistent code formatting.
  - Included a `format` script in `package.json` to run Prettier across the codebase.
- **Documentation**:
  - Expanded `tsdoc.json` to recognize more standard JSDoc tags (`@property`, `@class`, `@static`, `@private`, `@constant`) for improved TypeDoc generation.

### Changed

- **Code Quality**:
  - Extensively refactored JSDoc comments across the entire codebase (core utilities, MCP client/server components, services, scripts, and type definitions) for improved clarity, accuracy, and completeness.
  - Standardized code formatting throughout the project using Prettier.
  - Added `@module` and `@fileoverview` JSDoc tags to relevant files to enhance documentation structure and maintainability.
- **Scripts**:
  - Improved JSDoc comments and formatting in utility scripts (`scripts/clean.ts`, `scripts/fetch-openapi-spec.ts`, `scripts/make-executable.ts`, `scripts/tree.ts`).
- **Documentation Files**:
  - Updated `docs/api-references/jsdoc-standard-tags.md` with formatting improvements and to align with expanded `tsdoc.json`.
  - Refreshed `docs/tree.md` to reflect the current directory structure and generation timestamp.
  - Updated `README.md` to reflect the new version.
- **Configuration**:
  - Minor formatting adjustment in `repomix.config.json`.
  - Minor formatting adjustment (trailing newline) in `tsconfig.json`.
- **Core Application & Utilities**:
  - Refactored configuration management (`src/config/index.ts`) for enhanced clarity, validation using Zod, and comprehensive JSDoc.
  - Overhauled the main application entry point (`src/index.ts`) with improved startup/shutdown logic, robust error handling for uncaught exceptions/rejections, and detailed JSDoc.
  - Enhanced error type definitions (`src/types-global/errors.ts`) with extensive JSDoc, clarifying `BaseErrorCode`, `McpError`, and `ErrorSchema`.
- **MCP Components**:
  - Refactored the `echo` resource (`src/mcp-server/resources/echoResource/`) with detailed JSDoc, clearer type definitions, and improved registration logic.
  - Refactored the `echo_message` tool (`src/mcp-server/tools/echoTool/`) with detailed JSDoc, improved input/response types, and enhanced registration structure.

## [1.2.0] - 2025-05-14

### Added

- **Documentation System**:
  - Integrated JSDoc for comprehensive code documentation.
  - Added `tsdoc.json` for TSDoc configuration to ensure consistent JSDoc tag recognition by TypeDoc.
  - Included `docs/api-references/jsdoc-standard-tags.md` as a detailed reference for standard JSDoc tags.
  - Updated `.clinerules` with a new section on JSDoc and code documentation best practices.
- **Logging**: Implemented log file rotation for the Winston logger (`src/utils/internal/logger.ts`) to manage log file sizes.

### Changed

- **Refactoring**:
  - Standardized `RequestContext` creation and usage across the application (server, transports, core utilities) using `requestContextService.createRequestContext()` for improved logging, error reporting, and operational tracing.
  - Enhanced `ErrorHandler` (`src/utils/internal/errorHandler.ts`) to correctly use and create `RequestContext` and improve log payload creation.
  - Significantly refactored the `Logger` (`src/utils/internal/logger.ts`) to correctly handle `RequestContext`, improve console logging format, and enhance MCP notification payloads.
  - Updated JSDoc comments in `src/utils/internal/requestContext.ts` and improved internal logging within the service.
  - Modified various utility files (`jsonParser.ts`, `rateLimiter.ts`, `sanitization.ts`) to use `requestContextService.createRequestContext` for internal logging when a context is not provided.
- **Dependencies**:
  - Updated `@types/node` from `22.15.17` to `22.15.18`.
  - Updated `sanitize-html` from `2.16.0` to `2.17.0`.
- **Documentation**:
  - Updated `docs/tree.md` to reflect new documentation files and structure.

## [1.1.9] - 2025-05-12

### Changed

- **Configuration**:
  - Renamed `APP_URL` to `OPENROUTER_APP_URL` and `APP_NAME` to `OPENROUTER_APP_NAME` across the codebase (`src/config/index.ts`, `src/services/openRouterProvider.ts`, `README.md`) for clarity.

## [1.1.8] - 2025-05-12

### Added

- **Service**: Integrated OpenRouter service (`src/services/openRouterProvider.ts`) for leveraging various Large Language Models.
- **Configuration**:
  - Added new environment variables to `src/config/index.ts` for OpenRouter and LLM customization: `OPENROUTER_APP_URL`, `OPENROUTER_APP_NAME`, `OPENROUTER_API_KEY`, `LLM_DEFAULT_MODEL`, `LLM_DEFAULT_TEMPERATURE`, `LLM_DEFAULT_TOP_P`, `LLM_DEFAULT_MAX_TOKENS`, `LLM_DEFAULT_TOP_K`, `LLM_DEFAULT_MIN_P`.
- **Error Handling**: Introduced `INITIALIZATION_FAILED` error code to `src/types-global/errors.ts` for better service initialization diagnostics.

### Changed

- **Dependencies**:
  - Updated `@modelcontextprotocol/sdk` to `^1.11.2`.
  - Updated `@types/node` to `^22.15.17`.
  - Updated `openai` to `^4.98.0`.
- **Documentation**:
  - Updated `README.md` to document new OpenRouter environment variables and add the OpenRouter Provider to the project features table.
  - Refreshed `docs/tree.md` to reflect the current directory structure.

## [1.1.7] - 2025-05-07

### Added

- **Configuration**: Added `mcp.json` (MCP client/server configuration file) to version control.
- **Scripts**: Added `inspector` script to `package.json` for use with `mcp-inspector`.

### Changed

- **Dependencies**: Updated several direct and development dependencies, including `@types/node`, `@types/sanitize-html`, `openai`, `zod`, and `typedoc`.
- **Version**: Bumped project version to `1.1.7` in `package.json`, `README.md`.
- **Error Handling**: Significantly refactored the `ErrorHandler` utility (`src/utils/internal/errorHandler.ts`) with improved JSDoc, more robust error classification, and refined handling of `McpError` instances.
- **Logging**:
  - Made console output (warnings, info messages, errors) conditional on `stdout` being a TTY across various files (`src/config/index.ts`, `src/mcp-server/transports/httpTransport.ts`, `src/utils/internal/logger.ts`) to prevent interference with MCP protocol in stdio mode.
  - Removed `rethrow: true` from `ErrorHandler.tryCatch` calls in `src/mcp-client/client.ts` and `src/utils/metrics/tokenCounter.ts` as `tryCatch` now rethrows by default if an error occurs.
- **Request Context**: Refactored `src/utils/internal/requestContext.ts` with comprehensive JSDoc documentation and minor structural improvements for clarity and maintainability.
- **Documentation**: Updated `docs/tree.md` to reflect the addition of `mcp.json`.

## [1.1.6] - 2025-05-07

### Added

- **Scripts**: Added `inspector` script to `package.json` for use with `mcp-inspector`.
- **Configuration**: Added `mcp.json` (MCP client/server configuration file) to version control.

### Changed

- **Dependencies**: Updated several direct and development dependencies:
  - `@types/node`: `^22.15.3` -> `^22.15.15`
  - `@types/sanitize-html`: `^2.15.0` -> `^2.16.0`
  - `openai`: `^4.96.2` -> `^4.97.0`
  - `zod`: `^3.24.3` -> `^3.24.4`
  - `typedoc` (devDependency): `^0.28.3` -> `^0.28.4`
- **Logging**: Refactored logging behavior across `src/config/index.ts`, `src/index.ts`, `src/mcp-server/transports/stdioTransport.ts`, and `src/utils/internal/logger.ts` to make console output (warnings, info messages) conditional on `stdout` being a TTY. This prevents interference with the MCP protocol when running in `stdio` transport mode.
- **Build**: Bumped project version to `1.1.6` in `package.json` and `package-lock.json`.

## [1.1.5] - 2025-05-07

### Changed

- **Security**: Enhanced the `Sanitization` utility class (`src/utils/security/sanitization.ts`):
  - Improved JSDoc comments for all methods, providing more detailed explanations of functionality, parameters, and return values.
  - Refined the `sanitizePath` method for more robust and flexible path sanitization:
    - Added `PathSanitizeOptions` to control behavior like POSIX path conversion (`toPosix`), allowing/disallowing absolute paths (`allowAbsolute`), and restricting to a `rootDir`.
    - Returns a `SanitizedPathInfo` object containing the sanitized path, original input, and details about the sanitization process (e.g., if an absolute path was converted to relative).
    - Improved logic for handling root directory constraints and preventing path traversal.
  - Clarified options and behavior for `sanitizeString` and `sanitizeNumber` methods.
  - Ensured consistent error handling and logging within sanitization methods, providing more context on failures.
- **Build**: Bumped project version to `1.1.5` in `package.json`, `package-lock.json`, and `README.md`.

## [1.1.4] - 2025-05-02

### Changed

- **MCP Client**: Updated the entire client implementation (`src/mcp-client/`) to align with the **MCP 2025-03-26 specification**. This includes:
  - Correctly defining client identity and capabilities during initialization (`client.ts`).
  - Adding comprehensive JSDoc comments explaining MCP concepts and implementation details across all client files (`client.ts`, `configLoader.ts`, `transport.ts`, `index.ts`).
  - Resolving TypeScript errors related to SDK types and error codes.
  - Enhancing error handling and type safety in connection and transport logic.
  - Updating the example configuration (`mcp-config.json.example`) to include an HTTP transport example.
- **Documentation**: Updated `README.md` to reflect the client changes, add the MCP spec version badge, and refine descriptions. Updated `docs/tree.md`.

## [1.1.3] - 2025-05-02

### Added

- **HTTP Authentication**: Implemented mandatory JWT-based authentication for the HTTP transport (`src/mcp-server/transports/authentication/authMiddleware.ts`) as required by MCP security guidelines. Added `jsonwebtoken` dependency.
- **Configuration**: Added `MCP_AUTH_SECRET_KEY` environment variable for JWT signing/verification.

### Changed

- **Dependencies**: Updated `@modelcontextprotocol/sdk` to `^1.11.0`.
- **HTTP Transport**: Integrated authentication middleware, enhanced security headers (CSP, Referrer-Policy), and improved logging context/clarity.
- **Server Core**: Refined server initialization logging and error handling. Improved comments referencing MCP specifications.
- **Stdio Transport**: Improved logging context and added comments referencing MCP specifications and authentication guidelines.
- **Documentation**: Updated `README.md` with new version badges, authentication details, and configuration variable (`MCP_AUTH_SECRET_KEY`). Regenerated `docs/tree.md`.

## [1.1.2] - 2025-05-01

### Added

- **Utility Script**: Added `scripts/fetch-openapi-spec.ts`, a generic script to fetch OpenAPI specifications (YAML/JSON) from a URL with fallback logic, parse them, and save both YAML and JSON versions locally.
- **NPM Script**: Added `fetch-spec` script to `package.json` for running the new OpenAPI fetch script (`ts-node --esm scripts/fetch-openapi-spec.ts <url> <output-base-path>`).
- **Dependencies**: Added `axios`, `js-yaml`, and `@types/js-yaml` as dev dependencies required by the new fetch script.

## [1.1.1] - 2025-05-01

- **Configuration Refactoring**: Centralized the handling of environment variables (`MCP_TRANSPORT_TYPE`, `MCP_HTTP_PORT`, `MCP_HTTP_HOST`, `MCP_ALLOWED_ORIGINS`, `MCP_SERVER_NAME`, `MCP_SERVER_VERSION`, `MCP_LOG_LEVEL`, `NODE_ENV`) within `src/config/index.ts` using Zod for validation and defaulting.
- Updated `src/mcp-server/server.ts`, `src/mcp-server/transports/httpTransport.ts`, `src/index.ts`, and `src/utils/security/rateLimiter.ts` to consistently use the validated configuration object from `src/config/index.ts` instead of accessing `process.env` directly.
- Changed the default HTTP port (`MCP_HTTP_PORT`) from 3000 to 3010 in the configuration.

## [1.1.0] - 2025-05-01

This release focuses on integrating API documentation generation, enhancing the HTTP transport layer, and refining server initialization and logging.

- **API Documentation & Build**: Integrated TypeDoc for automated API documentation generation. Added `typedoc.json` configuration and a `docs:generate` script to `package.json`. Updated `.gitignore` to exclude the generated `docs/api/` directory and refreshed `README.md` and `docs/tree.md`. (Commit: `b1e5f4d` - approx, based on sequence)
- **MCP Types & Server Initialization**: Removed redundant local MCP type definitions (`src/types-global/mcp.ts`, `src/types-global/tool.ts`), relying on the SDK types. Refactored the main server entry point (`src/index.ts`) to initialize the logger _after_ configuration loading and used an async IIFE for startup. Improved JSDoc clarity in server, resource, and tool registration files. (Commit: `0459112`)
- **HTTP Transport & Logging Enhancements**:
  - Added stricter security headers (CSP, HSTS, Permissions-Policy) to HTTP responses.
  - Improved logging detail within the HTTP transport for origin checks, session handling, port checks, and request flow.
  - Made logger initialization asynchronous and added conditional console logging (active only when `MCP_LOG_LEVEL=debug` and stdout is a TTY).
  - Implemented a workaround for an SDK `isInitializeRequest` check issue in the HTTP transport.
  - Changed the default HTTP port from 3000 to 3010.
  - Enhanced port conflict detection with proactive checks before binding.
  - Cleaned up minor logging inconsistencies. (Commit: `76bf1b8`)

## [1.0.6] - 2025-04-29

### Added

- Zod dependency for enhanced schema validation (`e038177`).

### Changed

- **Project Alignment**: Updated core components to align with the **MCP Specification (2025-03-26)** and **TypeScript SDK (v1.10.2+)**. Key areas refactored include:
  - **Server**: Implemented Streamable HTTP transport (`b2b8665`).
  - **Client**: Enhanced capabilities handling, configuration loading (using Zod), and transport management (Stdio/HTTP) (`38f68b8`).
  - **Logging**: Aligned log levels with RFC 5424 standards and added notification support (`cad6f29`).
  - **Configuration**: Improved validation and aligned log level settings (`6c1e958`).
  - **Echo Example**: Updated Echo tool and resource implementations, including Base64 handling (`a7f385f`).
- **Server Refinement**: Enhanced `src/mcp-server/server.ts` with comprehensive JSDoc comments, improved logging messages, and refined HTTP transport logic including error handling and session management (`6c54d1e`).
- **Documentation**: Updated project documentation and internal cheatsheets (`de12abf`, `53c7c0d`).
