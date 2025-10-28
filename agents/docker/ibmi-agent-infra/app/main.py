"""AgentOS Demo"""

import asyncio
from pathlib import Path

from agno.os import AgentOS

from agents.agno_assist import get_agno_assist
from agents.ibmi_agents import get_performance_agent
from agents.web_agent import get_web_agent
from workflows import (
    simple_performance_workflow,
    performance_investigation_workflow,
    capacity_planning_workflow,
    database_tuning_workflow,
)

os_config_path = str(Path(__file__).parent.joinpath("config.yaml"))

watsonx_llama = "watsonx:meta-llama/llama-3-3-70b-instruct"
anthropic_claude = "anthropic:claude-sonnet-4-5"

web_agent = get_web_agent(model_id="gpt-4o")
agno_assist = get_agno_assist(model_id="gpt-4o")
performance_agent = get_performance_agent(model=anthropic_claude)

# Create the AgentOS
agent_os = AgentOS(
    os_id="agentos-demo",
    agents=[web_agent, agno_assist, performance_agent],
    workflows=[
        simple_performance_workflow,
        performance_investigation_workflow,
        capacity_planning_workflow,
        database_tuning_workflow,
    ],
    # Configuration for the AgentOS
    config=os_config_path,
    enable_mcp=True,
)
app = agent_os.get_app()

if __name__ == "__main__":
    # Add knowledge to Agno Assist agent
    asyncio.run(
        agno_assist.knowledge.add_content_async(  # type: ignore
            name="Agno Docs",
            url="https://docs.agno.com/llms-full.txt",
        )
    )
    # Simple run to generate and record a session
    agent_os.serve(app="main:app", reload=True)
