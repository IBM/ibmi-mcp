#!/usr/bin/env node

/**
 * Generate Tree Script
 * ===================
 *
 * Description:
 *   A utility script that generates a visual tree representation of your project's directory structure.
 *   The script respects .gitignore patterns and applies common exclusions like node_modules.
 *   The tree is saved as a markdown file by default in the docs directory.
 *
 * Usage:
 *   - Add to package.json: "tree": "ts-node --esm scripts/tree.ts"
 *   - Run directly: npm run tree
 *   - Specify custom output path: ts-node --esm scripts/tree.ts ./documentation/structure.md
 *   - Specify max depth: ts-node --esm scripts/tree.ts --depth=3
 *   - Get help: ts-node --esm scripts/tree.ts --help
 *
 * Features:
 *   - Automatically excludes directories listed in .gitignore
 *   - Handles directory sorting (folders first)
 *   - Supports custom output path
 *   - Works on all platforms
 *   - Can limit directory depth
 */

import fs from "fs/promises";
import path from "path";

// Define the project root directory robustly
const projectRoot = process.cwd();

// Process command line arguments
const args = process.argv.slice(2);
let outputPath = "docs/tree.md"; // Default output path relative to project root
let maxDepth = Infinity;

/**
 * Interface for gitignore pattern
 */
interface GitignorePattern {
  pattern: string;
  negated: boolean;
  regex: string;
}

// Handle command line options
if (args.includes("--help")) {
  console.log(`
Generate Tree - Project directory structure visualization tool

Usage:
  ts-node --esm scripts/tree.ts [output-path] [--depth=<number>] [--help]

Options:
  output-path      Custom file path for the tree output (relative to project root, default: docs/tree.md)
  --depth=<number> Maximum directory depth to display (default: unlimited)
  --help           Show this help message
`);
  process.exit(0);
}

// Default patterns to always ignore
const DEFAULT_IGNORE_PATTERNS: string[] = [
  ".git",
  "node_modules",
  ".DS_Store",
  "dist",
  "build",
];

/**
 * Loads patterns from the .gitignore file
 */
async function loadGitignorePatterns(): Promise<GitignorePattern[]> {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  try {
    // Security: Ensure we read only from within the project root
    if (!path.resolve(gitignorePath).startsWith(projectRoot + path.sep)) {
      console.warn(
        "Attempted to read .gitignore outside project root. Using default patterns only.",
      );
      return [];
    }
    const gitignoreContent = await fs.readFile(gitignorePath, "utf-8");
    return (
      gitignoreContent
        .split("\n")
        .map((line) => line.trim())
        // Remove comments, empty lines, and lines with just whitespace
        .filter((line) => line && !line.startsWith("#") && line.trim() !== "")
        // Process each pattern
        .map((pattern) => ({
          pattern: pattern.startsWith("!") ? pattern.slice(1) : pattern,
          negated: pattern.startsWith("!"),
          // Convert glob patterns to regex-compatible strings (simplified approach)
          regex: pattern
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // Escape regex special chars first
            .replace(/\\\*/g, ".*") // Convert \* to .*
            .replace(/\\\?/g, ".") // Convert \? to .
            .replace(/\/$/, "(/.*)?"), // Handle directory indicators
        }))
    );
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.warn(
        "No .gitignore file found at project root, using default patterns only",
      );
    } else {
      console.error(`Error reading .gitignore: ${error.message}`);
    }
    return [];
  }
}

/**
 * Checks if a path should be ignored based on patterns
 */
function isIgnored(
  entryPath: string,
  ignorePatterns: GitignorePattern[],
): boolean {
  const relativePath = path.relative(projectRoot, entryPath); // Use relative path for matching

  // Always check default patterns first using relative path
  if (
    DEFAULT_IGNORE_PATTERNS.some((pattern) => relativePath.startsWith(pattern))
  ) {
    return true;
  }

  let ignored = false;
  for (const { pattern, negated, regex } of ignorePatterns) {
    // Match against the relative path
    const regexPattern = new RegExp(`^${regex}$|^${regex}/`); // Match full path or directory start

    if (regexPattern.test(relativePath)) {
      ignored = !negated;
    }
  }

  return ignored;
}

/**
 * Generates a tree representation of the directory structure
 */
async function generateTree(
  dir: string,
  ignorePatterns: GitignorePattern[],
  prefix = "",
  isLast = true,
  currentDepth = 0,
): Promise<string> {
  // Security Check: Ensure the directory being read is within the project root
  const resolvedDir = path.resolve(dir);
  if (
    !resolvedDir.startsWith(projectRoot + path.sep) &&
    resolvedDir !== projectRoot
  ) {
    console.warn(`Skipping directory outside project root: ${resolvedDir}`);
    return ""; // Prevent traversal outside root
  }

  let entries;
  try {
    entries = await fs.readdir(resolvedDir, { withFileTypes: true }); // Use resolvedDir
  } catch (error: any) {
    console.error(`Error reading directory ${resolvedDir}: ${error.message}`);
    return ""; // Stop processing this branch on error
  }

  let output = "";

  // Filter and sort entries
  const filteredEntries = entries
    .filter((entry) => {
      const entryAbsolutePath = path.join(resolvedDir, entry.name); // Use absolute path for ignore check
      return !isIgnored(entryAbsolutePath, ignorePatterns);
    })
    .sort((a, b) => {
      // Directories first, then files
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  for (let i = 0; i < filteredEntries.length; i++) {
    const entry = filteredEntries[i];
    const isLastEntry = i === filteredEntries.length - 1;
    const newPrefix = prefix + (isLast ? "    " : "│   ");

    output += prefix + (isLastEntry ? "└── " : "├── ") + entry.name + "\n";

    // Only traverse deeper if we haven't reached maxDepth
    if (entry.isDirectory() && currentDepth < maxDepth) {
      output += await generateTree(
        path.join(resolvedDir, entry.name), // Pass resolved path for next level
        ignorePatterns,
        newPrefix,
        isLastEntry,
        currentDepth + 1,
      );
    }
  }

  return output;
}

// Process command line arguments for custom configurations
for (const arg of args) {
  if (arg.startsWith("--depth=")) {
    const depthValue = arg.split("=")[1];
    const parsedDepth = parseInt(depthValue, 10);

    if (isNaN(parsedDepth) || parsedDepth < 1) {
      console.error("Invalid depth value. Using unlimited depth.");
      maxDepth = Infinity;
    } else {
      maxDepth = parsedDepth;
    }
  } else if (!arg.startsWith("--")) {
    // If it's not an option flag, assume it's the output path
    outputPath = arg;
  }
}

/**
 * Main function to write the tree to a file
 */
const writeTree = async (): Promise<void> => {
  try {
    const projectName = path.basename(projectRoot);
    const ignorePatterns = await loadGitignorePatterns();

    // --- Security Validation for Output Path ---
    const resolvedOutputFile = path.resolve(projectRoot, outputPath);
    if (!resolvedOutputFile.startsWith(projectRoot + path.sep)) {
      console.error(
        `Error: Output path "${outputPath}" resolves outside the project directory: ${resolvedOutputFile}`,
      );
      process.exit(1);
    }
    const resolvedOutputDir = path.dirname(resolvedOutputFile);
    // Double-check directory path as well
    if (
      !resolvedOutputDir.startsWith(projectRoot + path.sep) &&
      resolvedOutputDir !== projectRoot
    ) {
      console.error(
        `Error: Output directory "${resolvedOutputDir}" is outside the project directory.`,
      );
      process.exit(1);
    }
    // --- End Security Validation ---

    console.log(`Generating directory tree for: ${projectName}`);
    console.log(`Output path: ${resolvedOutputFile}`); // Log resolved path
    if (maxDepth !== Infinity) {
      console.log(`Maximum depth: ${maxDepth}`);
    }

    // Generate the tree structure starting from the project root
    const treeContent = await generateTree(
      projectRoot,
      ignorePatterns,
      "",
      true,
      0,
    );

    // Ensure output directory exists (use validated path)
    try {
      await fs.access(resolvedOutputDir); // Use validated resolvedOutputDir
    } catch {
      console.log(`Creating directory: ${resolvedOutputDir}`);
      try {
        await fs.mkdir(resolvedOutputDir, { recursive: true }); // Use validated resolvedOutputDir
      } catch (mkdirError: any) {
        console.error(
          `Error creating directory ${resolvedOutputDir}: ${mkdirError.message}`,
        );
        process.exit(1);
      }
    }

    // Write tree to file (use validated path)
    const timestamp = new Date()
      .toISOString()
      .replace(/T/, " ")
      .replace(/\..+/, "");

    const content = `# ${projectName} - Directory Structure

Generated on: ${timestamp}

${maxDepth !== Infinity ? `_Depth limited to ${maxDepth} levels_\n\n` : ""}
\`\`\`
${projectName}
${treeContent}
\`\`\`

_Note: This tree excludes files and directories matched by .gitignore and common patterns like node_modules._
`;

    try {
      await fs.writeFile(
        resolvedOutputFile, // Use validated resolvedOutputFile
        content,
      );
    } catch (writeFileError: any) {
      console.error(
        `Error writing to file ${resolvedOutputFile}: ${writeFileError.message}`,
      );
      process.exit(1);
    }

    console.log(
      `✓ Successfully generated tree structure in ${resolvedOutputFile}`,
    );
  } catch (error) {
    console.error(
      `× Error generating tree: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }
};

// Execute the write tree function
writeTree();
