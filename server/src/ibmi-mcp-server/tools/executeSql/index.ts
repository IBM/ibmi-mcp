/**
 * @fileoverview Barrel file for the execute SQL tool
 * This module exports the registration function and configuration utilities
 * for the dynamic SQL execution tool.
 *
 * @module src/mcp-server/tools/executeSql/index
 */

export {
  registerExecuteSqlTool,
  setExecuteSqlConfig,
  getExecuteSqlConfig,
  isExecuteSqlEnabled,
  type ExecuteSqlToolConfig,
} from "./registration.js";
