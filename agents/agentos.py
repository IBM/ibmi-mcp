from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.os import AgentOS
from dotenv import load_dotenv
from agno.tools.mcp import MCPTools
from agno.db.sqlite import SqliteDb

db = SqliteDb(
    db_file="tmp/ibmi_agent.db",
    memory_table="ibmi_agent_memory",
    session_table="ibmi_agent_sessions",
    metrics_table="ibmi_agent_metrics",
    eval_table="ibmi_agent_evals",
    knowledge_table="ibmi_agent_knowledge"
)

mcp_tools = MCPTools(
    transport="streamable-http",
    url = "http://127.0.0.1:3010/mcp"
)

load_dotenv()  # Load environment variables from .env file

assistant = Agent(
    name="IBM i Agent",
    model=OpenAIChat(id="gpt-4o"),
    instructions=["You are a helpful assistant that helps users with IBM i related tasks."],
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
    description="IBM i AgentOS",
    agents=[assistant]
)

app = agent_os.get_app()

if __name__ == "__main__":
    # Default port is 7777; change with port=...
    agent_os.serve(app="agentos:app", reload=True)