/**
 * @fileoverview Provides a service class (`OpenRouterProvider`) for interacting with the
 * OpenRouter API, using the OpenAI SDK for chat completions. It handles API key
 * configuration, default parameters, rate limiting, model-specific parameter adjustments,
 * and error handling.
 * @module src/services/llm-providers/openRouter/openRouterProvider
 */
import OpenAI from "openai"; // This will be the type, actual instance from factory
import {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";
import { Stream } from "openai/streaming";
import { config } from "../../../config/index.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { ErrorHandler } from "../../../utils/internal/errorHandler.js";
import { logger } from "../../../utils/internal/logger.js";
import {
  OperationContext,
  RequestContext,
  requestContextService,
} from "../../../utils/internal/requestContext.js";
import { rateLimiter } from "../../../utils/security/rateLimiter.js";
import { sanitization } from "../../../utils/security/sanitization.js";
import { llmFactory, OpenRouterClientOptions } from "../llmFactory.js"; // Import factory

// Note: OpenRouter recommends setting HTTP-Referer (e.g., config.openrouterAppUrl)
// and X-Title (e.g., config.openrouterAppName) headers.
// The llmFactory.ts already handles this for OpenRouter client creation.

/**
 * Defines the parameters for an OpenRouter chat completion request.
 * This type extends standard OpenAI chat completion parameters and includes
 * OpenRouter-specific fields.
 *
 * @property top_k - OpenRouter specific: Sample from the k most likely next tokens.
 * @property min_p - OpenRouter specific: Minimum probability for a token to be considered.
 * @property transforms - OpenRouter specific: Apply transformations to the request or response.
 * @property models - OpenRouter specific: A list of models to use, often for fallback or routing.
 * @property route - OpenRouter specific: Specifies routing strategy, e.g., 'fallback'.
 * @property provider - OpenRouter specific: Provider-specific parameters or routing preferences.
 * @property stream - If true, the response will be a stream of `ChatCompletionChunk` objects.
 *   If false or undefined, a single `ChatCompletion` object is returned.
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
};

/**
 * Service class for interacting with the OpenRouter API.
 * Uses the OpenAI SDK for chat completions, configured for OpenRouter.
 * Handles API key management, default headers, model-specific parameter adjustments,
 * and provides methods for chat completions and listing models.
 */
class OpenRouterProvider {
  /**
   * The OpenAI SDK client instance configured for OpenRouter.
   * @private
   */
  private client?: OpenAI; // Stays as OpenAI type
  /**
   * Current status of the OpenRouter service.
   * - `unconfigured`: API key is missing.
   * - `initializing`: Constructor is running.
   * - `ready`: Client initialized successfully and service is usable.
   * - `error`: An error occurred during initialization.
   */
  public status: "unconfigured" | "initializing" | "ready" | "error";
  /**
   * Stores any error that occurred during client initialization.
   * @private
   */
  private initializationError: Error | null = null;

  /**
   * Constructs an `OpenRouterProvider` instance.
   * Initializes the OpenAI client for OpenRouter if an API key is provided.
   * Sets default headers required by OpenRouter.
   * @param apiKey - The OpenRouter API key. If undefined, the service remains 'unconfigured'.
   * @param parentOpContext - Optional parent operation context for linked logging.
   */
  constructor(
    options?: OpenRouterClientOptions,
    parentOpContext?: OperationContext,
  ) {
    const operationName = parentOpContext?.operation
      ? `${parentOpContext.operation}.OpenRouterProvider.constructor`
      : "OpenRouterProvider.constructor";
    const opContext = requestContextService.createRequestContext({
      operation: operationName,
      parentRequestId: parentOpContext?.requestId,
    });
    this.status = "initializing";

    // The factory will use config.openrouterApiKey if options.apiKey is not provided.
    // If neither is available, the factory will throw a CONFIGURATION_ERROR.
    // The 'unconfigured' status here might become less relevant if factory handles all key checks.
    // However, we can keep it for cases where the service is instantiated without attempting client creation immediately.
    if (!options?.apiKey && !config.openrouterApiKey) {
      this.status = "unconfigured";
      logger.warning(
        "OpenRouter API key not provided in options or global config. Service is unconfigured.",
        { ...opContext, service: "OpenRouterProvider" },
      );
      // Early return if no key is available at all, factory would fail anyway.
      // Or, let the factory attempt and catch the error. For now, let's try to initialize.
    }

    llmFactory
      .getLlmClient("openrouter", opContext, options)
      .then((client) => {
        this.client = client as OpenAI; // Factory returns OpenAI for 'openrouter'
        this.status = "ready";
        logger.info("OpenRouter Service Initialized and Ready via LlmFactory", {
          ...opContext,
          service: "OpenRouterProvider",
        });
      })
      .catch((error) => {
        this.status = "error";
        this.initializationError =
          error instanceof Error
            ? error
            : new McpError(BaseErrorCode.INITIALIZATION_FAILED, String(error));
        logger.error("Failed to initialize OpenRouter client via LlmFactory", {
          ...opContext,
          service: "OpenRouterProvider",
          error: this.initializationError.message,
        });
      });
  }

  /**
   * Checks if the service is ready to make API calls.
   * @param operation - The name of the operation attempting to use the service.
   * @param context - The request context for logging.
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
      // This should ideally not happen if status is 'ready', but as a safeguard:
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
   * Can return either a single response or a stream of chunks.
   * Applies rate limiting and handles model-specific parameter adjustments.
   *
   * @param params - Parameters for the chat completion request.
   * @param context - Request context for logging, error handling, and rate limiting.
   * @returns A promise resolving with either a `ChatCompletion` or a `Stream<ChatCompletionChunk>`.
   * @throws {McpError} If service not ready, rate limit exceeded, or API call fails.
   */
  async chatCompletion(
    params: OpenRouterChatParams,
    context: RequestContext,
  ): Promise<ChatCompletion | Stream<ChatCompletionChunk>> {
    const operation = "OpenRouterProvider.chatCompletion";
    this.checkReady(operation, context);

    const isStreaming = params.stream === true;
    const effectiveModelId = params.model || config.llmDefaultModel;

    const standardParams: Partial<
      | ChatCompletionCreateParamsStreaming
      | ChatCompletionCreateParamsNonStreaming
    > = {
      model: effectiveModelId,
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
        !standardKeys.has(key) &&
        key !== "max_tokens"
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
      if (!extraBody.provider.sort) extraBody.provider.sort = "throughput";
    } else if (extraBody.provider === undefined) {
      extraBody.provider = { sort: "throughput" };
    }

    // Conditional logic for max_tokens vs max_completion_tokens
    // Certain underlying models (e.g., newer OpenAI models like the o1 series)
    // may require `max_completion_tokens` instead of `max_tokens`.
    // This client sends `max_completion_tokens` in `extra_body` for these models if a limit is specified.
    // For other models, `max_tokens` is used as a standard parameter.
    const modelsRequiringMaxCompletionTokens = ["openai/o1", "openai/gpt-4.1"];
    const needsMaxCompletionTokens = modelsRequiringMaxCompletionTokens.some(
      (modelPrefix) => effectiveModelId.startsWith(modelPrefix),
    );
    const effectiveMaxTokensValue =
      params.max_tokens ?? config.llmDefaultMaxTokens;

    if (effectiveMaxTokensValue !== undefined) {
      if (needsMaxCompletionTokens) {
        extraBody.max_completion_tokens = effectiveMaxTokensValue;
        logger.info(
          `[${operation}] Using 'max_completion_tokens: ${effectiveMaxTokensValue}' for model ${effectiveModelId} (sent via extra_body).`,
          context,
        );
      } else {
        // For models not in the list, or if OpenRouter handles the mapping transparently,
        // send max_tokens as a standard parameter.
        standardParams.max_tokens = effectiveMaxTokensValue;
        logger.info(
          `[${operation}] Using 'max_tokens: ${effectiveMaxTokensValue}' for model ${effectiveModelId}.`,
          context,
        );
      }
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
          throw new Error("Client missing despite ready status");

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
            `OpenRouter API error (${error.status || "unknown status"}): ${error.message}`,
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
   * Makes a direct `fetch` call to the `/models` endpoint.
   *
   * @param context - Request context for logging and error handling.
   * @returns A promise resolving with the JSON response from the OpenRouter API.
   * @throws {McpError} If the service is not ready, or if the API call fails.
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
              // Authorization header might be needed if OpenRouter changes their /models endpoint access
              // "Authorization": `Bearer ${this.client?.apiKey}`, // apiKey is private on OpenAI client
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
 * Initialized with the OpenRouter API key from application configuration.
 */
// Update instantiation to pass options if needed, or rely on factory's use of global config.
// For a singleton, it usually relies on global config.
// If the constructor now takes OpenRouterClientOptions, and we want the singleton
// to use global config, we'd pass undefined or an empty object for options.
const openRouterProviderInstance = new OpenRouterProvider(
  undefined, // Or { apiKey: config.openrouterApiKey } if we want to be explicit
  // but factory already checks config.openrouterApiKey
);

export { openRouterProviderInstance as openRouterProvider };

/**
 * Exporting the type of the OpenRouterProvider class for use in dependency injection
 * or for type hinting elsewhere in the application.
 */
export type { OpenRouterProvider };
