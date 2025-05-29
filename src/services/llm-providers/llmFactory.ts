/**
 * @fileoverview Factory for creating LLM client instances.
 * Provides a centralized way to instantiate clients for LLM providers
 * like OpenRouter, handling API key configuration and basic client setup.
 * @module src/services/llm-providers/llmFactory
 */

import OpenAI from "openai";
import { config } from "../../config/index.js";
import { BaseErrorCode, McpError } from "../../types-global/errors.js";
import { logger, RequestContext } from "../../utils/index.js";

/**
 * Defines the supported LLM providers.
 */
export type LlmProviderType = "openrouter";

/**
 * Options for configuring the OpenRouter client.
 */
export interface OpenRouterClientOptions {
  apiKey?: string;
  baseURL?: string;
  siteUrl?: string;
  siteName?: string;
}

/**
 * Union type for all LLM client options.
 */
export type LlmClientOptions = OpenRouterClientOptions;

/**
 * LLM Factory class to create and configure LLM clients.
 */
class LlmFactory {
  /**
   * Creates and returns an LLM client instance for the specified provider.
   *
   * @param provider - The LLM provider to create a client for.
   * @param context - The request context for logging.
   * @param options - Optional provider-specific configuration options.
   * @returns A Promise resolving to an instance of OpenAI (for OpenRouter).
   * @throws {McpError} If the provider is unsupported or API key/config is missing.
   */
  public async getLlmClient(
    provider: LlmProviderType,
    context: RequestContext,
    options?: LlmClientOptions,
  ): Promise<OpenAI> {
    const operation = `LlmFactory.getLlmClient.${provider}`;
    logger.info(`[${operation}] Requesting LLM client`, {
      ...context,
      provider,
    });

    switch (provider) {
      case "openrouter":
        return this.createOpenRouterClient(
          context,
          options as OpenRouterClientOptions,
        );
      // No default case needed if LlmProviderType only allows 'openrouter'
      // However, to be safe and handle potential future extensions or direct calls with invalid provider:
      default:
        // This part of the code should ideally be unreachable if LlmProviderType is strictly 'openrouter'.
        // If it's reached, it implies an internal logic error or misuse.
        const exhaustiveCheck: never = provider; // Ensures all LlmProviderType cases are handled
        logger.error(
          `[${operation}] Unsupported LLM provider requested: ${exhaustiveCheck}`,
          context,
        );
        throw new McpError(
          BaseErrorCode.CONFIGURATION_ERROR,
          `Unsupported LLM provider: ${provider}`,
          { operation, provider: exhaustiveCheck },
        );
    }
  }

  /**
   * Creates an OpenAI client configured for OpenRouter.
   * @private
   */
  private createOpenRouterClient(
    context: RequestContext,
    options?: OpenRouterClientOptions,
  ): OpenAI {
    const operation = "LlmFactory.createOpenRouterClient";
    const apiKey = options?.apiKey || config.openrouterApiKey;
    const baseURL = options?.baseURL || "https://openrouter.ai/api/v1";
    const siteUrl = options?.siteUrl || config.openrouterAppUrl;
    const siteName = options?.siteName || config.openrouterAppName;

    if (!apiKey) {
      logger.error(`[${operation}] OPENROUTER_API_KEY is not set.`, context);
      throw new McpError(
        BaseErrorCode.CONFIGURATION_ERROR,
        "OpenRouter API key is not configured.",
        { operation },
      );
    }

    try {
      const client = new OpenAI({
        baseURL,
        apiKey,
        defaultHeaders: {
          "HTTP-Referer": siteUrl,
          "X-Title": siteName,
        },
      });
      logger.info(
        `[${operation}] OpenRouter client created successfully.`,
        context,
      );
      return client;
    } catch (error: any) {
      logger.error(`[${operation}] Failed to create OpenRouter client`, {
        ...context,
        error: error.message,
      });
      throw new McpError(
        BaseErrorCode.INITIALIZATION_FAILED,
        `Failed to initialize OpenRouter client: ${error.message}`,
        { operation, cause: error },
      );
    }
  }
}

/**
 * Singleton instance of the LlmFactory.
 */
export const llmFactory = new LlmFactory();
