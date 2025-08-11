# IBM i MCP Agent Examples

This directory contains example AI agents that demonstrate how to interact with the IBM i MCP Server.

## Quick Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure API Key

Create a `.env` file in this directory with your OpenAI API key:

```bash
# Create .env file
cat > .env << EOF
OPENAI_API_KEY=your-openai-api-key-here
EOF
```

**Get your OpenAI API key:**

1. Visit [OpenAI API Keys](https://platform.openai.com/api-keys)
2. Create a new API key
3. Copy it to your `.env` file

### 3. Start the MCP Server

Ensure the IBM i MCP server is running:

```bash
# From the main project directory
npm run start:http
```

### 4. Run the Agent

```bash
# Use a custom prompt
python agno_agent.py -p "What's my system status?"

# Or run with the default prompt
python agno_agent.py

# Get help
python agno_agent.py -h
```

## Available Agents

### agno_agent.py

The main example agent that connects to your IBM i MCP server and allows natural language queries.

**Features:**

- Connects to IBM i MCP server via HTTP
- Supports custom prompts with `-p` parameter
- Automatically discovers available tools
- Provides debug output showing tool selection

**Example Usage:**

```bash
python agno_agent.py -p "Show me user profiles with security issues"
python agno_agent.py -p "What jobs are consuming the most CPU?"
python agno_agent.py -p "How many remote connections are active?"
```

## Model Support

**Current:** OpenAI GPT models (via OpenAI API)

**Future Support Planned:**

- Anthropic Claude models
- Local models via Ollama
- Azure OpenAI
- Google Gemini
- Additional model providers

The agent framework is designed to be model-agnostic, making it easy to switch between different AI providers.

## Troubleshooting

### Common Issues

**"No API key found"**

- Ensure your `.env` file contains `OPENAI_API_KEY=your-key-here`
- Verify the `.env` file is in the `tests/agents/` directory

**"Connection refused"**

- Make sure the MCP server is running: `npm run start:http`
- Check the server is accessible at `http://127.0.0.1:3010/mcp`

**"No tools found"**

- Verify your YAML tools configuration in the main `.env` file
- Check `TOOLS_YAML_PATH` points to a valid YAML file

### Debug Mode

The agent runs with debug mode enabled by default, showing:

- Available tools discovered
- Tool selection process
- SQL queries being executed
- Response formatting

## Contributing

When adding new agent examples:

1. Follow the existing pattern of using environment variables
2. Include clear documentation and usage examples
3. Support both prompted and interactive modes
4. Add appropriate error handling and debug output
