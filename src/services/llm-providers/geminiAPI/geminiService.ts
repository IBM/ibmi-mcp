/**
 * @fileoverview Service module for interacting with the Google Gemini API,
 * supporting Gemini 2.5 models and their features.
 * @module services/llm-providers/geminiAPI/geminiService
 */

import {
  ChatSession,
  Content,
  GenerateContentRequest,
  GenerationConfig,
  GenerativeModel,
  GoogleGenerativeAI,
  Part,
  SafetySetting,
  StartChatParams,
  Tool,
  ToolConfig,
  // Explicitly import RequestOptions if it's used beyond GoogleGenerativeAI constructor
  // import { RequestOptions } from '@google/generative-ai'; 
} from '@google/generative-ai';
import { BaseErrorCode, McpError } from '../../../types-global/errors';
import { logger, RequestContext, requestContextService } from '../../../utils';

/**
 * Extended GenerationConfig including thinking_config for Gemini 2.5 models.
 */
export interface GeminiGenerationConfig extends GenerationConfig {
  thinking_config?: {
    thinking_budget?: number; // Controls reasoning depth
  };
}

/**
 * Configuration for the GeminiService.
 */
export interface GeminiServiceConfig {
  apiKey: string;
  modelName?: string; // e.g., 'gemini-2.5-pro', 'gemini-2.5-flash-latest'
  vertexAiConfig?: {
    project: string;
    location: string;
  };
  defaultGenerationConfig?: GeminiGenerationConfig;
  defaultSystemInstruction?: string | Content | Part;
  defaultSafetySettings?: SafetySetting[];
  // defaultRequestOptions?: RequestOptions; // For passing timeout, apiVersion to GoogleGenerativeAI constructor
}

/**
 * Options for generating content, aligning with GenerateContentRequest.
 * 
 * **Caching Behavior with Gemini API:**
 * The Gemini API offers two caching mechanisms:
 * 1.  **Implicit Caching**:
 *     - Enabled by default for all Gemini 2.5 models (effective May 8th, 2025).
 *     - Automatic cost savings if a request hits the cache; no developer action needed to enable.
 *     - Minimum input token count for context caching: 1,024 for 2.5 Flash, 2,048 for 2.5 Pro.
 *     - To increase implicit cache hits:
 *       - Place large, common content at the beginning of your prompt.
 *       - Send requests with similar prefixes in a short amount of time.
 *     - Cache hit details can be found in the `usage_metadata` field of the API response.
 * 2.  **Explicit Caching (`cachedContent` option)**:
 *     - Used to guarantee cost savings, but requires manual management of caches.
 *     - This service supports *using* an explicit cache by providing a `cachedContent` identifier.
 *     - The `cachedContent` identifier must be obtained by creating a cache beforehand (e.g., via `gcloud` CLI or other SDK mechanisms).
 *     - This service currently does NOT provide methods for creating or managing the lifecycle of explicit caches.
 */
export interface GenerateContentOptions {
  generationConfig?: GeminiGenerationConfig;
  safetySettings?: SafetySetting[];
  tools?: Tool[];
  toolConfig?: ToolConfig;
  systemInstruction?: string | Content | Part;
  cachedContent?: string; // Identifier for EXPLICIT caching.
  // requestOptions?: RequestOptions; // For per-request options like timeout
}

/**
 * Service class for interacting with the Google Gemini API.
 * Updated for Gemini 2.5 models and features.
 */
export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private defaultModelName: string = 'gemini-2.5-flash-latest';

  /**
   * Creates an instance of GeminiService.
   * @param {GeminiServiceConfig} config - The configuration for the service.
   * @param {RequestContext} context - The request context for logging and error handling.
   * @throws {McpError} If API key is missing and not using Vertex AI.
   */
  constructor(private config: GeminiServiceConfig, private context: RequestContext) {
    // const clientOptions = config.defaultRequestOptions || {}; // If using per-client request options
    if (config.vertexAiConfig) {
      this.genAI = new GoogleGenerativeAI({
        vertexai: true,
        project: config.vertexAiConfig.project,
        location: config.vertexAiConfig.location,
      } as any /*, clientOptions */); 
      logger.info('GeminiService initialized with Vertex AI.', this.context);
    } else if (config.apiKey) {
      this.genAI = new GoogleGenerativeAI(config.apiKey /*, clientOptions */);
      logger.info('GeminiService initialized with API Key.', this.context);
    } else {
      throw new McpError(BaseErrorCode.CONFIGURATION_ERROR, 'Gemini API key is required or Vertex AI config must be provided.', { context: this.context });
    }
    
    const modelName = config.modelName || this.defaultModelName;
    this.model = this.genAI.getGenerativeModel({ 
      model: modelName,
      systemInstruction: config.defaultSystemInstruction,
      safetySettings: config.defaultSafetySettings,
      generationConfig: config.defaultGenerationConfig,
    });
    logger.info(`GeminiService model set to: ${modelName}`, this.context);
  }

  private prepareContents(prompt: string | Content | Content[]): Content[] {
    if (typeof prompt === 'string') {
      return [{ role: 'user', parts: [{ text: prompt }] }];
    }
    if (Array.isArray(prompt)) {
      return prompt;
    }
    return [prompt]; // Single Content object
  }

  /**
   * Generates text content based on a prompt, supporting Gemini 2.5 features.
   * @param {string | Content | Content[]} prompt - The prompt or content array to generate text from.
   * @param {GenerateContentOptions} [options] - Optional parameters including generationConfig, tools, systemInstruction, cachedContent, etc.
   * @param {RequestContext} [parentContext] - The parent request context.
   * @returns {Promise<string>} The generated text.
   * @throws {McpError} If the API call fails.
   */
  async generateText(
    prompt: string | Content | Content[],
    options?: GenerateContentOptions,
    parentContext?: RequestContext,
  ): Promise<string> {
    const baseContext = parentContext || this.context;
    const operationContext: RequestContext = {
      ...baseContext,
      operation: 'GeminiService.generateText',
      metadata: {
        ...(typeof baseContext.metadata === 'object' && baseContext.metadata !== null ? baseContext.metadata : {}),
        model: this.config.modelName || this.defaultModelName,
        optionsUsed: options ? Object.keys(options) : [],
      },
    };
    logger.debug(`Generating text with prompt: ${typeof prompt === 'string' ? prompt : 'Content object'}`, operationContext);

    const request: GenerateContentRequest = {
      contents: this.prepareContents(prompt),
      ...(options?.generationConfig && { generationConfig: options.generationConfig }),
      ...(options?.safetySettings && { safetySettings: options.safetySettings }),
      ...(options?.tools && { tools: options.tools }),
      ...(options?.toolConfig && { toolConfig: options.toolConfig }),
      ...(options?.systemInstruction && { systemInstruction: options.systemInstruction }),
      ...(options?.cachedContent && { cachedContent: options.cachedContent }), // Support for explicit caching
    };
    
    // Merge with default generation config if not fully overridden
    if (this.config.defaultGenerationConfig && request.generationConfig) {
        request.generationConfig = { ...this.config.defaultGenerationConfig, ...request.generationConfig };
    } else if (this.config.defaultGenerationConfig && !request.generationConfig) { // Ensure default is applied if no options.genConfig
        request.generationConfig = this.config.defaultGenerationConfig;
    }

    try {
      // const requestOptions = options?.requestOptions; // If per-request options like timeout are needed
      const result = await this.model.generateContent(request /*, requestOptions */);
      const response = result.response;
      // TODO: Inspect result.response.usageMetadata for cache hit details (implicit caching)
      const text = response.text();
      logger.info('Text generation successful.', { ...operationContext, usageMetadata: response.usageMetadata });
      return text;
    } catch (error) {
      logger.error('Error generating text from Gemini API', error as Error, operationContext);
      throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Gemini API error during text generation: ${(error as Error).message}`, { context: operationContext, cause: error });
    }
  }

  /**
   * Generates text content as a stream, supporting Gemini 2.5 features.
   * @param {string | Content | Content[]} prompt - The prompt or content array to generate text from.
   * @param {GenerateContentOptions} [options] - Optional parameters including generationConfig, tools, systemInstruction, cachedContent, etc.
   * @param {RequestContext} [parentContext] - The parent request context.
   * @returns {Promise<AsyncIterable<string>>} An async iterable stream of generated text chunks.
   * @throws {McpError} If the API call fails.
   */
  async generateTextStream(
    prompt: string | Content | Content[],
    options?: GenerateContentOptions,
    parentContext?: RequestContext,
  ): Promise<AsyncIterable<string>> {
    const baseContext = parentContext || this.context;
    const operationContext: RequestContext = {
      ...baseContext,
      operation: 'GeminiService.generateTextStream',
      metadata: {
        ...(typeof baseContext.metadata === 'object' && baseContext.metadata !== null ? baseContext.metadata : {}),
        model: this.config.modelName || this.defaultModelName,
        optionsUsed: options ? Object.keys(options) : [],
      },
    };
    logger.debug(`Generating text stream with prompt: ${typeof prompt === 'string' ? prompt : 'Content object'}`, operationContext);

    const request: GenerateContentRequest = {
      contents: this.prepareContents(prompt),
      ...(options?.generationConfig && { generationConfig: options.generationConfig }),
      ...(options?.safetySettings && { safetySettings: options.safetySettings }),
      ...(options?.tools && { tools: options.tools }),
      ...(options?.toolConfig && { toolConfig: options.toolConfig }),
      ...(options?.systemInstruction && { systemInstruction: options.systemInstruction }),
      ...(options?.cachedContent && { cachedContent: options.cachedContent }), // Support for explicit caching
    };

    if (this.config.defaultGenerationConfig && request.generationConfig) {
        request.generationConfig = { ...this.config.defaultGenerationConfig, ...request.generationConfig };
    } else if (this.config.defaultGenerationConfig && !request.generationConfig) { // Ensure default is applied
        request.generationConfig = this.config.defaultGenerationConfig;
    }

    try {
      // const requestOptions = options?.requestOptions; // If per-request options like timeout are needed
      const streamResult = await this.model.generateContentStream(request /*, requestOptions */);
      logger.info('Text generation stream started.', operationContext);
      
      async function* textStreamHelper(): AsyncIterable<string> {
        // TODO: Expose usageMetadata from streamResult.response (Promise) after stream completion if needed.
        for await (const chunk of streamResult.stream) {
          // TODO: Handle function call parts if present in chunk.content.parts
          if (chunk && typeof chunk.text === 'function') {
            const textPart = chunk.text();
            if (textPart) {
              yield textPart;
            }
          }
        }
      }
      return textStreamHelper();
    } catch (error) {
      logger.error('Error generating text stream from Gemini API', error as Error, operationContext);
      throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Gemini API error during streaming text generation: ${(error as Error).message}`, { context: operationContext, cause: error });
    }
  }

  /**
   * Starts a new chat session.
   * @param {StartChatParams} [startChatParams] - Optional parameters to start the chat. This can include history, systemInstruction, etc.
   * @param {RequestContext} [parentContext] - The parent request context.
   * @returns {ChatSession} The chat session object.
   */
  startChat(startChatParams?: StartChatParams, parentContext?: RequestContext): ChatSession {
    const baseContext = parentContext || this.context;
    const operationContext: RequestContext = {
      ...baseContext,
      operation: 'GeminiService.startChat',
      metadata: {
        ...(typeof baseContext.metadata === 'object' && baseContext.metadata !== null ? baseContext.metadata : {}),
        model: this.config.modelName || this.defaultModelName,
        startParamsUsed: startChatParams ? Object.keys(startChatParams) : [],
      },
    };
    logger.debug('Starting new chat session.', operationContext);
    
    return this.model.startChat(startChatParams);
  }

  /**
   * Sends a message in an existing chat session and gets the response.
   * @param {ChatSession} chatSession - The active chat session.
   * @param {string | Part | (string | Part)[]} message - The message parts to send.
   * @param {RequestContext} [parentContext] - The parent request context.
   * @returns {Promise<string>} The generated text response from the chat.
   * @throws {McpError} If the API call fails.
   */
  async sendMessageInChat(
    chatSession: ChatSession, 
    message: string | Part | (string | Part)[], 
    parentContext?: RequestContext
  ): Promise<string> {
    const baseContext = parentContext || this.context;
    const operationContext: RequestContext = {
      ...baseContext,
      operation: 'GeminiService.sendMessageInChat',
      metadata: {
        ...(typeof baseContext.metadata === 'object' && baseContext.metadata !== null ? baseContext.metadata : {}),
      }
    };
    logger.debug(`Sending message in chat: ${typeof message === 'string' ? message : 'Part(s) object'}`, operationContext);

    try {
      let messageToSend: string | (string | Part)[];
      if (typeof message === 'string' || Array.isArray(message)) {
        messageToSend = message;
      } else { 
        messageToSend = [message];
      }
      const result = await chatSession.sendMessage(messageToSend);
      const response = result.response;
      // TODO: Handle function calls if present in response.candidates[0].content.parts
      // TODO: Inspect result.response.usageMetadata for cache hit details (implicit caching)
      const text = response.text();
      logger.info('Chat message sent and response received successfully.', { ...operationContext, usageMetadata: response.usageMetadata });
      return text;
    } catch (error) {
      logger.error('Error sending message in chat via Gemini API', error as Error, operationContext);
      throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Gemini API error during chat message: ${(error as Error).message}`, { context: operationContext, cause: error });
    }
  }

  /**
   * Sends a message in an existing chat session and gets the response as a stream.
   * @param {ChatSession} chatSession - The active chat session.
   * @param {string | Part | (string | Part)[]} message - The message parts to send.
   * @param {RequestContext} [parentContext] - The parent request context.
   * @returns {Promise<AsyncIterable<string>>} An async iterable stream of generated text chunks.
   * @throws {McpError} If the API call fails.
   */
  async sendMessageInChatStream(
    chatSession: ChatSession, 
    message: string | Part | (string | Part)[], 
    parentContext?: RequestContext
  ): Promise<AsyncIterable<string>> {
    const baseContext = parentContext || this.context;
    const operationContext: RequestContext = {
      ...baseContext,
      operation: 'GeminiService.sendMessageInChatStream',
      metadata: {
        ...(typeof baseContext.metadata === 'object' && baseContext.metadata !== null ? baseContext.metadata : {}),
      }
    };
    logger.debug(`Sending message stream in chat: ${typeof message === 'string' ? message : 'Part(s) object'}`, operationContext);
    
    try {
      let messageToSend: string | (string | Part)[];
      if (typeof message === 'string' || Array.isArray(message)) {
        messageToSend = message;
      } else { 
        messageToSend = [message];
      }
      const streamResult = await chatSession.sendMessageStream(messageToSend);
      logger.info('Chat message stream started.', operationContext);

      async function* textStreamHelper(): AsyncIterable<string> {
        // TODO: Expose usageMetadata from streamResult.response (Promise) after stream completion if needed.
        for await (const chunk of streamResult.stream) {
          // TODO: Handle function call parts if present in chunk.content.parts
          if (chunk && typeof chunk.text === 'function') {
            const textPart = chunk.text();
            if (textPart) {
              yield textPart;
            }
          }
        }
      }
      return textStreamHelper();
    } catch (error) {
      logger.error('Error streaming chat message via Gemini API', error as Error, operationContext);
      throw new McpError(BaseErrorCode.INTERNAL_ERROR, `Gemini API error during streaming chat message: ${(error as Error).message}`, { context: operationContext, cause: error });
    }
  }
}

/**
 * Example usage (illustrative, requires API key and proper setup):
 *
 * async function main() {
 *   const apiKey = process.env.GEMINI_API_KEY;
 *   if (!apiKey) {
 *     console.error("Missing GEMINI_API_KEY environment variable.");
 *     return;
 *   }
 *
 *   const rootContext = requestContextService.createRequestContext({ operation: 'GeminiServiceExampleMain' });
 *   const geminiService = new GeminiService({ 
 *      apiKey, 
 *      modelName: 'gemini-2.5-flash-latest',
 *      defaultSystemInstruction: { role: 'system', parts: [{text: 'You are a helpful AI assistant.'}] },
 *      defaultGenerationConfig: { temperature: 0.7, thinking_config: { thinking_budget: 512 } }
 *   }, rootContext);
 *
 *   // Text generation with system instruction and thinking budget
 *   try {
 *     const textResponse = await geminiService.generateText(
 *       "Explain the concept of zero-knowledge proofs in simple terms.",
 *       { 
 *         systemInstruction: "Explain like I'm five.", // This will be a Content object: { role: 'user', parts: [{text: "Explain like I'm five."}]} if not structured
 *                                                     // Or should be: { role: 'system', parts: [{text: "Explain like I'm five."}]}
 *                                                     // The SDK expects systemInstruction to be string | Content | Part.
 *                                                     // If string, it's likely treated as text for a user part if not specified.
 *                                                     // For true system instruction, use Content with role 'system' or the model's default.
 *         generationConfig: { temperature: 0.5, thinking_config: { thinking_budget: 1024 } } 
 *       },
 *       rootContext
 *     );
 *     console.log("Text Generation Response:", textResponse);
 *   } catch (e) {
 *     const err = e as McpError;
 *     console.error("Text Generation Error:", err.message, err.details || '');
 *   }
 *
 *   // ... (rest of the example)
 * }
 */
