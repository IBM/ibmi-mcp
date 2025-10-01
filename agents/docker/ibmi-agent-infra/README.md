# IBM i Agent Infrastructure

Production-ready agent infrastructure for IBM i system administration and performance monitoring. Built on [Agno](https://agno.link/gh) AgentOS with specialized IBM i agents that use MCP (Model Context Protocol) tools.

**Key Features:**
- **IBM i Specialized Agents**: Performance monitoring, system administration, and database analysis
- **MCP Integration**: Direct access to IBM i systems via MCP tools (SQL queries, system services)
- **Multi-LLM Support**: watsonx and OpenAI models
- **AgentOS API**: RESTful API for agent interactions and workflow orchestration
- **PostgreSQL Storage**: Agent sessions, knowledge, and conversation history

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop) installed and running
- IBM i MCP server running (see [ibmi-mcp-server README](../../../README.md))
- API keys:
  - [watsonx API key](https://cloud.ibm.com/) (IBM Cloud) **OR**
  - [OpenAI API key](https://platform.openai.com/api-keys)

## Quick Start

### 1. Configure Environment

Create `infra/.env` file (see [infra/README.md](infra/README.md) for details):

```bash
# MCP Server (required)
MCP_URL=http://host.docker.internal:3010/mcp
MCP_TRANSPORT=streamable-http

# watsonx (option 1)
WATSONX_API_KEY=your_ibm_cloud_api_key
WATSONX_PROJECT_ID=your_project_id
WATSONX_BASE_URL=https://us-south.ml.cloud.ibm.com
WATSONX_MODEL_ID=meta-llama/llama-3-3-70b-instruct

# OpenAI (option 2)
OPENAI_API_KEY=sk-your_openai_key

# Database (optional)
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASS=mysecretpassword
DB_DATABASE=agno
```

> **Note**: Use `host.docker.internal` instead of `localhost` for MCP_URL when running in Docker to access services on the host machine.

### 2. Start the Application

**Using ag CLI** (recommended):
```sh
ag infra up
```

**Or using Docker Compose directly**:
```sh
docker compose up -d --build
```

This starts:
- **AgentOS API**: [http://localhost:8000](http://localhost:8000)
- **PostgreSQL Database**: `localhost:5432`
- **API Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)

### 3. Access the Application

**API Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)

**AgentOS UI** (optional):
1. Open [os.agno.com](https://os.agno.com)
2. Connect to `http://localhost:8000`
3. Interact with agents via chat interface

**API Example**:
```bash
curl -X POST http://localhost:8000/agents/ibmi-performance-monitor/runs \
  -H "Content-Type: application/json" \
  -d '{"message": "Check system performance"}'
```

### 4. Managing the Application

**Stop the application**:
```sh
ag infra down
# or: docker compose down
```

**Restart the application**:
```sh
ag infra restart
# or: docker compose restart
```

**View logs**:
```sh
docker compose logs -f
```

**Check status**:
```sh
docker compose ps
```

## IBM i Agents

The infrastructure includes specialized agents for IBM i administration:

### Performance Agent
Monitor and analyze IBM i system performance.

**Capabilities**:
- System status and activity monitoring
- CPU utilization analysis
- Memory pool tracking
- Job performance analysis
- HTTP server metrics


**API Endpoint**: `/agents/ibmi-performance-monitor`

### SysAdmin Agents

Three specialized agents for system administration:

**Discovery Agent** (`/agents/ibmi-sysadmin-discovery`):
- High-level system overviews
- Service category summaries
- Component inventories

**Browse Agent** (`/agents/ibmi-sysadmin-browse`):
- Detailed service exploration
- Schema-based browsing
- Object type filtering

**Search Agent** (`/agents/ibmi-sysadmin-search`):
- Service name searches
- Example code lookup
- Documentation searches

## Workflows

Pre-built workflows for common IBM i tasks (see [workflows/](workflows/)):

- **Simple Performance Check**: Quick system health assessment
- **Performance Investigation**: Deep dive into performance issues
- **Capacity Planning**: Resource utilization forecasting
- **Database Tuning**: Db2 performance optimization
- **System Health Audit**: Comprehensive system analysis

**API Example**:
```bash
curl -X 'POST' \
  'http://localhost:8000/workflows/ibm-i-quick-performance-check/runs' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'message=create a brief report of the current system status'
```

## Development Setup

To setup your local virtual environment:

### Install `uv`

We use `uv` for python environment and package management. Install it by following the the [`uv` documentation](https://docs.astral.sh/uv/#getting-started) or use the command below for unix-like systems:

```sh
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### Create Virtual Environment & Install Dependencies

Run the `dev_setup.sh` script. This will create a virtual environment and install project dependencies:

```sh
./scripts/dev_setup.sh
```

### Activate Virtual Environment

Activate the created virtual environment:

```sh
source .venv/bin/activate
```

(On Windows, the command might differ, e.g., `.venv\Scripts\activate`)

## Managing Python Dependencies

If you need to add or update python dependencies:

### Modify pyproject.toml

Add or update your desired Python package dependencies in the `[dependencies]` section of the `pyproject.toml` file.

### Generate requirements.txt

The `requirements.txt` file is used to build the application image. After modifying `pyproject.toml`, regenerate `requirements.txt` using:

```sh
./scripts/generate_requirements.sh
```

To upgrade all existing dependencies to their latest compatible versions, run:

```sh
./scripts/generate_requirements.sh upgrade
```

### Rebuild Docker Images

Rebuild your Docker images to include the updated dependencies:

```sh
docker compose up -d --build
```

## Running Tests

This project comes with a set of integration tests that you can use to ensure the application is working as expected.

First, start the application:

```sh
docker compose up -d
```

Then, run the tests:

```sh
pytest tests/
```

Then close the application again:

```sh
docker compose down
```

## Community & Support

Need help, have a question, or want to connect with the community?

- 📚 **[Read the Agno Docs](https://docs.agno.com)** for more in-depth information.
- 💬 **Chat with us on [Discord](https://agno.link/discord)** for live discussions.
- ❓ **Ask a question on [Discourse](https://agno.link/community)** for community support.
- 🐛 **[Report an Issue](https://github.com/agno-agi/agent-api/issues)** on GitHub if you find a bug or have a feature request.

## Running in Production

This repository includes a `Dockerfile` for building a production-ready container image of the application.

The general process to run in production is:

1. Update the `scripts/build_image.sh` file and set your IMAGE_NAME and IMAGE_TAG variables.
2. Build and push the image to your container registry:

```sh
./scripts/build_image.sh
```

3. Run in your cloud provider of choice.

### Detailed Steps

1. **Configure for Production**

- Ensure your production environment variables (e.g., `OPENAI_API_KEY`, database connection strings) are securely managed. Most cloud providers offer a way to set these as environment variables for your deployed service.
- Review the agent configurations in the `/agents` directory and ensure they are set up for your production needs (e.g., correct model versions, any production-specific settings).

2. **Build Your Production Docker Image**

- Update the `scripts/build_image.sh` script to set your desired `IMAGE_NAME` and `IMAGE_TAG` (e.g., `your-repo/agent-api:v1.0.0`).
- Run the script to build and push the image:

  ```sh
  ./scripts/build_image.sh
  ```

3. **Deploy to a Cloud Service**
   With your image in a registry, you can deploy it to various cloud services that support containerized applications. Some common options include:

- **Serverless Container Platforms**:

  - **Google Cloud Run**: A fully managed platform that automatically scales your stateless containers. Ideal for HTTP-driven applications.
  - **AWS App Runner**: Similar to Cloud Run, AWS App Runner makes it easy to deploy containerized web applications and APIs at scale.
  - **Azure Container Apps**: Build and deploy modern apps and microservices using serverless containers.

- **Container Orchestration Services**:

  - **Amazon Elastic Container Service (ECS)**: A highly scalable, high-performance container orchestration service that supports Docker containers. Often used with AWS Fargate for serverless compute or EC2 instances for more control.
  - **Google Kubernetes Engine (GKE)**: A managed Kubernetes service for deploying, managing, and scaling containerized applications using Google infrastructure.
  - **Azure Kubernetes Service (AKS)**: A managed Kubernetes service for deploying and managing containerized applications in Azure.

- **Platform as a Service (PaaS) with Docker Support**

  - **Railway.app**: Offers a simple way to deploy applications from a Dockerfile. It handles infrastructure, scaling, and networking.
  - **Render**: Another platform that simplifies deploying Docker containers, databases, and static sites.
  - **Heroku**: While traditionally known for buildpacks, Heroku also supports deploying Docker containers.

- **Specialized Platforms**:
  - **Modal**: A platform designed for running Python code (including web servers like FastAPI) in the cloud, often with a focus on batch jobs, scheduled functions, and model inference, but can also serve web endpoints.

The specific deployment steps will vary depending on the chosen provider. Generally, you'll point the service to your container image in the registry and configure aspects like port mapping (the application runs on port 8000 by default inside the container), environment variables, scaling parameters, and any necessary database connections.

4. **Database Configuration**

- The default `docker-compose.yml` sets up a PostgreSQL database for local development. In production, you will typically use a managed database service provided by your cloud provider (e.g., AWS RDS, Google Cloud SQL, Azure Database for PostgreSQL) for better reliability, scalability, and manageability.
- Ensure your deployed application is configured with the correct database connection URL for your production database instance. This is usually set via an environment variables.


## Project Structure

```
.
├── agents/            # IBM i specialized agents (performance, sysadmin)
│   └── utils/         # MCP tool filtering, model selection, watsonx integration
├── workflows/         # Pre-built IBM i workflows (performance, capacity, database)
├── app/               # FastAPI application (AgentOS entry point)
├── infra/             # Centralized configuration system (see infra/README.md)
├── db/                # Database session management
├── tools/             # MCP tool metadata (YAML configs)
├── tests/             # Integration tests
├── scripts/           # Development & build scripts
├── secrets/           # Secret storage (gitignored)
├── compose.yml        # docker compose file (With AgentOS instance and PostgreSQL database)
├── Dockerfile         # Dockerfile for the application
├── pyproject.toml     # python project definition
├── requirements.txt   # python dependencies generated by pyproject.toml


## Resources

- **[Agno Documentation](https://docs.agno.com)** - AgentOS framework
- **[IBM i MCP Server](../../../README.md)** - MCP server setup
- **[Configuration Guide](infra/README.md)** - Environment setup
