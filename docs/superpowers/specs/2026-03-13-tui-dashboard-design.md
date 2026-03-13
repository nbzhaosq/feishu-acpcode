# TUI Dashboard Design Specification

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan.

**Goal:** Replace auto-connect startup with an interactive TUI dashboard for managing the Feishu ACP Code Bot.

**Architecture:** React-based TUI using Ink framework. Split-pane layout with status panel (left), message log (right), and command input (bottom). Background service pattern for bot connection management.

**Tech Stack:** TypeScript, Ink (React for CLI), existing @larksuiteoapi/node-sdk

---

## Overview

The current bot auto-connects on startup. This spec defines a TUI (Terminal User Interface) that:
- Starts in disconnected state
- Provides visual dashboard with real-time status and message log
- Accepts commands for connection control and configuration

## File Structure

```
src/
├── index.ts                    # Entry point - starts TUI app
├── tui/
│   ├── App.tsx                 # Main Ink application
│   ├── components/
│   │   ├── StatusPanel.tsx     # Left pane - connection, stats, config
│   │   ├── MessageLog.tsx      # Right pane - scrollable activity log
│   │   └── CommandInput.tsx    # Bottom bar - command input
│   └── hooks/
│       └── useBotManager.ts    # Bot connection state management
├── lark/
│   └── client.ts               # Existing - add event emitter for TUI
└── ... (existing files)
```

## Layout Design

```
┌─────────────────────────────────────────────────────────────┐
│  Feishu ACP Code Bot                           ● Connected  │
├──────────────────┬──────────────────────────────────────────┤
│ 📊 Status        │ 📨 Messages                              │
│ ● Connected      │ [13:24:01] → User: Hello!               │
│ Uptime: 2h 34m   │ [13:24:05] ← Bot: Hi there!             │
│ Messages: 127    │ [13:25:18] ⚙ Tool: Read file.ts         │
│ Sessions: 3      │ [13:25:20] ← Bot: Done!                 │
│                  │ ...                                      │
│ ⚙ Config         │                                          │
│ Agent: claude    │                                          │
│ Workspace: dev   │                                          │
├──────────────────┴──────────────────────────────────────────┤
│ ❯ /start /stop /status /clear /agent /workspace /logs /exit│
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. App.tsx (Main Application)

**Responsibilities:**
- Render layout with StatusPanel, MessageLog, CommandInput
- Manage global state (connection status, messages, stats)
- Handle command dispatch

**State:**
```typescript
interface AppState {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  messages: LogMessage[];
  stats: {
    uptime: number;
    messageCount: number;
    sessionCount: number;
  };
  config: {
    agent: string;
    workspace: string;
  };
}
```

### 2. StatusPanel.tsx (Left Pane)

**Displays:**
- Connection status indicator (● Connected / ○ Disconnected)
- Uptime timer (updates every second when connected)
- Message count (incremented on each incoming/outgoing message)
- Active session count
- Current agent name
- Current workspace name

**Width:** ~25% of terminal

### 3. MessageLog.tsx (Right Pane)

**Displays:**
- Scrollable log of bot activity
- Each entry shows: timestamp, direction icon, message

**Entry format:**
```
[HH:MM:SS] → User: <message>     (incoming user message)
[HH:MM:SS] ← Bot: <response>     (outgoing bot response)
[HH:MM:SS] ⚙ Tool: <action>      (tool execution)
[HH:MM:SS] ⚡ System: <event>    (system events)
[HH:MM:SS] ❌ Error: <error>     (errors)
```

**Behavior:**
- Auto-scroll to newest message
- Keep last 100 messages in memory
- Support scroll with up/down arrows (when not in input mode)

### 4. CommandInput.tsx (Bottom Bar)

**Features:**
- Prompt character: `❯ `
- Text input with cursor
- Command history (up/down arrows)
- Tab completion for commands

### 5. useBotManager.ts (Hook)

**Responsibilities:**
- Expose `connect()`, `disconnect()` functions
- Emit connection status changes
- Forward bot events to TUI message log
- Track uptime, message count, session count

## Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Connect to Feishu WebSocket | `/start` |
| `/stop` | Disconnect from Feishu | `/stop` |
| `/status` | Show detailed status in log | `/status` |
| `/clear` | Clear current chat session history | `/clear` |
| `/agent <name>` | Switch agent | `/agent claude` |
| `/workspace <name>` | Switch workspace | `/workspace dev` |
| `/logs` | Toggle verbose logging mode | `/logs` |
| `/config` | Display current configuration | `/config` |
| `/help` | Show command reference | `/help` |
| `/exit` | Graceful shutdown | `/exit` |

## Event Flow

### Connection Sequence

```
User types /start
    ↓
TUI calls useBotManager.connect()
    ↓
Status → "connecting..."
    ↓
Lark client connects via WebSocket
    ↓
Status → "connected"
    ↓
Log: "⚡ System: Connected to Feishu"
```

### Message Sequence

```
Feishu sends message
    ↓
Lark client receives via WebSocket
    ↓
Event emitted to useBotManager
    ↓
TUI appends to MessageLog: "→ User: ..."
    ↓
Message count incremented
    ↓
Router processes, executor runs acpx
    ↓
Response event emitted
    ↓
TUI appends to MessageLog: "← Bot: ..."
```

## Integration with Existing Code

### Changes to src/lark/client.ts

Add event emitter for TUI integration:

```typescript
import { EventEmitter } from 'events';

export const botEvents = new EventEmitter();

// Emit on message received
botEvents.emit('message', { type: 'incoming', chatId, text });

// Emit on connection status change
botEvents.emit('status', { status: 'connected' });
```

### Changes to src/index.ts

Replace auto-connect with TUI startup:

```typescript
import { render } from 'ink';
import App from './tui/App.js';

render(<App />);
```

### Changes to src/acpx/executor.ts

Emit tool events for TUI logging:

```typescript
import { botEvents } from '../lark/client.js';

// On tool call
botEvents.emit('message', { type: 'tool', name: toolName, status });

// On response
botEvents.emit('message', { type: 'outgoing', text: responseText });
```

## Dependencies

Add to package.json:
- `ink` - React for CLI
- `react` - Peer dependency for Ink
- `@types/react` - TypeScript types

## Error Handling

- Connection failure: Show error in log, status remains "disconnected"
- Invalid command: Show error message in log
- Unexpected disconnect: Auto-update status, show reconnection hint

## Testing

Manual testing checklist:
1. Start app → Shows disconnected state
2. `/start` → Connects, shows connected state
3. Send message from Feishu → Appears in log
4. `/stop` → Disconnects cleanly
5. `/exit` → Graceful shutdown
6. All commands work as documented
