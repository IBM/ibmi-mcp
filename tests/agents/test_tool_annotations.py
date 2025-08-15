from agno.agent import Agent
from agno.models.openai import OpenAIChat
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
        toolsets = set()
        print("=== ALL TOOLS ===")
        for tool in tools_list:
            print(f"- {tool.name}: {tool.description}")
            print(f"  Annotations:{tool.annotations}")
            try:
                print(f"  Toolsets: {tool.annotations.toolsets}")
                toolsets.update(tool.annotations.toolsets)
            except AttributeError:
                print(f"  Toolsets: None")

        print(f"=== ALL TOOLSETS ===")
        for toolset in toolsets:
            print(f"- {toolset}")

        # Create agent with all tools but instruct it to prefer security tools
        if not dry_run:
            agent = Agent(
                model=OpenAIChat(),
                tools=[tools],  # Use original tools but with specific instructions
                name="agno-agent",
                description=f"An agent that specializes in IBM i performance analysis.",
                show_tool_calls=True,
                debug_mode=True,
                debug_level=1,
                markdown=True,
                additional_context={
                    "tool_annotations": {
                        tool.name: tool.annotations
                        for tool in tools_list
                        if tool.annotations
                    }
                },
            )

            # Use provided prompt or default prompt
            user_prompt = prompt if prompt else "what are the top 5 jobs consuming CPU?"

            await agent.aprint_response(user_prompt, stream=False)


if __name__ == "__main__":
    import asyncio

    # Parse command line arguments
    parser = argparse.ArgumentParser(
        description="IBM i MCP Agent Test - List all tools and their annotations"
    )
    parser.add_argument("-p", "--prompt", type=str, help="Prompt to send to the agent")
    parser.add_argument(
        "-d",
        "--dry-run",
        action="store_true",
        help="Run in dry mode without executing actions",
    )

    args = parser.parse_args()

    asyncio.run(main(args.prompt, args.dry_run))