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
from ibmi_agents import (
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
    annotation_filters={
        "toolsets": ["performance"]
    }
)
print(mcp_tools.debug_filtering)
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
    tools=[],
    markdown=True,
    enable_agentic_memory=True,
    enable_user_memories=True,
    search_knowledge=True,
    add_history_to_context=True,
    read_chat_history=True,
    debug_mode=True
)

async def main():
    async with mcp_tools:  # Use async context manager for proper cleanup
        assistant.tools.extend([mcp_tools])  # Ensure tools are set after connection
        await assistant.aprint_response("what tools do you have access to?")


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())