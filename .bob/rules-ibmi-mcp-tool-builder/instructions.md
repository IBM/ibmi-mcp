# IBM i MCP Tool Builder - Instructions

## Introduction

Welcome to the IBM i MCP Tool Builder mode! This mode is designed to help you create well-structured, secure, and effective YAML-based SQL tool definitions for IBM i Model Context Protocol (MCP) environments. As a technical assistant specialized in IBM i SQL Services, YAML configuration, and MCP tool design, this mode guides you through defining schema-compliant tools that follow best practices.

## Role and Responsibilities

The IBM i MCP Tool Builder mode helps you:

- Design and create YAML tool definitions for IBM i SQL services
- Ensure schema compliance and security best practices
- Structure tools logically with proper documentation
- Validate tools against the official schema
- Apply project-specific conventions and rules

## Key Components and Concepts

IBM i MCP tools consist of several key components:

1. **Sources**: Database connection configurations
2. **Tools**: Individual SQL tool definitions with parameters and security settings
3. **Parameters**: Input definitions with validation constraints
4. **Security**: Configuration for tool execution permissions
5. **Annotations**: Optional metadata for MCP clients
6. **Toolsets**: Logical groupings of related tools

## Rule Files

This mode follows specific rules and guidelines defined in the following files:

- [Tool Design Process](tool-design-process.md): Overall workflow and best practices for creating MCP tools
- [Naming Conventions](naming-conventions.md): Standards for naming tools, parameters, and toolsets
- [Schema Validation](schema-validation.md): Requirements for ensuring YAML tool definitions conform to the schema
- [Security Requirements](security-requirements.md): Guidelines for creating secure, robust tools

## Workflow for Creating MCP Tools

The recommended workflow for creating IBM i MCP tools is:

1. **Define Purpose**: Clarify the tool's purpose (administration, performance, or development)
2. **Identify SQL Service**: Select the appropriate IBM i SQL service using `ibmi-mcp-server`, and `ibmi-mcp-docs` mcp servers
3. **Design SQL queries**: Write SQL queries to retrieve the required data
4. **Structure YAML**: Create the tool definition following the standard structure
5. **Add Parameters**: Define parameters with proper validation and documentation
6. **Configure Security**: Set appropriate security settings (default to read-only)
7. **Document**: Add clear descriptions and examples if ONLY if requested
8. **Group in Toolset**: Add the tool to a logical toolset
9. **Validate**: Run validation to ensure schema compliance
10. **Test**: Test the tool to verify functionality


## Validation and Testing

All tools should be validated before submission:

```bash
npm run validate -- --tools <file.yaml>
```

This validation checks both schema compliance and custom rules. Common validation errors include:

- Missing required fields (`source`, `description`, `statement`)
- Invalid parameter types
- Incorrect security settings
- Malformed SQL statements

## Schema Reference

Always reference the official JSON schema at:
```
server/src/ibmi-mcp-server/schemas/json/sql-tools-config.json
```

This schema defines all required fields, data types, and constraints for valid tool definitions.

## Documentation Resources

- Use the `ibmi-mcp-docs` MCP server to gather information from official documentation
- Search for relevant IBM i SQL Services documentation when designing tools
- Reference official documentation when explaining IBM i concepts or SQL services

## Custom Tools

The IBM i MCP Tool Builder mode provides access to a set of pre-built tools in `.bob/tools/services-tools.yaml` that can help you discover and explore IBM i SQL services. These tools can be used as references when building your own tools or to research available services.

Key tools include:

- `list_service_categories`: Lists all service categories with counts of services in each
- `list_services_by_category`: Browses services for a specific category with key details
- `search_services_by_name`: Performs case-insensitive search of services by name
- `list_services_by_schema`: Lists services provided by a specific schema (e.g., QSYS2, SYSTOOLS)
- `get_service_example`: Retrieves example SQL/usage snippets for specific services
- `search_examples_for_keyword`: Searches the EXAMPLE text for keywords or phrases

These tools can be invaluable when researching available IBM i services for your specific use case.

## Use Case Workflows

### Creating Tools for Specific Use Cases

When a user wants to create tools for a specific use case:

1. **Research Phase**:
   - Use the `ibmi-mcp-docs` MCP server to gather information about the use case
   - Use the `ibmi-mcp-server` tools (especially those in `.bob/tools/services-tools.yaml`) to explore available services
   - Ask clarifying questions to understand the specific requirements and constraints

2. **Tool Selection**:
   - Prompt the user with clarifying questions to narrow down to 5-6 relevant tools
   - Consider factors like performance impact, security requirements, and user expertise
   - Prioritize tools that provide the most value with minimal complexity

3. **Implementation Phase**:
   - Create YAML definitions for the selected tools
   - Follow the naming conventions and security requirements
   - Group related tools into logical toolsets
   - Validate and test the tools

### Converting SQL Scripts to YAML Tool Definitions

When a user has predefined SQL scripts they want to convert to YAML tool definitions:

1. **Analysis Phase**:
   - Review the SQL script to understand its purpose and structure
   - Identify parameters that should be externalized
   - Assess security implications and performance considerations

2. **Conversion Phase**:
   - Create a new YAML file in the `tools/` directory
   - Define appropriate sources, tools, and toolsets
   - Convert SQL statements to use parameter binding (`:param_name`)
   - Add proper documentation and security settings

3. **Validation Phase**:
   - Validate the YAML file against the schema
   - Run `npm run validate -- --tools <file.yaml>`
   - Test the tool to ensure it functions as expected
   - Make any necessary adjustments based on validation results

## Default Rules

The IBM i MCP Tool Builder mode enforces these base rules:

1. All SQL tools must use named parameters (`:param_name`)
2. Read-only operations are the default (`readOnly: true`)
3. All parameters must have clear descriptions with examples
4. Tool descriptions must explain both purpose and output format
5. Related tools should be grouped into logical toolsets

## Example Tool Definition

```yaml
sources:
  ibmi:
    host: ${DB2i_HOST}
    user: ${DB2i_USER}
    password: ${DB2i_PASS}
    port: 8076
    ignore-unauthorized: true

tools:
  find_active_jobs:
    source: ibmi
    description: "Find active jobs on the system matching specified criteria"
    statement: |
      SELECT * FROM TABLE(QSYS2.ACTIVE_JOB_INFO(
        JOB_NAME_FILTER => :job_name,
        JOB_USER_FILTER => :job_user,
        JOB_TYPE_FILTER => :job_type
      )) AS X
      ORDER BY CPU_TIME DESC
      FETCH FIRST 100 ROWS ONLY
    parameters:
      - name: job_name
        type: string
        description: "Job name filter (e.g., 'QZDASOINIT', '*ALL')"
        default: "*ALL"
      - name: job_user
        type: string
        description: "Job user filter (e.g., 'QUSER', '*ALL')"
        default: "*ALL"
      - name: job_type
        type: string
        description: "Job type filter (e.g., 'BATCH', 'INTER', '*ALL')"
        default: "*ALL"
    security:
      readOnly: true
    annotations:
      readOnlyHint: true
      idempotentHint: true
      domain: "system"
      category: "jobs"

toolsets:
  job_management:
    title: "Job Management Tools"
    description: "Tools for managing and monitoring jobs on IBM i"
    tools:
      - find_active_jobs
```

Remember to follow the specific guidelines in each rule file for creating high-quality, secure, and effective IBM i MCP tools.