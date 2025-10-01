# IBM i MCP Agents (WIP!!)

AI agents for IBM i system administration and monitoring built with Agno's AgentOS framework and Model Context Protocol (MCP) tools. This project provides intelligent agents that can analyze IBM i system performance, manage resources, and assist with administrative tasks.

## What is this project?

The IBM i MCP Agents project consists of:

1. **AI Agents**: Python-based intelligent agents that use the MCP tools to perform system administration tasks
2. **Agent UI**: A web interface for interacting with the agents
3. **Evaluation Framework**: Tools for testing and validating agent performance

The agents can help with tasks like:
- System performance monitoring and analysis
- Resource utilization reporting
- Job and process management
- System configuration analysis
- Automated troubleshooting and recommendations

## Complete Setup Guide

Follow these step-by-step instructions to set up and run the IBM i MCP Agents.

### Step 1: Install Prerequisites

**Install uv** (Python package manager):
   ```bash
   # On macOS and Linux:
   curl -LsSf https://astral.sh/uv/install.sh | sh
   
   # On Windows (PowerShell):
   powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
   
   # Alternative: Install via pip
   pip install uv
   ```

#### Verify installations:
```bash
node --version    # Should be v20+
uv --version      # Should show uv version
```

### Step 2: Clone and Setup the Repository

```bash
# Clone the repository
git clone https://github.com/IBM/ibmi-mcp-server.git
cd ibmi-mcp-server/

# Install Node.js dependencies for the MCP server
npm install
```

### Step 3: Configure IBM i Connection

Create the environment configuration file:

```bash
# Copy the example environment file
cp .env.example .env

# Edit the .env file with your IBM i connection details
# Use your preferred text editor (code, nano, vim, etc.)
code .env
```

Fill in your IBM i connection details in the `.env` file:

```bash
# IBM i DB2 for i Connection Settings
DB2i_HOST=your-ibmi-hostname
DB2i_USER=your-username
DB2i_PASS=your-password
DB2i_PORT=8076
DB2i_IGNORE_UNAUTHORIZED=true
```

### Step 4: Build and Start the MCP Server

```bash
# Build the TypeScript MCP server
npm run build

# Start the MCP server in HTTP mode (required for agents)
npm run start:http
```

The server will start on `http://127.0.0.1:3010/mcp` and display available tools and configuration.

**Keep this terminal open** - the MCP server needs to stay running for the agents to work.

### Step 5: Setup the Agent Environment

Open a **new terminal** and navigate to the agents directory:

```bash
cd ibmi-mcp-server/agents/frameworks/agno

# Create the agents environment file
touch .env

# Edit the agents .env file
code .env
```

Add your OpenAI API key to the `agents/.env` file:

```bash
OPENAI_API_KEY=your-openai-api-key-here
```

### Step 6: Run the Agents

Now you can run different types of agents. Choose one of the following options:

#### Option A: Standard Agent (All MCP Tools)
Provides access to all available MCP tools:

```bash
uv run agentos.py
```

This serves AgentOS on `http://localhost:7777` with full tool access.

#### Option B: Multi-Agent OS (Specialized Agents)
Runs multiple specialized agents for different tasks:

```bash
uv run ibmi_agentos.py
```

This starts four specialized agents:
- **Performance Agent**: System performance monitoring
- **SysAdmin Discovery Agent**: System configuration discovery
- **Browse Agent**: Data browsing and exploration
- **Search Agent**: Information search and retrieval

## Agent UI (Local)

Use the local Next.js UI to chat with your AgentOS instance.

1) Ensure AgentOS is running on `http://localhost:7777` (start one of the agents above).

2) Start the UI from `agents/agent-ui`:

   Using pnpm:
   ```
   cd agents/agent-ui
   pnpm install
   pnpm dev
   ```

   Using npm:
   ```
   cd agents/agent-ui
   npm install
   npm run dev
   ```

3) Open `http://localhost:3000` and confirm the endpoint is `http://localhost:7777` (edit from the left sidebar if needed).

## Evals

- Run reliability evals for the performance agent
  - Command:
    ```
    uv run eval_runner.py
    ```
  - Runs `performance_agent_reliability_evals()` and asserts expected tool calls


## Interacting with Agents

Once your agents are running, you can interact with them in several ways:

### Via Agent UI (Recommended)
Use the web interface at `http://localhost:3000` to chat with agents in a user-friendly environment.

### Via AgentOS API
Send HTTP requests directly to `http://localhost:7777` using the AgentOS API.

### Example Queries to Try

Here are some example questions you can ask your IBM i agents:

#### Performance Monitoring
- "What is the current system status?"
- "Show me memory pool utilization"
- "What are the top CPU-consuming jobs?"
- "Check for any performance bottlenecks"

#### System Administration
- "List all active jobs"
- "Show system configuration values"
- "What services are currently running?"
- "Check disk usage and storage"

#### Troubleshooting
- "Are there any error messages in the system?"
- "What jobs are waiting for resources?"
- "Check for any system alerts or warnings"

## Running Evaluations

Test the reliability and performance of your agents using the evaluation framework:

```bash
# Run performance agent reliability evaluations
uv run eval_runner.py
```

This runs automated tests to ensure agents are working correctly and making appropriate tool calls.

## Technical Details

### Architecture Overview

1. **MCP Server (TypeScript)**: Provides tools for IBM i system interaction via SQL
2. **AgentOS (Python)**: Framework for running AI agents with tool access
3. **Agents**: Specialized AI agents that use MCP tools to accomplish tasks
4. **Transport**: HTTP-based communication between agents and MCP server

### Default Configuration

- **MCP Server URL**: `http://127.0.0.1:3010/mcp`
- **AgentOS URL**: `http://localhost:7777`
- **Agent UI URL**: `http://localhost:3000`
- **Transport**: `streamable-http`

### Customization

You can customize agent behavior by:
- Modifying toolset selection in the filtered agent
- Adjusting MCP server configuration
- Creating custom agent specializations
- Adding new evaluation scenarios

## Notes

- The MCP server must be running in HTTP mode for agents to connect
- Default timeout for MCP operations is configured for IBM i system response times
- Agents maintain conversation context and can handle multi-step tasks
- All interactions are logged for debugging and evaluation purposes