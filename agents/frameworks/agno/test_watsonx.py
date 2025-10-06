from ibmi_agent_sdk.agno import MyWatsonx as WatsonX

from agno.agent import Agent
from agno.os import AgentOS
from agno.tools.mcp import MCPTools
import os
from dotenv import load_dotenv
from agno.tools import tool

@tool(
    name="my_tool",
)
def my_tool() -> str:
    return "This is my custom tool"

@tool(
    name="add",
)
def add(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b


load_dotenv()

# Create MCPTools instance
mcp_tools = MCPTools("npx -y @openbnb/mcp-server-airbnb --ignore-robots-txt")

# Create MCP-enabled agent
agent = Agent(
    model=WatsonX(
        id=os.getenv("IBM_WATSONX_MODEL_ID"),
        url=os.getenv("IBM_WATSONX_BASE_URL"),
        api_key=os.getenv("IBM_WATSONX_API_KEY"),
        project_id=os.getenv("IBM_WATSONX_PROJECT_ID"),
    ),
    id="agno-agent",
    name="Agno Agent",
    tools=[my_tool, add],
    debug_mode=True,
    markdown=True
)

# AgentOS manages MCP lifespan
agent_os = AgentOS(
    description="AgentOS with MCP Tools",
    agents=[agent],
)

app = agent_os.get_app()

if __name__ == "__main__":
    # Don't use reload=True with MCP tools to avoid lifespan issues
    # agent_os.serve(app="test_watsonx:app")
    
    agent.cli_app(markdown=True)
