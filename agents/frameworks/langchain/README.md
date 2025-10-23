# IBMi Langgraph Agents

## Available Agents

- **Performance Agent**: System performance monitoring and analysis
- **SysAdmin Discovery Agent**: High-level system discovery and summarization
- **SysAdmin Browse Agent**: Detailed system browsing and exploration
- **SysAdmin Search Agent**: System search and lookup capabilities

## Prerequisites

- IBM i MCP Server running at http://127.0.0.1:3010/mcp (or configured URL)
- Python 3.13 or higher
- uv package manager

## Setup

### 1. Ensure the IBM i MCP Server is Running

The MCP server should be running at the URL specified in your `.env` file (default: http://127.0.0.1:3010/mcp).

You can check if the server is running with:

```bash
ps aux | grep ibmi-mcp-server
```

### 2. Configure Environment Variables

Create or update the `.env` file in the `agents/frameworks/langchain` directory

### 3. Install Dependencies

First, install the ibmi-agent-sdk package in editable mode:

```bash
cd /path/to/ibmi-mcp-server/agents/packages/ibmi-agent-sdk
uv pip install -e .
```

Then, install the LangChain agents package:

```bash
cd /path/to/ibmi-mcp-server/agents/frameworks/langchain
uv pip install -e .
```

## Usage

### Quick Test

To verify that all agents can be created successfully:

```bash
cd /path/to/ibmi-mcp-server/agents/frameworks/langchain/src/ibmi_agents/agents
uv run test_agents.py --quick
```

### Test Specific Agent

To test a specific agent with a sample query:

```bash
uv run test_agents.py --agent performance
```

Available agent types: `performance`, `discovery`, `browse`, `search`

### Interactive Mode

To chat interactively with a specific agent:

```bash
uv run test_agents.py --agent performance --interactive
```

### Additional Options

- `--model`: Specify a different model (e.g., `--model openai:gpt-4o`)
- `--quiet`: Disable verbose logging (only show final responses)
- `--verbose`: Enable verbose logging (default)

## Using Agents in Your Code

You can import and use the agents directly in your Python code:

```python
import asyncio
from ibmi_agents import create_agent, chat_with_agent

async def main():
    # Create a performance agent
    ctx = await create_agent("performance", model_id="ollama:llama3.2")
    
    # Use the agent in an async context
    async with ctx as (agent, session):
        # Send a query to the agent
        response = await chat_with_agent(
            agent,
            "What is my system status?",
            thread_id="my-session-1"
        )
        print(response)

if __name__ == "__main__":
    asyncio.run(main())
```

### Available Functions in ibmi_agents.py

- `create_agent(agent_type, **kwargs)`: Create an agent of the specified type
- `chat_with_agent(agent, message, thread_id, verbose)`: Send a message to an agent and get the response
- `list_available_agents()`: Get information about all available agent types
- `set_verbose_logging(enabled)`: Enable or disable verbose logging globally
- `get_verbose_logging()`: Get current verbose logging status

### Agent Types

- `performance`: System performance monitoring and analysis
- `discovery`: High-level system discovery and summarization
- `browse`: Detailed system browsing and exploration
- `search`: System search and lookup capabilities

### Model Configuration

You can specify different models when creating agents:

```python
# Using Ollama (local models)
ctx = await create_agent("performance", model_id="ollama:llama3.2")

# Using OpenAI (requires API key)
ctx = await create_agent("performance", model_id="openai:gpt-4o")

# Using Anthropic (requires API key)
ctx = await create_agent("performance", model_id="anthropic:claude-3.7-sonnet")
```