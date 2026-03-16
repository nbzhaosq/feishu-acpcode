# Feishu ACP Code Bot

A Feishu bot that brings AI coding assistants (Claude Code, OpenCode, Codex) directly into your Feishu chats.

## Features

- **Interactive TUI Dashboard**: Beautiful terminal interface for bot management
- **Real-time Streaming**: Watch AI thinking and tool usage in message cards
- **Multi-Agent Support**: Switch between Claude Code, OpenCode, and Codex
- **Session Persistence**: Maintains conversation context across messages
- **Workspace Management**: Configure multiple project workspaces
- **Message Deduplication**: Handles duplicate messages from Feishu WebSocket

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure

Copy `config.example.json` to `config.json` and fill in your Feishu app credentials:

```json
{
  "lark": {
    "appId": "your-app-id",
    "appSecret": "your-app-secret"
  },
  "workspaces": [
    {
      "name": "default",
      "path": "/path/to/your/project"
    }
  ],
  "agents": {
    "default": "claude",
    "available": ["claude", "opencode", "codex"]
  },
  "acpx": {
    "path": "acpx",
    "timeout": 300000,
    "ttl": 300
  },
  "api": {
    "baseUrl": "https://api.anthropic.com",
    "apiKey": "sk-ant-your-key"
  }
}
```

### 3. Run

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm start

# Or use the CLI executable
acpcode
```

### Global Installation (Optional)

```bash
# Install globally
npm install -g feishu-acpcode

# Run from anywhere
acpcode
```

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `agent.timeout` | Max wait time for agent response (ms) | `300000` (5 min) |
| `agent.throttleInterval` | Card update throttle (ms) | `1500` |
| `api.baseUrl` | Custom API base URL (for proxies) | Anthropic API |
| `api.apiKey` | Custom API key | `ANTHROPIC_API_KEY` env |
| `agentOptions.mcpServers` | MCP server configurations | `{}` |
| `agentOptions.allowedTools` | Tools the agent can use | `[]` |
| `agentOptions.enableSkills` | Enable Skills capability | `true` |
| `agentOptions.settingSources` | Sources for loading Skills | `["user", "project"]` |
| `logging.level` | Log level (debug, info, warn, error) | `info` |
| `logging.file.enabled` | Enable file logging | `true` |
| `logging.file.path` | Log file path | `~/.claude/logs/feishu-acpcode.log` |

### Agent Configuration

Configure agent execution settings:

```json
{
  "agent": {
    "timeout": 300000,
    "throttleInterval": 1500
  }
}
```

- `timeout`: Maximum time to wait for agent response in milliseconds
- `throttleInterval`: Throttle interval for message card updates in milliseconds

### API Configuration

Configure a custom API endpoint (e.g., for proxy servers or alternative providers):

```json
{
  "api": {
    "baseUrl": "https://your-proxy.example.com",
    "apiKey": "your-api-key"
  }
}
```

- `baseUrl`: Custom API endpoint URL (optional)
- `apiKey`: API key for authentication (optional, falls back to `ANTHROPIC_API_KEY` environment variable)

### MCP Servers Configuration

Configure MCP (Model Context Protocol) servers to extend Claude's capabilities:

```json
{
  "agentOptions": {
    "mcpServers": {
      "filesystem": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/directory"]
      },
      "postgres": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://user:pass@localhost/db"]
      },
      "github": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-github"],
        "env": {
          "GITHUB_TOKEN": "your-github-token"
        }
      }
    },
    "allowedTools": [
      "mcp__filesystem__*",
      "mcp__postgres__query",
      "Skill"
    ]
  }
}
```

| Option | Description |
|--------|-------------|
| `mcpServers` | Map of MCP server configurations |
| `mcpServers.<name>.command` | Command to run the MCP server |
| `mcpServers.<name>.args` | Arguments passed to the server |
| `mcpServers.<name>.env` | Environment variables for the server |
| `allowedTools` | Tools the agent is allowed to use (use `mcp__servername__*` for all tools from a server) |

### Skills Configuration

Skills are loaded from `.claude/skills/` directories:

```json
{
  "agentOptions": {
    "enableSkills": true,
    "settingSources": ["user", "project"],
    "allowedTools": ["Skill"]
  }
}
```

| Option | Description | Default |
|--------|-------------|---------|
| `enableSkills` | Enable Skills capability | `true` |
| `settingSources` | Where to load Skills from (`user` = `~/.claude/`, `project` = `.claude/`) | `["user", "project"]` |

Skills directory structure:
```
project/
├── .claude/
│   └── skills/
│       ├── my-skill/
│       │   └── SKILL.md
│       └── another-skill/
│           └── SKILL.md
```

## TUI Dashboard

The bot starts with an interactive terminal dashboard:

```
┌─────────────────────────────────────────────────────────────┐
│  Feishu ACP Code Bot                           ● Connected │
├──────────────────┬──────────────────────────────────────────┤
│ 📊 Status        │ 📨 Messages                              │
│ ● Connected      │ [14:30:01] ⚡ Connected to Feishu       │
│ Uptime: 5m 23s   │ [14:30:15] → User: Help me fix this    │
│ Messages: 12     │ [14:30:18] ⚙ Read: parser.ts           │
│ Sessions: 2      │ [14:30:20] ← Bot: I found the issue... │
│                  │                                          │
│ 🤖 Agents (1)    │                                          │
│ 1 task(s) running│                                          │
│                  │                                          │
│ ⚙ Config         │                                          │
│ Agent: claude    │                                          │
│ Workspace: myapp │                                          │
├──────────────────┴──────────────────────────────────────────┤
│ ❯ _                                                         │
└─────────────────────────────────────────────────────────────┘
```

## Commands

### TUI Commands (Terminal)

| Command | Description |
|---------|-------------|
| `/start` | Connect to Feishu |
| `/stop` | Disconnect and stop all agents |
| `/cancel` | Cancel all running agent tasks |
| `/status` | Show detailed status |
| `/agent <name>` | Switch agent |
| `/workspace <name>` | Switch workspace |
| `/config` | Show configuration |
| `/logs` | Toggle verbose logging |
| `/help` | Show help |
| `/exit` | Exit application |

### Feishu Commands (In Chat)

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/status` | Show bot status |
| `/agent <name>` | Switch agent |
| `/workspace <name>` | Switch workspace |
| `/clear` | Clear conversation history |

## Session Management

- Sessions are automatically tied to workspace directories
- acpx `sessions ensure` creates/reuses sessions
- On disconnect, sessions are properly closed via `sessions close`
- Use `/clear` to start a fresh session

## Requirements

- Node.js 18+
- [acpx](https://github.com/openclaw/acpx) installed globally
- Feishu App with WebSocket enabled

## License

MIT
