#!/bin/bash
set -e

###############################################################################
# n8n Development Shutdown Script
# Stops all containers and ngrok tunnel
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🛑 Stopping n8n development environment..."
echo ""

# Stop Docker containers
echo "🐋 Stopping Docker containers..."
cd "${SCRIPT_DIR}"
docker-compose down
echo "   ✓ All containers stopped"
echo ""

# Kill ngrok processes
echo "📡 Stopping ngrok tunnel..."
pkill -f "ngrok http" 2>/dev/null && echo "   ✓ ngrok stopped" || echo "   ⚠️  ngrok was not running"
echo ""

echo "✅ Development environment stopped"
echo ""
echo "🔄 To start again:"
echo "   ./start-dev.sh"
echo ""
