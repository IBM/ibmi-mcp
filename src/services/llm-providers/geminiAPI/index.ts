/**
 * @fileoverview Barrel file for the Gemini API service module.
 * Exports the GeminiService class and related types for easy consumption.
 * @module services/llm-providers/geminiAPI/index
 */

export { 
  GeminiService,
  type GeminiServiceConfig,
  type GeminiGenerationConfig,
  type GenerateContentOptions 
} from './geminiService';
