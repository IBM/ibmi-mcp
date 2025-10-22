"""
IBM i Specialized Agents Collection - LangGraph Implementation

This module defines a collection of specialized LangGraph agents for different 
IBM i system administration and monitoring tasks. Each agent has domain-specific 
instructions but access to all MCP tools.

Available agents:
- Performance Agent: System performance monitoring and analysis
- SysAdmin Discovery Agent: High-level system discovery and summarization
- SysAdmin Browse Agent: Detailed system browsing and exploration  
- SysAdmin Search Agent: System search and lookup capabilities

Based on the working ibmi_agents_prebuilt_debug.py pattern.
"""

import asyncio
import os
import json
import getpass
from typing import Dict, Any, List
from contextlib import asynccontextmanager
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langgraph.prebuilt import create_react_agent
from langchain_mcp_adapters.client import MultiServerMCPClient

# Import MCP tools from the SDK package
from ibmi_agent_sdk.langchain import load_filtered_mcp_tools, load_toolset_tools

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.store.memory import InMemoryStore
from langchain_core.messages import AIMessage, ToolMessage, HumanMessage
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Disable LangSmith tracing by default (can be enabled via env var)
os.environ.setdefault("LANGCHAIN_TRACING_V2", "false")

# Enable verbose logging
VERBOSE_LOGGING = os.getenv("VERBOSE_LOGGING", "true").lower() == "true"

# Default MCP connection settings
DEFAULT_MCP_URL = "http://127.0.0.1:3010/mcp"
DEFAULT_TRANSPORT = "streamable_http"

# -----------------------------------------------------------------------------
# Shared Memory Management
# -----------------------------------------------------------------------------
_shared_checkpointer = None
_shared_store = None
_mcp_client = None

def get_shared_checkpointer() -> InMemorySaver:
    """Get or create shared checkpointer for all agents."""
    global _shared_checkpointer
    if _shared_checkpointer is None:
        _shared_checkpointer = InMemorySaver()
    return _shared_checkpointer

def get_shared_store() -> InMemoryStore:
    """Get or create shared memory store for all agents."""
    global _shared_store
    if _shared_store is None:
        _shared_store = InMemoryStore()
    return _shared_store

def get_mcp_client(url: str = DEFAULT_MCP_URL, transport: str = DEFAULT_TRANSPORT) -> MultiServerMCPClient:
    """Get or create shared MCP client."""
    global _mcp_client
    if _mcp_client is None:
        _mcp_client = MultiServerMCPClient({
            "ibmi_tools": {"url": url, "transport": transport}
        })
    return _mcp_client

# -----------------------------------------------------------------------------
# Model Selection
# -----------------------------------------------------------------------------
def ensure_api_keys(model_id: str):
    """
    Ensure that the necessary API keys are available for the specified model.
    
    Args:
        model_id: Model identifier with provider prefix
    """
    if model_id.startswith("openai:") and not os.environ.get("OPENAI_API_KEY"):
        print("OpenAI API key not found in environment variables.")
        os.environ["OPENAI_API_KEY"] = getpass.getpass("Enter your OpenAI API key: ")
        
    elif model_id.startswith("anthropic:") and not os.environ.get("ANTHROPIC_API_KEY"):
        print("Anthropic API key not found in environment variables.")
        os.environ["ANTHROPIC_API_KEY"] = getpass.getpass("Enter your Anthropic API key: ")

def get_model(model_id: str = "gpt-oss:20b", temperature: float = 0.3):
    """
    Get a chat model instance based on the model_id.
    
    Supports:
    - Ollama models: "gpt-oss:20b", "llama3", "mistral", etc.
    - OpenAI models: "openai:gpt-4o", "openai:gpt-3.5-turbo", etc.
    - Anthropic models: "anthropic:claude-3-opus", "anthropic:claude-3-sonnet", etc.
    
    Args:
        model_id: Model identifier with optional provider prefix
        temperature: Model temperature
        
    Returns:
        LangChain chat model instance
    """
    # Ensure API keys are available for the selected model
    ensure_api_keys(model_id)
    
    # Handle OpenAI models
    if model_id.startswith("openai:"):
        model_name = model_id.split(":", 1)[1]
        return ChatOpenAI(model=model_name, temperature=temperature)
    
    # Handle Anthropic models
    elif model_id.startswith("anthropic:"):
        model_name = model_id.split(":", 1)[1]
        return ChatAnthropic(model=model_name, temperature=temperature)
    
    # Handle Ollama models
    elif model_id.startswith("ollama:"):
        model_name = model_id.split(":", 1)[1]
        return ChatOllama(model=model_name, temperature=temperature)
    
    # Default to Ollama if no prefix is specified
    else:
        return ChatOllama(model=model_id, temperature=temperature)

# -----------------------------------------------------------------------------
# Agent Creation Functions
# -----------------------------------------------------------------------------

async def create_performance_agent(
    model_id: str = "gpt-oss:20b",
    mcp_url: str = DEFAULT_MCP_URL,
    transport: str = DEFAULT_TRANSPORT,
    **kwargs
):
    """
    Create IBM i Performance Monitoring Agent.
    
    This creates an agent with MCP tools loaded. The MCP session generator
    is returned so the caller can manage the session lifecycle.
    
    Usage:
        session_gen = await create_performance_agent()
        async with session_gen as (agent, session):
            # Use agent while session is active
            result = await agent.ainvoke(...)
    
    Returns:
        AsyncContextManager that yields (agent, session)
    """
    client = get_mcp_client(mcp_url, transport)
    
    # Return an async context manager
    @asynccontextmanager
    async def agent_session():
        async with client.session("ibmi_tools") as session:
            # Load only performance tools for this agent
            tools = await load_toolset_tools(session, "performance", debug=True)
            print(f"✅ Loaded {len(tools)} performance tools for Performance Agent")
            
            system_message = """You are a specialized IBM i performance monitoring assistant.
You have access to comprehensive performance monitoring tools including:
- System status and activity monitoring
- Memory pool analysis
- Temporary storage tracking
- HTTP server performance metrics
- Active job analysis and CPU consumption tracking
- System value monitoring
- Collection Services configuration

Your role is to:
- Monitor and analyze system performance metrics
- Identify performance bottlenecks and resource constraints
- Provide actionable recommendations for optimization
- Explain performance data in business terms
- Help troubleshoot performance-related issues

Always explain what metrics you're checking and why they're important.
Provide context for normal vs. concerning values when analyzing data.
Focus on actionable insights rather than just presenting raw data."""
        
            llm = get_model(model_id)
            
            agent = create_react_agent(
                model=llm,
                tools=tools,
                prompt=system_message,
                checkpointer=get_shared_checkpointer(),
                store=get_shared_store(),
                **kwargs
            )
            
            agent.name = "IBM i Performance Monitor"
            yield agent, session
    
    return agent_session()

async def create_sysadmin_discovery_agent(
    model_id: str = "gpt-oss:20b",
    mcp_url: str = DEFAULT_MCP_URL,
    transport: str = DEFAULT_TRANSPORT,
    **kwargs
):
    """
    Create IBM i SysAdmin Discovery Agent.
    
    Returns an async context manager that yields (agent, session).
    Usage: async with (await create_sysadmin_discovery_agent()) as (agent, session): ...
    """
    client = get_mcp_client(mcp_url, transport)
    
    @asynccontextmanager
    async def agent_session():
        async with client.session("ibmi_tools") as session:
            # Load only sysadmin discovery tools for this agent
            tools = await load_toolset_tools(session, "sysadmin_discovery", debug=True)
            print(f"✅ Loaded {len(tools)} sysadmin discovery tools for Discovery Agent")
            
            system_message = """You are a specialized IBM i system administration discovery assistant.
You help administrators get high-level overviews and summaries of system components.

Your discovery tools include:
- Service category listings and counts
- Schema-based service summaries
- SQL object type categorization
- Cross-referencing capabilities

Your role is to:
- Provide high-level system overviews and inventories
- Help administrators understand the scope and organization of system services
- Summarize system components by category, schema, and type
- Identify patterns and relationships in system organization

Focus on providing clear, organized summaries that help administrators
understand what's available on their system and how it's organized.
Use counts and categorizations to give context about system complexity."""
            
            llm = get_model(model_id)
            
            agent = create_react_agent(
                model=llm,
                tools=tools,
                prompt=system_message,
                checkpointer=get_shared_checkpointer(),
                store=get_shared_store(),
                **kwargs
            )
            
            agent.name = "IBM i SysAdmin Discovery"
            yield agent, session
    
    return agent_session()

async def create_sysadmin_browse_agent(
    model_id: str = "gpt-oss:20b",
    mcp_url: str = DEFAULT_MCP_URL,
    transport: str = DEFAULT_TRANSPORT,
    **kwargs
):
    """
    Create IBM i SysAdmin Browse Agent.
    
    Returns an async context manager that yields (agent, session).
    Usage: async with (await create_sysadmin_browse_agent()) as (agent, session): ...
    """
    client = get_mcp_client(mcp_url, transport)
    
    @asynccontextmanager
    async def agent_session():
        async with client.session("ibmi_tools") as session:
            # Load only sysadmin browse tools for this agent
            tools = await load_toolset_tools(session, "sysadmin_browse", debug=True)
            print(f"✅ Loaded {len(tools)} sysadmin browse tools for Browse Agent")
            
            system_message = """You are a specialized IBM i system administration browsing assistant.
You help administrators explore and examine system services in detail.

Your browsing tools include:
- Listing services by specific categories
- Exploring services within specific schemas (QSYS2, SYSTOOLS, etc.)
- Filtering services by SQL object type (VIEW, PROCEDURE, FUNCTION, etc.)
- Detailed service metadata and compatibility information

Your role is to:
- Help administrators explore specific areas of interest in depth
- Provide detailed listings and metadata for system services
- Explain service compatibility and release requirements
- Guide users through logical browsing paths

Focus on helping users navigate and understand the details of what they find.
Explain technical concepts like SQL object types and release compatibility.
Suggest related services or logical next steps in their exploration."""
            
            llm = get_model(model_id)
            
            agent = create_react_agent(
                model=llm,
                tools=tools,
                prompt=system_message,
                checkpointer=get_shared_checkpointer(),
                store=get_shared_store(),
                **kwargs
            )
            
            agent.name = "IBM i SysAdmin Browser"
            yield agent, session
    
    return agent_session()

async def create_sysadmin_search_agent(
    model_id: str = "gpt-oss:20b",
    mcp_url: str = DEFAULT_MCP_URL,
    transport: str = DEFAULT_TRANSPORT,
    **kwargs
):
    """
    Create IBM i SysAdmin Search Agent.
    
    Returns an async context manager that yields (agent, session).
    Usage: async with (await create_sysadmin_search_agent()) as (agent, session): ...
    """
    client = get_mcp_client(mcp_url, transport)
    
    @asynccontextmanager
    async def agent_session():
        async with client.session("ibmi_tools") as session:
            # Load only sysadmin search tools for this agent
            tools = await load_toolset_tools(session, "sysadmin_search", debug=True)
            print(f"✅ Loaded {len(tools)} sysadmin search tools for Search Agent")
            
            system_message = """You are a specialized IBM i system administration search assistant.
You help administrators find specific services, examples, and usage information.

Your search capabilities include:
- Case-insensitive service name searching
- Locating services across all schemas
- Searching example code and usage patterns
- Retrieving specific service examples and documentation

Your role is to:
- Help users find specific services they're looking for
- Locate usage examples and code snippets
- Provide exact service locations and metadata
- Search through documentation and examples for keywords

Focus on helping users find exactly what they're looking for quickly.
When showing examples, explain the context and provide usage guidance.
If multiple matches are found, help users understand the differences.
Suggest related searches or alternative terms when searches yield few results."""
            
            llm = get_model(model_id)
            
            agent = create_react_agent(
                model=llm,
                tools=tools,
                prompt=system_message,
                checkpointer=get_shared_checkpointer(),
                store=get_shared_store(),
                **kwargs
            )
            
            agent.name = "IBM i SysAdmin Search"
            yield agent, session
    
    return agent_session()

# -----------------------------------------------------------------------------
# Agent Registry and Factory Pattern
# -----------------------------------------------------------------------------

AVAILABLE_AGENTS = {
    "performance": create_performance_agent,
    "discovery": create_sysadmin_discovery_agent,
    "browse": create_sysadmin_browse_agent,
    "search": create_sysadmin_search_agent,
}

async def create_agent(agent_type: str, **kwargs):
    """
    Create an agent of the specified type.
    
    Args:
        agent_type: Type of agent ("performance", "discovery", "browse", "search")
        **kwargs: Additional configuration options
        
    Returns:
        Configured agent instance
    """
    if agent_type not in AVAILABLE_AGENTS:
        available = ", ".join(AVAILABLE_AGENTS.keys())
        raise ValueError(f"Unknown agent type '{agent_type}'. Available: {available}")
    
    return await AVAILABLE_AGENTS[agent_type](**kwargs)

def list_available_agents() -> Dict[str, str]:
    """Get information about all available agent types."""
    return {
        "performance": "System performance monitoring and analysis",
        "discovery": "High-level system discovery and summarization",
        "browse": "Detailed system browsing and exploration",
        "search": "System search and lookup capabilities"
    }

def set_verbose_logging(enabled: bool):
    """
    Enable or disable verbose logging globally.
    
    Args:
        enabled: True to enable verbose logging, False to disable
    """
    global VERBOSE_LOGGING
    VERBOSE_LOGGING = enabled
    print(f"Verbose logging {'enabled' if enabled else 'disabled'}")

def get_verbose_logging() -> bool:
    """Get current verbose logging status."""
    return VERBOSE_LOGGING

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

def print_section(title: str, symbol: str = "=", width: int = 80):
    """Print a section header."""
    if VERBOSE_LOGGING:
        print(f"\n{symbol * width}")
        print(f"{title:^{width}}")
        print(f"{symbol * width}")

def print_message(label: str, content: str, color: str = ""):
    """Print a message with a label."""
    if VERBOSE_LOGGING:
        colors = {
            "blue": "\033[94m",
            "green": "\033[92m",
            "yellow": "\033[93m",
            "red": "\033[91m",
            "cyan": "\033[96m",
            "end": "\033[0m"
        }
        color_code = colors.get(color, "")
        reset = colors["end"] if color else ""
        print(f"\n{color_code}{label}{reset}")
        print(f"{'-' * 80}")
        print(content)
        print(f"{'-' * 80}")

def print_tool_call(tool_name: str, tool_input: Any):
    """Print a tool call with formatted input."""
    if VERBOSE_LOGGING:
        print(f"\n🔧 {'TOOL CALL':^76} 🔧")
        print(f"{'=' * 80}")
        print(f"Tool: {tool_name}")
        print(f"{'─' * 80}")
        print("Input:")
        try:
            if isinstance(tool_input, dict):
                print(json.dumps(tool_input, indent=2))
            else:
                print(tool_input)
        except:
            print(str(tool_input))
        print(f"{'=' * 80}")

def print_tool_response(tool_name: str, response: Any):
    """Print a tool response."""
    if VERBOSE_LOGGING:
        print(f"\n✅ {'TOOL RESPONSE':^74} ✅")
        print(f"{'=' * 80}")
        print(f"Tool: {tool_name}")
        print(f"{'─' * 80}")
        print("Response:")
        try:
            if isinstance(response, dict):
                print(json.dumps(response, indent=2))
            elif isinstance(response, str) and len(response) > 500:
                # Truncate very long responses
                print(f"{response[:500]}...")
                print(f"\n[Response truncated - {len(response)} total characters]")
            else:
                print(response)
        except:
            print(str(response))
        print(f"{'=' * 80}")

def print_agent_thinking(content: str):
    """Print agent's reasoning/thinking."""
    if VERBOSE_LOGGING:
        print(f"\n💭 {'AGENT REASONING':^74} 💭")
        print(f"{'=' * 80}")
        print(content)
        print(f"{'=' * 80}")

async def chat_with_agent(agent, message: str, thread_id: str = "default", verbose: bool = None) -> str:
    """
    Send a message to an agent and get the response with detailed logging.
    
    NOTE: Must be called while inside the agent's async context manager.
    
    Args:
        agent: The agent instance
        message: User message
        thread_id: Thread ID for conversation continuity
        verbose: Override global VERBOSE_LOGGING setting
        
    Returns:
        Agent's response as a string
    """
    # Override global verbose setting if specified
    global VERBOSE_LOGGING
    original_verbose = VERBOSE_LOGGING
    if verbose is not None:
        VERBOSE_LOGGING = verbose
    
    try:
        if VERBOSE_LOGGING:
            print_section(f"🤖 AGENT INTERACTION - Thread: {thread_id} 🤖")
            print_message("👤 USER MESSAGE", message, "cyan")
        
        # Invoke the agent
        result = await agent.ainvoke(
            {"messages": [{"role": "user", "content": message}]},
            config={"configurable": {"thread_id": thread_id}}
        )
        
        if VERBOSE_LOGGING:
            print(f"\n{'🔄 PROCESSING MESSAGES 🔄':^80}")
            print(f"{'=' * 80}")
            print(f"Total messages in response: {len(result['messages'])}")
            print(f"{'=' * 80}\n")
        
        # Process and print all messages
        for i, msg in enumerate(result["messages"]):
            if VERBOSE_LOGGING:
                print(f"\n{'─' * 80}")
                print(f"Message {i + 1}/{len(result['messages'])}: {type(msg).__name__}")
                print(f"{'─' * 80}")
            
            if isinstance(msg, HumanMessage):
                if VERBOSE_LOGGING:
                    print(f"👤 Human: {msg.content}")
                    
            elif isinstance(msg, AIMessage):
                # Check for tool calls
                if hasattr(msg, 'tool_calls') and msg.tool_calls:
                    for tool_call in msg.tool_calls:
                        print_tool_call(tool_call.get('name', 'Unknown'), tool_call.get('args', {}))
                
                # Print AI message content if present
                if msg.content:
                    if any(keyword in msg.content.lower() for keyword in ['think', 'reason', 'consider', 'analyze']):
                        print_agent_thinking(msg.content)
                    elif VERBOSE_LOGGING:
                        print_message("🤖 AI MESSAGE", msg.content, "green")
                        
            elif isinstance(msg, ToolMessage):
                if VERBOSE_LOGGING:
                    # Extract tool name from the message
                    tool_name = getattr(msg, 'name', 'Unknown Tool')
                    print_tool_response(tool_name, msg.content)
        
        # Get final response
        final_response = result["messages"][-1].content
        
        if VERBOSE_LOGGING:
            print_section("✨ FINAL RESPONSE ✨", "=")
            print(f"\n{final_response}\n")
            print(f"{'=' * 80}\n")
        
        return final_response
        
    finally:
        # Restore original verbose setting
        VERBOSE_LOGGING = original_verbose

# -----------------------------------------------------------------------------
# Example Usage
# -----------------------------------------------------------------------------

if __name__ == "__main__":
    async def test_agents():
        """Test all agent types with proper session management."""
        print("=== Testing IBM i Specialized Agents (LangGraph) ===\n")
        
        # Define model options to demonstrate
        model_options = [
            "gpt-oss:20b",           # Default Ollama model
            "ollama:llama3.1",         # Explicit Ollama model
            "openai:gpt-4o",  # OpenAI model
            "anthropic:claude-3.7-sonnet"  # Anthropic model
        ]
        
        print("Available model options:")
        for model in model_options:
            print(f"  - {model}")
        print()
        
        # Use default model for testing all agent types
        for agent_type in AVAILABLE_AGENTS.keys():
            print(f"Testing {agent_type} agent...")
            try:
                ctx = await create_agent(agent_type, model_id="gpt-oss:20b")
                async with ctx as (agent, session):
                    print(f"✓ {agent.name} created successfully")
                    
                    # Optional: Test with a quick query
                    # response = await chat_with_agent(agent, "Hello!")
                    # print(f"  Response: {response[:100]}...")
                print()
                
            except Exception as e:
                print(f"✗ Failed: {e}\n")
        
        # Uncomment to test with specific model providers
        # Example: Test performance agent with different model providers
        # for model_id in model_options:
        #     print(f"Testing performance agent with model: {model_id}")
        #     try:
        #         ctx = await create_agent("performance", model_id=model_id)
        #         async with ctx as (agent, session):
        #             print(f"✓ Agent created successfully with {model_id}")
        #     except Exception as e:
        #         print(f"✗ Failed with {model_id}: {e}")
        #     print()
    
    asyncio.run(test_agents())
