#!/bin/bash
set -e

###############################################################################
# n8n Development Startup Script
# Automatically starts ngrok, updates configuration, and launches containers
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NGROK_PORT=5678
NGROK_LOG="${SCRIPT_DIR}/ngrok.log"
ENV_FILE="${SCRIPT_DIR}/.env"

echo "🚀 Starting n8n development environment..."
echo ""

###############################################################################
# Step 1: Start ngrok in background
###############################################################################
echo "📡 Starting ngrok tunnel on port ${NGROK_PORT}..."

# Kill any existing ngrok processes
pkill -f "ngrok http" 2>/dev/null || true
sleep 2

# Start ngrok in background
ngrok http ${NGROK_PORT} --log=stdout > "${NGROK_LOG}" 2>&1 &
NGROK_PID=$!
echo "   ✓ ngrok started (PID: ${NGROK_PID})"

# Wait for ngrok to initialize
echo "   ⏳ Waiting for ngrok to initialize..."
sleep 4

###############################################################################
# Step 2: Extract ngrok URL from API
###############################################################################
echo "🔍 Fetching ngrok public URL..."

NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[a-zA-Z0-9-]*\.ngrok-free\.dev' | head -1)

if [ -z "$NGROK_URL" ]; then
    echo "❌ Error: Failed to get ngrok URL from API"
    echo "   Check ngrok logs: ${NGROK_LOG}"
    exit 1
fi

NGROK_HOST="${NGROK_URL#https://}"
echo "   ✓ ngrok URL: ${NGROK_URL}"
echo "   ✓ ngrok Host: ${NGROK_HOST}"
echo ""

###############################################################################
# Step 3: Update .env file with new ngrok URL
###############################################################################
echo "📝 Updating .env file..."

# Backup existing .env
cp "${ENV_FILE}" "${ENV_FILE}.backup"

# Update WEBHOOK_URL
if grep -q "^WEBHOOK_URL=" "${ENV_FILE}"; then
    sed -i '' "s|^WEBHOOK_URL=.*|WEBHOOK_URL=${NGROK_URL}|" "${ENV_FILE}"
else
    echo "WEBHOOK_URL=${NGROK_URL}" >> "${ENV_FILE}"
fi

# Update N8N_HOST
if grep -q "^N8N_HOST=" "${ENV_FILE}"; then
    sed -i '' "s|^N8N_HOST=.*|N8N_HOST=${NGROK_HOST}|" "${ENV_FILE}"
else
    echo "N8N_HOST=${NGROK_HOST}" >> "${ENV_FILE}"
fi

echo "   ✓ Updated WEBHOOK_URL=${NGROK_URL}"
echo "   ✓ Updated N8N_HOST=${NGROK_HOST}"
echo ""

###############################################################################
# Step 4: Start Docker containers
###############################################################################
echo "🐋 Starting Docker containers..."

cd "${SCRIPT_DIR}"

# Start postgres first if not running
docker-compose up -d postgres
echo "   ⏳ Waiting for postgres to be healthy..."
sleep 5

# Start/recreate n8n with new environment variables
docker-compose up -d n8n --force-recreate
echo "   ✓ n8n container recreated"

# Start ibmi-mcp-server
docker-compose up -d ibmi-mcp-server
echo "   ✓ ibmi-mcp-server started"

# Start other services based on profile (if specified)
if [ -n "$1" ]; then
    PROFILE="$1"
    docker-compose --profile ${PROFILE} up -d
    echo "   ✓ All services started (profile: ${PROFILE})"
else
    docker-compose up -d
    echo "   ✓ All services started (no profile)"
fi
echo ""

###############################################################################
# Step 5: Display summary
###############################################################################
echo "✅ Development environment ready!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📌 Access URLs:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   🌐 n8n (local):      http://localhost:5678"
echo "   🌍 n8n (public):     ${NGROK_URL}"
echo "   🔧 ngrok dashboard:  http://localhost:4040"
echo "   🛠️  IBM i MCP:        http://localhost:3010"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Next steps:"
echo "   1. Open n8n at ${NGROK_URL}"
echo "   2. Create/activate your workflow"
echo "   3. Use the Production URL for webhooks in Slack"
echo ""
echo "⚠️  Important: Keep this terminal open to maintain ngrok tunnel!"
echo ""
echo "🛑 To stop everything:"
echo "   ./stop-dev.sh"
echo ""
echo "📊 View logs:"
echo "   docker-compose logs -f n8n"
echo "   tail -f ngrok.log"
echo ""

# Keep script running and show ngrok log tail
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📡 ngrok tunnel active - monitoring requests..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
tail -f "${NGROK_LOG}"
