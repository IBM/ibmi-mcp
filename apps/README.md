# IBM i MCP Server - Deployment Configurations

Deployment configurations for various platforms and integrations.

## Available Deployments

### Docker Compose
Complete stack with MCP Gateway, PostgreSQL, Redis, and admin UIs.

```bash
cd docker
docker-compose up -d
```

Access MCP Gateway at http://localhost:4444

See [docker/README.md](./docker/README.md) for detailed setup.

### MCP Gateway
Configuration for standalone MCP Gateway integration.

The MCP Gateway provides:
- Centralized MCP server management
- Authentication and authorization
- Rate limiting and caching
- Admin UI for server configuration

### n8n Integration
Workflow automation integration configurations.

```bash
cd n8n
# See n8n configuration for workflow automation
```

## Requirements

- Docker or Podman
- Configured `.env` file in repository root

## Quick Start

1. **Configure environment**:
   ```bash
   cd ../..  # Back to repository root
   cp .env.example .env
   # Edit .env with your IBM i connection details
   ```

2. **Start Docker services**:
   ```bash
   cd apps/docker
   docker-compose up -d
   ```

3. **Access services**:
   - MCP Gateway: http://localhost:4444
   - PostgreSQL Admin: http://localhost:5050
   - Redis Insight: http://localhost:5540

## Documentation

See individual directories for specific deployment instructions:
- [docker/](./docker/) - Docker Compose deployment
- [gateway/](./gateway/) - MCP Gateway configuration
- [n8n/](./n8n/) - n8n workflow integration
