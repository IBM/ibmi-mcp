# IBM i Agents with Google ADK Framework

This directory contains the implementation of IBM i agents using the Google ADK framework. These agents provide specialized capabilities for interacting with IBM i systems.

## Available Agents

- **Performance Agent**: Analyzes IBM i performance metrics and suggests optimizations
- **System Admin Discovery Agent**: Discovers IBM i services, schemas, and system structure
- **System Admin Browse Agent**: Explores and navigates IBM i system objects and libraries
- **System Admin Search Agent**: Searches for specific IBM i objects and provides quick lookups

## Prerequisites

- Python 3.13+
- Google ADK framework
- IBM i Agent SDK
- Access to an IBM i MCP server

## Installation

### Using uv (Recommended)

[uv](https://docs.astral.sh/uv/) is a fast Python package installer and resolver. It's the recommended way to manage dependencies for this project.

1. Install uv if you haven't already:

```bash
# On macOS and Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# On Windows
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

2. Create a virtual environment and install dependencies:

```bash
# Navigate to the project directory
cd agents/frameworks/google_adk

# Create and activate virtual environment with uv
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
uv pip install google-adk ibmi-agent-sdk python-dotenv fastapi
```

### Using pip

Alternatively, you can use pip:

```bash
pip install google-adk ibmi-agent-sdk python-dotenv fastapi
```

### Environment Setup

Set up environment variables:

```bash
# Create a .env file with the following variables
IBMI_MCP_ACCESS_TOKEN=your_access_token
IBMI_MCP_SERVER_URL=http://127.0.0.1:3010/mcp  # Default MCP server URL
IBMI_AGENT_MODEL=watsonx/meta-llama/llama-3-3-70b-instruct  # Default LLM model
IBMI_AGENT_LOG_LEVEL=INFO                      # Logging level
```

## Usage

### Command Line Interface

The `main.py` script provides a command-line interface for running the agents.

#### Using uv (Recommended)

```bash
# Run with uv
uv run main.py --agent performance --query "Show me system CPU usage"

# Or activate the virtual environment first
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
python main.py --agent performance --query "Show me system CPU usage"
```

#### Basic Examples

```bash
# Run a performance agent
python main.py --agent performance --query "Show me system CPU usage"

# Run a system admin discovery agent
python main.py --agent sysadmin_discovery --query "List available schemas"

# Run a system admin browse agent
python main.py --agent sysadmin_browse --query "Show me objects in QSYS2"

# Run a system admin search agent
python main.py --agent sysadmin_search --query "Find all tables with CUSTOMER in the name"

# List available agents
python main.py --list-agents
```

#### Advanced Options

```bash
# Enable verbose output with detailed logging
python main.py --agent performance --query "Show me system CPU usage" --verbose

# Quiet mode - only show final response without logs
python main.py --agent performance --query "Show me system CPU usage" --quiet

# Use a different LLM model
python main.py --agent performance --query "Show me system CPU usage" --model "gpt-4"

# Combine options (note: --verbose and --quiet are mutually exclusive)
python main.py --agent sysadmin_search --query "Find QSYS2" --model "gemini-2.0-flash"
```

### Programmatic Usage

You can also use the agents programmatically in your Python code:

```python
import asyncio
from dotenv import load_dotenv
from src.ibmi_agents.agents.ibmi_agents import create_performance_agent, chat_with_agent

async def main():
    # Load environment variables
    load_dotenv()
    
    # Create a performance agent
    agent = await create_performance_agent()
    
    # Chat with the agent
    response = await chat_with_agent(agent, "Show me system CPU usage")
    
    # Print the response
    print(response)

if __name__ == "__main__":
    asyncio.run(main())
```

### Advanced Usage with Google ADK Runner

For more advanced use cases, you can use the Google ADK Runner directly:

```python
import asyncio
from dotenv import load_dotenv
from google.adk.sessions import InMemorySessionService
from google.adk.runners import Runner
from google.genai import types
from src.ibmi_agents.agents.ibmi_agents import create_performance_agent

async def main():
    # Load environment variables
    load_dotenv()
    
    # Create a session
    session_service = InMemorySessionService()
    await session_service.create_session(app_name="my_app", user_id="user123", session_id="session456")
    
    # Create an agent
    agent, toolset = await create_performance_agent()
    
    # Create a runner
    runner = Runner(app_name="my_app", agent=agent, session_service=session_service)
    
    # Format the query
    query = "Show me system CPU usage"
    content = types.Content(role='user', parts=[types.Part(text=query)])
    
    # Run the agent and process events
    events = runner.run_async(user_id="user123", session_id="session456", new_message=content)
    async for event in events:
        if event.is_final_response():
            final_response = event.content.parts[0].text
            print(final_response)
    await toolset.close()

if __name__ == "__main__":
    asyncio.run(main())
```

## Development

### Mock Mode

The agents can run in a mock mode when the required dependencies are not available. This is useful for development and testing without an actual MCP server connection.

### Adding New Agents

To add a new agent:

1. Create a new agent creation function in `src/ibmi_agents/agents/ibmi_agents.py`
2. Add the agent to the `AVAILABLE_AGENTS` dictionary in `main.py`
3. Update the documentation to reflect the new agent

### Creating Workflows

You can create complex workflows by combining multiple agents. See `src/ibmi_agents/workflows/system_health_audit_flow.py` for an example of a workflow that uses multiple agents.

## Testing

A test script is provided to verify the implementation.

### Using uv

```bash
# Test all agent types
uv run test_agents.py --test-all

# Test a specific agent type
uv run test_agents.py --test-agent performance

# Test chatting with an agent
uv run test_agents.py --test-chat "Show me system CPU usage"

# Test running a workflow
uv run test_agents.py --test-workflow

# Enable verbose output
uv run test_agents.py --test-all --verbose
```

### Using python directly

```bash
# Activate virtual environment first
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Then run tests
python test_agents.py --test-all
python test_agents.py --test-agent performance
python test_agents.py --test-chat "Show me system CPU usage"
python test_agents.py --test-workflow
python test_agents.py --test-all --verbose
```

## Troubleshooting

- **Missing IBMI_MCP_ACCESS_TOKEN**: Ensure you have set the access token in your environment variables or .env file
- **Connection errors**: Verify that the MCP server is running and accessible at the specified URL
- **Import errors**: Make sure all required dependencies are installed
- **Google ADK errors**: Ensure you have the latest version of Google ADK installed

## License

This project is licensed under the MIT License - see the LICENSE file for details.