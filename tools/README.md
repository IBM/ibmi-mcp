# IBM i MCP Server - SQL Tool Configurations

YAML-based SQL tool definitions for IBM i system operations.

## Available Toolsets

### performance.yaml
System performance monitoring tools:
- `system_status` - Overall system performance statistics
- `system_activity` - CPU and job activity metrics
- `memory_pools` - Memory pool utilization
- `active_job_info` - Active job information
- And more performance-related tools

### sys-admin.yaml
System administration tools:
- System configuration queries
- User management tools
- Object statistics
- Job management
- And more administrative tools

## Usage

Configure the server to use these tools via environment variable:

```bash
# In .env file (root of monorepo)
TOOLS_YAML_PATH=tools

# Or via command line
TOOLS_YAML_PATH=tools npm run start:http
```

## YAML File Structure

Each YAML file contains three main sections:

### 1. Sources
Database connection configurations:
```yaml
sources:
  ibmi-system:
    host: ${DB2i_HOST}
    user: ${DB2i_USER}
    password: ${DB2i_PASS}
    port: 8076
```

### 2. Tools
Individual SQL operations with parameters:
```yaml
tools:
  system_status:
    source: ibmi-system
    description: "Overall system performance statistics"
    statement: |
      SELECT * FROM QSYS2.SYSTEM_STATUS
    parameters: []
```

### 3. Toolsets
Logical groupings of related tools:
```yaml
toolsets:
  performance:
    tools:
      - system_status
      - system_activity
      - memory_pools
```

## Adding New Tools

1. Create or edit a YAML file in this directory
2. Follow the schema in existing files
3. Define sources, tools, and toolsets
4. Validate configuration:
   ```bash
   cd ../server
   npm run validate -- --config ../tools/your-config.yaml
   ```

## Loading Specific Toolsets

Load only specific toolsets instead of all tools:

```bash
# Via environment variable
SELECTED_TOOLSETS=performance,monitoring npm run start:http

# Via CLI
npm run start:http -- --toolsets performance,monitoring
```

## Documentation

See [server documentation](../server/README.md) for complete tool development guide and architectural standards.

For detailed SQL tool configuration documentation, see the [root README](../README.md#-sql-tool-configuration).
