/**
 * @fileoverview MCP Authentication Middleware for Bearer Token Validation (JWT).
 *
 * This middleware validates JSON Web Tokens (JWT) passed via the 'Authorization' header
 * using the 'Bearer' scheme (e.g., "Authorization: Bearer <your_token>").
 * It verifies the token's signature and expiration using the secret key defined
 * in the configuration (`config.mcpAuthSecretKey`).
 *
 * If the token is valid, the decoded payload is attached to `req.auth` for potential
 * use in downstream authorization logic (e.g., checking scopes or permissions).
 * If the token is missing, invalid, or expired, it sends an HTTP 401 Unauthorized response.
 *
 * --- Scope and Relation to MCP Authorization Spec (2025-03-26) ---
 * - This middleware handles the *validation* of an already obtained Bearer token,
 *   as required by Section 2.6 of the MCP Auth Spec.
 * - It does *NOT* implement the full OAuth 2.1 authorization flows (e.g., Authorization
 *   Code Grant with PKCE), token endpoints (/token), authorization endpoints (/authorize),
 *   metadata discovery (/.well-known/oauth-authorization-server), or dynamic client
 *   registration (/register) described in the specification. It assumes the client
 *   obtained the JWT through an external process compliant with the spec or another
 *   agreed-upon mechanism.
 * - It correctly returns HTTP 401 errors for invalid/missing tokens as per Section 2.8.
 *
 * --- Implementation Details & Requirements ---
 * - Requires the 'jsonwebtoken' package.
 * - The `MCP_AUTH_SECRET_KEY` environment variable (accessed via `config.mcpAuthSecretKey`)
 *   MUST be set to a strong, secret value in production.
 * - In non-production environments, if the secret key is missing, authentication checks
 *   are bypassed for development convenience (a warning is logged). THIS IS INSECURE FOR PRODUCTION.
 *
 * @see {@link https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/basic/authorization.mdx | MCP Authorization Specification}
 * @module mcp-server/transports/authentication/authMiddleware
 */

import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config, environment } from "../../../config/index.js"; // Application config and environment
import { logger, requestContextService } from "../../../utils/index.js"; // Core utilities

// Extend the Express Request interface to include the optional 'auth' property
// This allows attaching the decoded JWT payload to the request object for downstream use.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Decoded JWT payload if authentication is successful, or a development mode indicator. */
      auth?: jwt.JwtPayload | string | { devMode: boolean; warning: string };
    }
  }
}

// --- Startup Validation ---
// Validate secret key presence on module load (fail fast principle).
// This prevents the server starting insecurely in production without the key.
if (environment === "production" && !config.mcpAuthSecretKey) {
  logger.fatal(
    "CRITICAL: MCP_AUTH_SECRET_KEY is not set in production environment. Authentication cannot proceed securely.",
  );
  throw new Error(
    "MCP_AUTH_SECRET_KEY must be set in production environment for JWT authentication.",
  );
} else if (!config.mcpAuthSecretKey) {
  logger.warning(
    "MCP_AUTH_SECRET_KEY is not set. Authentication middleware will bypass checks (DEVELOPMENT ONLY). This is insecure for production.",
  );
}

/**
 * Express middleware function for verifying JWT Bearer token authentication.
 * It checks the `Authorization` header for a 'Bearer' token. If found, it verifies
 * the token's signature and expiration using the `config.mcpAuthSecretKey`.
 * On successful verification, the decoded token payload is attached to `req.auth`.
 * If authentication fails (missing token, invalid format, invalid signature, expired),
 * an HTTP 401 Unauthorized response is sent.
 * In non-production environments, if `config.mcpAuthSecretKey` is not set,
 * authentication is bypassed for development convenience.
 *
 * @param {Request} req - Express request object.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next middleware function.
 * @public
 */
export function mcpAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const context = requestContextService.createRequestContext({
    operation: "mcpAuthMiddleware",
    method: req.method,
    path: req.path,
  });
  logger.debug(
    "Running MCP Authentication Middleware (Bearer Token Validation)...",
    context,
  );

  // --- Development Mode Bypass ---
  if (!config.mcpAuthSecretKey) {
    if (environment !== "production") {
      logger.warning(
        "Bypassing JWT authentication: MCP_AUTH_SECRET_KEY is not set (DEVELOPMENT ONLY).",
        context,
      );
      req.auth = {
        devMode: true,
        warning: "Auth bypassed due to missing secret key",
      };
      return next();
    } else {
      logger.error(
        "FATAL: MCP_AUTH_SECRET_KEY is missing in production. Cannot bypass auth.",
        context,
      );
      res.status(500).json({
        error: "Server configuration error: Authentication key missing.",
      });
      return;
    }
  }

  // --- Standard JWT Bearer Token Verification ---
  const authHeader = req.headers.authorization;
  logger.debug(`Authorization header present: ${!!authHeader}`, context);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    logger.warning(
      "Authentication failed: Missing or malformed Authorization header (Bearer scheme required).",
      context,
    );
    res.status(401).json({
      error: "Unauthorized: Missing or invalid authentication token format.",
    });
    return;
  }

  const token = authHeader.split(" ")[1];
  logger.debug("Extracted token from Bearer header.", context); // Token value itself is not logged

  if (!token) {
    logger.warning(
      "Authentication failed: Token missing after Bearer split (Malformed header).",
      context,
    );
    res
      .status(401)
      .json({ error: "Unauthorized: Malformed authentication token." });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.mcpAuthSecretKey);
    logger.debug("JWT verified successfully.", { ...context });
    req.auth = decoded;
    next();
  } catch (error: unknown) {
    let errorMessage = "Invalid token";
    if (error instanceof jwt.TokenExpiredError) {
      errorMessage = "Token expired";
      logger.warning("Authentication failed: Token expired.", {
        ...context,
        expiredAt: error.expiredAt,
      });
    } else if (error instanceof jwt.JsonWebTokenError) {
      errorMessage = `Invalid token: ${error.message}`;
      logger.warning(`Authentication failed: ${errorMessage}`, { ...context });
    } else if (error instanceof Error) {
      errorMessage = `Verification error: ${error.message}`;
      logger.error(
        "Authentication failed: Unexpected error during token verification.",
        { ...context, error: error.message },
      );
    } else {
      errorMessage = "Unknown verification error";
      logger.error(
        "Authentication failed: Unexpected non-error exception during token verification.",
        { ...context, error },
      );
    }
    res.status(401).json({ error: `Unauthorized: ${errorMessage}.` });
  }
}
