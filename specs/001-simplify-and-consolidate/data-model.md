# Data Model: YAML Utilities Consolidation

## Core Entities

### ConsolidatedYamlProcessor

**Purpose**: Unified interface for YAML tool processing
**Responsibilities**: Parse, validate, and process YAML configurations into executable tools

**Properties**:

- `configSources: ConfigSource[]` - List of YAML file/directory sources
- `processingOptions: ProcessingOptions` - Merge behavior and validation settings
- `cache: Map<string, ProcessedConfig>` - Memoized configurations
- `stats: ProcessingStats` - Performance and usage metrics

**Key Methods**:

- `loadAndProcess(): Promise<ProcessedToolCollection>`
- `validateConfiguration(): ValidationResult`
- `clearCache(): void`

**State Transitions**:

- `Uninitialized` → `Loading` → `Processed` → `Cached`
- Error states: `ValidationFailed`, `LoadingFailed`

### ProcessedToolCollection

**Purpose**: Container for all processed YAML tools ready for registration
**Responsibilities**: Hold validated tool configurations with metadata

**Properties**:

- `tools: Map<string, ProcessedTool>` - Tool name to configuration mapping
- `sources: Map<string, SourceConfig>` - Database source configurations
- `toolsets: Map<string, ToolsetConfig>` - Tool grouping configurations
- `metadata: ConfigMetadata` - Global configuration metadata

**Validation Rules**:

- All tool source references must exist in sources map
- Toolset tool references must exist in tools map
- No circular dependencies between toolsets
- Tool names must be unique across the collection

### ProcessedTool

**Purpose**: Individual tool ready for MCP server registration
**Responsibilities**: Encapsulate complete tool definition with compiled schemas

**Properties**:

- `name: string` - Unique tool identifier
- `description: string` - Human-readable description
- `inputSchema: ZodSchema` - Compiled parameter validation schema
- `outputSchema: ZodSchema` - Response structure schema
- `handler: ToolHandler` - Executable function
- `annotations: ToolAnnotations` - Metadata for MCP registration
- `sourceReference: string` - Database source name
- `toolsets: string[]` - Containing toolset names

**Validation Rules**:

- Name must match pattern: `^[a-z][a-z0-9_]*$`
- Description must be 10-500 characters
- Source reference must exist in collection
- Handler must be callable function

### DeprecatedClassWrapper

**Purpose**: Maintain API compatibility during transition
**Responsibilities**: Proxy calls to new implementation with deprecation warnings

**Properties**:

- `targetImplementation: ConsolidatedYamlProcessor` - New implementation
- `deprecationWarnings: Set<string>` - Tracked warning messages
- `compatibilityMode: boolean` - Enable legacy behavior

**State Transitions**:

- `Active` → `Deprecated` → `Removed`
- Warning frequency: First call, then every 100th call

## Data Relationships

```
ConsolidatedYamlProcessor
├── ProcessedToolCollection
│   ├── ProcessedTool[] (1:many)
│   ├── SourceConfig[] (1:many)
│   └── ToolsetConfig[] (1:many)
├── ProcessingStats (1:1)
└── ConfigCache (1:1)

DeprecatedClassWrapper
└── ConsolidatedYamlProcessor (1:1, proxy)
```

## Migration Data Model

### ConsolidationPhase

**Purpose**: Track consolidation progress and rollback points
**Responsibilities**: Manage incremental migration state

**Properties**:

- `phase: 'quick-wins' | 'consolidation' | 'architecture'`
- `completedSteps: string[]` - Successfully completed operations
- `rollbackPoints: Map<string, any>` - Restoration data for failures
- `validationResults: TestResult[]` - Continuous validation outcomes

### CompatibilityMatrix

**Purpose**: Track API compatibility during migration
**Responsibilities**: Ensure no breaking changes to public interfaces

**Properties**:

- `publicAPIs: Map<string, APISignature>` - Original API signatures
- `deprecatedAPIs: Map<string, DeprecationInfo>` - Deprecation timeline
- `migrationPaths: Map<string, string>` - Old API to new API mapping

## Performance Data Model

### ProcessingMetrics

**Purpose**: Monitor performance impact of consolidation
**Responsibilities**: Track speed, memory, and efficiency improvements

**Properties**:

- `toolRegistrationTime: number[]` - Time series data
- `memoryUsage: MemorySnapshot[]` - Memory usage over time
- `cacheHitRatio: number` - Configuration cache effectiveness
- `errorRate: number` - Failed processing rate

**Validation Rules**:

- Registration time must not increase >10% post-consolidation
- Memory usage should decrease by >15%
- Cache hit ratio should improve
- Error rate must remain <1%

## Implementation Constraints

### Backward Compatibility

- All existing public method signatures preserved
- Deprecation warnings before removal
- Migration timeline: 2 major versions minimum

### Performance Requirements

- Tool registration: <100ms per tool
- Memory usage: 15-20% reduction target
- Cache effectiveness: >80% hit rate for repeated configurations

### Testing Requirements

- 100% of existing tests must pass
- New integration tests for consolidated classes
- Performance regression tests
- Migration path validation tests
