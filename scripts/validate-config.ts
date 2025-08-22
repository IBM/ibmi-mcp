#!/usr/bin/env node

/**
 * @fileoverview YAML Configuration Validation CLI Script
 *
 * This script provides comprehensive validation for YAML tool configurations using
 * the same Zod schemas and validation logic employed by the runtime system. It supports
 * validating individual files or entire directories of YAML configurations.
 *
 * Usage:
 *   npm run validate --tools file.yaml
 *   npm run validate --tools-dir tools/
 *
 * @module scripts/validate-config
 */

import { readdirSync, statSync } from "fs";
import { resolve, extname, relative } from "path";
import { parseArgs } from "util";
import { YamlParser } from "../src/utils/yaml/yamlParser.js";
import type { YamlParsingResult } from "../src/utils/yaml/types.js";
import { logger, type McpLogLevel } from "../src/utils/index.js";

interface ValidationReport {
  totalFiles: number;
  validFiles: number;
  invalidFiles: number;
  files: FileValidationResult[];
  summary: ValidationSummary;
}

interface FileValidationResult {
  filePath: string;
  relativePath: string;
  isValid: boolean;
  result: YamlParsingResult;
  processingTime: number;
}

interface ValidationSummary {
  totalSources: number;
  totalTools: number;
  totalToolsets: number;
  totalParameters: number;
  commonErrors: string[];
}

/**
 * CLI argument parser configuration
 */
const ARGS_CONFIG = {
  tools: {
    type: "string" as const,
    short: "t",
    description: "Path to a single YAML file to validate",
  },
  "tools-dir": {
    type: "string" as const,
    short: "d",
    description: "Path to a directory containing YAML files to validate",
  },
  verbose: {
    type: "boolean" as const,
    short: "v",
    default: false,
    description: "Enable verbose output with detailed validation results",
  },
  help: {
    type: "boolean" as const,
    short: "h",
    default: false,
    description: "Show this help message",
  },
} as const;

/**
 * Display usage information and help text
 */
function showHelp(): void {
  console.log(`
YAML Configuration Validation Tool

Usage:
  npm run validate -- --tools <file.yaml>       Validate a single YAML file
  npm run validate -- --tools-dir <directory>   Validate all YAML files in a directory

Options:
  -t, --tools <file>        Path to a single YAML file to validate
  -d, --tools-dir <dir>     Path to a directory containing YAML files
  -v, --verbose             Enable verbose output with detailed validation results  
  -h, --help                Show this help message

Examples:
  npm run validate -- --tools agents/configs/test.yaml
  npm run validate -- --tools-dir agents/configs/
  npm run validate -- --tools-dir prebuiltconfigs/ --verbose

Note: The "--" is required to separate npm arguments from script arguments.

The script uses the same validation logic as the runtime system, including:
- Zod schema validation for all configuration sections
- Cross-reference validation (tool sources, toolset references)  
- Parameter type validation
- Comprehensive error reporting
`);
}

/**
 * Parse command line arguments using Node.js built-in parseArgs
 */
function parseCliArgs(): {
  tools?: string;
  toolsDir?: string;
  verbose: boolean;
  help: boolean;
} {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: ARGS_CONFIG,
      allowPositionals: false,
    });

    return {
      tools: values.tools,
      toolsDir: values["tools-dir"],
      verbose: values.verbose || false,
      help: values.help || false,
    };
  } catch (error) {
    console.error(
      `❌ Invalid arguments: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    showHelp();
    process.exit(1);
  }
}

/**
 * Get all YAML files in a directory recursively
 */
function getYamlFilesInDirectory(dirPath: string): string[] {
  const yamlFiles: string[] = [];
  const resolvedDir = resolve(dirPath);

  function scanDirectory(currentDir: string): void {
    try {
      const entries = readdirSync(currentDir);

      for (const entry of entries) {
        const fullPath = resolve(currentDir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          scanDirectory(fullPath);
        } else if (
          stat.isFile() &&
          [".yaml", ".yml"].includes(extname(entry).toLowerCase())
        ) {
          yamlFiles.push(fullPath);
        }
      }
    } catch (error) {
      console.warn(
        `⚠️  Warning: Could not scan directory ${currentDir}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  scanDirectory(resolvedDir);
  return yamlFiles.sort();
}

/**
 * Validate a single YAML file and return detailed results
 */
async function validateSingleFile(
  filePath: string,
): Promise<FileValidationResult> {
  const startTime = process.hrtime.bigint();
  const absolutePath = resolve(filePath);
  const relativePath = relative(process.cwd(), absolutePath);

  try {
    const result = await YamlParser.parseYamlFile(absolutePath);
    const endTime = process.hrtime.bigint();
    const processingTime = Number(endTime - startTime) / 1_000_000; // Convert to milliseconds

    return {
      filePath: absolutePath,
      relativePath,
      isValid: result.success,
      result,
      processingTime,
    };
  } catch (error) {
    const endTime = process.hrtime.bigint();
    const processingTime = Number(endTime - startTime) / 1_000_000;

    // Create a failed result for unexpected errors
    const failedResult: YamlParsingResult = {
      success: false,
      errors: [
        error instanceof Error ? error.message : "Unknown validation error",
      ],
    };

    return {
      filePath: absolutePath,
      relativePath,
      isValid: false,
      result: failedResult,
      processingTime,
    };
  }
}

/**
 * Generate a comprehensive validation summary
 */
function generateValidationSummary(
  results: FileValidationResult[],
): ValidationSummary {
  let totalSources = 0;
  let totalTools = 0;
  let totalToolsets = 0;
  let totalParameters = 0;
  const errorMap: Record<string, number> = {};

  for (const result of results) {
    if (result.result.success && result.result.stats) {
      totalSources += result.result.stats.sourceCount;
      totalTools += result.result.stats.toolCount;
      totalToolsets += result.result.stats.toolsetCount;
      totalParameters += result.result.stats.totalParameterCount;
    }

    if (!result.result.success && result.result.errors) {
      for (const error of result.result.errors) {
        const normalizedError = error.split(":")[0].trim(); // Get error type
        errorMap[normalizedError] = (errorMap[normalizedError] || 0) + 1;
      }
    }
  }

  // Get most common errors (top 5)
  const commonErrors = Object.entries(errorMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([error, count]) => `${error} (${count} occurrences)`);

  return {
    totalSources,
    totalTools,
    totalToolsets,
    totalParameters,
    commonErrors,
  };
}

/**
 * Format and display validation results
 */
function displayResults(report: ValidationReport, verbose: boolean): void {
  const { totalFiles, validFiles, invalidFiles, files, summary } = report;

  // Header
  console.log("\n📋 YAML Configuration Validation Report");
  console.log("═".repeat(50));

  // Overall statistics
  const successRate =
    totalFiles > 0 ? ((validFiles / totalFiles) * 100).toFixed(1) : "0.0";
  console.log(`\n📊 Overall Results:`);
  console.log(`   Total files processed: ${totalFiles}`);
  console.log(`   ✅ Valid configurations: ${validFiles}`);
  console.log(`   ❌ Invalid configurations: ${invalidFiles}`);
  console.log(`   📈 Success rate: ${successRate}%`);

  // Configuration summary for valid files
  if (validFiles > 0) {
    console.log(`\n🔧 Configuration Summary:`);
    console.log(`   Total sources defined: ${summary.totalSources}`);
    console.log(`   Total tools defined: ${summary.totalTools}`);
    console.log(`   Total toolsets defined: ${summary.totalToolsets}`);
    console.log(`   Total parameters defined: ${summary.totalParameters}`);
  }

  // Common errors
  if (summary.commonErrors.length > 0) {
    console.log(`\n🚨 Most Common Errors:`);
    summary.commonErrors.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error}`);
    });
  }

  // Detailed file results
  console.log(`\n📄 File Validation Results:`);
  files.forEach((fileResult) => {
    const status = fileResult.isValid ? "✅" : "❌";
    const timeStr = fileResult.processingTime.toFixed(2);
    console.log(`   ${status} ${fileResult.relativePath} (${timeStr}ms)`);

    // Always show errors for invalid files
    if (!fileResult.result.success && fileResult.result.errors) {
      fileResult.result.errors.forEach((error) => {
        console.log(`      ❌ ${error}`);
      });
    }

    // Verbose mode shows detailed breakdown for all files
    if (verbose) {
      if (fileResult.result.success && fileResult.result.config) {
        const config = fileResult.result.config;
        const stats = fileResult.result.stats!;

        console.log(`      📊 Configuration Details:`);
        console.log(
          `         • Sources: ${stats.sourceCount}, Tools: ${stats.toolCount}, Toolsets: ${stats.toolsetCount}, Parameters: ${stats.totalParameterCount}`,
        );

        // Show source details
        if (config.sources && Object.keys(config.sources).length > 0) {
          console.log(`      🔗 Sources:`);
          Object.entries(config.sources).forEach(([name, source]) => {
            console.log(
              `         • ${name}: ${source.user}@${source.host}${source.port ? `:${source.port}` : ""}`,
            );
          });
        }

        // Show tool details
        if (config.tools && Object.keys(config.tools).length > 0) {
          console.log(`      🔧 Tools:`);
          Object.entries(config.tools).forEach(([name, tool]) => {
            const paramCount = tool.parameters?.length || 0;
            const hints: string[] = [];
            if (tool.readOnlyHint) hints.push("readonly");
            if (tool.destructiveHint) hints.push("destructive");
            if (tool.idempotentHint) hints.push("idempotent");
            if (tool.openWorldHint) hints.push("open-world");
            const hintsStr = hints.length > 0 ? ` [${hints.join(", ")}]` : "";

            console.log(
              `         • ${name}: ${paramCount} param${paramCount !== 1 ? "s" : ""}, source: ${tool.source}${hintsStr}`,
            );

            if (tool.parameters && tool.parameters.length > 0) {
              tool.parameters.forEach((param) => {
                const defaultStr =
                  param.default !== undefined ? ` = ${param.default}` : "";
                console.log(
                  `           - ${param.name}: ${param.type}${defaultStr}`,
                );
              });
            }

            if (tool.security) {
              const securityDetails: string[] = [];
              if (tool.security.readOnly) securityDetails.push("read-only");
              if (tool.security.maxQueryLength)
                securityDetails.push(
                  `max-length: ${tool.security.maxQueryLength}`,
                );
              if (tool.security.forbiddenKeywords?.length)
                securityDetails.push(
                  `forbidden-keywords: ${tool.security.forbiddenKeywords.length}`,
                );
              if (securityDetails.length > 0) {
                console.log(
                  `           🛡️  Security: ${securityDetails.join(", ")}`,
                );
              }
            }
          });
        }

        // Show toolset details
        if (config.toolsets && Object.keys(config.toolsets).length > 0) {
          console.log(`      📦 Toolsets:`);
          Object.entries(config.toolsets).forEach(([name, toolset]) => {
            console.log(`         • ${name}: ${toolset.tools.join(", ")}`);
            if (toolset.description) {
              console.log(`           "${toolset.description}"`);
            }
          });
        }
      } else if (fileResult.result.success && fileResult.result.stats) {
        // Fallback for files with stats but no config
        const stats = fileResult.result.stats;
        console.log(
          `      📊 Basic Stats: Sources: ${stats.sourceCount}, Tools: ${stats.toolCount}, Toolsets: ${stats.toolsetCount}, Parameters: ${stats.totalParameterCount}`,
        );
      }
    } else if (fileResult.result.success && fileResult.result.stats) {
      // Non-verbose mode shows basic stats for valid files
      const stats = fileResult.result.stats;
      console.log(
        `      📊 Sources: ${stats.sourceCount}, Tools: ${stats.toolCount}, Toolsets: ${stats.toolsetCount}, Parameters: ${stats.totalParameterCount}`,
      );
    }
  });

  // Footer with recommendations
  console.log("\n💡 Recommendations:");
  if (invalidFiles > 0) {
    console.log(
      "   • Fix validation errors in invalid files before deployment",
    );
    console.log("   • Use --verbose flag for detailed error information");
  }
  if (validFiles > 0) {
    console.log("   • Valid configurations are ready for use");
  }
  console.log(
    "   • Run this script regularly during development to catch issues early",
  );
  console.log("═".repeat(50));
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  // Initialize logger early to suppress "Logger not initialized" warnings
  // Use 'error' level to minimize output during validation
  try {
    await logger.initialize("error" as McpLogLevel);
  } catch (_error) {
    // Ignore logger initialization errors for validation script
  }

  const args = parseCliArgs();

  if (args.help) {
    showHelp();
    return;
  }

  if (!args.tools && !args.toolsDir) {
    console.error("❌ Error: You must specify either --tools or --tools-dir");
    showHelp();
    process.exit(1);
  }

  if (args.tools && args.toolsDir) {
    console.error(
      "❌ Error: Cannot specify both --tools and --tools-dir at the same time",
    );
    process.exit(1);
  }

  console.log("🔍 Starting YAML configuration validation...\n");

  try {
    let filesToValidate: string[] = [];

    if (args.tools) {
      const resolvedPath = resolve(args.tools);
      filesToValidate = [resolvedPath];
      console.log(
        `📁 Validating single file: ${relative(process.cwd(), resolvedPath)}`,
      );
    } else if (args.toolsDir) {
      const resolvedDir = resolve(args.toolsDir);
      filesToValidate = getYamlFilesInDirectory(resolvedDir);
      console.log(
        `📁 Validating directory: ${relative(process.cwd(), resolvedDir)}`,
      );
      console.log(`📄 Found ${filesToValidate.length} YAML file(s)`);
    }

    if (filesToValidate.length === 0) {
      console.log("ℹ️  No YAML files found to validate");
      return;
    }

    // Validate all files
    const validationPromises = filesToValidate.map((file) =>
      validateSingleFile(file),
    );
    const results = await Promise.all(validationPromises);

    // Generate report
    const report: ValidationReport = {
      totalFiles: results.length,
      validFiles: results.filter((r) => r.isValid).length,
      invalidFiles: results.filter((r) => !r.isValid).length,
      files: results,
      summary: generateValidationSummary(results),
    };

    // Display results
    displayResults(report, args.verbose);

    // Set appropriate exit code
    const exitCode = report.invalidFiles > 0 ? 1 : 0;
    process.exit(exitCode);
  } catch (error) {
    console.error(
      `❌ Validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    process.exit(1);
  }
}

// Execute main function
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(
      `❌ Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    process.exit(1);
  });
}
