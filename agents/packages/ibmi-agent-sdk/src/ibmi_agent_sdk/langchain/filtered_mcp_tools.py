"""
FilteredMCPTools - LangGraph version with annotation-based filtering

This module provides a load_filtered_mcp_tools function that wraps langchain_mcp_adapters.tools.load_mcp_tools
to add annotation-based filtering capabilities.
"""

from typing import List, Optional, Union, Literal, Callable, Dict, Any
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.tools import load_mcp_tools


# Default MCP connection settings
DEFAULT_MCP_URL = "http://127.0.0.1:3010/mcp"
DEFAULT_TRANSPORT = "streamable_http"


# -----------------------------------------------------------------------------
# Annotation Filtering Logic
# -----------------------------------------------------------------------------

def _get_annotation_value(tool, annotation_key: str) -> Any:
    """
    Extract annotation value from a LangChain MCP tool.
    
    LangChain MCP adapter stores MCP tool annotations in the tool.metadata dictionary.
    
    Args:
        tool: LangChain tool object
        annotation_key: Name of the annotation to extract (e.g., 'toolsets', 'readOnlyHint')
        
    Returns:
        The annotation value, or None if annotation doesn't exist or tool has no metadata.
    """
    try:
        # LangChain stores MCP annotations in tool.metadata
        if hasattr(tool, 'metadata') and tool.metadata:
            return tool.metadata.get(annotation_key, None)
        return None
    except Exception:
        return None


def _annotation_value_matches_filter(
    annotation_value: Any, filter_value: Any
) -> bool:
    """
    Check if annotation value matches the filter criteria.
    
    Args:
        annotation_value: The actual annotation value from the tool
        filter_value: The filter criteria to match against
        
    Returns:
        True if the annotation value matches the filter, False otherwise
        
    Filter types supported:
    - Primitive (str/bool/int): Exact match
    - List: OR logic - annotation_value must be in list OR list intersection for list annotations
    - Callable: filter_value(annotation_value) must return True
    """
    if callable(filter_value):
        try:
            return bool(filter_value(annotation_value))
        except Exception:
            return False
    
    if isinstance(filter_value, list):
        if isinstance(annotation_value, list):
            # List annotation: check if any annotation values match any filter values
            return bool(set(annotation_value) & set(filter_value))
        else:
            # Single annotation: check if it's in the filter list
            return annotation_value in filter_value
    
    # Primitive exact match
    return annotation_value == filter_value


def _should_include_tool(
    tool,
    annotation_filters: Optional[Dict[str, Union[Any, List[Any], Callable]]] = None,
    custom_filter: Optional[Callable] = None,
) -> bool:
    """
    Determine if a tool should be included based on all filtering criteria.
    
    Combines:
    1. Generic annotation_filters (new system)
    2. Optional custom_filter (for complex logic)
    3. All filters use AND logic (tool must match ALL criteria)
    
    Args:
        tool: LangChain MCP tool object to evaluate
        annotation_filters: Dict mapping annotation names to filter values
        custom_filter: Optional custom function(tool) -> bool
        
    Returns:
        True if tool should be included, False otherwise
    """
    # Apply custom filter first if provided
    if custom_filter:
        try:
            if not custom_filter(tool):
                return False
        except Exception:
            return False
    
    # Apply generic annotation filters
    if annotation_filters:
        for annotation_key, filter_value in annotation_filters.items():
            annotation_value = _get_annotation_value(tool, annotation_key)
            
            if not _annotation_value_matches_filter(annotation_value, filter_value):
                return False
    
    return True


async def load_filtered_mcp_tools(
    session,
    annotation_filters: Optional[Dict[str, Union[Any, List[Any], Callable]]] = None,
    custom_filter: Optional[Callable] = None,
    debug: bool = False,
):
    """
    Load MCP tools with annotation-based filtering.
    
    This is a drop-in replacement for langchain_mcp_adapters.tools.load_mcp_tools
    that adds filtering capabilities based on tool annotations.
    
    Args:
        session: MCP session object (from MultiServerMCPClient.session())
        annotation_filters: Dict mapping annotation names to filter values.
                          Filter values can be:
                          - Primitives (str/bool/int): Exact match
                          - Lists: OR logic (annotation must be in list or lists must intersect)
                          - Callables: function(annotation_value) -> bool
        custom_filter: Optional custom function(tool) -> bool for complex filtering
        debug: Whether to print filtering debug information
        
    Returns:
        List of filtered LangChain tool objects
        
    Example:
        # Filter by toolsets annotation
        tools = await load_filtered_mcp_tools(
            session,
            annotation_filters={"toolsets": ["performance"]}
        )
        
        # Filter by read-only tools
        tools = await load_filtered_mcp_tools(
            session,
            annotation_filters={"readOnlyHint": True}
        )
        
        # Combine multiple filters (AND logic)
        tools = await load_filtered_mcp_tools(
            session,
            annotation_filters={
                "toolsets": ["performance"],
                "readOnlyHint": True,
            }
        )
        
        # Use custom filter function
        tools = await load_filtered_mcp_tools(
            session,
            custom_filter=lambda tool: "system" in tool.name.lower()
        )
    """
    # Load all tools from the MCP server
    all_tools = await load_mcp_tools(session)
    
    if debug:
        print(f"[FilteredMCPTools] Loaded {len(all_tools)} total tools from MCP server")
    
    # If no filters, return all tools
    if not annotation_filters and not custom_filter:
        if debug:
            print("[FilteredMCPTools] No filters specified, returning all tools")
        return all_tools
    
    # Apply filtering
    if debug:
        print(f"[FilteredMCPTools] Applying filters: {annotation_filters or 'custom_filter'}")
    
    filtered_tools = []
    for tool in all_tools:
        if _should_include_tool(tool, annotation_filters, custom_filter):
            filtered_tools.append(tool)
            if debug:
                print(f"[FilteredMCPTools] ✓ Including tool: {tool.name}")
        elif debug:
            # Show annotation values for excluded tools
            annotations_info = []
            if annotation_filters:
                for annotation_key in annotation_filters.keys():
                    annotation_value = _get_annotation_value(tool, annotation_key)
                    annotations_info.append(f"{annotation_key}={annotation_value}")
            annotations_str = ", ".join(annotations_info) if annotations_info else "no matching annotations"
            print(f"[FilteredMCPTools] ✗ Excluding tool: {tool.name} ({annotations_str})")
    
    if debug:
        print(f"[FilteredMCPTools] Filtered to {len(filtered_tools)} tools")
    
    return filtered_tools


# -----------------------------------------------------------------------------
# Convenience Factory Functions
# -----------------------------------------------------------------------------

async def load_toolset_tools(
    session,
    toolsets: Union[str, List[str]],
    debug: bool = False,
):
    """
    Load MCP tools filtered by toolset annotation.
    
    Args:
        session: MCP session object
        toolsets: Single toolset string or list of toolsets
        debug: Whether to print debug information
        
    Returns:
        List of filtered LangChain tool objects
    """
    toolsets_list = [toolsets] if isinstance(toolsets, str) else list(toolsets)
    return await load_filtered_mcp_tools(
        session,
        annotation_filters={"toolsets": toolsets_list},
        debug=debug,
    )


async def load_readonly_tools(session, debug: bool = False):
    """Load only read-only tools (using MCP standard annotation)."""
    return await load_filtered_mcp_tools(
        session,
        annotation_filters={"readOnlyHint": True},
        debug=debug,
    )


async def load_non_destructive_tools(session, debug: bool = False):
    """Load only non-destructive tools (using MCP standard annotation)."""
    return await load_filtered_mcp_tools(
        session,
        annotation_filters={"destructiveHint": False},
        debug=debug,
    )


async def load_closed_world_tools(session, debug: bool = False):
    """Load only closed-world tools (using MCP standard annotation)."""
    return await load_filtered_mcp_tools(
        session,
        annotation_filters={"openWorldHint": False},
        debug=debug,
    )


async def load_safe_tools(session, debug: bool = False):
    """Load safe tools (read-only, non-destructive, closed-world)."""
    return await load_filtered_mcp_tools(
        session,
        annotation_filters={
            "readOnlyHint": True,
            "destructiveHint": False,
            "openWorldHint": False,
        },
        debug=debug,
    )
