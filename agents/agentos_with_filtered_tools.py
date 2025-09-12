"""
IBM i Agent with FilteredMCPTools

This version uses the new FilteredMCPTools class that properly extends agno's MCPTools
with toolset-based filtering capabilities.
"""

from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.os import AgentOS
from dotenv import load_dotenv
from agno.db.sqlite import SqliteDb
from agno.tools.mcp import MCPTools

# Import our FilteredMCPTools
from tools.filtered_mcp_tools import (
    FilteredMCPTools
)

load_dotenv()  # Load environment variables from .env file

# Database configuration
db = SqliteDb(
    db_file="tmp/ibmi_agent.db",
    memory_table="ibmi_agent_memory",
    session_table="ibmi_agent_sessions",
    metrics_table="ibmi_agent_metrics",
    eval_table="ibmi_agent_evals",
    knowledge_table="ibmi_agent_knowledge"
)

# Option 1: Performance tools only (recommended for focused performance monitoring)
mcp_tools = FilteredMCPTools(
    url="http://127.0.0.1:3010/mcp",
    transport="streamable-http",
    toolsets=["performance"]
)
agent_name = "IBM i Performance Agent"
instructions = [
    "You are a specialized IBM i performance monitoring assistant.",
    "You have access to performance-related MCP tools only.",
    "Focus on helping users monitor system performance, memory usage, and system activity.",
    "Always explain what performance metrics you're checking and why.",
    "Provide actionable insights based on the performance data you gather."
]
print("✓ Using performance tools only")

print(f"type check:{isinstance(mcp_tools, MCPTools)}")
# Create agent
assistant = Agent(
    name=agent_name,
    model=OpenAIChat(id="gpt-4o"),
    instructions=instructions,
    db=db,
    tools=[mcp_tools],
    markdown=True,
    enable_agentic_memory=True,
    enable_user_memories=True,
    search_knowledge=True,
    add_history_to_context=True,
    read_chat_history=True,
    debug_mode=True
)

agent_os = AgentOS(
    os_id="ibmi-agentos",
    description="IBM i AgentOS Filtered Tools",
    agents=[assistant]
)

app = agent_os.get_app()

if __name__ == "__main__":
    # Default port is 7777; change with port=...
    agent_os.serve(app="agentos_with_filtered_tools:app", reload=True)