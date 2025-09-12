/**
 * @fileoverview SQL Security Validator for validating SQL queries against security policies
 * Provides both AST-based and regex-based validation with comprehensive security checks
 *
 * @module src/utils/security/sqlSecurityValidator
 */

import pkg from "node-sql-parser";
const { Parser } = pkg;
import { logger } from "@/utils/internal/logger.js";
import { RequestContext } from "@/utils/internal/requestContext.js";
import { JsonRpcErrorCode, McpError } from "@/types-global/errors.js";
import { YamlToolSecurityConfig } from "../yaml/types.js";

/**
 * Security validation result
 */
export interface SecurityValidationResult {
  /** Whether the validation passed */
  isValid: boolean;
  /** List of security violations found */
  violations: string[];
  /** Validation method used */
  validationMethod: "ast" | "regex" | "combined";
}

/**
 * Dangerous SQL operations that should be blocked in read-only mode
 */
export const DANGEROUS_OPERATIONS = [
  // Data manipulation
  "INSERT",
  "UPDATE",
  "DELETE",
  "REPLACE",
  "MERGE",
  "TRUNCATE",
  // Schema operations
  "DROP",
  "CREATE",
  "ALTER",
  "RENAME",
  // System operations
  "CALL",
  "EXEC",
  "EXECUTE",
  "SET",
  "DECLARE",
  // Security operations
  "GRANT",
  "REVOKE",
  "DENY",
  // Data transfer
  "LOAD",
  "IMPORT",
  "EXPORT",
  "BULK",
  // System control
  "SHUTDOWN",
  "RESTART",
  "KILL",
  "STOP",
  "START",
  // Backup/restore
  "BACKUP",
  "RESTORE",
  "DUMP",
  // Locking
  "LOCK",
  "UNLOCK",
  // Transaction control (in some contexts dangerous)
  "COMMIT",
  "ROLLBACK",
  "SAVEPOINT",
  // IBM i specific
  "QCMDEXC",
  "SQL_EXECUTE_IMMEDIATE",
] as const;

/**
 * Dangerous SQL functions that should be monitored/blocked
 */
export const DANGEROUS_FUNCTIONS = [
  "SYSTEM",
  "QCMDEXC",
  "SQL_EXECUTE_IMMEDIATE",
  "SQLCMD",
  "LOAD_EXTENSION",
  "EXEC",
  "EXECUTE_IMMEDIATE",
  "EVAL",
  "CONCAT",
  "CHAR",
  "VARCHAR", // Can be used for dynamic SQL construction
] as const;

/**
 * Dangerous SQL patterns that should be detected
 */
export const DANGEROUS_PATTERNS = [
  // Dynamic SQL patterns
  /\bCONCAT\s*\(/i,
  /\b(CHAR|VARCHAR|CLOB)\s*\(/i,
  // System function patterns
  /\bSYSTEM\s*\(/i,
  /\bLOAD_EXTENSION\s*\(/i,
  /\bQCMDEXC\s*\(/i,
  // Comment-based bypass attempts
  /\/\*.*?(DROP|DELETE|INSERT|UPDATE).*?\*\//i,
  // Multiple statement patterns
  /;\s*(DROP|DELETE|INSERT|UPDATE|CREATE|ALTER)/i,
  // Union-based attacks
  /\bUNION\s+(ALL\s+)?\s*\(\s*(DROP|DELETE|INSERT|UPDATE)/i,
] as const;

/**
 * SQL Security Validator class for comprehensive SQL security validation
 */
export class SqlSecurityValidator {
  private static parser = new Parser();

  /**
   * Validate SQL query against security configuration
   * @param query - SQL query to validate
   * @param securityConfig - Security configuration
   * @param context - Request context for logging
   * @throws {McpError} If validation fails
   */
  static validateQuery(
    query: string,
    securityConfig: YamlToolSecurityConfig,
    context: RequestContext,
  ): void {
    logger.debug(
      {
        ...context,
        queryLength: query.length,
        readOnly: securityConfig.readOnly,
        maxQueryLength: securityConfig.maxQueryLength,
      },
      "Starting SQL security validation",
    );

    // 1. Check query length limit
    this.validateQueryLength(query, securityConfig);

    // 2. Always validate forbidden keywords (regardless of read-only setting)
    this.validateForbiddenKeywords(query, securityConfig, context);

    // 3. If in read-only mode, perform comprehensive write operation validation
    if (securityConfig.readOnly !== false) {
      this.validateReadOnlyRestrictions(query, context);
    }

    logger.debug(
      {
        ...context,
      },
      "SQL security validation passed",
    );
  }

  /**
   * Validate query length against configured limits
   * @param query - SQL query to validate
   * @param securityConfig - Security configuration
   * @private
   */
  private static validateQueryLength(
    query: string,
    securityConfig: YamlToolSecurityConfig,
  ): void {
    const maxLength = securityConfig.maxQueryLength ?? 10000;
    if (query.length > maxLength) {
      throw new McpError(
        JsonRpcErrorCode.ValidationError,
        `Query exceeds maximum length of ${maxLength} characters`,
        {
          queryLength: query.length,
          maxLength,
          query: query.substring(0, 100) + (query.length > 100 ? "..." : ""),
        },
      );
    }
  }

  /**
   * Validate forbidden keywords using both AST and regex approaches
   * @param query - SQL query to validate
   * @param securityConfig - Security configuration
   * @param context - Request context for logging
   * @private
   */
  private static validateForbiddenKeywords(
    query: string,
    securityConfig: YamlToolSecurityConfig,
    context: RequestContext,
  ): void {
    if (
      !securityConfig.forbiddenKeywords ||
      securityConfig.forbiddenKeywords.length === 0
    ) {
      return;
    }

    // Try AST-based validation first
    const astResult = this.validateForbiddenKeywordsAST(
      query,
      securityConfig.forbiddenKeywords,
      context,
    );
    if (!astResult.isValid) {
      throw new McpError(
        JsonRpcErrorCode.ValidationError,
        `Forbidden keywords detected: ${astResult.violations.join(", ")}`,
        {
          violations: astResult.violations,
          forbiddenKeywords: securityConfig.forbiddenKeywords,
          query: query.substring(0, 100) + (query.length > 100 ? "..." : ""),
        },
      );
    }

    // Fallback to regex validation
    const regexResult = this.validateForbiddenKeywordsRegex(
      query,
      securityConfig.forbiddenKeywords,
    );
    if (!regexResult.isValid) {
      throw new McpError(
        JsonRpcErrorCode.ValidationError,
        `Forbidden keywords detected: ${regexResult.violations.join(", ")}`,
        {
          violations: regexResult.violations,
          forbiddenKeywords: securityConfig.forbiddenKeywords,
          query: query.substring(0, 100) + (query.length > 100 ? "..." : ""),
        },
      );
    }
  }

  /**
   * Validate read-only restrictions using comprehensive validation
   * @param query - SQL query to validate
   * @param context - Request context for logging
   * @private
   */
  private static validateReadOnlyRestrictions(
    query: string,
    context: RequestContext,
  ): void {
    // Try AST-based validation first (more reliable)
    const astResult = this.validateQueryAST(query, context);
    if (!astResult.isValid) {
      throw new McpError(
        JsonRpcErrorCode.ValidationError,
        `Write operations detected: ${astResult.violations.join(", ")}`,
        {
          violations: astResult.violations,
          readOnly: true,
          query: query.substring(0, 100) + (query.length > 100 ? "..." : ""),
        },
      );
    }

    // Fallback to regex validation for additional coverage
    const regexResult = this.validateQueryRegex(query, context);
    if (!regexResult.isValid) {
      throw new McpError(
        JsonRpcErrorCode.ValidationError,
        `Write operations detected: ${regexResult.violations.join(", ")}`,
        {
          violations: regexResult.violations,
          readOnly: true,
          query: query.substring(0, 100) + (query.length > 100 ? "..." : ""),
        },
      );
    }
  }

  /**
   * Validate SQL query using AST parsing
   * @param query - SQL query to validate
   * @param context - Request context for logging
   * @private
   */
  private static validateQueryAST(
    query: string,
    context: RequestContext,
  ): SecurityValidationResult {
    const violations: string[] = [];

    try {
      const ast = this.parser.astify(query, { database: "mysql" });

      logger.debug(
        {
          ...context,
          astType: Array.isArray(ast) ? "multiple" : "single",
          statementCount: Array.isArray(ast) ? ast.length : 1,
        },
        "SQL AST parsed successfully",
      );

      const statements = Array.isArray(ast) ? ast : [ast];

      for (const statement of statements) {
        if (!statement || typeof statement !== "object") continue;

        const objStmt = statement as unknown as Record<string, unknown>;
        const stmtType = String(objStmt.type || "").toUpperCase();

        // 1. Check top-level statement type
        if (
          stmtType &&
          (DANGEROUS_OPERATIONS as readonly string[]).includes(stmtType)
        ) {
          violations.push(`Dangerous statement type: ${stmtType}`);
        }

        // 2. Check for dangerous functions anywhere in the AST
        const dangerousFunctions = this.findDangerousFunctionsInAST(statement);
        if (dangerousFunctions.length > 0) {
          violations.push(
            ...dangerousFunctions.map(
              (f: string) => `Dangerous function: ${f}`,
            ),
          );
        }

        // 3. Check for UNION-based attacks
        if (this.hasUnionWithDangerousStatements(statement)) {
          violations.push("UNION with dangerous statements detected");
        }
      }

      return {
        isValid: violations.length === 0,
        violations,
        validationMethod: "ast",
      };
    } catch (parseError) {
      logger.warning(
        {
          ...context,
          error:
            parseError instanceof Error
              ? parseError.message
              : String(parseError),
          queryLength: query.length,
        },
        "SQL AST parsing failed, will use regex validation only",
      );

      return {
        isValid: true, // Let regex validation handle it
        violations: [],
        validationMethod: "ast",
      };
    }
  }

  /**
   * Validate SQL query using regex patterns
   * @param query - SQL query to validate
   * @param _context - Request context for logging (unused but kept for consistency)
   * @private
   */
  private static validateQueryRegex(
    query: string,
    _context: RequestContext,
  ): SecurityValidationResult {
    const violations: string[] = [];

    // Check for dangerous operations
    for (const operation of DANGEROUS_OPERATIONS) {
      const pattern = new RegExp(`\\b${operation}\\b`, "i");
      if (pattern.test(query)) {
        violations.push(`Write operation '${operation}' detected`);
      }
    }

    // Check for dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(query)) {
        violations.push(`Dangerous pattern detected: ${pattern.source}`);
      }
    }

    // Check for suspicious function calls
    for (const func of DANGEROUS_FUNCTIONS) {
      const pattern = new RegExp(`\\b${func}\\s*\\(`, "i");
      if (pattern.test(query)) {
        violations.push(`Suspicious function '${func}' detected`);
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
      validationMethod: "regex",
    };
  }

  /**
   * Validate forbidden keywords using AST parsing
   * @param query - SQL query to validate
   * @param forbiddenKeywords - List of forbidden keywords
   * @param context - Request context for logging
   * @private
   */
  private static validateForbiddenKeywordsAST(
    query: string,
    forbiddenKeywords: string[],
    context: RequestContext,
  ): SecurityValidationResult {
    const violations: string[] = [];

    try {
      const ast = this.parser.astify(query, { database: "mysql" });
      const statements = Array.isArray(ast) ? ast : [ast];

      for (const statement of statements) {
        const foundKeywords = this.findForbiddenKeywordsInAST(
          statement,
          forbiddenKeywords,
        );
        violations.push(...foundKeywords.map((k) => `Forbidden keyword: ${k}`));
      }
    } catch (parseError) {
      logger.debug(
        {
          ...context,
          error:
            parseError instanceof Error
              ? parseError.message
              : String(parseError),
        },
        "AST parsing failed for forbidden keyword validation",
      );
    }

    return {
      isValid: violations.length === 0,
      violations,
      validationMethod: "ast",
    };
  }

  /**
   * Validate forbidden keywords using regex patterns
   * @param query - SQL query to validate
   * @param forbiddenKeywords - List of forbidden keywords
   * @private
   */
  private static validateForbiddenKeywordsRegex(
    query: string,
    forbiddenKeywords: string[],
  ): SecurityValidationResult {
    const violations: string[] = [];

    for (const keyword of forbiddenKeywords) {
      const pattern = new RegExp(
        `\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i",
      );
      if (pattern.test(query)) {
        violations.push(`Forbidden keyword: ${keyword}`);
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
      validationMethod: "regex",
    };
  }

  /**
   * Find dangerous functions anywhere in the AST
   * @param node - AST node to analyze
   * @private
   */
  private static findDangerousFunctionsInAST(node: unknown): string[] {
    const violations: string[] = [];

    if (!node || typeof node !== "object") return violations;

    const objNode = node as Record<string, unknown>;

    // Check if this node is a function call
    if (objNode.type === "function" && objNode.name) {
      const funcName = String(objNode.name).toUpperCase();

      if ((DANGEROUS_FUNCTIONS as readonly string[]).includes(funcName)) {
        violations.push(funcName);
      }
    }

    // Recursively check all properties
    for (const key in objNode) {
      const value = objNode[key];
      if (Array.isArray(value)) {
        value.forEach((item) =>
          violations.push(...this.findDangerousFunctionsInAST(item)),
        );
      } else if (typeof value === "object") {
        violations.push(...this.findDangerousFunctionsInAST(value));
      }
    }

    return violations;
  }

  /**
   * Find forbidden keywords anywhere in the AST
   * @param node - AST node to analyze
   * @param forbiddenKeywords - List of forbidden keywords
   * @private
   */
  private static findForbiddenKeywordsInAST(
    node: unknown,
    forbiddenKeywords: string[],
  ): string[] {
    const violations: string[] = [];

    if (!node || typeof node !== "object") return violations;

    const objNode = node as Record<string, unknown>;

    // Check string values for forbidden keywords
    for (const key in objNode) {
      const value = objNode[key];
      if (typeof value === "string") {
        for (const keyword of forbiddenKeywords) {
          const pattern = new RegExp(
            `\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
            "i",
          );
          if (pattern.test(value)) {
            violations.push(keyword);
          }
        }
      } else if (Array.isArray(value)) {
        value.forEach((item) =>
          violations.push(
            ...this.findForbiddenKeywordsInAST(item, forbiddenKeywords),
          ),
        );
      } else if (typeof value === "object") {
        violations.push(
          ...this.findForbiddenKeywordsInAST(value, forbiddenKeywords),
        );
      }
    }

    return violations;
  }

  /**
   * Check for UNION with dangerous statements
   * @param statement - AST statement to check
   * @private
   */
  private static hasUnionWithDangerousStatements(statement: unknown): boolean {
    if (!statement || typeof statement !== "object") return false;

    const stmt = statement as Record<string, unknown>;

    // Check if this is a UNION statement
    if (stmt.type === "select" && stmt.union) {
      // Check each part of the union
      const unionParts = Array.isArray(stmt.union) ? stmt.union : [stmt.union];
      for (const part of unionParts) {
        const partObj = part as Record<string, unknown>;
        if (partObj.type && String(partObj.type).toUpperCase() !== "SELECT") {
          return true;
        }
      }
    }

    return false;
  }
}
