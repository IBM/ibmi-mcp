"""
Reliability Evaluations for IBM i Specialized Agents

These evaluations test agent reliability by validating tool calls, error handling,
and recovery behavior. Reliability tests ensure agents behave predictably and
handle edge cases gracefully.
"""

from typing import Optional
from agno.eval.reliability import ReliabilityEval, ReliabilityResult
from agno.run.agent import RunOutput

from ..agents.ibmi_agents import create_performance_agent

async def performance_agent_reliability_evals():
    agent = create_performance_agent(debug_filtering=True)
    async with agent.tools[0]:
        response: RunOutput= await agent.arun("What is my system status?")
        evaluation = ReliabilityEval(
            name="Performance Agent CPU Usage Check",
            agent_response= response,
            expected_tool_calls=["system_status"]
        )
        result: Optional[ReliabilityResult] = evaluation.run(print_results=True)
        
        if result:
            result.assert_passed()
            
        

    