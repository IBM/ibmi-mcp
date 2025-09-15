#!/usr/bin/env node
/**
 * Simple test script for IBM i HTTP Authentication endpoint
 * Tests the POST /api/v1/auth endpoint with user credentials
 *
 * Loads credentials from .env DB2i_* variables by default, with CLI fallback
 * Sets IBMI_MCP_ACCESS_TOKEN environment variable on success
 *
 * Usage: node get-access-token.js [--user <username>] [--password <password>] [--host <ibmi-host>] [--verbose] [--https]
 */

import https from "https";
import http from "http";
import { parseArgs } from "node:util";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Parse command line arguments
const options = {
  user: {
    type: "string",
    short: "u",
    description: "IBM i username (defaults to DB2i_USER from .env)",
  },
  password: {
    type: "string",
    short: "p",
    description: "IBM i password (defaults to DB2i_PASS from .env)",
  },
  host: {
    type: "string",
    short: "h",
    description: "IBM i host address (defaults to DB2i_HOST from .env)",
  },
  verbose: {
    type: "boolean",
    short: "v",
    description: "Enable verbose output with metadata",
    default: false,
  },
  https: {
    type: "boolean",
    description: "Use HTTPS instead of HTTP",
    default: false,
  },
  quiet: {
    type: "boolean",
    short: "q",
    description: "Output only export command for shell evaluation",
    default: false,
  },
  server: {
    type: "string",
    description: "MCP server address",
    default: "localhost",
  },
  port: {
    type: "string",
    description: "MCP server port",
    default: "3010",
  },
  duration: {
    type: "string",
    description: "Token duration in seconds",
    default: "7200",
  },
  "pool-start": {
    type: "string",
    description: "Initial pool size",
    default: "2",
  },
  "pool-max": {
    type: "string",
    description: "Maximum pool size",
    default: "5",
  },
};

let args;
try {
  const parsed = parseArgs({ options, allowPositionals: false });
  args = parsed.values;
} catch (error) {
  console.error("❌ Error parsing arguments:", error.message);
  console.error(
    "\nUsage: node test-auth.js --user <username> --password <password> --host <ibmi-host> [--verbose] [--https]",
  );
  console.error("\nOptions:");
  Object.entries(options).forEach(([key, opt]) => {
    const shortFlag = opt.short ? `-${opt.short}, ` : "";
    console.error(`  ${shortFlag}--${key}\t${opt.description}`);
  });
  process.exit(1);
}

// Load credentials from environment variables with CLI fallback
const credentials = {
  user: args.user || process.env.DB2i_USER,
  password: args.password || process.env.DB2i_PASS,
  host: args.host || process.env.DB2i_HOST,
};

// Determine credential source for messaging
const credentialSource = {
  user: args.user
    ? "CLI argument"
    : process.env.DB2i_USER
      ? ".env DB2i_USER"
      : "missing",
  password: args.password
    ? "CLI argument"
    : process.env.DB2i_PASS
      ? ".env DB2i_PASS"
      : "missing",
  host: args.host
    ? "CLI argument"
    : process.env.DB2i_HOST
      ? ".env DB2i_HOST"
      : "missing",
};

// Print credential source information
if (args.verbose) {
  console.log("🔑 Using credentials from:");
  console.log(`   User: ${credentialSource.user}`);
  console.log(`   Password: ${credentialSource.password}`);
  console.log(`   Host: ${credentialSource.host}`);
  console.log();
}

// Validate required credentials
if (!credentials.user || !credentials.password || !credentials.host) {
  const missing = [];
  if (!credentials.user) missing.push("user");
  if (!credentials.password) missing.push("password");
  if (!credentials.host) missing.push("host");

  console.error(`❌ Missing required credentials: ${missing.join(", ")}`);
  console.error("\n📝 Solutions:");
  console.error(
    "   1. Set in .env file: DB2i_USER=<user> DB2i_PASS=<pass> DB2i_HOST=<host>",
  );
  console.error(
    "   2. Use CLI args: --user <user> --password <pass> --host <host>",
  );
  console.error(
    "\nUsage: node get-access-token.js [--user <username>] [--password <password>] [--host <ibmi-host>] [--verbose] [--https]",
  );
  process.exit(1);
}

// Test configuration
const TEST_CONFIG = {
  server: args.server,
  port: parseInt(args.port, 10),
  path: "/api/v1/auth",
  username: credentials.user,
  password: credentials.password,
  useHttps: args.https,
  verbose: args.verbose,
};

const ibmiHost = credentials.host;

if (TEST_CONFIG.verbose) {
  console.log("🧪 Testing IBM i HTTP Authentication Endpoint");
  console.log(
    `   Endpoint: ${TEST_CONFIG.useHttps ? "https" : "http"}://${TEST_CONFIG.server}:${TEST_CONFIG.port}${TEST_CONFIG.path}`,
  );
  console.log(`   IBM i Host: ${ibmiHost}`);
  console.log(`   Username: ${TEST_CONFIG.username}`);
  console.log(`   Password: ${"*".repeat(TEST_CONFIG.password.length)}`);
  console.log();

  if (!TEST_CONFIG.useHttps) {
    console.log("⚠️  Using HTTP - TLS enforcement may reject this request");
    console.log("💡 To allow HTTP in development, start the server with:");
    console.log(
      "   IBMI_HTTP_AUTH_ENABLED=true IBMI_AUTH_ALLOW_HTTP=true npm start",
    );
    console.log("💡 Or test with HTTPS: add --https flag");
    console.log();
  }
}

// Create Basic Auth header
const encodedCredentials = Buffer.from(
  `${TEST_CONFIG.username}:${TEST_CONFIG.password}`,
).toString("base64");

// Request payload
const requestData = JSON.stringify({
  host: ibmiHost, // IBM i host
  duration: parseInt(args.duration, 10), // Token lifetime in seconds
  poolstart: parseInt(args["pool-start"], 10), // Starting pool size
  poolmax: parseInt(args["pool-max"], 10), // Max pool size
});

// Request options
const requestOptions = {
  hostname: TEST_CONFIG.server,
  port: TEST_CONFIG.port,
  path: TEST_CONFIG.path,
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(requestData),
    Authorization: `Basic ${encodedCredentials}`,
  },
  // For HTTPS testing, ignore self-signed certificates
  rejectUnauthorized: false,
};

if (TEST_CONFIG.verbose) {
  console.log("📤 Sending authentication request...");
}

const httpModule = TEST_CONFIG.useHttps ? https : http;

const req = httpModule.request(requestOptions, (res) => {
  if (TEST_CONFIG.verbose) {
    console.log(`📥 Response Status: ${res.statusCode} ${res.statusMessage}`);
    console.log("📥 Response Headers:");
    Object.entries(res.headers).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });
    console.log();
  }

  let responseBody = "";
  res.on("data", (chunk) => {
    responseBody += chunk;
  });

  res.on("end", () => {
    try {
      const parsedResponse = JSON.parse(responseBody);

      if (args.quiet && res.statusCode === 201 && parsedResponse.access_token) {
        // Quiet mode: output only export command
        console.log(
          `export IBMI_MCP_ACCESS_TOKEN="${parsedResponse.access_token}"`,
        );
        return;
      }

      if (TEST_CONFIG.verbose) {
        console.log("📥 Response Body:");
        console.log(JSON.stringify(parsedResponse, null, 2));

        if (res.statusCode === 201) {
          console.log();
          console.log("✅ Authentication successful!");
          console.log(
            `   Token: ${parsedResponse.access_token.substring(0, 20)}...`,
          );
          console.log(`   Expires: ${parsedResponse.expires_at}`);
          console.log(`   Duration: ${parsedResponse.expires_in} seconds`);

          console.log();
          console.log("🔍 Token details:");
          console.log(`   Length: ${parsedResponse.access_token.length} bytes`);
          console.log(`   Type: ${parsedResponse.token_type}`);

          // Set environment variable for the token
          console.log();
          console.log(
            "🔧 Setting IBMI_MCP_ACCESS_TOKEN environment variable...",
          );

          // For the current process
          process.env.IBMI_MCP_ACCESS_TOKEN = parsedResponse.access_token;

          console.log("✅ Environment variable set for current process!");
          console.log(
            "💡 Use in your test agent: process.env.IBMI_MCP_ACCESS_TOKEN",
          );
          console.log();
          console.log("📋 To set for your shell session, run:");
          console.log(
            `   export IBMI_MCP_ACCESS_TOKEN="${parsedResponse.access_token}"`,
          );
          console.log();
          console.log("🚀 Or use with eval to set automatically:");
          console.log("   eval $(node get-access-token.js --quiet)");
        } else {
          console.log();
          console.log("❌ Authentication failed!");
          if (parsedResponse.error) {
            console.log(`   Error Code: ${parsedResponse.error.code}`);
            console.log(`   Error Message: ${parsedResponse.error.message}`);

            // Specific guidance for TLS error
            if (
              parsedResponse.error.message.includes("HTTPS/TLS is required")
            ) {
              console.log();
              console.log(
                "💡 This error means TLS enforcement is working correctly.",
              );
              console.log(
                "   To test in development, restart the server with:",
              );
              console.log(
                "   IBMI_HTTP_AUTH_ENABLED=true IBMI_AUTH_ALLOW_HTTP=true npm start",
              );
              console.log("   Then run the test again.");
            }
          }
        }
      } else {
        // Non-verbose mode: just output the JSON response
        console.log(JSON.stringify(parsedResponse, null, 2));

        // Handle quiet mode for shell evaluation
        if (res.statusCode === 201 && parsedResponse.access_token) {
          process.env.IBMI_MCP_ACCESS_TOKEN = parsedResponse.access_token;

          if (args.quiet) {
            // Output only the export command for eval
            console.log(
              `export IBMI_MCP_ACCESS_TOKEN="${parsedResponse.access_token}"`,
            );
          }
        }
      }
    } catch (parseError) {
      if (TEST_CONFIG.verbose) {
        console.log("Raw response:", responseBody);
        console.log("❌ Failed to parse JSON response:", parseError.message);
      } else {
        console.error(
          JSON.stringify(
            { error: "Failed to parse JSON response", raw: responseBody },
            null,
            2,
          ),
        );
      }
      process.exit(1);
    }
  });
});

req.on("error", (error) => {
  if (TEST_CONFIG.verbose) {
    console.log("❌ Request failed:", error.message);

    if (error.code === "ECONNREFUSED") {
      console.log("💡 Make sure the server is running with:");
      console.log("   IBMI_HTTP_AUTH_ENABLED=true npm start");
    }

    if (
      error.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" &&
      TEST_CONFIG.useHttps
    ) {
      console.log(
        "💡 For HTTPS testing, add --https flag for insecure connections",
      );
    }
  } else {
    console.error(
      JSON.stringify({ error: error.message, code: error.code }, null, 2),
    );
  }
  process.exit(1);
});

// Send the request
req.write(requestData);
req.end();

if (TEST_CONFIG.verbose) {
  console.log("⏳ Waiting for response...");
}
