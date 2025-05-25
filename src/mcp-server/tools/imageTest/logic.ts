/**
 * @fileoverview Core logic for the fetch_image_test tool. Fetches a random cat image.
 * @module src/mcp-server/tools/imageTest/logic
 */
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch"; // Using node-fetch for broader Node version compatibility
import { z } from "zod";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  logger,
  RequestContext,
  requestContextService,
  sanitizeInputForLogging,
} from "../../../utils/index.js";

// Minimal input schema, as the tool will return a dynamic image
export const FetchImageTestInputSchema = z.object({
  trigger: z.boolean().optional().default(true).describe("A trigger to invoke the tool and fetch a new cat image."),
});

export type FetchImageTestInput = z.infer<typeof FetchImageTestInputSchema>;

const CAT_API_URL = "https://cataas.com/cat";

export async function fetchImageTestLogic(
  input: FetchImageTestInput,
  parentRequestContext: RequestContext
): Promise<CallToolResult> {
  const operationContext = requestContextService.createRequestContext({
    parentRequestId: parentRequestContext.requestId,
    operation: "fetchImageTestLogicExecution",
    input: sanitizeInputForLogging(input),
  });

  logger.info(
    `Executing 'fetch_image_test'. Trigger: ${input.trigger}`,
    operationContext
  );

  try {
    const response = await fetch(CAT_API_URL);
    if (!response.ok) {
      throw new McpError(
        BaseErrorCode.SERVICE_UNAVAILABLE,
        `Failed to fetch cat image from ${CAT_API_URL}. Status: ${response.status}`,
        {
          statusCode: response.status,
          statusText: response.statusText,
          responseBody: await response.text().catch(() => "Could not read response body"),
        }
      );
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    const mediaType = response.headers.get("content-type") || "image/jpeg"; // Default to jpeg if not specified

    const imageContent = {
      type: "image" as const, // Explicitly cast type to literal "image"
      data: imageBuffer.toString("base64"), // Convert buffer to base64 string
      mimeType: mediaType, // Rename mediaType to mimeType
    };

    return {
      content: [imageContent],
      isError: false,
    };
  } catch (error: any) {
    logger.error(
      "Execution failed for 'fetch_image_test'",
      error,
      operationContext
    );
    
    let mcpError: McpError;
    if (error instanceof McpError) {
      mcpError = error;
    } else {
      mcpError = new McpError(
        BaseErrorCode.INTERNAL_ERROR, // Corrected Error Code
        `'fetch_image_test' failed: ${error.message || "Internal server error."}`,
        {
          originalErrorName: error.name,
          originalErrorMessage: error.message,
          requestId: operationContext.requestId,
        }
      );
    }
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: {
              code: mcpError.code,
              message: mcpError.message,
              details: mcpError.details,
            },
          }),
        },
      ],
      isError: true,
    };
  }
}
