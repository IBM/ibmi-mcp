"""
Agno integration utilities for IBM i agents.

This module provides IBM i-specific extensions and utilities for the Agno framework,
including model selection, WatsonX integration, and filtered MCP tools.
"""

from .agno_model_selector import (
    COMMON_MODELS,
    get_model,
    get_model_by_alias,
    parse_model_spec,
)
from .filtered_mcp_tools import (
    FilteredMCPTools,
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
)
from .watsonx import MyWatsonx

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