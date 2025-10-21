# IBM i MCP Server - SQL Tool Configurations

Tools for this MCP server are defined in YAML configuration files. This directory contains several example tool configuration files that can be used to monitor and manage IBM i systems.

There are three main sections in each YAML file:
- **sources**: Define database connections
- **tools**: Define individual SQL operations
- **toolsets**: Group related tools together for easier loading

Below is an overview of the structure and purpose of each section.

## Sources

The `sources` section defines database connection details. Each source includes:
- `host`: IBM i system hostname or IP
- `user`: Database user
- `password`: User password
- `port`: Database port (default: 8076)
- `ignore-unauthorized`: Whether to ignore SSL certificate errors

> `host`, `user`, and `password` are REQUIRED for each source.

Example:
```yaml
sources:
  ibmi-system:
    host: ${DB2i_HOST}
    user: ${DB2i_USER}
    password: ${DB2i_PASS}
    port: 8076
    ignore-unauthorized: true
```
> The environment variables DB2i_HOST, DB2i_USER, DB2i_PASS, and DB2i_PORT can be set in the server .env file.

## Tools

The `tools` section defines the actions that your agent can take. you can configure what system that the tool runs against, the SQL query to execute, parameters, security settings, etc. 

Each tools requires:
- `name`: Unique tool name
- `soure`: Source to use for database connection
- `description`: Description of the tool's purpose
- `statement`: SQL statement to execute

Example:
```yaml
tools:
  system_status:
    source: ibmi-system
    description: "Overall system performance statistics with CPU, memory, and I/O metrics"
    parameters: []
    statement: |
      SELECT * FROM TABLE(QSYS2.SYSTEM_STATUS(RESET_STATISTICS=>'YES',DETAILED_INFO=>'ALL')) X

```

### Parameters

Tools can accept parameters to make SQL queries dynamic and reusable. Parameters are validated before execution to ensure type safety and security. All parameters are bound securely to prevent SQL injection.

#### Parameter Reference

Parameters are used in SQL statements with the `:parameter_name` syntax. Each parameter must be defined in the `parameters` array with at least a `name` and `type`.

**Basic Structure:**
```yaml
parameters:
  - name: parameter_name      # Required: Name used in SQL statement
    type: string              # Required: Data type
    description: "..."        # Recommended: Description for LLM
    required: true            # Optional: Whether parameter is required
    default: "value"          # Optional: Default value if not provided
```

---

#### Parameter Types

| Type | Description | Use Cases | Constraints Available |
|------|-------------|-----------|----------------------|
| `string` | Text values | Library names, object names, patterns | `minLength`, `maxLength`, `pattern`, `enum` |
| `integer` | Whole numbers | Row limits, IDs, counts | `min`, `max`, `enum` |
| `float` | Decimal numbers | Thresholds, percentages, measurements | `min`, `max`, `enum` |
| `boolean` | True/false values | Flags, enable/disable options | None (inherently constrained) |
| `array` | List of values | Multiple filters, batch operations | `minLength`, `maxLength`, `itemType` |

---

#### Common Properties

These properties apply to all parameter types:

| Property | Required | Type | Description |
|----------|----------|------|-------------|
| `name` | ✅ Yes | string | Parameter name used in SQL (e.g., `:library_name`) |
| `type` | ✅ Yes | string | One of: `string`, `integer`, `float`, `boolean`, `array` |
| `description` | ⭐ Recommended | string | **LLM-facing description**—clear guidance on usage and examples |
| `required` | No | boolean | `true` = must be provided, `false` = optional (default: `true` unless `default` is set) |
| `default` | No | varies | Default value if parameter is not provided |

> **Important:** The `description` is sent directly to the LLM. Write clear, helpful descriptions with examples to guide the LLM in using the parameter correctly.

---

### String Parameters

String parameters accept text values and support length constraints, pattern matching, and enumerated values.

**Available Constraints:**
- `minLength`: Minimum string length
- `maxLength`: Maximum string length
- `pattern`: Regular expression validation
- `enum`: List of allowed values

**Example 1: Basic String Parameter**
```yaml
parameters:
  - name: library_name
    type: string
    description: "Library containing the file. Example: 'APPLIB', 'MYLIB'"
    required: true
```

**Example 2: String with Length Constraints**
```yaml
parameters:
  - name: object_name
    type: string
    description: "IBM i object name (1-10 characters)"
    required: true
    minLength: 1
    maxLength: 10
```

**Example 3: String with Pattern Validation**
```yaml
parameters:
  - name: library_name
    type: string
    description: "Library name (uppercase alphanumeric, starts with letter)"
    required: true
    pattern: "^[A-Z][A-Z0-9_]*$"
    maxLength: 10
```

**Example 4: String with Enum Values** *(from object-statistics-dev.yaml)*
```yaml
parameters:
  - name: sql_object_type
    type: string
    description: "SQL object type to find."
    required: false
    default: "INDEX"
    enum: [ALIAS, FUNCTION, INDEX, PACKAGE, PROCEDURE, ROUTINE, SEQUENCE, TABLE, TRIGGER, TYPE, VARIABLE, VIEW, XSR]
```
> When `enum` is provided, the description is automatically enhanced with "Must be one of: 'ALIAS', 'FUNCTION', ..." for LLM clarity.

---

### Integer Parameters

Integer parameters accept whole numbers and support minimum/maximum constraints and enumerated values.

**Available Constraints:**
- `min`: Minimum value (inclusive)
- `max`: Maximum value (inclusive)
- `enum`: List of allowed values

**Example 1: Basic Integer Parameter**
```yaml
parameters:
  - name: max_rows
    type: integer
    description: "Maximum number of rows to return"
    required: false
    default: 100
```

**Example 2: Integer with Range Constraints** *(from object-statistics-dev.yaml)*
```yaml
parameters:
  - name: months_unused
    type: integer
    description: "Look back this many months. Examples: 1 (past month), 3 (past 3 months), 6 (past 6 months)"
    required: false
    default: 1
    min: 1
    max: 120
```

**Example 3: Integer with Enum Values**
```yaml
parameters:
  - name: priority_level
    type: integer
    description: "Job priority level"
    required: false
    default: 5
    enum: [1, 5, 10, 20]
```

---

### Float Parameters

Float parameters accept decimal numbers and support minimum/maximum constraints.

**Available Constraints:**
- `min`: Minimum value (inclusive)
- `max`: Maximum value (inclusive)
- `enum`: List of allowed values

**Example 1: Basic Float Parameter**
```yaml
parameters:
  - name: cpu_threshold
    type: float
    description: "CPU usage threshold percentage (0.0 to 100.0)"
    required: false
    default: 80.0
    min: 0.0
    max: 100.0
```

**Example 2: Float for Decimal Precision**
```yaml
parameters:
  - name: memory_gb
    type: float
    description: "Memory size in gigabytes (supports decimals)"
    required: true
    min: 0.1
    max: 1024.0
```

---

### Boolean Parameters

Boolean parameters accept `true` or `false` values. They do not support additional constraints as they are inherently constrained to two values.

**Example 1: Simple Boolean Flag**
```yaml
parameters:
  - name: include_inactive
    type: boolean
    description: "Include inactive objects in results"
    required: false
    default: false
```

**Example 2: Boolean with Clear Documentation**
```yaml
parameters:
  - name: reset_statistics
    type: boolean
    description: "Reset statistics after retrieval. true = reset counters, false = preserve current values"
    required: false
    default: false
```

---

### Array Parameters

Array parameters accept lists of values and require an `itemType` to specify the type of elements in the array.

**Available Constraints:**
- `itemType`: **Required** - Type of array elements (`string`, `integer`, `float`, or `boolean`)
- `minLength`: Minimum number of items
- `maxLength`: Maximum number of items

**Example 1: String Array**
```yaml
parameters:
  - name: library_list
    type: array
    itemType: string
    description: "List of library names to search"
    required: false
    minLength: 1
    maxLength: 50
```

**Example 2: Integer Array with Constraints**
```yaml
parameters:
  - name: job_numbers
    type: array
    itemType: integer
    description: "List of job numbers to analyze"
    required: true
    minLength: 1
    maxLength: 100
```

**Using Arrays in SQL:**
```yaml
statement: |
  SELECT * FROM qsys2.object_statistics
  WHERE objlib IN (SELECT * FROM TABLE(SYSTOOLS.SPLIT(:library_list, ',')))
```

---

### Parameter Constraint Summary

| Constraint | Type Support | Description | Example |
|-----------|--------------|-------------|---------|
| `min` | integer, float | Minimum value (inclusive) | `min: 1` |
| `max` | integer, float | Maximum value (inclusive) | `max: 100` |
| `minLength` | string, array | Minimum length/count | `minLength: 1` |
| `maxLength` | string, array | Maximum length/count | `maxLength: 50` |
| `pattern` | string | Regular expression validation | `pattern: "^[A-Z][A-Z0-9]*$"` |
| `enum` | string, integer, float, boolean | Allowed values only | `enum: [INDEX, TABLE, VIEW]` |
| `itemType` | array | Type of array elements (**required**) | `itemType: string` |

---

### Best Practices for Parameter Descriptions

The `description` field is **sent directly to the LLM** to help it understand how to use the parameter. Follow these guidelines:

✅ **DO:**
- Provide clear, concise descriptions
- Include examples of valid values
- Explain the purpose and impact of the parameter
- Use IBM i terminology when applicable
- Indicate units for numeric values

```yaml
# Good examples
description: "Library name. Examples: 'MYLIB', '*LIBL', '*USRLIBL', '*ALLUSR'"
description: "Look back this many months. Examples: 1 (past month), 3 (past 3 months), 6 (past 6 months)"
description: "CPU usage threshold percentage (0.0 to 100.0). Values above this trigger alerts"
```

❌ **DON'T:**
- Use vague descriptions: ~~`"A library"`~~
- Omit examples: ~~`"Number of months"`~~
- Forget to document special values: ~~`"Library name"` (should mention `*LIBL`, etc.)~~

---

### Using Parameters in SQL Statements

Parameters are referenced in SQL statements using the `:parameter_name` syntax:

**Example: Parameter Binding**
```yaml
statement: |
  SELECT * FROM TABLE (
    qsys2.object_statistics(
      object_schema => :object_schema,
      objtypelist => '*ALL',
      object_name => '*ALL'
    )
  )
  WHERE sql_object_type = :sql_object_type
    AND last_used_timestamp < current_timestamp - :months_unused MONTHS
  ORDER BY last_used_timestamp DESC
```

**Handling Optional Parameters:**
```yaml
statement: |
  SELECT * FROM qsys2.library_info
  WHERE (:name_filter IS NULL OR library_name LIKE :name_filter)
    AND (:type_filter IS NULL OR library_type = :type_filter)
  ORDER BY library_name
```

**Using Default Values:**
```yaml
parameters:
  - name: name_filter
    type: string
    required: false  # NULL if not provided
  - name: max_rows
    type: integer
    required: false
    default: 100     # 100 if not provided
```

---

### Complete Parameter Examples

#### Example 1: Recently Used Objects *(from object-statistics-dev.yaml)*

```yaml
tools:
  find_recently_used_objects:
    source: ibmi-system
    description: Find objects that have been used within a specified time period
    statement: |
      SELECT * FROM TABLE (
        qsys2.object_statistics(
          object_schema => :object_schema,
          objtypelist => '*ALL',
          object_name => '*ALL'
        )
      )
      WHERE last_used_object = 'YES'
        AND sql_object_type = :sql_object_type
        AND last_used_timestamp < current_timestamp - :months_unused MONTHS
      ORDER BY last_used_timestamp DESC
    parameters:
      - name: object_schema
        type: string
        description: "Library name. Examples: 'MYLIB', '*LIBL', '*USRLIBL', '*ALLUSR'"
        required: true

      - name: sql_object_type
        type: string
        description: "SQL object type to find."
        required: false
        default: "INDEX"
        enum: [ALIAS, FUNCTION, INDEX, PACKAGE, PROCEDURE, ROUTINE, SEQUENCE, TABLE, TRIGGER, TYPE, VARIABLE, VIEW, XSR]

      - name: months_unused
        type: integer
        description: "Look back this many months. Examples: 1 (past month), 3 (past 3 months), 6 (past 6 months)"
        required: false
        default: 1
        min: 1
        max: 120
```

#### Example 2: Filtered Library Search

```yaml
tools:
  search_libraries:
    source: ibmi-system
    description: Search for libraries with filtering options
    statement: |
      SELECT library_name, library_type, library_size
      FROM qsys2.library_info
      WHERE (:name_pattern IS NULL OR library_name LIKE :name_pattern)
        AND (:type_filter IS NULL OR library_type = :type_filter)
        AND (:min_size IS NULL OR library_size >= :min_size)
      ORDER BY library_name
      FETCH FIRST :max_rows ROWS ONLY
    parameters:
      - name: name_pattern
        type: string
        description: "Library name pattern (use % for wildcards). Example: 'APP%' matches all libraries starting with APP"
        required: false
        pattern: "^[A-Z0-9%_*]+$"
        maxLength: 10

      - name: type_filter
        type: string
        description: "Filter by library type"
        required: false
        enum: ["PROD", "TEST"]

      - name: min_size
        type: integer
        description: "Minimum library size in bytes"
        required: false
        min: 0

      - name: max_rows
        type: integer
        description: "Maximum number of results to return"
        required: false
        default: 100
        min: 1
        max: 1000
```

---

### Parameter Validation

All parameters are validated before SQL execution:

1. **Type Validation**: Values must match the declared type
2. **Constraint Validation**: Values must satisfy min/max, length, pattern, and enum constraints
3. **SQL Security**: Parameters are bound securely to prevent SQL injection
4. **Required Check**: Required parameters must be provided (unless they have defaults)

**Validation Errors:**
- Invalid type: `Expected integer, got string`
- Out of range: `Value 150 exceeds maximum of 120`
- Pattern mismatch: `Value does not match pattern: ^[A-Z][A-Z0-9]*$`
- Enum violation: `Value 'INVALID' must be one of: 'INDEX', 'TABLE', 'VIEW'`
- Missing required: `Required parameter 'library_name' not provided`




