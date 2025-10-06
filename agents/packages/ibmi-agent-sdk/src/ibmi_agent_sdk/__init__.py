"""
IBM i Agent SDK.

A Python SDK for building AI agents that interact with IBM i systems through
the Agno framework and MCP (Model Context Protocol) tools.
"""

from .agno import (
    COMMON_MODELS,
    FilteredMCPTools,
    MyWatsonx,
    create_annotation_filtered_tools,
    create_closed_world_tools,
    create_custom_filtered_tools,
    create_multi_toolset_tools,
    create_non_destructive_tools,
    create_performance_tools,
    create_readonly_tools,
    create_safe_tools,
    create_sysadmin_tools,
    create_system_performance_tools,
    get_model,
    get_model_by_alias,
    parse_model_spec,
)

__version__ = "0.1.0"

__all__ = [
    # Model selection
    "COMMON_MODELS",
    "get_model",
    "get_model_by_alias",
    "parse_model_spec",
    # WatsonX
    "MyWatsonx",
    # Filtered MCP Tools
    "FilteredMCPTools",
    "create_annotation_filtered_tools",
    "create_closed_world_tools",
    "create_custom_filtered_tools",
    "create_multi_toolset_tools",
    "create_non_destructive_tools",
    "create_performance_tools",
    "create_readonly_tools",
    "create_safe_tools",
    "create_sysadmin_tools",
    "create_system_performance_tools",
]
