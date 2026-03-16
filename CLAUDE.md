# Feishu ACP Code Bot

A Feishu bot that provides AI coding assistance through ACP (Agent Client Protocol) agents like Claude Code, OpenCode, and Codex.

## Project Overview

This bot connects to Feishu via WebSocket and responds to user messages by executing AI agents. It features:

- **TUI Dashboard**: Interactive terminal interface for managing the bot
- **Multi-agent Support**: Claude Code, OpenCode, Codex via ACP SDK
- **Real-time Streaming**: Progress updates and thinking visible in Feishu message cards
- **Session Management**: Persistent conversation context per chat (tied to workspace path)
- **Message Deduplication**: Prevents duplicate message processing from Feishu WebSocket

## Architecture

```
src/
├── index.ts              # Entry point - TUI application
├── tui/
│   ├── App.tsx           # Main TUI layout
│   ├── components/
│   │   ├── StatusPanel.tsx    # Left pane - status display
│   │   ├── MessageLog.tsx     # Right pane - activity log
│   │   └── CommandInput.tsx   # Bottom bar - command input
│   └── hooks/
│       └── useBotManager.ts    # Bot state management
├── lark/
│   ├── client.ts         # Feishu WebSocket connection, message deduplication
│   ├── events.ts         # Event emitter for TUI
│   ├── message.ts        # Message sending utilities
│   └── card.ts           # Feishu message card builder
├── acp/
│   ├── connection.ts     # ACP connection manager, process spawning
│   ├── executor.ts       # ACP executor, session handling, timeout
│   ├── client.ts         # Feishu ACP client implementation
│   ├── parser.ts         # ACP JSON-RPC message parser
│   └── types.ts          # ACP type definitions
├── claude/
│   ├── executor.ts       # Claude Agent SDK executor
│   ├── session.ts        # Claude session management
│   └── types.ts          # Claude-specific types
├── agent/
│   └── router.ts         # Agent routing (Claude SDK vs ACP SDK)
├── session/
│   └── index.ts          # Chat session state management
├── commands/
│   └── router.ts         # Message routing and command handlers
├── config.ts             # Configuration loading
├── utils/
│   └── logger.ts         # Logging (console + file)
└── types/
    ├── config.ts         # Config type definitions
    ├── session.ts        # Session type definitions
    ├── agent.ts          # Shared agent types
    └── lark.ts           # Lark event type definitions
```

## Configuration

Create `config.json` from `config.example.json`:

```json
{
  "lark": {
    "appId": "your-app-id",
    "appSecret": "your-app-secret"
  },
  "workspaces": [
    {
      "name": "default",
      "path": "/path/to/workspace",
      "default": true
    }
  ],
  "agents": {
    "default": "claude",
    "available": ["claude", "opencode", "codex"]
  },
  "agent": {
    "timeout": 300000,
    "throttleInterval": 1500
  },
  "api": {
    "baseUrl": "https://api.anthropic.com",
    "apiKey": "sk-ant-xxxxxxxx"
  },
  "agentOptions": {
    "mcpServers": {},
    "allowedTools": ["Skill"],
    "settingSources": ["user", "project"],
    "enableSkills": true
  },
  "logging": {
    "level": "info",
    "file": {
      "enabled": true,
      "path": "~/.claude/logs/feishu-acpcode.log",
      "maxSize": 10485760
    }
  }
}
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `agent.timeout` | Max time to wait for agent response (ms) | `300000` (5 min) |
| `agent.throttleInterval` | Card update throttle interval (ms) | `1500` |
| `api.baseUrl` | Custom API base URL | Anthropic API |
| `api.apiKey` | Custom API key | `ANTHROPIC_API_KEY` env |
| `agentOptions.mcpServers` | MCP server configurations | `{}` |
| `agentOptions.allowedTools` | Tools the agent can use | `[]` |
| `agentOptions.enableSkills` | Enable Skills capability | `true` |
| `logging.level` | Log level (debug, info, warn, error) | `info` |
| `logging.file.enabled` | Enable file logging | `true` |

## Running the Bot

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm start

# Using the CLI executable (after npm install)
acpcode

# Or run directly
node bin/acpcode.js
```

## TUI Commands

| Command | Description |
|---------|-------------|
| `/start` | Connect to Feishu WebSocket |
| `/stop` | Disconnect from Feishu (also stops all running agents) |
| `/cancel` | Cancel all running agent tasks |
| `/status` | Show detailed status information |
| `/agent <name>` | Switch agent (claude, opencode, codex) |
| `/workspace <name>` | Switch workspace |
| `/config` | Display current configuration |
| `/logs` | Toggle verbose logging |
| `/help` | Show command reference |
| `/exit` | Exit the application |

## Feishu Commands (in chat)

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/status` | Show bot status |
| `/agent <name>` | Switch agent for this chat |
| `/workspace <name>` | Switch workspace for this chat |
| `/session new` | Create new session |
| `/session close` | Close current session |
| `/clear` | Clear conversation history |

## Session Management

- Sessions are automatically tied to the workspace directory path
- Sessions are managed by the respective SDK (Claude Agent SDK or ACP SDK)
- Use `/session new` or `/clear` to start fresh

## Message Flow

1. User sends message to bot in Feishu
2. Bot receives via WebSocket, deduplicates by message_id
3. Bot creates/updates session for the chat+workspace
4. Bot routes to appropriate executor (Claude SDK or ACP SDK)
5. Executor streams responses with thinking, tool calls, and text
6. Bot updates Feishu message card with progress (throttled)
7. On completion, final response is displayed

## Cleanup & Timeout

- Internal cleanup: Tasks with no activity for 30 minutes are terminated
- Agent timeout: Configurable via `agent.timeout` (default 5 minutes)
- On disconnect/exit: All sessions are properly closed

## Development

### Build

```bash
npm run build
```

### Type Check

```bash
npm run typecheck
```

### Key Dependencies

- `@larksuiteoapi/node-sdk` - Feishu/Lark SDK for WebSocket connection
- `@anthropic-ai/claude-agent-sdk` - Claude Agent SDK for native Claude integration
- `@agentclientprotocol/sdk` - ACP SDK for OpenCode, Codex, and other agents
- `ink` - React-based TUI framework
- `react` - UI components
- `zod` - Configuration validation
- `tsx` - TypeScript execution

## Requirements

- Node.js 18+
- Claude Code, OpenCode, or Codex installed
- Feishu App with WebSocket enabled

## License

MIT
