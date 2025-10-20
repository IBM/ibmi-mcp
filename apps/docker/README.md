# Docker Deployment

This directory contains the Dockerfile and related files for building the IBM i MCP Server container.

**Note:** The `docker-compose.yml` file has been moved to `../mcpgateway/` for better organization with the full MCP Gateway stack.

## Quick Start

For the complete MCP Gateway stack (including IBM i MCP Server):

```bash
# Navigate to the mcpgateway directory
cd ../mcpgateway

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

See [../mcpgateway/README.md](../mcpgateway/README.md) for complete Docker Compose documentation.

## Services

| Service | Port | Description | Access URL |
|---------|------|-------------|------------|
| **gateway** | 4444 | MCP Gateway UI and API | http://localhost:4444 |
| **ibmi-mcp-server** | 3010 | IBM i MCP Server | http://localhost:3010 |
| **postgres** | - | PostgreSQL database (internal) | - |
| **redis** | 6379 | Redis cache | redis://localhost:6379 |
| **pgadmin** | 5050 | PostgreSQL admin UI | http://localhost:5050 |
| **redis_insight** | 5540 | Redis admin UI | http://localhost:5540 |

## Configuration

### 1. Root .env File

Ensure `../../.env` contains:

```ini
# IBM i connection details
DB2i_HOST=your-ibmi-host
DB2i_USER=your-username
DB2i_PASS=your-password
DB2i_PORT=8076

# MCP Auth mode
MCP_AUTH_MODE=ibmi

# IBM i HTTP authentication settings
IBMI_AUTH_KEY_ID=development
IBMI_AUTH_PRIVATE_KEY_PATH=server/secrets/private.pem
IBMI_AUTH_PUBLIC_KEY_PATH=server/secrets/public.pem
IBMI_HTTP_AUTH_ENABLED=true
IBMI_AUTH_ALLOW_HTTP=true

# Tools path (in container)
TOOLS_YAML_PATH=/usr/src/app/tools
```

### 2. Generate Authentication Keys

```bash
cd ../../server
mkdir -p secrets
openssl genpkey -algorithm RSA -out secrets/private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -pubout -in secrets/private.pem -out secrets/public.pem
```

## Service Management

### Start Services

```bash
# Start all services
docker-compose up -d

# Start specific service
docker-compose up -d ibmi-mcp-server

# Start without dependencies
docker-compose up --no-deps ibmi-mcp-server
```

### Stop Services

```bash
# Stop all services
docker-compose down

# Stop specific service
docker-compose stop ibmi-mcp-server
```

### View Logs

```bash
# Follow gateway logs
docker-compose logs -f gateway

# View last 100 lines
docker-compose logs --tail=100 ibmi-mcp-server

# View all logs
docker-compose logs
```

### Rebuild Services

```bash
# Rebuild specific service
docker-compose build ibmi-mcp-server

# Rebuild and restart all
docker-compose up --build -d
```

## Accessing the MCP Gateway

1. Navigate to http://localhost:4444
2. Login with demo credentials:
   - **Email**: `admin@example.com`
   - **Password**: `changeme`

3. Configure IBM i MCP Server:
   - Go to "Gateways/MCP Servers" tab
   - Add server endpoint: `http://ibmi-mcp-server:3010`
   - Manage tools and create virtual servers

## Troubleshooting

### Server Not Starting

```bash
# Check logs
docker-compose logs ibmi-mcp-server

# Verify .env exists
ls -la ../../.env

# Check secrets directory
ls -la ../../server/secrets/
```

### Port Already in Use

```bash
# Change ports in docker-compose.yml
# Or stop conflicting services
```

### Tools Not Loading

```bash
# Verify tools directory mount
docker-compose exec ibmi-mcp-server ls -la /usr/src/app/tools

# Check TOOLS_YAML_PATH environment variable
docker-compose exec ibmi-mcp-server printenv TOOLS_YAML_PATH
```

## Production Deployment

For production:

1. **Update passwords** in docker-compose.yml
2. **Enable HTTPS** for gateway and server
3. **Set secure secrets** for JWT and auth
4. **Configure proper networking** and firewalls
5. **Set up monitoring** and log aggregation
6. **Use external databases** for persistence
7. **Set `IBMI_AUTH_ALLOW_HTTP=false`** to enforce HTTPS

See root README for complete production deployment guide.
