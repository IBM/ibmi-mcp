/**
 * @fileoverview YAML-based SQL tools type definitions
 * Defines interfaces for YAML configuration of SQL tools, sources, and toolsets
 *
 * @module src/types-global/yaml-tools
 */

/**
 * Database source configuration for YAML tools
 * Supports IBM i DB2 connections with optional SSL configuration
 */
export interface YamlSource {
  /** Database host address */
  host: string;
  /** Database user name */
  user: string;
  /** Database password */
  password: string;
  /** Database port (default: 8471 for IBM i) */
  port?: number;
  /** Whether to ignore unauthorized SSL certificates */
  "ignore-unauthorized"?: boolean;
}

/**
 * Parameter definition for YAML tools (secure parameter binding)
 * Supports enhanced parameter types with validation for :param and ? placeholders
 */
export interface YamlToolParameter {
  /** Parameter name */
  name: string;
  /** Parameter type */
  type: "string" | "number" | "boolean" | "integer" | "float" | "array";
  /** Parameter description */
  description?: string;
  /** Default value for the parameter */
  default?: string | number | boolean | unknown[];
  /** Whether parameter is required (overrides default) */
  required?: boolean;
  /** Array item type (only for array parameters) */
  itemType?: "string" | "number" | "boolean" | "integer" | "float";
  /** Minimum value (for numeric types) */
  min?: number;
  /** Maximum value (for numeric types) */
  max?: number;
  /** Minimum length (for string/array types) */
  minLength?: number;
  /** Maximum length (for string/array types) */
  maxLength?: number;
  /** Valid values (enum validation) */
  enum?: (string | number | boolean)[];
  /** Custom validation pattern (regex for strings) */
  pattern?: string;
}

/**
 * Individual tool definition in YAML configuration
 * Defines a single executable SQL tool with metadata
 */
export interface YamlTool {
  /** Source name to connect to (references YamlSource key) */
  source: string;
  /** Tool description */
  description: string;
  /** SQL statement with parameter placeholders (:param or ?) */
  statement: string;
  /** Parameter definitions for secure binding (:param and ? placeholders) */
  parameters?: YamlToolParameter[];
  /** Optional domain categorization */
  domain?: string;
  /** Optional category within domain */
  category?: string;
  /** Optional tool-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Toolset definition - groups of related tools
 * Replaces the existing suite system
 */
export interface YamlToolset {
  /** Human-readable toolset title */
  title?: string;
  /** Toolset description */
  description?: string;
  /** List of tool names in this toolset */
  tools: string[];
  /** Optional toolset metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Root YAML configuration structure
 * Contains all sources, tools, and toolsets
 */
export interface YamlToolsConfig {
  /** Database sources configuration */
  sources?: Record<string, YamlSource>;
  /** Tool definitions */
  tools?: Record<string, YamlTool>;
  /** Toolset definitions */
  toolsets?: Record<string, YamlToolset>;
  /** Optional global metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Processed tool information after YAML parsing
 * Includes resolved source and generated metadata
 */
export interface ProcessedYamlTool {
  /** Tool name */
  name: string;
  /** Tool configuration from YAML */
  config: YamlTool;
  /** Resolved source configuration */
  source: YamlSource;
  /** Toolsets this tool belongs to */
  toolsets: string[];
  /** Generated tool metadata compatible with existing system */
  metadata: {
    name: string;
    description: string;
    domain?: string;
    category?: string;
    toolsets: string[];
  };
}

/**
 * YAML parsing result with validation information
 */
export interface YamlParsingResult {
  /** Whether parsing was successful */
  success: boolean;
  /** Parsed configuration (if successful) */
  config?: YamlToolsConfig;
  /** Validation errors (if unsuccessful) */
  errors?: string[];
  /** Processed tools ready for registration */
  processedTools?: ProcessedYamlTool[];
  /** Statistics about the parsed configuration */
  stats?: {
    sourceCount: number;
    toolCount: number;
    toolsetCount: number;
    totalParameterCount: number;
  };
}

/**
 * Runtime tool execution context
 * Passed to tool execution functions
 */
export interface YamlToolExecutionContext {
  /** Tool name */
  toolName: string;
  /** Source name */
  sourceName: string;
  /** Bound parameters */
  parameters: Record<string, unknown>;
  /** Request context for logging */
  requestContext: import("../utils/internal/requestContext.js").RequestContext;
}

/**
 * Tool execution result structure
 */
export interface YamlToolExecutionResult<T = unknown> {
  /** Whether execution was successful */
  success: boolean;
  /** Query result data */
  data?: T[];
  /** Error message (if unsuccessful) */
  error?: string;
  /** Execution metadata */
  metadata?: {
    executionTime: number;
    rowCount: number;
    affectedRows?: number;
    /** Parameter processing mode used */
    parameterMode?: string;
    /** Number of parameters processed */
    parameterCount?: number;
  };
}
