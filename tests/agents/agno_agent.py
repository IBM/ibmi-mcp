from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.models.anthropic import Claude
from agno.tools.mcp import MCPTools
from dotenv import load_dotenv
import os
import argparse

load_dotenv(override=True)

url = "http://127.0.0.1:3010/mcp"


async def main(prompt=None, dry_run=False):
    async with MCPTools(url=url, transport="streamable-http") as tools:
        # Print available tools for debugging
        result = await tools.session.list_tools()
        tools_list = result.tools  # Extract the tools list from the result

        print("=== ALL TOOLS ===")
        for tool in tools_list:
            print(f"- {tool.name}: {tool.description}")
            print(f"  Annotations:{tool.annotations}")
            try:
                print(f"  Toolsets: {tool.annotations.toolsets}")
            except AttributeError:
                print(f"  Toolsets: None")

        print("\n=== YAML TOOLS ONLY (with toolsets annotation) ===")
        yaml_tools = []
        for tool in tools_list:
            try:
                if tool.annotations and tool.annotations.toolsets:
                    yaml_tools.append(tool)
            except AttributeError:
                print(f"no toolsets found for tool: {tool.name}")

        for tool in yaml_tools:
            print(f"- {tool.name}: {tool.description}")
            print(f"  Toolsets: {tool.annotations.toolsets}")

        print("\n=== SECURITY TOOLS ONLY ===")
        security_tools = []
        for tool in tools_list:
            try:
                if tool.annotations and tool.annotations.toolsets and "security" in tool.annotations.toolsets:
                    security_tools.append(tool)
            except AttributeError:
                print(f"no toolsets found for tool: {tool.name}")

        for tool in security_tools:
            print(f"- {tool.name}: {tool.description}")
            
        # Get security tool names
        security_tool_names = [tool.name for tool in security_tools]

        print(
            f"\n=== AGENT CONFIGURED TO PREFER {len(security_tool_names)} SECURITY TOOLS ==="
        )
        for name in security_tool_names:
            print(f"- {name}")

        # Create agent with all tools but instruct it to prefer security tools
        if not dry_run:
            agent = Agent(
                model=OpenAIChat(),
                tools=[tools],  # Use original tools but with specific instructions
                name="agno-agent",
                description=f"An agent that specializes in IBM i security analysis.",
                show_tool_calls=True,
                debug_mode=True,
                debug_level=1,
                markdown=True
            )

            # Use provided prompt or default prompt
            user_prompt = prompt if prompt else "what are the top 5 jobs consuming CPU?"
            
            await agent.aprint_response(
                user_prompt, stream=False
            )


if __name__ == "__main__":
    import asyncio
    
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="IBM i MCP Agent - Query your IBM i system using natural language")
    parser.add_argument("-p", "--prompt", type=str, help="Prompt to send to the agent")
    parser.add_argument("-d", "--dry-run", action="store_true", help="Run in dry mode without executing actions")
    
    args = parser.parse_args()

    asyncio.run(main(args.prompt, args.dry_run))
