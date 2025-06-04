/**
 * @fileoverview Defines the core logic, schemas, and types for the `get_random_cat_fact` tool.
 * This tool fetches a random cat fact from the public Cat Fact Ninja API.
 * It demonstrates an asynchronous API call within an MCP tool.
 * @module src/mcp-server/tools/catFactFetcher/catFactFetcherLogic
 */

import { z } from "zod";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  fetchWithTimeout,
  logger,
  type RequestContext,
} from "../../../utils/index.js";

/**
 * Interface representing the structure of the response from the Cat Fact Ninja API's /fact endpoint.
 */
interface CatFactApiResponse {
  fact: string;
  length: number;
}

/**
 * Asynchronously fetches a random cat fact from the Cat Fact Ninja API.
 * @param maxLength - Optional maximum length for the cat fact.
 * @param context - The request context for logging.
 * @returns A promise that resolves to the CatFactApiResponse.
 * @throws {McpError} If the API request fails or returns an error.
 */
async function fetchRandomCatFactFromApi(
  maxLength: number | undefined,
  context: RequestContext,
): Promise<CatFactApiResponse> {
  // Best practice: API URLs should be configurable, e.g., via environment variables or a config file.
  let apiUrl = "https://catfact.ninja/fact";
  if (maxLength !== undefined) {
    apiUrl += `?max_length=${maxLength}`;
  }

  logger.info(`Fetching random cat fact from: ${apiUrl}`, context);

  // Best practice: Timeouts should be configurable.
  const CAT_FACT_API_TIMEOUT_MS = 5000;

  try {
    // Use the fetchWithTimeout utility
    const response = await fetchWithTimeout(
      apiUrl,
      CAT_FACT_API_TIMEOUT_MS,
      context,
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        `Cat Fact API request to ${apiUrl} failed with status ${response.status}: ${errorText}`,
        context,
      );
      throw new McpError(
        BaseErrorCode.SERVICE_UNAVAILABLE,
        `Cat Fact API request to ${apiUrl} failed: ${response.status} ${response.statusText}`,
        {
          ...context,
          httpStatusCode: response.status,
          responseBodyBrief: errorText,
          errorSource: "CatFactApiNonOkResponse",
        },
      );
    }
    const data: CatFactApiResponse = await response.json();
    logger.info(
      `Successfully fetched cat fact (length: ${data.length}): "${data.fact.substring(0, 50)}..."`,
      context,
    );
    return data;
  } catch (error) {
    // The fetchWithTimeout utility handles AbortError and throws McpError with BaseErrorCode.TIMEOUT.
    // It also wraps other fetch-related network errors in McpError.
    // So, we primarily need to catch McpErrors here or wrap any truly unexpected errors.

    if (error instanceof McpError) {
      // Log McpErrors specifically if needed, or just re-throw
      // If it's a TIMEOUT error from fetchWithTimeout, it's already logged by the utility.
      // If it's a SERVICE_UNAVAILABLE from fetchWithTimeout (generic network error), also logged.
      // If it's from response.ok check above, it's also an McpError.
      throw error;
    }

    // Fallback for any other unexpected errors not already wrapped by McpError
    logger.error(
      `Unexpected error during Cat Fact API processing for ${apiUrl}: ${error instanceof Error ? error.message : String(error)}`,
      context,
    );
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR, // Or UNKNOWN_ERROR if more appropriate
      `Unexpected error processing response from Cat Fact API (${apiUrl}): ${error instanceof Error ? error.message : String(error)}`,
      {
        ...context,
        originalErrorName: error instanceof Error ? error.name : "UnknownError",
        errorSource: "CatFactApiUnexpectedCatch",
      },
    );
  }
}

/**
 * Zod schema for validating input arguments for the `get_random_cat_fact` tool.
 */
export const CatFactFetcherInputSchema = z
  .object({
    maxLength: z
      .number()
      .int("Max length must be an integer.")
      .min(1, "Max length must be at least 1.")
      .optional()
      .describe(
        "Optional: The maximum character length of the cat fact to retrieve.",
      ),
  })
  .describe(
    "Input schema for the get_random_cat_fact tool. Allows specifying a maximum length for the fact.",
  );

/**
 * TypeScript type inferred from `CatFactFetcherInputSchema`.
 */
export type CatFactFetcherInput = z.infer<typeof CatFactFetcherInputSchema>;

/**
 * Defines the structure of the JSON payload returned by the `get_random_cat_fact` tool handler.
 */
export interface CatFactFetcherResponse {
  fact: string;
  length: number;
  requestedMaxLength?: number;
  timestamp: string;
}

/**
 * Processes the core logic for the `get_random_cat_fact` tool.
 * It calls the Cat Fact Ninja API and returns the fetched fact.
 * @param params - The validated input parameters for the tool.
 * @param context - The request context for logging and tracing.
 * @returns A promise that resolves to an object containing the cat fact data.
 */
export const processCatFactFetcher = async (
  params: CatFactFetcherInput,
  context: RequestContext,
): Promise<CatFactFetcherResponse> => {
  logger.debug("Processing get_random_cat_fact logic with input parameters.", {
    ...context,
    toolInput: { maxLength: params.maxLength },
  });

  const apiResponse = await fetchRandomCatFactFromApi(
    params.maxLength,
    context,
  );

  const toolResponse: CatFactFetcherResponse = {
    fact: apiResponse.fact,
    length: apiResponse.length,
    requestedMaxLength: params.maxLength,
    timestamp: new Date().toISOString(),
  };

  logger.debug("Random cat fact fetched and processed successfully.", {
    ...context,
    toolResponseSummary: {
      factLength: toolResponse.length,
      requestedMaxLength: toolResponse.requestedMaxLength,
    },
  });

  return toolResponse;
};
