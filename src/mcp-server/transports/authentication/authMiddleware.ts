/**
 * @fileoverview MCP Authentication Middleware for Bearer Token Validation (JWT).
 *
 * This middleware validates JSON Web Tokens (JWT) passed via the 'Authorization' header
 * using the 'Bearer' scheme (e.g., "Authorization: Bearer <your_token>").
 * It verifies the token's signature and expiration using the secret key defined
 * in the configuration (`config.mcpAuthSecretKey`).
 *
 * If the token is valid, an object conforming to the MCP SDK's `AuthInfo` type
 * (expected to contain `token`, `clientId`, and `scopes`) is attached to `req.auth`.
 * If the token is missing, invalid, or expired, it sends an HTTP 401 Unauthorized response.
 *
 * @see {@link https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/basic/authorization.mdx | MCP Authorization Specification}
 * @module src/mcp-server/transports/authentication/authMiddleware
 */

import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"; // Import from SDK
import { config, environment } from "../../../config/index.js";
import { logger, requestContextService } from "../../../utils/index.js";

// Extend the Express Request interface to include the optional 'auth' property
// using the imported AuthInfo type from the SDK.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Authentication information derived from the JWT, conforming to MCP SDK's AuthInfo. */
      auth?: AuthInfo;
    }
  }
}

// Startup Validation: Validate secret key presence on module load.
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
 * Express middleware for verifying JWT Bearer token authentication.
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

  // Development Mode Bypass
  if (!config.mcpAuthSecretKey) {
    if (environment !== "production") {
      logger.warning(
        "Bypassing JWT authentication: MCP_AUTH_SECRET_KEY is not set (DEVELOPMENT ONLY).",
        context,
      );
      // Populate req.auth strictly according to SDK's AuthInfo
      req.auth = {
        token: "dev-mode-placeholder-token",
        clientId: "dev-client-id",
        scopes: ["dev-scope"],
      };
      // Log dev mode details separately, not attaching to req.auth if not part of AuthInfo
      logger.debug("Dev mode auth object created.", {
        ...context,
        authDetails: req.auth,
      });
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

  const authHeader = req.headers.authorization;
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

  const tokenParts = authHeader.split(" ");
  if (tokenParts.length !== 2 || tokenParts[0] !== "Bearer" || !tokenParts[1]) {
    logger.warning("Authentication failed: Malformed Bearer token.", context);
    res
      .status(401)
      .json({ error: "Unauthorized: Malformed authentication token." });
    return;
  }
  const rawToken = tokenParts[1];

  try {
    const decoded = jwt.verify(rawToken, config.mcpAuthSecretKey);

    if (typeof decoded === "string") {
      logger.warning(
        "Authentication failed: JWT decoded to a string, expected an object payload.",
        context,
      );
      res
        .status(401)
        .json({ error: "Unauthorized: Invalid token payload format." });
      return;
    }

    // Extract and validate fields for SDK's AuthInfo
    const clientIdFromToken =
      typeof decoded.cid === "string"
        ? decoded.cid
        : typeof decoded.client_id === "string"
          ? decoded.client_id
          : undefined;
    if (!clientIdFromToken) {
      logger.warning(
        "Authentication failed: JWT 'cid' or 'client_id' claim is missing or not a string.",
        { ...context, jwtPayloadKeys: Object.keys(decoded) },
      );
      res.status(401).json({
        error: "Unauthorized: Invalid token, missing client identifier.",
      });
      return;
    }

    let scopesFromToken: string[];
    if (
      Array.isArray(decoded.scp) &&
      decoded.scp.every((s) => typeof s === "string")
    ) {
      scopesFromToken = decoded.scp as string[];
    } else if (
      typeof decoded.scope === "string" &&
      decoded.scope.trim() !== ""
    ) {
      scopesFromToken = decoded.scope.split(" ").filter((s) => s);
      if (scopesFromToken.length === 0 && decoded.scope.trim() !== "") {
        // handles case " " -> [""]
        scopesFromToken = [decoded.scope.trim()];
      } else if (scopesFromToken.length === 0 && decoded.scope.trim() === "") {
        // If scope is an empty string, treat as no scopes rather than erroring, or use a default.
        // Depending on strictness, could also error here. For now, allow empty array if scope was empty string.
        logger.debug(
          "JWT 'scope' claim was an empty string, resulting in empty scopes array.",
          context,
        );
      }
    } else {
      // If scopes are strictly mandatory and not found or invalid format
      logger.warning(
        "Authentication failed: JWT 'scp' or 'scope' claim is missing, not an array of strings, or not a valid space-separated string. Assigning default empty array.",
        { ...context, jwtPayloadKeys: Object.keys(decoded) },
      );
      scopesFromToken = []; // Default to empty array if scopes are mandatory but not found/invalid
      // Or, if truly mandatory and must be non-empty:
      // res.status(401).json({ error: "Unauthorized: Invalid token, missing or invalid scopes." });
      // return;
    }

    // Construct req.auth with only the properties defined in SDK's AuthInfo
    // All other claims from 'decoded' are not part of req.auth for type safety.
    req.auth = {
      token: rawToken,
      clientId: clientIdFromToken,
      scopes: scopesFromToken,
    };

    // Log separately if other JWT claims like 'sub' (sessionId) are needed for app logic
    const subClaimForLogging =
      typeof decoded.sub === "string" ? decoded.sub : undefined;
    logger.debug("JWT verified successfully. AuthInfo attached to request.", {
      ...context,
      mcpSessionIdContext: subClaimForLogging,
      clientId: req.auth.clientId,
      scopes: req.auth.scopes,
    });
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
