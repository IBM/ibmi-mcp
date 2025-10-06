# IBM i MCP Agents

AI agents for IBM i system administration and monitoring using Model Context Protocol (MCP) tools. This directory contains multiple agent framework implementations, deployment infrastructure, and web interfaces for interacting with intelligent IBM i system agents.

## Directory Structure

```
agents/                        # Root directory for IBM i MCP agents
├── agent-ui                   # Next.js web interface for agents
├── aws                        # AWS deployment infrastructure
│   └── ibmi-agent-infra-aws
├── docker                     # Docker-based deployment infrastructure
│   └── ibmi-agent-infra
├── frameworks                 # Different agent framework implementations
│   ├── agno
│   └── langchain
└── packages                   # Reusable packages and SDKs
    └── ibmi-agent-sdk
```

## Getting Started

### Prerequisites

- **Python 3.12+** (for agent frameworks)
- **uv** (Python package manager)
- **Node.js 20+** (for Agent UI)
- **MCP Server** running in HTTP mode


## Frameworks

The `frameworks/` directory provides different agent framework implementations, allowing you to choose the best solution for your use case.

### Current Frameworks
| Framework | Language | Description |
|-----------|----------|-------------|
| [Agno](./frameworks/agno) | Python | Agents built with Agno's AgentOS
| [LangChain](./frameworks/langchain) | Python | Agents built with LangChain framework |

### Agno (AgentOS)

The Agno implementation uses [Agno's AgentOS framework](https://agno.com) to provide intelligent agents that connect to IBM i MCP tools via HTTP transport.

**Features:**
- Multi-agent orchestration with specialized agents
- Built-in evaluation framework for testing reliability
- Tool filtering for focused agent capabilities
- WatsonX AI model integration support
- HTTP-based MCP transport for distributed deployments

**Quick Start:**
```bash
cd frameworks/agno
# Set your OpenAI API key
export OPENAI_API_KEY=your_openai_api_key_here  
# Run multi-agent system
uv run ibmi_agentos.py  
```

**Documentation:** See [frameworks/agno/README.md](frameworks/agno/README.md)

### LangChain

**Status:** Planned

Future implementation using [LangChain](https://langchain.com) framework for agent development. This will provide:
- LangChain's extensive ecosystem integration
- Alternative agent orchestration patterns
- Additional model provider options
- LangChain-specific tooling and utilities

## Agent UI

A modern Next.js web interface for interacting with agent frameworks.

**Features:**
- Real-time chat interface with agents
- AgentOS endpoint configuration
- Markdown rendering for agent responses
- Responsive design for desktop and mobile

**Quick Start:**
```bash
cd agent-ui
pnpm install  # or npm install
pnpm dev      # or npm run dev
# Open http://localhost:3000
```

**Documentation:** See [agent-ui/README.md](agent-ui/README.md)

## Deployment Infrastructure

Deploy IBM i Agno agents using either Docker-based or AWS-based infrastructure.

> More info: [Agno Deployment Documentation](https://docs.agno.com/deploy/introduction)

| Option  | Description |
|---------|-------------|
| [Docker](./docker/ibmi-agent-infra)  | Containerized agent deployments using Docker Compose |
| [AWS](./aws/ibmi-agent-infra-aws)   | Cloud-based deployments using AWS infrastructure (in progress) |


### Docker

Docker-based infrastructure for containerized agent deployments.

- **Location:** `docker/ibmi-agent-infra/`
- **Documentation:** See [README](docker/ibmi-agent-infra/README.md)

**Features:**
- Containerized agent runtime
- Docker Compose configurations
- Isolated agent environments
- Easy local development setup  

### AWS (In Progress)

AWS infrastructure for cloud-based agent deployments.

- **Location:** `aws/ibmi-agent-infra-aws/`
- **Documentation:** See [README](aws/ibmi-agent-infra-aws/README.md)

**Features:**
- AWS deployment configurations
- Scalable cloud infrastructure
- Production-ready deployment patterns

## Agent Capabilities

All agent frameworks connect to the IBM i MCP server and can perform tasks such as:

- **System Performance Monitoring**
  - CPU and memory utilization analysis
  - Job queue monitoring
  - Resource bottleneck identification

- **System Administration**
  - Active job management
  - System configuration queries
  - Service status checks

- **Database Operations**
  - SQL query execution
  - Table and schema exploration
  - Data retrieval and analysis

- **Troubleshooting**
  - Error message analysis
  - System health checks
  - Automated diagnostics


## Resources

- **Agno Documentation:** https://docs.agno.com
- **LangChain Documentation:** https://docs.langchain.com
- **Model Context Protocol:** https://modelcontextprotocol.io
- **IBM i MCP Server:** [../README.md](../README.md)


For general IBM i MCP server issues, see the main project documentation.
