# Feishu ACP Code Bot

A Feishu bot that provides AI coding assistance through ACP (Agent Client Protocol) agents like Claude Code, OpenCode, and Codex.

## Project Overview

This bot connects to Feishu via WebSocket and responds to user messages by executing AI agents. It features:

- **TUI Dashboard**: Interactive terminal interface for managing the bot
- **Multi-agent Support**: Claude Code, OpenCode, Codex via acpx
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
├── acpx/
│   ├── executor.ts       # acpx process management, session handling, timeout/ttl
│   ├── parser.ts         # ACP JSON-RPC message parser
│   └── session.ts        # Chat session state
├── commands/
│   └── router.ts         # Message routing and command handlers
├── config.ts             # Configuration loading
└── types/
    ├── config.ts         # Config type definitions
    ├── session.ts        # Session type definitions
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
  "acpx": {
    "path": "acpx",
    "timeout": 300000,
    "ttl": 300,
    "throttleInterval": 1500
  }
}
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `acpx.path` | Path to acpx executable | `"acpx"` |
| `acpx.timeout` | Max time to wait for agent response (ms) | `300000` (5 min) |
| `acpx.ttl` | Queue owner idle TTL before shutdown (seconds) | `300` (5 min) |
| `acpx.throttleInterval` | Card update throttle interval (ms) | `1500` |

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
| `/session new` | Create new session (closes acpx session) |
| `/session close` | Close current session |
| `/clear` | Clear conversation history |

## Session Management

- Sessions are automatically tied to the workspace directory path
- `acpx sessions ensure` creates/reuses a session for the workspace
- On disconnect/exit, `acpx sessions close` is called to properly close sessions
- Use `/session new` or `/clear` to start fresh (closes existing acpx session)

## Message Flow

1. User sends message to bot in Feishu
2. Bot receives via WebSocket, deduplicates by message_id
3. Bot creates/updates session for the chat+workspace
4. Bot spawns acpx process with `--timeout` and `--ttl` from config
5. acpx streams ACP JSON-RPC messages
6. Parser extracts thinking, tool calls, response text
7. Bot updates Feishu message card with progress (throttled)
8. On completion, final response is displayed

## Cleanup & Timeout

- Internal cleanup: Tasks with no activity for 30 minutes are terminated
- acpx timeout: Passed via `--timeout` flag (from config.acpx.timeout)
- acpx ttl: Passed via `--ttl` flag (from config.acpx.ttl)
- On disconnect/exit: All acpx sessions are closed via `sessions close`

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
- `ink` - React-based TUI framework
- `react` - UI components
- `zod` - Configuration validation
- `tsx` - TypeScript execution

## Requirements

- Node.js 18+
- [acpx](https://github.com/openclaw/acpx) installed globally
- Feishu App with WebSocket enabled

## License

MIT
