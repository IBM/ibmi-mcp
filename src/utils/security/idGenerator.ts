/**
 * @fileoverview Provides a utility class `IdGenerator` for creating customizable, prefixed unique identifiers,
 * and a standalone `generateUUID` function for generating standard UUIDs.
 * The `IdGenerator` supports entity-specific prefixes, custom character sets, and lengths.
 * @module utils/security/idGenerator
 */
import { randomBytes, randomUUID as cryptoRandomUUID } from "crypto";
import { BaseErrorCode, McpError } from "../../types-global/errors.js";
import { logger } from "../index.js"; // For potential future logging, though currently unused in this file directly.

/**
 * Defines the structure for configuring entity prefixes.
 * Keys are entity type names (e.g., "project", "task"), and values are their corresponding ID prefixes (e.g., "PROJ", "TASK").
 * @typedef {object} EntityPrefixConfig
 * @property {string} [entityType] - The prefix string for a given entity type.
 */
export interface EntityPrefixConfig {
  [key: string]: string;
}

/**
 * Defines options for customizing ID generation.
 * @typedef {object} IdGenerationOptions
 * @property {number} [length] - The length of the random part of the ID.
 * @property {string} [separator] - The separator character between a prefix and the random part.
 * @property {string} [charset] - The character set to use for generating the random part.
 */
export interface IdGenerationOptions {
  length?: number;
  separator?: string;
  charset?: string;
}

/**
 * A generic ID Generator class for creating and managing unique, prefixed identifiers.
 * It allows for defining custom prefixes for different entity types, generating random strings,
 * and validating/normalizing generated IDs.
 * @class IdGenerator
 */
export class IdGenerator {
  /**
   * Default character set for the random part of the ID.
   * @private
   * @static
   * @readonly
   * @type {string}
   */
  private static DEFAULT_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  /**
   * Default separator character between prefix and random part.
   * @private
   * @static
   * @readonly
   * @type {string}
   */
  private static DEFAULT_SEPARATOR = "_";
  /**
   * Default length for the random part of the ID.
   * @private
   * @static
   * @readonly
   * @type {number}
   */
  private static DEFAULT_LENGTH = 6;

  /**
   * Stores the mapping of entity types to their prefixes.
   * @private
   * @type {EntityPrefixConfig}
   */
  private entityPrefixes: EntityPrefixConfig = {};
  /**
   * Stores a reverse mapping from prefixes (case-insensitive) to entity types for quick lookup.
   * @private
   * @type {Record<string, string>}
   */
  private prefixToEntityType: Record<string, string> = {};

  /**
   * Constructs an `IdGenerator` instance.
   * @param {EntityPrefixConfig} [entityPrefixes={}] - An initial map of entity types to their prefixes.
   */
  constructor(entityPrefixes: EntityPrefixConfig = {}) {
    this.setEntityPrefixes(entityPrefixes);
  }

  /**
   * Sets or updates the entity prefix configuration and rebuilds the internal reverse lookup map.
   * @param {EntityPrefixConfig} entityPrefixes - A map where keys are entity type names and values are their desired ID prefixes.
   * @public
   */
  public setEntityPrefixes(entityPrefixes: EntityPrefixConfig): void {
    this.entityPrefixes = { ...entityPrefixes };

    this.prefixToEntityType = Object.entries(this.entityPrefixes).reduce(
      (acc, [type, prefix]) => {
        acc[prefix] = type; // Store original case for potential reconstruction if needed
        acc[prefix.toLowerCase()] = type; // Store lowercase for case-insensitive lookup
        return acc;
      },
      {} as Record<string, string>,
    );
  }

  /**
   * Retrieves a copy of the current entity prefix configuration.
   * @returns {EntityPrefixConfig} The current entity prefix configuration.
   * @public
   */
  public getEntityPrefixes(): EntityPrefixConfig {
    return { ...this.entityPrefixes };
  }

  /**
   * Generates a cryptographically secure random string of a specified length using a given character set.
   * @param {number} [length=IdGenerator.DEFAULT_LENGTH] - The desired length of the random string.
   * @param {string} [charset=IdGenerator.DEFAULT_CHARSET] - The character set from which to pick characters.
   * @returns {string} The generated random string.
   * @public
   */
  public generateRandomString(
    length: number = IdGenerator.DEFAULT_LENGTH,
    charset: string = IdGenerator.DEFAULT_CHARSET,
  ): string {
    const bytes = randomBytes(length);
    let result = "";
    for (let i = 0; i < length; i++) {
      result += charset[bytes[i] % charset.length];
    }
    return result;
  }

  /**
   * Generates a unique ID, optionally prepended with a prefix and customized with generation options.
   * @param {string} [prefix] - An optional prefix for the ID.
   * @param {IdGenerationOptions} [options={}] - Optional parameters for ID generation, including length, separator, and charset.
   * @returns {string} A unique identifier string.
   * @public
   */
  public generate(prefix?: string, options: IdGenerationOptions = {}): string {
    const {
      length = IdGenerator.DEFAULT_LENGTH,
      separator = IdGenerator.DEFAULT_SEPARATOR,
      charset = IdGenerator.DEFAULT_CHARSET,
    } = options;

    const randomPart = this.generateRandomString(length, charset);

    return prefix ? `${prefix}${separator}${randomPart}` : randomPart;
  }

  /**
   * Generates a unique ID for a specified entity type, using its configured prefix.
   * The format is typically `PREFIX_RANDOMLPART`.
   * @param {string} entityType - The type of entity for which to generate an ID (must be registered via `setEntityPrefixes`).
   * @param {IdGenerationOptions} [options={}] - Optional parameters for ID generation.
   * @returns {string} A unique identifier string for the entity (e.g., "PROJ_A6B3J0").
   * @throws {McpError} If the `entityType` is not registered (i.e., has no configured prefix).
   * @public
   */
  public generateForEntity(
    entityType: string,
    options: IdGenerationOptions = {},
  ): string {
    const prefix = this.entityPrefixes[entityType];
    if (!prefix) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        `Unknown entity type: ${entityType}. No prefix registered.`,
      );
    }
    return this.generate(prefix, options);
  }

  /**
   * Validates if a given ID conforms to the expected format for a specific entity type,
   * including its prefix, separator, and the random part's length and character set (implicitly, by regex).
   * @param {string} id - The ID string to validate.
   * @param {string} entityType - The expected entity type of the ID.
   * @param {IdGenerationOptions} [options={}] - Optional parameters used during generation (length, separator) to ensure validation consistency.
   *                                             The charset is not directly validated here but assumed by the regex `[A-Z0-9]`.
   * @returns {boolean} `true` if the ID is valid for the entity type, `false` otherwise.
   * @public
   */
  public isValid(
    id: string,
    entityType: string,
    options: IdGenerationOptions = {},
  ): boolean {
    const prefix = this.entityPrefixes[entityType];
    const {
      length = IdGenerator.DEFAULT_LENGTH,
      separator = IdGenerator.DEFAULT_SEPARATOR,
      // charset is not used in regex directly, assumes default-like characters
    } = options;

    if (!prefix) {
      return false; // Entity type not registered, so ID cannot be valid for it.
    }

    // Regex assumes default charset characters (uppercase letters and digits)
    // For custom charsets, this regex would need to be more dynamic or validation more complex.
    const pattern = new RegExp(
      `^${prefix}${this.escapeRegex(separator)}[A-Z0-9]{${length}}$`,
    );
    return pattern.test(id);
  }

  /**
   * Helper to escape special characters in the separator for regex construction.
   * @param {string} str - The string to escape.
   * @returns {string} The escaped string.
   * @private
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Strips the prefix and separator from an ID string.
   * @param {string} id - The ID string (e.g., "PROJ_A6B3J0").
   * @param {string} [separator=IdGenerator.DEFAULT_SEPARATOR] - The separator used in the ID.
   * @returns {string} The ID part without the prefix (e.g., "A6B3J0"), or the original ID if the separator is not found.
   * @public
   */
  public stripPrefix(
    id: string,
    separator: string = IdGenerator.DEFAULT_SEPARATOR,
  ): string {
    const parts = id.split(separator);
    return parts.length > 1 ? parts[1] : id;
  }

  /**
   * Determines the entity type from a given ID string by extracting and looking up its prefix.
   * The lookup is case-insensitive for the prefix part.
   * @param {string} id - The ID string (e.g., "PROJ_A6B3J0").
   * @param {string} [separator=IdGenerator.DEFAULT_SEPARATOR] - The separator used in the ID.
   * @returns {string} The determined entity type.
   * @throws {McpError} If the ID format is invalid (e.g., no separator) or the extracted prefix is unknown.
   * @public
   */
  public getEntityType(
    id: string,
    separator: string = IdGenerator.DEFAULT_SEPARATOR,
  ): string {
    const parts = id.split(separator);
    if (parts.length < 2 || !parts[0]) {
      // Allow for IDs that might have more separators in the random part, though unusual.
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        `Invalid ID format: ${id}. Expected format like: PREFIX${separator}RANDOMLPART`,
      );
    }

    const prefix = parts[0];
    const entityType = this.prefixToEntityType[prefix.toLowerCase()]; // Case-insensitive lookup

    if (!entityType) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        `Unknown entity type for prefix: ${prefix}`,
      );
    }
    return entityType;
  }

  /**
   * Normalizes an entity ID to ensure the prefix matches the registered case
   * and the random part is uppercase.
   * @param {string} id - The ID to normalize (e.g., "proj_a6b3j0").
   * @param {string} [separator=IdGenerator.DEFAULT_SEPARATOR] - The separator used in the ID.
   * @returns {string} The normalized ID (e.g., "PROJ_A6B3J0").
   * @throws {McpError} If the entity type cannot be determined from the ID.
   * @public
   */
  public normalize(
    id: string,
    separator: string = IdGenerator.DEFAULT_SEPARATOR,
  ): string {
    const entityType = this.getEntityType(id, separator); // This will throw if prefix is unknown
    const registeredPrefix = this.entityPrefixes[entityType]; // Get the canonical prefix
    const idParts = id.split(separator);
    const randomPart = idParts.slice(1).join(separator); // Re-join if separator was in random part

    return `${registeredPrefix}${separator}${randomPart.toUpperCase()}`;
  }
}

/**
 * Default singleton instance of the `IdGenerator`.
 * This instance is initialized with an empty entity prefix configuration.
 * Use `idGenerator.setEntityPrefixes({})` to configure it.
 * @type {IdGenerator}
 */
export const idGenerator = new IdGenerator();

/**
 * Generates a standard Version 4 UUID (Universally Unique Identifier).
 * Uses the Node.js `crypto` module for generation.
 * @returns {string} A new UUID string (e.g., "123e4567-e89b-12d3-a456-426614174000").
 * @public
 */
export const generateUUID = (): string => {
  return cryptoRandomUUID();
};
