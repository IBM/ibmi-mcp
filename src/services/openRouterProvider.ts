/**
 * @fileoverview Provides a service class (`OpenRouterProvider`) for interacting with the
 * OpenRouter API, using the OpenAI SDK for chat completions. It handles API key
 * configuration, default parameters, rate limiting, and error handling.
 * @module services/openRouterProvider
 */
import OpenAI from "openai";
import {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";
import { Stream } from "openai/streaming";
import { config } from "../config/index.js";
import { BaseErrorCode, McpError } from "../types-global/errors.js";
import { ErrorHandler } from "../utils/internal/errorHandler.js";
import { logger } from "../utils/internal/logger.js";
import {
  OperationContext,
  RequestContext,
  requestContextService,
} from "../utils/internal/requestContext.js";
import { rateLimiter } from "../utils/security/rateLimiter.js";
import { sanitization } from "../utils/security/sanitization.js";

// Use the updated config properties
const YOUR_SITE_URL = config.openrouterAppUrl;
const YOUR_SITE_NAME = config.openrouterAppName;

/**
 * Defines the parameters for an OpenRouter chat completion request.
 * This type extends the standard OpenAI chat completion parameters
 * (`ChatCompletionCreateParamsNonStreaming` or `ChatCompletionCreateParamsStreaming` from the `openai` SDK)
 * and includes additional fields specific to OpenRouter or for custom behavior.
 *
 * @typedef {object} OpenRouterChatParams
 * @property {number} [top_k] - OpenRouter specific: Sample from the k most likely next tokens at each step.
 * @property {number} [min_p] - OpenRouter specific: Minimum probability for a token to be considered.
 * @property {string[]} [transforms] - OpenRouter specific: Apply transformations to the request or response.
 * @property {string[]} [models] - OpenRouter specific: A list of models to use, often for fallback or routing.
 * @property {'fallback'} [route] - OpenRouter specific: Specifies routing strategy, e.g., 'fallback'.
 * @property {Record<string, any>} [provider] - OpenRouter specific: Provider-specific parameters or routing preferences.
 *                                              Example: `{ sort: 'throughput' }`.
 * @property {boolean} [stream] - If true, the response will be a stream of `ChatCompletionChunk` objects (from `openai` SDK).
 *                                If false or undefined, a single `ChatCompletion` object (from `openai` SDK) is returned.
 * @see ChatCompletionCreateParamsNonStreaming (from `openai` SDK)
 * @see ChatCompletionCreateParamsStreaming (from `openai` SDK)
 */
export type OpenRouterChatParams = (
  | ChatCompletionCreateParamsNonStreaming
  | ChatCompletionCreateParamsStreaming
) & {
  top_k?: number;
  min_p?: number;
  transforms?: string[];
  models?: string[];
  route?: "fallback";
  provider?: Record<string, any>;
  // Add other potential non-standard params here
};

/**
 * Service class for interacting with the OpenRouter API.
 * It uses the OpenAI SDK for chat completions, configured to point to OpenRouter's base URL.
 * Handles API key management, default headers, and provides methods for chat completions and listing models.
 * The service status (`unconfigured`, `initializing`, `ready`, `error`) indicates its usability.
 * @class OpenRouterProvider
 */
class OpenRouterProvider {
  /**
   * The OpenAI SDK client instance configured for OpenRouter.
   * Undefined if the service is not configured (e.g., missing API key).
   * @private
   * @type {OpenAI | undefined}
   */
  private client?: OpenAI;
  /**
   * Current status of the OpenRouter service.
   * - `unconfigured`: API key is missing.
   * - `initializing`: Constructor is running.
   * - `ready`: Client initialized successfully and service is usable.
   * - `error`: An error occurred during initialization.
   * @readonly
   * @type {'unconfigured' | 'initializing' | 'ready' | 'error'}
   */
  public readonly status: "unconfigured" | "initializing" | "ready" | "error";
  /**
   * Stores any error that occurred during client initialization.
   * Null if initialization was successful or not yet attempted.
   * @private
   * @type {Error | null}
   */
  private initializationError: Error | null = null;

  /**
   * Constructs an `OpenRouterProvider` instance.
   * Initializes the OpenAI client for OpenRouter if an API key is provided.
   * Sets default headers required by OpenRouter.
   * @param {string | undefined} apiKey - The OpenRouter API key. If undefined, the service remains 'unconfigured'.
   * @param {OperationContext} [parentOpContext] - Optional parent operation context for linked logging.
   */
  constructor(apiKey: string | undefined, parentOpContext?: OperationContext) {
    const operationName = parentOpContext?.operation
      ? `${parentOpContext.operation}.OpenRouterProvider.constructor`
      : "OpenRouterProvider.constructor";
    const opContext = requestContextService.createRequestContext({
      operation: operationName,
      parentRequestId: parentOpContext?.requestId,
    });
    this.status = "initializing";

    if (!apiKey) {
      this.status = "unconfigured";
      logger.warning(
        "OPENROUTER_API_KEY is not set. OpenRouter service is not configured.",
        { ...opContext, service: "OpenRouterProvider" },
      );
      return;
    }

    try {
      this.client = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: apiKey,
        defaultHeaders: {
          "HTTP-Referer": YOUR_SITE_URL,
          "X-Title": YOUR_SITE_NAME,
        },
      });
      this.status = "ready";
      logger.info("OpenRouter Service Initialized and Ready", {
        ...opContext,
        service: "OpenRouterProvider",
      });
    } catch (error: any) {
      this.status = "error";
      this.initializationError =
        error instanceof Error ? error : new Error(String(error));
      logger.error("Failed to initialize OpenRouter client", {
        ...opContext,
        service: "OpenRouterProvider",
        error: this.initializationError.message,
      });
    }
  }

  /**
   * Checks if the service is ready to make API calls.
   * Throws an `McpError` if the service is not in a 'ready' state.
   * @param {string} operation - The name of the operation attempting to use the service.
   * @param {RequestContext} context - The request context for logging.
   * @throws {McpError} If the service is not ready.
   * @private
   */
  private checkReady(operation: string, context: RequestContext): void {
    if (this.status !== "ready") {
      let errorCode = BaseErrorCode.SERVICE_UNAVAILABLE;
      let message = `OpenRouter service is not available (status: ${this.status}).`;
      if (this.status === "unconfigured") {
        errorCode = BaseErrorCode.CONFIGURATION_ERROR;
        message = "OpenRouter service is not configured (missing API key).";
      } else if (this.status === "error") {
        errorCode = BaseErrorCode.INITIALIZATION_FAILED;
        message = `OpenRouter service failed to initialize: ${this.initializationError?.message || "Unknown error"}`;
      }
      logger.error(
        `[${operation}] Attempted to use OpenRouter service when not ready.`,
        { ...context, status: this.status },
      );
      throw new McpError(errorCode, message, {
        operation,
        status: this.status,
        cause: this.initializationError,
      });
    }
    if (!this.client) {
      logger.error(
        `[${operation}] Service status is ready, but client is missing.`,
        { ...context },
      );
      throw new McpError(
        BaseErrorCode.INTERNAL_ERROR,
        "Internal inconsistency: OpenRouter client is missing despite ready status.",
        { operation },
      );
    }
  }

  /**
   * Creates a chat completion using the OpenRouter API.
   * This method can return either a single chat completion response or an async iterable stream
   * of chat completion chunks, based on the `stream` parameter.
   * It applies rate limiting and handles API errors by throwing `McpError`.
   *
   * @param {OpenRouterChatParams} params - The parameters for the chat completion request. This includes standard
   *                                        OpenAI parameters as well as OpenRouter-specific fields.
   * @param {RequestContext} context - The request context for logging, error handling, and rate limiting.
   * @returns {Promise<ChatCompletion | Stream<ChatCompletionChunk>>} A promise that resolves with either
   *          a `ChatCompletion` object (if `params.stream` is false or undefined) or a
   *          `Stream<ChatCompletionChunk>` (if `params.stream` is true). These types are from the `openai` SDK.
   * @throws {McpError} If the service is not ready, if rate limiting is exceeded, or if the API call fails.
   * @public
   */
  async chatCompletion(
    params: OpenRouterChatParams,
    context: RequestContext,
  ): Promise<ChatCompletion | Stream<ChatCompletionChunk>> {
    const operation = "OpenRouterProvider.chatCompletion";
    this.checkReady(operation, context);

    const isStreaming = params.stream === true;
    const standardParams: Partial<
      | ChatCompletionCreateParamsStreaming
      | ChatCompletionCreateParamsNonStreaming
    > = {
      model: params.model || config.llmDefaultModel,
      messages: params.messages,
      ...(params.temperature !== undefined ||
      config.llmDefaultTemperature !== undefined
        ? { temperature: params.temperature ?? config.llmDefaultTemperature }
        : {}),
      ...(params.top_p !== undefined || config.llmDefaultTopP !== undefined
        ? { top_p: params.top_p ?? config.llmDefaultTopP }
        : {}),
      ...(params.presence_penalty !== undefined
        ? { presence_penalty: params.presence_penalty }
        : {}),
      // Note: OpenAI SDK marks `max_tokens` as deprecated in favor of `max_completion_tokens` for their direct API.
      // However, OpenRouter API still uses `max_tokens`. We use `max_tokens` here for OpenRouter compatibility.
      ...(params.max_tokens !== undefined ||
      config.llmDefaultMaxTokens !== undefined
        ? { max_tokens: params.max_tokens ?? config.llmDefaultMaxTokens }
        : {}),
      ...(params.stream !== undefined && { stream: params.stream }),
      ...(params.tools !== undefined && { tools: params.tools }),
      ...(params.tool_choice !== undefined && {
        tool_choice: params.tool_choice,
      }),
      ...(params.response_format !== undefined && {
        response_format: params.response_format,
      }),
      ...(params.stop !== undefined && { stop: params.stop }),
      ...(params.seed !== undefined && { seed: params.seed }),
      ...(params.frequency_penalty !== undefined
        ? { frequency_penalty: params.frequency_penalty }
        : {}),
      ...(params.logit_bias !== undefined && { logit_bias: params.logit_bias }),
    };

    const extraBody: Record<string, any> = {};
    const standardKeys = new Set(Object.keys(standardParams));
    standardKeys.add("messages");

    for (const key in params) {
      if (
        Object.prototype.hasOwnProperty.call(params, key) &&
        !standardKeys.has(key)
      ) {
        extraBody[key] = (params as any)[key];
      }
    }

    if (extraBody.top_k === undefined && config.llmDefaultTopK !== undefined) {
      extraBody.top_k = config.llmDefaultTopK;
    }
    if (extraBody.min_p === undefined && config.llmDefaultMinP !== undefined) {
      extraBody.min_p = config.llmDefaultMinP;
    }

    if (extraBody.provider && typeof extraBody.provider === "object") {
      if (!extraBody.provider.sort) {
        extraBody.provider.sort = "throughput";
        logger.debug(
          `[${operation}] Merged 'sort: throughput' into existing provider preferences.`,
          context,
        );
      } else {
        logger.debug(
          `[${operation}] Provider 'sort' preference already exists, respecting provided value: ${extraBody.provider.sort}`,
          context,
        );
      }
    } else if (extraBody.provider === undefined) {
      extraBody.provider = { sort: "throughput" };
      logger.debug(
        `[${operation}] Added 'provider: { sort: 'throughput' }' preferences.`,
        context,
      );
    }

    const allEffectiveParams = { ...standardParams, ...extraBody };
    const sanitizedParams = sanitization.sanitizeForLogging(allEffectiveParams);
    logger.info(`[${operation}] Request received`, {
      ...context,
      params: sanitizedParams,
      streaming: isStreaming,
    });

    const rateLimitKey = context.requestId || "openrouter_default_key";
    try {
      rateLimiter.check(rateLimitKey, context);
      logger.debug(`[${operation}] Rate limit check passed`, {
        ...context,
        key: rateLimitKey,
      });
    } catch (error) {
      logger.warning(`[${operation}] Rate limit exceeded`, {
        ...context,
        key: rateLimitKey,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return await ErrorHandler.tryCatch(
      async () => {
        if (!this.client)
          throw new Error("Client missing despite ready status"); // Should be caught by checkReady

        const apiParams: any = { ...standardParams };
        if (Object.keys(extraBody).length > 0) {
          apiParams.extra_body = extraBody;
        }

        try {
          if (isStreaming) {
            const stream = await this.client.chat.completions.create(
              apiParams as ChatCompletionCreateParamsStreaming,
            );
            logger.info(`[${operation}] Streaming request successful`, {
              ...context,
              model: apiParams.model,
            });
            return stream;
          } else {
            const completion = await this.client.chat.completions.create(
              apiParams as ChatCompletionCreateParamsNonStreaming,
            );
            logger.info(`[${operation}] Non-streaming request successful`, {
              ...context,
              model: apiParams.model,
            });
            return completion;
          }
        } catch (error: any) {
          logger.error(`[${operation}] API call failed`, {
            ...context,
            error: error.message,
            status: error.status,
          });
          const errorDetails = {
            providerStatus: error.status,
            providerMessage: error.message,
            cause: error?.cause,
          };
          if (error.status === 401) {
            throw new McpError(
              BaseErrorCode.UNAUTHORIZED,
              `OpenRouter authentication failed: ${error.message}`,
              errorDetails,
            );
          } else if (error.status === 429) {
            throw new McpError(
              BaseErrorCode.RATE_LIMITED,
              `OpenRouter rate limit exceeded: ${error.message}`,
              errorDetails,
            );
          } else if (error.status === 402) {
            throw new McpError(
              BaseErrorCode.FORBIDDEN,
              `OpenRouter insufficient credits or payment required: ${error.message}`,
              errorDetails,
            );
          }
          throw new McpError(
            BaseErrorCode.INTERNAL_ERROR,
            `OpenRouter API error (${error.status}): ${error.message}`,
            errorDetails,
          );
        }
      },
      {
        operation,
        context,
        input: sanitizedParams,
        errorCode: BaseErrorCode.INTERNAL_ERROR,
      },
    );
  }

  /**
   * Lists available models from the OpenRouter API.
   * This method makes a direct `fetch` call to the `/models` endpoint, as the standard
   * OpenAI SDK does not support listing models from a custom base URL like OpenRouter's.
   *
   * @param {RequestContext} context - The request context for logging and error handling.
   * @returns {Promise<any>} A promise that resolves with the JSON response from the OpenRouter API,
   *                         typically an object containing a `data` array of model objects.
   * @throws {McpError} If the service is not ready, or if the API call fails (e.g., network error, non-OK response).
   * @public
   */
  async listModels(context: RequestContext): Promise<any> {
    const operation = "OpenRouterProvider.listModels";
    this.checkReady(operation, context);
    logger.info(`[${operation}] Request received`, context);

    return await ErrorHandler.tryCatch(
      async () => {
        try {
          const response = await fetch("https://openrouter.ai/api/v1/models", {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            const errorBody = await response.text();
            const errorDetails = {
              providerStatus: response.status,
              providerMessage: errorBody,
            };
            logger.error(`[${operation}] Failed to list models`, {
              ...context,
              ...errorDetails,
            });
            throw new McpError(
              BaseErrorCode.INTERNAL_ERROR,
              `OpenRouter list models API request failed with status ${response.status}.`,
              errorDetails,
            );
          }

          const models = await response.json();
          logger.info(`[${operation}] Successfully listed models`, context);
          return models;
        } catch (error: any) {
          logger.error(`[${operation}] Error listing models`, {
            ...context,
            error: error.message,
          });
          if (error instanceof McpError) {
            throw error;
          }
          throw new McpError(
            BaseErrorCode.SERVICE_UNAVAILABLE,
            `Network or unexpected error listing OpenRouter models: ${error.message}`,
            { cause: error },
          );
        }
      },
      {
        operation,
        context,
        errorCode: BaseErrorCode.INTERNAL_ERROR,
      },
    );
  }
}

/**
 * Singleton instance of the `OpenRouterProvider`.
 * This instance is initialized with the OpenRouter API key from the application configuration.
 * Consumers should check its `status` property or handle errors from its methods to ensure
 * the service is ready before use.
 * @type {OpenRouterProvider}
 */
const openRouterProviderInstance = new OpenRouterProvider(
  config.openrouterApiKey,
);

export { openRouterProviderInstance as openRouterProvider };

/**
 * Exporting the type of the OpenRouterProvider class for use in dependency injection
 * or for type hinting elsewhere in the application.
 * @typedef {OpenRouterProvider} OpenRouterProviderType
 */
export type { OpenRouterProvider };
