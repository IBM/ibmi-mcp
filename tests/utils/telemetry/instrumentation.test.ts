/**
 * @fileoverview Tests for OpenTelemetry instrumentation.
 * @module tests/utils/telemetry/instrumentation.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NodeSDK } from "@opentelemetry/sdk-node";
import winston from "winston";

// Mock SDK instance that will be returned by NodeSDK constructor
const mockSdkInstance = {
  start: vi.fn(),
  shutdown: vi.fn().mockResolvedValue(undefined),
  spanProcessors: [],
};

// Mock dependencies
vi.mock("@opentelemetry/sdk-node", () => {
  const NodeSDK = vi.fn(() => mockSdkInstance);
  return { NodeSDK };
});

vi.mock("winston", () => {
  const mTransports = {
    File: vi.fn(),
    Console: vi.fn(),
  };
  const mFormat = {
    combine: vi.fn(),
    timestamp: vi.fn(),
    json: vi.fn(),
  };
  const mLogger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    on: vi.fn().mockReturnThis(),
    end: vi.fn(),
  };
  const createLoggerMock = vi.fn(() => mLogger);

  const winstonMock = {
    createLogger: createLoggerMock,
    format: mFormat,
    transports: mTransports,
  };

  return {
    ...winstonMock,
    default: winstonMock,
  };
});

vi.mock("../../../src/config/index", () => ({
  config: {
    openTelemetry: {
      enabled: true,
      serviceName: "test-service",
      serviceVersion: "1.0.0",
      logLevel: "INFO",
      samplingRatio: 1,
      tracesEndpoint: "",
      metricsEndpoint: "",
    },
    logsPath: "/tmp/logs",
    environment: "test",
  },
}));

describe("OpenTelemetry Instrumentation", () => {
  let instrumentation: typeof import("../../../src/utils/telemetry/instrumentation.js");

  beforeEach(async () => {
    // Clear all modules first to ensure fresh import
    vi.resetModules();

    // Re-apply all mocks after reset
    vi.clearAllMocks();

    // Import the module after mocks are properly set up
    instrumentation = await import(
      "../../../src/utils/telemetry/instrumentation.js"
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("OtelDiagnosticLogger", () => {
    it("should create a winston logger with a file transport if logsPath is available", () => {
      // When OpenTelemetry is enabled, winston.createLogger should be called
      // at least once for the OtelDiagnosticLogger
      expect(winston.createLogger).toHaveBeenCalled();
      expect(winston.transports.File).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: expect.stringContaining("opentelemetry.log"),
        }),
      );
    });
  });

  describe("FileSpanProcessor", () => {
    it("should create a winston logger for traces when OpenTelemetry is enabled", async () => {
      // When OpenTelemetry is enabled, winston.createLogger should be called
      // at least twice: once for OtelDiagnosticLogger and once for FileSpanProcessor
      expect(winston.createLogger).toHaveBeenCalledTimes(2);

      // Verify that a logger for traces.log is created
      expect(winston.transports.File).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: expect.stringContaining("traces.log"),
        }),
      );
    });
  });

  describe("SDK Initialization", () => {
    it("should initialize NodeSDK with correct parameters", () => {
      expect(NodeSDK).toHaveBeenCalledWith(
        expect.objectContaining({
          sampler: expect.any(Object),
          resource: expect.any(Object),
          spanProcessors: expect.any(Array),
        }),
      );
      expect(mockSdkInstance.start).toHaveBeenCalled();
    });
  });

  describe("shutdownOpenTelemetry", () => {
    it("should call sdk.shutdown if sdk is initialized", async () => {
      const { shutdownOpenTelemetry } = instrumentation;

      // Clear any previous calls to the mock
      mockSdkInstance.shutdown.mockClear();

      await shutdownOpenTelemetry();

      expect(mockSdkInstance.shutdown).toHaveBeenCalled();
    });
  });
});
