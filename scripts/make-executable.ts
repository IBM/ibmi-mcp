#!/usr/bin/env node

/**
 * Make Executable Script
 * ======================
 *
 * Description:
 *   A cross-platform utility that makes script files executable (chmod +x) on Unix-like systems.
 *   On Windows, this script does nothing but exits successfully (as chmod is not applicable).
 *   Useful for CLI applications or tools where the built output needs to be executable.
 *
 * Usage:
 *   - Add to package.json build script: "build": "tsc && ts-node --esm scripts/make-executable.ts dist/index.js"
 *   - Run directly (if needed): ts-node --esm scripts/make-executable.ts [file1] [file2] ...
 *   - Default target (if no args): dist/index.js
 *
 * Platform compatibility:
 *   - Runs on all platforms but only performs chmod on Unix-like systems (Linux, macOS)
 *   - On Windows, the script will succeed without performing any action
 *
 * Common use case:
 *   - For Node.js CLI applications where the entry point needs executable permissions
 *   - Often used as a postbuild script to ensure the built output is executable
 */

import fs from "fs/promises";
import os from "os";
import path from "path";

// Get platform information
const isUnix = os.platform() !== "win32";
const projectRoot = process.cwd(); // Define project root

// File permissions
const EXECUTABLE_MODE = 0o755; // rwxr-xr-x

/**
 * Interface for the result of making a file executable
 */
interface ExecutableResult {
  file: string;
  status: "success" | "error" | "skipped"; // Added 'skipped' status
  reason?: string;
}

/**
 * Main function to make files executable
 */
const makeExecutable = async (): Promise<void> => {
  try {
    // Get target files from command line arguments or use default
    const targetFiles: string[] =
      process.argv.slice(2).length > 0
        ? process.argv.slice(2)
        : ["dist/index.js"]; // Default relative to project root

    if (!isUnix) {
      console.log(
        "Windows detected. Skipping chmod operation (not applicable).",
      );
      console.log(
        "Note: On Windows, executable permissions are not required to run scripts.",
      );
      return;
    }

    console.log("Making files executable...");

    const results = await Promise.allSettled(
      targetFiles.map(async (targetFile): Promise<ExecutableResult> => {
        const normalizedPath = path.resolve(projectRoot, targetFile); // Resolve against project root

        // --- Security Check: Ensure path is within project root ---
        if (
          !normalizedPath.startsWith(projectRoot + path.sep) &&
          normalizedPath !== projectRoot
        ) {
          return {
            file: targetFile,
            status: "error",
            reason: `Path resolves outside project boundary: ${normalizedPath}`,
          };
        }
        // --- End Security Check ---

        try {
          // Check if file exists using the validated path
          await fs.access(normalizedPath);

          // Make file executable using the validated path
          await fs.chmod(normalizedPath, EXECUTABLE_MODE);
          return { file: targetFile, status: "success" };
        } catch (error) {
          const err = error as NodeJS.ErrnoException; // Type assertion for NodeJS errors
          if (err.code === "ENOENT") {
            return {
              file: targetFile,
              status: "error",
              reason: "File not found",
            };
          }
          // Log other errors but return an error status
          console.error(`Error processing ${targetFile}: ${err.message}`);
          return { file: targetFile, status: "error", reason: err.message };
        }
      }),
    );

    // Report results
    let hasErrors = false;
    for (const result of results) {
      if (result.status === "fulfilled") {
        const { file, status, reason } = result.value;
        if (status === "success") {
          console.log(`✓ Made executable: ${file}`);
        } else if (status === "error") {
          console.error(`× ${file}: ${reason}`);
          hasErrors = true;
        } else if (status === "skipped") {
          console.warn(`! Skipped: ${file} (${reason})`);
        }
      } else {
        // Handle rejected promises from map (should ideally not happen with current try/catch)
        console.error(`× Unexpected error: ${result.reason}`);
        hasErrors = true;
      }
    }

    if (hasErrors) {
      console.error("Some files could not be processed. See errors above.");
      // Optionally exit with error code if any file failed
      // process.exit(1);
    }
  } catch (error) {
    console.error(
      "× Fatal error during script execution:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
};

// Execute the makeExecutable function
makeExecutable();
