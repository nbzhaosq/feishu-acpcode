# Feishu ACP Code Bot

A Feishu bot that brings AI coding assistants (Claude Code, OpenCode, Codex) directly into your Feishu chats.

## Features

- **Interactive TUI Dashboard**: Beautiful terminal interface for bot management
- **Real-time Streaming**: Watch AI thinking and tool usage in message cards
- **Multi-Agent Support**: Switch between Claude Code, OpenCode, and Codex
- **Session Persistence**: Maintains conversation context across messages
- **Workspace Management**: Configure multiple project workspaces

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure

Copy `config.example.json` to `config.json` and fill in your Feishu app credentials:

```json
{
  "Lark": {
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

## Requirements

- Node.js 18+
- [acpx](https://github.com/openclaw/acpx) installed globally
- Feishu App with WebSocket enabled

## License

MIT
