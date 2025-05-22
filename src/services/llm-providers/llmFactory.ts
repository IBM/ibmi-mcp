/**
 * @fileoverview Factory for creating LLM client instances.
 * Provides a centralized way to instantiate clients for different LLM providers
 * like OpenRouter and Google Gemini, handling API key configuration and
 * basic client setup.
 * @module src/services/llm-providers/llmFactory
 */

import {
  GoogleGenAI
} from '@google/genai'; // Updated import path
import OpenAI from 'openai';
import { config } from '../../config/index.js';
import { BaseErrorCode, McpError } from '../../types-global/errors.js';
import { logger, RequestContext } from '../../utils/index.js';

/**
 * Defines the supported LLM providers.
 */
export type LlmProviderType = 'openrouter' | 'gemini'; // Gemini integration wasn't working correctly so I've removed it for now

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
 * Options for configuring the Gemini client using @google/genai.
 * The factory will return a GoogleGenAI instance.
 * Vertex AI specific options are included here.
 */
export interface GeminiClientOptions {
  apiKey?: string; // For standard Gemini API key auth
  useVertexAi?: boolean;
  project?: string; // Required if useVertexAi is true
  location?: string; // Required if useVertexAi is true
  // modelName, systemInstruction, etc., are now handled by the consuming service (GeminiService)
  // when making specific API calls (e.g., generateContent, startChat)
}

/**
 * Union type for all LLM client options.
 */
export type LlmClientOptions = OpenRouterClientOptions | GeminiClientOptions;

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
   * @returns A Promise resolving to an instance of OpenAI (for OpenRouter)
   *          or GoogleGenAI (for Gemini).
   * @throws {McpError} If the provider is unsupported or API key/config is missing.
   */
  public async getLlmClient(
    provider: LlmProviderType,
    context: RequestContext,
    options?: LlmClientOptions,
  ): Promise<OpenAI | GoogleGenAI> { // Return type changed for Gemini
    const operation = `LlmFactory.getLlmClient.${provider}`;
    logger.info(`[${operation}] Requesting LLM client`, { ...context, provider });

    switch (provider) {
      case 'openrouter':
        return this.createOpenRouterClient(context, options as OpenRouterClientOptions);
      case 'gemini':
        return this.createGeminiClient(context, options as GeminiClientOptions);
      default:
        logger.error(`[${operation}] Unsupported LLM provider requested: ${provider}`, context);
        throw new McpError(
          BaseErrorCode.CONFIGURATION_ERROR,
          `Unsupported LLM provider: ${provider}`,
          { operation, provider },
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
    const operation = 'LlmFactory.createOpenRouterClient';
    const apiKey = options?.apiKey || config.openrouterApiKey;
    const baseURL = options?.baseURL || 'https://openrouter.ai/api/v1';
    const siteUrl = options?.siteUrl || config.openrouterAppUrl;
    const siteName = options?.siteName || config.openrouterAppName;

    if (!apiKey) {
      logger.error(`[${operation}] OPENROUTER_API_KEY is not set.`, context);
      throw new McpError(
        BaseErrorCode.CONFIGURATION_ERROR,
        'OpenRouter API key is not configured.',
        { operation },
      );
    }

    try {
      const client = new OpenAI({
        baseURL,
        apiKey,
        defaultHeaders: {
          'HTTP-Referer': siteUrl,
          'X-Title': siteName,
        },
      });
      logger.info(`[${operation}] OpenRouter client created successfully.`, context);
      return client;
    } catch (error: any) {
      logger.error(`[${operation}] Failed to create OpenRouter client`, { ...context, error: error.message });
      throw new McpError(
        BaseErrorCode.INITIALIZATION_FAILED,
        `Failed to initialize OpenRouter client: ${error.message}`,
        { operation, cause: error },
      );
    }
  }

  /**
   * Creates a GoogleGenAI client for Gemini, supporting standard API key or Vertex AI.
   * @private
   */
  private createGeminiClient(
    context: RequestContext,
    options?: GeminiClientOptions,
  ): GoogleGenAI {
    const operation = 'LlmFactory.createGeminiClient';

    if (options?.useVertexAi) {
      if (!options.project || !options.location) {
        logger.error(`[${operation}] Vertex AI project and location are required when useVertexAi is true.`, context);
        throw new McpError(
          BaseErrorCode.CONFIGURATION_ERROR,
          'Vertex AI project and location must be configured if useVertexAi is true.',
          { operation },
        );
      }
      try {
        // For Vertex AI, apiKey in GoogleGenAI constructor is optional if ADC are set up.
        // The SDK handles ADC automatically if apiKey is not provided.
        const clientConfig: { project: string; location: string; apiKey?: string; vertexai: true } = {
          project: options.project,
          location: options.location,
          vertexai: true,
        };
        if (options.apiKey) { // Allow API key to be passed for Vertex if specific auth needed
            clientConfig.apiKey = options.apiKey;
        }

        const genAI = new GoogleGenAI(clientConfig);
        logger.info(`[${operation}] GoogleGenAI client for Vertex AI created successfully.`, context);
        return genAI;
      } catch (error: any) {
        logger.error(`[${operation}] Failed to create Gemini client for Vertex AI`, { ...context, error: error.message });
        throw new McpError(
          BaseErrorCode.INITIALIZATION_FAILED,
          `Failed to initialize Gemini client for Vertex AI: ${error.message}`,
          { operation, cause: error },
        );
      }
    } else {
      // Standard Gemini API key authentication
      const apiKey = options?.apiKey || config.geminiApiKey;
      if (!apiKey) {
        logger.error(`[${operation}] GEMINI_API_KEY is not set for standard API usage.`, context);
        throw new McpError(
          BaseErrorCode.CONFIGURATION_ERROR,
          'Gemini API key is not configured for standard API usage.',
          { operation },
        );
      }
      try {
        const genAI = new GoogleGenAI({ apiKey });
        logger.info(`[${operation}] GoogleGenAI client (standard API key) created successfully.`, context);
        return genAI;
      } catch (error: any) {
        logger.error(`[${operation}] Failed to create Gemini client (standard API key)`, { ...context, error: error.message });
        throw new McpError(
          BaseErrorCode.INITIALIZATION_FAILED,
          `Failed to initialize Gemini client (standard API key): ${error.message}`,
          { operation, cause: error },
        );
      }
    }
  }
}

/**
 * Singleton instance of the LlmFactory.
 */
export const llmFactory = new LlmFactory();
