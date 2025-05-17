#!/usr/bin/env node

/**
 * @fileoverview Generates a visual tree representation of the project's directory structure.
 * @module scripts/tree
 *   Respects .gitignore patterns and common exclusions (e.g., node_modules).
 *   Saves the tree to a markdown file (default: docs/tree.md).
 *   Supports custom output path and depth limitation.
 *   Ensures all file operations are within the project root for security.
 *
 * @example
 * // Generate tree with default settings:
 * // npm run tree
 *
 * @example
 * // Specify custom output path and depth:
 * // ts-node --esm scripts/tree.ts ./documentation/structure.md --depth=3
 */

import fs from "fs/promises";
import path from "path";

const projectRoot = process.cwd();
let outputPathArg = "docs/tree.md"; // Default output path
let maxDepthArg = Infinity;

/**
 * Represents a processed .gitignore pattern.
 * @property pattern - The original glob pattern (without negation prefix).
 * @property negated - True if the original pattern was negated (e.g., !pattern).
 * @property regex - A string representation of the regex derived from the glob pattern.
 */
interface GitignorePattern {
  pattern: string;
  negated: boolean;
  regex: string;
}

const args = process.argv.slice(2);
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

args.forEach((arg) => {
  if (arg.startsWith("--depth=")) {
    const depthValue = parseInt(arg.split("=")[1], 10);
    if (!isNaN(depthValue) && depthValue >= 0) {
      maxDepthArg = depthValue;
    } else {
      console.warn(`Invalid depth value: "${arg}". Using unlimited depth.`);
    }
  } else if (!arg.startsWith("--")) {
    outputPathArg = arg;
  }
});

const DEFAULT_IGNORE_PATTERNS: string[] = [
  ".git",
  "node_modules",
  ".DS_Store",
  "dist",
  "build",
  "logs", // Added logs as a common default ignore
];

/**
 * Loads and parses patterns from the .gitignore file at the project root.
 * @returns A promise resolving to an array of GitignorePattern objects.
 */
async function loadGitignorePatterns(): Promise<GitignorePattern[]> {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  try {
    // Security: Ensure we read only from within the project root
    if (!path.resolve(gitignorePath).startsWith(projectRoot + path.sep)) {
      console.warn(
        "Warning: Attempted to read .gitignore outside project root. Using default ignore patterns only.",
      );
      return [];
    }
    const gitignoreContent = await fs.readFile(gitignorePath, "utf-8");
    return gitignoreContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((patternLine) => {
        const negated = patternLine.startsWith("!");
        const pattern = negated ? patternLine.slice(1) : patternLine;
        // Simplified glob to regex conversion. For full gitignore spec, a library might be better.
        // This handles basic wildcards '*' and directory indicators '/'.
        const regexString = pattern
          .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape standard regex special chars
          .replace(/\*\*/g, ".*") // Handle '**' as 'match anything including slashes'
          .replace(/\*/g, "[^/]*") // Handle '*' as 'match anything except slashes'
          .replace(/\/$/, "(/.*)?"); // Handle trailing slash for directories
        return {
          pattern: pattern,
          negated: negated,
          regex: regexString,
        };
      });
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.warn(
        "Info: No .gitignore file found at project root. Using default ignore patterns only.",
      );
    } else {
      console.error(`Error reading .gitignore: ${error.message}`);
    }
    return [];
  }
}

/**
 * Checks if a given path should be ignored based on default and .gitignore patterns.
 * @param entryPath - The absolute path to the file or directory entry.
 * @param ignorePatterns - An array of GitignorePattern objects.
 * @returns True if the path should be ignored, false otherwise.
 */
function isIgnored(
  entryPath: string,
  ignorePatterns: GitignorePattern[],
): boolean {
  const relativePath = path.relative(projectRoot, entryPath);

  if (DEFAULT_IGNORE_PATTERNS.some((p) => relativePath.startsWith(p))) {
    return true;
  }

  let ignoredByGitignore = false;
  for (const { negated, regex } of ignorePatterns) {
    // Test regex against the start of the relative path for directories, or full match for files.
    const regexPattern = new RegExp(`^${regex}(/|$)`);
    if (regexPattern.test(relativePath)) {
      ignoredByGitignore = !negated; // If negated, a match means it's NOT ignored by this rule.
    }
  }
  return ignoredByGitignore;
}

/**
 * Recursively generates a string representation of the directory tree.
 * @param dir - The absolute path of the directory to traverse.
 * @param ignorePatterns - Patterns to ignore.
 * @param prefix - String prefix for formatting the tree lines.
 * @param currentDepth - Current depth of traversal.
 * @returns A promise resolving to the tree string.
 */
async function generateTree(
  dir: string,
  ignorePatterns: GitignorePattern[],
  prefix = "",
  currentDepth = 0,
): Promise<string> {
  const resolvedDir = path.resolve(dir);
  if (
    !resolvedDir.startsWith(projectRoot + path.sep) &&
    resolvedDir !== projectRoot
  ) {
    console.warn(`Security: Skipping directory outside project root: ${resolvedDir}`);
    return "";
  }

  if (currentDepth > maxDepthArg) {
    return "";
  }

  let entries;
  try {
    entries = await fs.readdir(resolvedDir, { withFileTypes: true });
  } catch (error: any) {
    console.error(`Error reading directory ${resolvedDir}: ${error.message}`);
    return "";
  }

  let output = "";
  const filteredEntries = entries
    .filter(
      (entry) => !isIgnored(path.join(resolvedDir, entry.name), ignorePatterns),
    )
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  for (let i = 0; i < filteredEntries.length; i++) {
    const entry = filteredEntries[i];
    const isLastEntry = i === filteredEntries.length - 1;
    const connector = isLastEntry ? "└── " : "├── ";
    const newPrefix = prefix + (isLastEntry ? "    " : "│   ");

    output += prefix + connector + entry.name + "\n";

    if (entry.isDirectory()) {
      output += await generateTree(
        path.join(resolvedDir, entry.name),
        ignorePatterns,
        newPrefix,
        currentDepth + 1,
      );
    }
  }
  return output;
}

/**
 * Main function to orchestrate loading ignore patterns, generating the tree,
 * and writing it to the specified output file.
 */
const writeTreeToFile = async (): Promise<void> => {
  try {
    const projectName = path.basename(projectRoot);
    const ignorePatterns = await loadGitignorePatterns();
    const resolvedOutputFile = path.resolve(projectRoot, outputPathArg);

    // Security Validation for Output Path
    if (!resolvedOutputFile.startsWith(projectRoot + path.sep)) {
      console.error(
        `Error: Output path "${outputPathArg}" resolves outside the project directory: ${resolvedOutputFile}. Aborting.`,
      );
      process.exit(1);
    }
    const resolvedOutputDir = path.dirname(resolvedOutputFile);
    if (
      !resolvedOutputDir.startsWith(projectRoot + path.sep) &&
      resolvedOutputDir !== projectRoot
    ) {
      console.error(
        `Error: Output directory "${resolvedOutputDir}" is outside the project directory. Aborting.`,
      );
      process.exit(1);
    }

    console.log(`Generating directory tree for project: ${projectName}`);
    console.log(`Output will be saved to: ${resolvedOutputFile}`);
    if (maxDepthArg !== Infinity) {
      console.log(`Maximum depth set to: ${maxDepthArg}`);
    }

    const treeContent = await generateTree(
      projectRoot,
      ignorePatterns,
      "",
      0,
    );

    try {
      await fs.access(resolvedOutputDir);
    } catch {
      console.log(`Output directory not found. Creating: ${resolvedOutputDir}`);
      await fs.mkdir(resolvedOutputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/T/, " ").replace(/\..+/, "");
    const fileHeader = `# ${projectName} - Directory Structure\n\nGenerated on: ${timestamp}\n`;
    const depthInfo = maxDepthArg !== Infinity ? `\n_Depth limited to ${maxDepthArg} levels_\n\n` : "\n";
    const treeBlock = `\`\`\`\n${projectName}\n${treeContent}\`\`\`\n`;
    const fileFooter = `\n_Note: This tree excludes files and directories matched by .gitignore and default patterns._\n`;
    const finalContent = fileHeader + depthInfo + treeBlock + fileFooter;

    await fs.writeFile(resolvedOutputFile, finalContent);
    console.log(`Successfully generated tree structure in: ${resolvedOutputFile}`);

  } catch (error) {
    console.error(
      `Error generating tree: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
};

writeTreeToFile();
