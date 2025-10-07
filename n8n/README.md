# n8n + IBM i MCP Server Integration

This directory contains a Docker Compose configuration that deploys n8n alongside the IBM i MCP Server, enabling workflow automation with direct IBM i database access.

## Services

- **n8n** (`:5678`): Workflow automation platform
- **ibmi-mcp-server** (`:3010`): MCP server for IBM i SQL operations
- **postgres**: Database for n8n
- **qdrant**: Vector database for AI embeddings
- **ollama**: Local LLM inference

## Quick Start with ngrok (Development)

For local development with webhook integrations (Slack, GitHub, etc.), use the automated startup script that handles ngrok tunnel creation and configuration.

### Start Everything

```bash
# Start ngrok tunnel + core containers (n8n, postgres, qdrant, ibmi-mcp-server)
./start-dev.sh

# Optional: Add Ollama by specifying a profile
./start-dev.sh cpu         # For CPU-only systems
./start-dev.sh gpu-nvidia  # For NVIDIA GPU systems
./start-dev.sh gpu-amd     # For AMD GPU systems
```

**What it does:**
1. ✅ Starts ngrok tunnel in background on port 5678
2. ✅ Extracts the public ngrok URL automatically
3. ✅ Updates `.env` file with the new webhook URL
4. ✅ Starts/recreates all Docker containers with new configuration
5. ✅ Displays all access URLs and monitoring info

**Output:**
```
✅ Development environment ready!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 Access URLs:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🌐 n8n (local):      http://localhost:5678
   🌍 n8n (public):     https://your-random-url.ngrok-free.dev
   🔧 ngrok dashboard:  http://localhost:4040
   🛠️  IBM i MCP:        http://localhost:3010
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📡 ngrok tunnel active - monitoring requests...
```

### Stop Everything

```bash
./stop-dev.sh
```

This stops all Docker containers and terminates the ngrok tunnel.

### Important Notes

- **Keep terminal open** - The script runs in foreground, showing ngrok request logs
- **URL changes each restart** - ngrok free tier generates a new random URL every time
- **Update webhooks** - After each restart, update your webhook URLs in Slack/other services
- **Environment backup** - Original `.env` is backed up to `.env.backup` automatically
- **Press Ctrl+C** - To stop the ngrok tunnel and view final statistics

### Using webhooks in Slack

1. Start the development environment: `./start-dev.sh`
2. Copy the ngrok public URL from the output
3. In n8n, activate your workflow and switch to the "Production URL" tab
4. Copy the production webhook URL (will use your ngrok domain)
5. Configure that URL in Slack's Event Subscriptions
6. **Important**: You'll need to repeat steps 3-5 each time you restart (URL changes)

## Manual Start (Without ngrok)

### 1. Configure Environment Variables

Ensure you have a `.env` file at the project root with IBM i connection details:

```bash
# IBM i Database Connection
DB2i_HOST=your-ibmi-system.com
DB2i_USER=your-username
DB2i_PASS=your-password
DB2i_PORT=8076
```

### 2. Start the Stack

From the `n8n/` directory:

```bash
# Start core services only (n8n, postgres, qdrant, ibmi-mcp-server)
docker-compose up -d

# Or include Ollama with a profile:
docker-compose --profile cpu up -d          # For CPU-only systems
docker-compose --profile gpu-nvidia up -d   # For NVIDIA GPU systems
docker-compose --profile gpu-amd up -d      # For AMD GPU systems
```

### 3. Access the Services

- **n8n UI**: http://localhost:5678
- **IBM i MCP Server**: http://localhost:3010
- **Qdrant**: http://localhost:6333
- **Ollama**: http://localhost:11434

### 4. Using IBM i MCP Server in n8n

The IBM i MCP Server is accessible from n8n workflows via HTTP:

```javascript
// Example n8n HTTP Request node
{
  "method": "POST",
  "url": "http://ibmi-mcp-server:3010/mcp/tools/call",
  "body": {
    "tool": "query_active_jobs",
    "parameters": {
      "max_rows": 50
    }
  }
}
```

## Shared Data

Both n8n and ibmi-mcp-server have access to a shared directory at `/data/shared` inside their containers. This is mounted from `./shared` in the n8n directory.

Use this for:
- Exchanging data between workflows and MCP tools
- Caching query results
- Storing temporary files

## Configuration Updates

### Key Changes for Integration

1. **Network**: ibmi-mcp-server now shares the `demo` network with n8n
2. **Build Context**: Corrected to parent directory for proper Dockerfile access
3. **Environment**: Uses main `.env` from project root
4. **Volumes**: Shares `/data/shared` directory with n8n for data exchange

### YAML Auto-Reload

The `YAML_AUTO_RELOAD=true` environment variable enables hot-reloading of tool configurations. Edit YAML files in `prebuiltconfigs/` and changes will be detected automatically.

## Healthcheck

The IBM i MCP Server includes a healthcheck endpoint at `http://localhost:3010/health`. The container will be marked unhealthy if this endpoint fails.

## Stopping the Stack

```bash
docker-compose --profile cpu down       # or your active profile
docker-compose --profile cpu down -v    # also remove volumes
```

## Troubleshooting

### Check Service Logs

```bash
docker-compose logs -f ibmi-mcp-server
docker-compose logs -f n8n
```

### Verify Network Connectivity

```bash
# From n8n container
docker exec n8n curl http://ibmi-mcp-server:3010/health
```

### IBM i Connection Issues

```bash
# Check MCP server logs for connection errors
docker-compose logs ibmi-mcp-server | grep -i error
```

## Development

### Rebuilding the IBM i MCP Server

```bash
docker-compose build ibmi-mcp-server
docker-compose up -d ibmi-mcp-server
```

### Using a Custom Image

Set the `IBMI_MCP_IMAGE` environment variable:

```bash
export IBMI_MCP_IMAGE=myregistry/ibmi-mcp-server:v1.2.3
docker-compose up -d
```
