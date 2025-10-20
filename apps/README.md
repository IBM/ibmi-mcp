# IBM i MCP Server - Integration Configurations

Integration configurations for connecting the IBM i MCP Server with various platforms and orchestration tools.

## Available Integrations

### MCP Gateway
Enterprise-grade MCP server orchestration and management platform.

The MCP Gateway provides:
- **Centralized Management**: Manage multiple MCP servers from a single control plane
- **Authentication & Authorization**: JWT-based security with role-based access control
- **Rate Limiting & Caching**: Redis-backed performance optimization
- **Admin UI**: Web-based interface for server configuration and monitoring
- **Database Backend**: PostgreSQL for persistent storage of configurations and sessions

**Quick Start**:
```bash
cd mcpgateway
docker-compose up -d
```

Access MCP Gateway at http://localhost:4444

---

### n8n Integration (Coming Soon)
Workflow automation and integration platform for building IBM i workflows.

The n8n integration enables:
- **Visual Workflow Builder**: Drag-and-drop interface for creating automation workflows
- **IBM i Data Flows**: Connect IBM i data with 400+ integrations
- **Scheduled Jobs**: Automate routine IBM i operations
- **Event-Driven Automation**: Trigger workflows based on IBM i system events

**Quick Start**:
```bash
cd n8n
docker-compose up -d
```

---

## Requirements

- Docker or Podman
- Configured `.env` file in repository root with IBM i connection details

## Environment Setup

1. **Configure environment variables**:
   ```bash
   # From repository root
   cp .env.example .env
   # Edit .env with your IBM i connection details
   ```

2. **Required variables**:
   - `DB2i_HOST` - IBM i system hostname or IP
   - `DB2i_USER` - IBM i user profile
   - `DB2i_PASS` - IBM i user password
   - `DB2i_PORT` - Database port (default: 8076)

## Getting Started

Choose the integration that best fits your use case:

- **For enterprise deployments** → Use [MCP Gateway](./mcpgateway/)
- **For workflow automation** → Use [n8n](./n8n/)

Both integrations can be used together for comprehensive IBM i automation and management.
