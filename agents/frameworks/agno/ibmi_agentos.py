"""
IBM i Multi-Agent Operating System

This module demonstrates how to run multiple specialized IBM i agents
using AgentOS with FilteredMCPTools for different system administration tasks.

Each agent is specialized for specific toolsets and can be accessed
independently through the AgentOS interface.
"""

from agno.os import AgentOS
from dotenv import load_dotenv

from ibmi_agents import (
    create_performance_agent,
    create_sysadmin_discovery_agent,
    create_sysadmin_browse_agent,
    create_sysadmin_search_agent
)

# Load environment variables
load_dotenv()

# Create specialized agents
performance_agent = create_performance_agent(debug_filtering=True)
discovery_agent = create_sysadmin_discovery_agent(debug_filtering=True)
browse_agent = create_sysadmin_browse_agent(debug_filtering=True)
search_agent = create_sysadmin_search_agent(debug_filtering=True)

# Create AgentOS with all specialized agents
agent_os = AgentOS(
    os_id="ibmi-multi-agent-os",
    description="IBM i Multi-Agent System with Specialized Toolsets",
    agents=[
        performance_agent,
        discovery_agent,
        browse_agent,
        search_agent
    ]
)

app = agent_os.get_app()

if __name__ == "__main__":
    print("=== IBM i Multi-Agent Operating System ===")
    print(f"Starting AgentOS with {len(agent_os.agents)} specialized agents:")
    
    for agent in agent_os.agents:
        print(f"  - {agent.name}")
    
    print(f"\nAccess the web interface at: http://localhost:7777")
    print("Each agent specializes in different IBM i administration tasks:")
    print("  - Performance Monitor: System performance analysis")
    print("  - SysAdmin Discovery: High-level system discovery")
    print("  - SysAdmin Browser: Detailed system exploration")
    print("  - SysAdmin Search: Service search and lookup")
    print()
    
    # Default port is 7777; change with port=...
    agent_os.serve(app="ibmi_agentos:app", reload=True)