# Agent OS AWS

Welcome to Agent OS AWS: a robust, production-ready application for serving Agentic Applications as an API. It includes:

- An **AgentOS instance**: An API-based interface for production-ready Agentic Applications.
- A **PostgreSQL database** for storing Agent sessions, knowledge, and memories.
- A set of **pre-built Agents** to use as a starting point.

For more information, checkout [Agno](https://agno.link/gh) and give it a ⭐️

## Quickstart

Follow these steps to get your Agent OS up and running:

> [Get Docker Desktop](https://www.docker.com/products/docker-desktop) should be installed and running.
> [Get OpenAI API key](https://platform.openai.com/api-keys)

### Clone the repo

```sh
git clone https://github.com/agno-agi/agent-infra-aws.git
cd agent-os-aws
```

### Configure API keys

We use GPT 4.1 as the default model, please export the `OPENAI_API_KEY` environment variable to get started.

```sh
export OPENAI_API_KEY="YOUR_API_KEY_HERE"
```

> **Note**: You can use any model provider, just update the agents in the `/agents` folder and add the required libraries to the `pyproject.toml` and `requirements.txt` files.

### Start the application

This examples includes 2 environments, `dev` and `prd`.

### Run the application locally in docker:

```sh
ag infra up --env dev
```

This command starts:

- The **AgentOS instance**, which is a FastAPI server, running on [http://localhost:8000](http://localhost:8000).
- The **PostgreSQL database**, accessible on `localhost:5432`.

Once started, you can:

- Test the API at [http://localhost:8000/docs](http://localhost:8000/docs).

### Connect to AgentOS UI

- Open the [Agno AgentOS UI](https://os.agno.com).
- Connect your OS with `http://localhost:8000` as the endpoint. You can name it `AgentOS` (or any name you prefer).
- Explore all the features of AgentOS or go straight to the Chat page to interact with your Agents.

### Stop the application

When you're done, stop the application using:

```sh
ag infra down
```

### Run the application in AWS:

```sh
ag infra up --env prd
```

### This command will create the following resources:

- AWS Security Groups
- AWS Secrets
- AWS Db Subnet Group
- AWS RDS Instance
- AWS Load Balancer
- AWS Target Group
- AWS Listener
- AWS ECS Cluster
- AWS ECS Service
- AWS ECS Task
- AWS ECS Task Definition

## Prebuilt Agents

The `/agents` folder contains pre-built agents that you can use as a starting point.

- Web Search Agent: A simple agent that can search the web.
- Agno Assist: An Agent that can help answer questions about Agno.
- Finance Agent: An agent that uses the Financial Datasets API to get stock prices and financial data.

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

Rebuild your Docker images to include the updated dependencies, set build_images to true in the `infra/settings.py` file and run the following command:

```sh
ag infra up -f
```

## Community & Support

Need help, have a question, or want to connect with the community?

- 📚 **[Read the Agno Docs](https://docs.agno.com)** for more in-depth information.
- 💬 **Chat with us on [Discord](https://agno.link/discord)** for live discussions.
- ❓ **Ask a question on [Discourse](https://agno.link/community)** for community support.
- 🐛 **[Report an Issue](https://github.com/agno-agi/agent-api/issues)** on GitHub if you find a bug or have a feature request.
