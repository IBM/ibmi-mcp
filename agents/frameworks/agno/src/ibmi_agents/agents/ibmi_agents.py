"""
IBM i Specialized Agents Collection

This module defines a collection of specialized agno agents using FilteredMCPTools
for different IBM i system administration and monitoring tasks. Each agent is 
configured with specific toolsets based on the prebuiltconfigs.

Available agents:
- Performance Agent: System performance monitoring and analysis
- SysAdmin Discovery Agent: High-level system discovery and summarization
- SysAdmin Browse Agent: Detailed system browsing and exploration  
- SysAdmin Search Agent: System search and lookup capabilities
"""

from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.models.ollama import Ollama
from agno.db.sqlite import SqliteDb
from dotenv import load_dotenv

from ..tools.filtered_mcp_tools import FilteredMCPTools

# Load environment variables
load_dotenv()

# Shared database instance for all agents
# Using a single database instance ensures consistent ID across all agents
_shared_db = None

def get_shared_db() -> SqliteDb:
    """
    Get or create the shared database instance for all agents.

    This ensures all agents use the same database instance with a consistent ID,
    preventing database ID conflicts in AgentOS.

    Returns:
        Shared SqliteDb instance
    """
    global _shared_db
    if _shared_db is None:
        _shared_db = SqliteDb(
            db_file="tmp/ibmi_agents.db",
            memory_table="agent_memory",
            session_table="agent_sessions",
            metrics_table="agent_metrics",
            eval_table="agent_evals",
            knowledge_table="agent_knowledge"
        )
    return _shared_db

# Default MCP connection settings
DEFAULT_MCP_URL = "http://127.0.0.1:3010/mcp"
DEFAULT_TRANSPORT = "streamable-http"

# Performance Monitoring Agent
def create_performance_agent(
    model_id: str = "gpt-4o",
    mcp_url: str = DEFAULT_MCP_URL,
    transport: str = DEFAULT_TRANSPORT,
    debug_filtering: bool = False,
    **kwargs
) -> Agent:
    """
    Create an IBM i Performance Monitoring Agent.
    
    This agent specializes in system performance analysis, monitoring CPU, memory,
    I/O metrics, and providing insights on system resource utilization.
    
    Args:
        model_id: OpenAI model to use (default: gpt-4o)
        mcp_url: MCP server URL
        transport: MCP transport type
        **kwargs: Additional agent configuration options
        
    Returns:
        Configured Agent instance for performance monitoring
    """
    performance_tools = FilteredMCPTools(
        url=mcp_url,
        transport=transport,
        annotation_filters={"toolsets": ["performance"]},
        debug_filtering=debug_filtering
    )
    
    return Agent(
        name="IBM i Performance Monitor",
        model=OpenAIChat(id=model_id),
        instructions=[
            "You are a specialized IBM i performance monitoring assistant.",
            "You have access to comprehensive performance monitoring tools including:",
            "- System status and activity monitoring",
            "- Memory pool analysis", 
            "- Temporary storage tracking",
            "- HTTP server performance metrics",
            "- Active job analysis and CPU consumption tracking",
            "- System value monitoring",
            "- Collection Services configuration",
            "",
            "Your role is to:",
            "- Monitor and analyze system performance metrics",
            "- Identify performance bottlenecks and resource constraints", 
            "- Provide actionable recommendations for optimization",
            "- Explain performance data in business terms",
            "- Help troubleshoot performance-related issues",
            "",
            "Always explain what metrics you're checking and why they're important.",
            "Provide context for normal vs. concerning values when analyzing data.",
            "Focus on actionable insights rather than just presenting raw data."
        ],
        db=get_shared_db(),
        tools=[performance_tools],
        markdown=True,
        enable_agentic_memory=True,
        enable_user_memories=True,
        search_knowledge=True,
        add_history_to_context=True,
        read_chat_history=True,
        **kwargs
    )

# System Administration Discovery Agent  
def create_sysadmin_discovery_agent(
    model_id: str = "gpt-4o",
    mcp_url: str = DEFAULT_MCP_URL,
    transport: str = DEFAULT_TRANSPORT,
    debug_filtering: bool = False,
    **kwargs
) -> Agent:
    """
    Create an IBM i System Administration Discovery Agent.
    
    This agent specializes in high-level system discovery, providing summaries
    and counts of system services and components.
    
    Args:
        model_id: OpenAI model to use (default: gpt-4o)
        mcp_url: MCP server URL
        transport: MCP transport type
        **kwargs: Additional agent configuration options
        
    Returns:
        Configured Agent instance for system discovery
    """
    discovery_tools = FilteredMCPTools(
        url=mcp_url,
        transport=transport,
        annotation_filters={"toolsets": ["sysadmin_discovery"]},
        debug_filtering=debug_filtering
    )
    
    return Agent(
        name="IBM i SysAdmin Discovery",
        model=OpenAIChat(id=model_id),
        instructions=[
            "You are a specialized IBM i system administration discovery assistant.",
            "You help administrators get high-level overviews and summaries of system components.",
            "",
            "Your discovery tools include:",
            "- Service category listings and counts",
            "- Schema-based service summaries", 
            "- SQL object type categorization",
            "- Cross-referencing capabilities",
            "",
            "Your role is to:",
            "- Provide high-level system overviews and inventories",
            "- Help administrators understand the scope and organization of system services",
            "- Summarize system components by category, schema, and type",
            "- Identify patterns and relationships in system organization",
            "",
            "Focus on providing clear, organized summaries that help administrators",
            "understand what's available on their system and how it's organized.",
            "Use counts and categorizations to give context about system complexity."
        ],
        db=get_shared_db(),
        tools=[discovery_tools],
        markdown=True,
        enable_agentic_memory=True,
        enable_user_memories=True,
        search_knowledge=True,
        add_history_to_context=True,
        read_chat_history=True,
        **kwargs
    )

# System Administration Browse Agent
def create_sysadmin_browse_agent(
    model_id: str = "gpt-4o",
    mcp_url: str = DEFAULT_MCP_URL,
    transport: str = DEFAULT_TRANSPORT,
    debug_filtering: bool = False,
    **kwargs
) -> Agent:
    """
    Create an IBM i System Administration Browse Agent.
    
    This agent specializes in detailed browsing and exploration of system services,
    allowing deep dives into specific categories, schemas, and object types.
    
    Args:
        model_id: OpenAI model to use (default: gpt-4o)
        mcp_url: MCP server URL
        transport: MCP transport type
        **kwargs: Additional agent configuration options
        
    Returns:
        Configured Agent instance for system browsing
    """
    browse_tools = FilteredMCPTools(
        url=mcp_url,
        transport=transport,
        annotation_filters={"toolsets": ["sysadmin_browse"]},
        debug_filtering=debug_filtering
    )
    
    return Agent(
        name="IBM i SysAdmin Browser",
        model=OpenAIChat(id=model_id),
        instructions=[
            "You are a specialized IBM i system administration browsing assistant.",
            "You help administrators explore and examine system services in detail.",
            "",
            "Your browsing tools include:",
            "- Listing services by specific categories",
            "- Exploring services within specific schemas (QSYS2, SYSTOOLS, etc.)",
            "- Filtering services by SQL object type (VIEW, PROCEDURE, FUNCTION, etc.)",
            "- Detailed service metadata and compatibility information",
            "",
            "Your role is to:",
            "- Help administrators explore specific areas of interest in depth",
            "- Provide detailed listings and metadata for system services",
            "- Explain service compatibility and release requirements",
            "- Guide users through logical browsing paths",
            "",
            "Focus on helping users navigate and understand the details of what they find.",
            "Explain technical concepts like SQL object types and release compatibility.",
            "Suggest related services or logical next steps in their exploration."
        ],
        db=get_shared_db(),
        tools=[browse_tools],
        markdown=True,
        enable_agentic_memory=True,
        enable_user_memories=True,
        search_knowledge=True,
        add_history_to_context=True,
        read_chat_history=True,
        **kwargs
    )

# System Administration Search Agent
def create_sysadmin_search_agent(
    model_id: str = "gpt-4o",
    mcp_url: str = DEFAULT_MCP_URL,
    transport: str = DEFAULT_TRANSPORT,
    debug_filtering: bool = False,
    **kwargs
) -> Agent:
    """
    Create an IBM i System Administration Search Agent.
    
    This agent specializes in searching and lookup capabilities, helping users
    find specific services, examples, and usage patterns.
    
    Args:
        model_id: OpenAI model to use (default: gpt-4o)
        mcp_url: MCP server URL
        transport: MCP transport type
        **kwargs: Additional agent configuration options
        
    Returns:
        Configured Agent instance for system search
    """
    search_tools = FilteredMCPTools(
        url=mcp_url,
        transport=transport,
        annotation_filters={"toolsets": ["sysadmin_search"]},
        debug_filtering=debug_filtering
    )
    
    return Agent(
        name="IBM i SysAdmin Search",
        model=OpenAIChat(id=model_id),
        instructions=[
            "You are a specialized IBM i system administration search assistant.",
            "You help administrators find specific services, examples, and usage information.",
            "",
            "Your search capabilities include:",
            "- Case-insensitive service name searching",
            "- Locating services across all schemas",
            "- Searching example code and usage patterns", 
            "- Retrieving specific service examples and documentation",
            "",
            "Your role is to:",
            "- Help users find specific services they're looking for",
            "- Locate usage examples and code snippets",
            "- Provide exact service locations and metadata",
            "- Search through documentation and examples for keywords",
            "",
            "Focus on helping users find exactly what they're looking for quickly.",
            "When showing examples, explain the context and provide usage guidance.",
            "If multiple matches are found, help users understand the differences.",
            "Suggest related searches or alternative terms when searches yield few results."
        ],
        db=get_shared_db(),
        tools=[search_tools],
        markdown=True,
        enable_agentic_memory=True,
        enable_user_memories=True,
        search_knowledge=True,
        add_history_to_context=True,
        read_chat_history=True,
        **kwargs
    )

# Agent Collection and Management
AVAILABLE_AGENTS = {
    "performance": create_performance_agent,
    "discovery": create_sysadmin_discovery_agent,
    "browse": create_sysadmin_browse_agent,
    "search": create_sysadmin_search_agent,
}

def create_agent(agent_type: str, **kwargs) -> Agent:
    """
    Create an agent of the specified type.
    
    Args:
        agent_type: Type of agent to create ("performance", "discovery", "browse", "search")
        **kwargs: Additional configuration options passed to the agent constructor
        
    Returns:
        Configured Agent instance
        
    Raises:
        ValueError: If agent_type is not recognized
    """
    if agent_type not in AVAILABLE_AGENTS:
        available = ", ".join(AVAILABLE_AGENTS.keys())
        raise ValueError(f"Unknown agent type '{agent_type}'. Available types: {available}")
    
    return AVAILABLE_AGENTS[agent_type](**kwargs)

def list_available_agents() -> dict:
    """
    Get information about all available agent types.
    
    Returns:
        Dictionary mapping agent types to their descriptions
    """
    return {
        "performance": "System performance monitoring and analysis",
        "discovery": "High-level system discovery and summarization", 
        "browse": "Detailed system browsing and exploration",
        "search": "System search and lookup capabilities"
    }

# Example usage and testing
if __name__ == "__main__":
    import asyncio
    
    async def test_agents():
        """Test all agent types with a simple query."""
        print("=== Testing IBM i Specialized Agents ===\n")
        
        for agent_type in AVAILABLE_AGENTS.keys():
            print(f"Testing {agent_type} agent...")
            try:
                agent = create_agent(agent_type, debug_filtering=True)
                print(f"✓ {agent.name} created successfully")
                print(f"  Tools: {len(agent.tools[0].functions) if agent.tools and hasattr(agent.tools[0], 'functions') else 'N/A'}")
                
                # Test a simple query
                async with agent.tools[0]:
                    print(f"  MCP Tools initialized: {len(agent.tools[0].functions)} functions available")
                    
            except Exception as e:
                print(f"✗ Failed to create {agent_type} agent: {e}")
            
            print()
    
    # Run the tests
    asyncio.run(test_agents())