# TUI Dashboard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace auto-connect startup with an interactive TUI dashboard for managing the Feishu ACP Code Bot.

**Architecture:** React-based TUI using Ink framework. Split-pane layout with status panel (left), message log (right), and command input (bottom). Background service pattern for bot connection management.

**Tech Stack:** TypeScript, Ink (React for CLI), existing @larksuiteoapi/node-sdk

---

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
│   ├── client.ts               # Add event emitter for TUI
│   └── events.ts               # NEW - Event emitter and types
└── ... (existing files)
```

---

## Chunk 1: Dependencies and Types

### Task 1: Install Ink Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install ink and react dependencies**

```bash
npm install ink react
npm install -D @types/react
```

Expected: Dependencies added to package.json

- [ ] **Step 2: Verify installation**

Run: `npm list ink react`
Expected: Both packages listed

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add ink and react dependencies for TUI"
```

### Task 2: Create Event System

**Files:**
- Create: `src/lark/events.ts`

- [ ] **Step 1: Create event emitter and types**

```typescript
// src/lark/events.ts
import { EventEmitter } from 'events';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type MessageType = 'incoming' | 'outgoing' | 'tool' | 'system' | 'error';

export interface LogMessage {
  timestamp: Date;
  type: MessageType;
  text: string;
  details?: string;
}

export interface BotStatus {
  connectionStatus: ConnectionStatus;
  uptime: number;
  messageCount: number;
  sessionCount: number;
  agent: string;
  workspace: string;
}

export interface BotEvents {
  'status': (status: BotStatus) => void;
  'message': (message: LogMessage) => void;
}

class BotEventEmitter extends EventEmitter {
  emit<K extends keyof BotEvents>(event: K, ...args: Parameters<BotEvents[K]>): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof BotEvents>(event: K, listener: BotEvents[K]): this {
    return super.on(event, listener);
  }

  off<K extends keyof BotEvents>(event: K, listener: BotEvents[K]): this {
    return super.off(event, listener);
  }
}

export const botEvents = new BotEventEmitter();
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lark/events.ts
git commit -m "feat: add event system for TUI integration"
```

### Task 3: Update Lark Client with Events

**Files:**
- Modify: `src/lark/client.ts`

- [ ] **Step 1: Add event emissions for connection status**

Update `src/lark/client.ts` to import and emit events:

```typescript
// Add to imports
import { botEvents, type BotStatus } from './events.js';

// Add at top after imports
let connectionStartTime: number | null = null;
let messageCount = 0;

// Replace existing connect function with:
export async function connect(): Promise<void> {
  const config = getConfig();

  if (wsClient) {
    logger.warn('WebSocket client already exists');
    return;
  }

  const client = new lark.Client({
    appId: config.lark.appId,
    appSecret: config.lark.appSecret,
  });

  botEvents.emit('status', {
    connectionStatus: 'connecting',
    uptime: 0,
    messageCount,
    sessionCount: 0,
    agent: config.agents.default,
    workspace: config.workspaces.find(w => w.default)?.name || config.workspaces[0].name,
  });

  const eventDispatcher = new lark.EventDispatcher({}).register({
    'im.message.receive_v1': async (data) => {
      logger.debug('Received message:', data.message.message_id);
      messageCount++;

      botEvents.emit('message', {
        timestamp: new Date(),
        type: 'incoming',
        text: `User message in chat ${data.message.chat_id}`,
      });

      try {
        await routeMessage(client!, data);
      } catch (error) {
        logger.error('Failed to process message:', error);
        botEvents.emit('message', {
          timestamp: new Date(),
          type: 'error',
          text: `Failed to process message: ${error}`,
        });
      }
    },
  });

  wsClient = new lark.WSClient({
    appId: config.lark.appId,
    appSecret: config.lark.appSecret,
    loggerLevel: lark.LoggerLevel.info,
  });

  logger.info('Connecting to Feishu WebSocket...');

  try {
    await wsClient.start({ eventDispatcher });
    isConnected = true;
    connectionStartTime = Date.now();

    botEvents.emit('status', {
      connectionStatus: 'connected',
      uptime: 0,
      messageCount,
      sessionCount: 0,
      agent: config.agents.default,
      workspace: config.workspaces.find(w => w.default)?.name || config.workspaces[0].name,
    });

    botEvents.emit('message', {
      timestamp: new Date(),
      type: 'system',
      text: 'Connected to Feishu',
    });

    logger.info('Feishu WebSocket connected');
  } catch (error) {
    isConnected = false;
    botEvents.emit('status', {
      connectionStatus: 'error',
      uptime: 0,
      messageCount,
      sessionCount: 0,
      agent: config.agents.default,
      workspace: config.workspaces.find(w => w.default)?.name || config.workspaces[0].name,
    });
    botEvents.emit('message', {
      timestamp: new Date(),
      type: 'error',
      text: `Connection failed: ${error}`,
    });
    logger.error('Feishu WebSocket connection failed:', error);
    throw error;
  }
}

// Add function to get current bot status
export function getBotStatus(): BotStatus {
  const config = getConfig();

  return {
    connectionStatus: isConnected ? 'connected' : 'disconnected',
    uptime: connectionStartTime ? Math.floor((Date.now() - connectionStartTime) / 1000) : 0,
    messageCount,
    sessionCount: 0, // Session count tracked by useBotManager hook
    agent: config.agents.default,
    workspace: config.workspaces.find(w => w.default)?.name || config.workspaces[0].name,
  };
}
```

- [ ] **Step 2: Update disconnect to emit events**

Update the disconnect function:

```typescript
export async function disconnect(): Promise<void> {
  if (wsClient) {
    wsClient.close();
    wsClient = null;
    isConnected = false;
    connectionStartTime = null;

    botEvents.emit('status', {
      connectionStatus: 'disconnected',
      uptime: 0,
      messageCount,
      sessionCount: 0,
      agent: '',
      workspace: '',
    });

    botEvents.emit('message', {
      timestamp: new Date(),
      type: 'system',
      text: 'Disconnected from Feishu',
    });

    logger.info('Disconnected from Feishu WebSocket');
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lark/client.ts
git commit -m "feat: add event emissions to lark client for TUI"
```

---

## Chunk 2: TUI Components

### Task 4: Create StatusPanel Component

**Files:**
- Create: `src/tui/components/StatusPanel.tsx`

- [ ] **Step 1: Create StatusPanel component**

```tsx
// src/tui/components/StatusPanel.tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { ConnectionStatus } from '../../lark/events.js';

interface StatusPanelProps {
  connectionStatus: ConnectionStatus;
  uptime: number;
  messageCount: number;
  sessionCount: number;
  agent: string;
  workspace: string;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export const StatusPanel: React.FC<StatusPanelProps> = ({
  connectionStatus,
  uptime,
  messageCount,
  sessionCount,
  agent,
  workspace,
}) => {
  const statusColor = connectionStatus === 'connected' ? 'green' :
    connectionStatus === 'connecting' ? 'yellow' :
    connectionStatus === 'error' ? 'red' : 'gray';

  const statusText = connectionStatus === 'connected' ? '● Connected' :
    connectionStatus === 'connecting' ? '● Connecting...' :
    connectionStatus === 'error' ? '● Error' : '○ Disconnected';

  return (
    <Box flexDirection="column" paddingX={1} width={24}>
      <Box marginBottom={1}>
        <Text bold color="cyan">📊 Status</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color={statusColor}>{statusText}</Text>
      </Box>

      {connectionStatus === 'connected' && (
        <>
          <Box>
            <Text dimColor>Uptime: </Text>
            <Text>{formatUptime(uptime)}</Text>
          </Box>
          <Box>
            <Text dimColor>Messages: </Text>
            <Text color="green">{messageCount}</Text>
          </Box>
          <Box>
            <Text dimColor>Sessions: </Text>
            <Text color="yellow">{sessionCount}</Text>
          </Box>
        </>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Text bold color="cyan">⚙ Config</Text>
        <Box>
          <Text dimColor>Agent: </Text>
          <Text color="magenta">{agent}</Text>
        </Box>
        <Box>
          <Text dimColor>Workspace: </Text>
          <Text color="blue">{workspace}</Text>
        </Box>
      </Box>
    </Box>
  );
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/tui/components/StatusPanel.tsx
git commit -m "feat: add StatusPanel component for TUI"
```

### Task 5: Create MessageLog Component

**Files:**
- Create: `src/tui/components/MessageLog.tsx`

- [ ] **Step 1: Create MessageLog component**

```tsx
// src/tui/components/MessageLog.tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { LogMessage } from '../../lark/events.js';

interface MessageLogProps {
  messages: LogMessage[];
  maxHeight: number;
}

function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 8);
}

function getMessageIcon(type: LogMessage['type']): string {
  switch (type) {
    case 'incoming': return '→';
    case 'outgoing': return '←';
    case 'tool': return '⚙';
    case 'system': return '⚡';
    case 'error': return '❌';
    default: return '•';
  }
}

function getMessageColor(type: LogMessage['type']): string {
  switch (type) {
    case 'incoming': return 'cyan';
    case 'outgoing': return 'magenta';
    case 'tool': return 'yellow';
    case 'system': return 'green';
    case 'error': return 'red';
    default: return 'white';
  }
}

export const MessageLog: React.FC<MessageLogProps> = ({ messages, maxHeight }) => {
  const visibleMessages = messages.slice(-maxHeight);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">📨 Messages</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {visibleMessages.length === 0 ? (
          <Text dimColor>No messages yet. Use /start to connect.</Text>
        ) : (
          visibleMessages.map((msg, index) => (
            <Box key={index}>
              <Text dimColor>[{formatTime(msg.timestamp)}] </Text>
              <Text color={getMessageColor(msg.type)}>
                {getMessageIcon(msg.type)} {msg.text}
              </Text>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/tui/components/MessageLog.tsx
git commit -m "feat: add MessageLog component for TUI"
```

### Task 6: Create CommandInput Component

**Files:**
- Create: `src/tui/components/CommandInput.tsx`

- [ ] **Step 1: Create CommandInput component**

```tsx
// src/tui/components/CommandInput.tsx
import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';

interface CommandInputProps {
  onSubmit: (command: string) => void;
  isConnected: boolean;
}

const COMMANDS = [
  '/start', '/stop', '/status', '/clear', '/agent', '/workspace',
  '/logs', '/config', '/help', '/exit',
];

export const CommandInput: React.FC<CommandInputProps> = ({ onSubmit, isConnected }) => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const handleSubmit = useCallback((cmd: string) => {
    if (cmd.trim()) {
      setHistory(prev => [...prev, cmd]);
      setHistoryIndex(-1);
      onSubmit(cmd.trim());
      setInput('');
    }
  }, [onSubmit]);

  useInput((char, key) => {
    if (key.return) {
      handleSubmit(input);
    } else if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
    } else if (key.upArrow) {
      if (history.length > 0 && historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInput(history[history.length - 1 - newIndex]);
      }
    } else if (key.downArrow) {
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(history[history.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput('');
      }
    } else if (key.tab) {
      // Tab completion
      const matchingCommands = COMMANDS.filter(cmd => cmd.startsWith(input));
      if (matchingCommands.length === 1) {
        setInput(matchingCommands[0] + ' ');
      }
    } else if (!key.ctrl && !key.meta) {
      setInput(prev => prev + char);
    }
  });

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text color="green" bold>❯ </Text>
      <Text>{input}</Text>
      <Text dimColor>▌</Text>
    </Box>
  );
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/tui/components/CommandInput.tsx
git commit -m "feat: add CommandInput component for TUI"
```

---

## Chunk 3: Main App and Integration

### Task 7: Create useBotManager Hook

**Files:**
- Create: `src/tui/hooks/useBotManager.ts`

- [ ] **Step 1: Create useBotManager hook**

```typescript
// src/tui/hooks/useBotManager.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  connect,
  disconnect,
  getConnectionStatus,
  getLarkClient,
} from '../../lark/client.js';
import { botEvents, type LogMessage, type BotStatus } from '../../lark/events.js';
import { getConfig, getDefaultWorkspace } from '../../config.js';
import { getAllChatSessions, updateChatSession } from '../../acpx/session.js';

const MAX_MESSAGES = 100;

export function useBotManager() {
  const config = getConfig();

  const [status, setStatus] = useState<BotStatus>({
    connectionStatus: getConnectionStatus() ? 'connected' : 'disconnected',
    uptime: 0,
    messageCount: 0,
    sessionCount: 0,
    agent: config.agents.default,
    workspace: getDefaultWorkspace().name,
  });

  const [messages, setMessages] = useState<LogMessage[]>([]);
  const [verboseLogs, setVerboseLogs] = useState(false);
  const [connectionStartTime, setConnectionStartTime] = useState<number | null>(null);
  const uptimeIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Handle bot events
  useEffect(() => {
    const handleStatus = (newStatus: BotStatus) => {
      setStatus(prev => ({ ...prev, ...newStatus }));
      // Track when connection started for uptime calculation
      if (newStatus.connectionStatus === 'connected') {
        setConnectionStartTime(Date.now());
      } else if (newStatus.connectionStatus === 'disconnected') {
        setConnectionStartTime(null);
      }
    };

    const handleMessage = (message: LogMessage) => {
      setMessages(prev => {
        const updated = [...prev, message];
        return updated.slice(-MAX_MESSAGES);
      });
    };

    botEvents.on('status', handleStatus);
    botEvents.on('message', handleMessage);

    return () => {
      botEvents.off('status', handleStatus);
      botEvents.off('message', handleMessage);
    };
  }, []);

  // Update uptime every second when connected
  useEffect(() => {
    if (status.connectionStatus === 'connected' && connectionStartTime) {
      uptimeIntervalRef.current = setInterval(() => {
        const sessions = getAllChatSessions();
        const uptime = Math.floor((Date.now() - connectionStartTime) / 1000);
        setStatus(prev => ({
          ...prev,
          uptime,
          sessionCount: sessions.length,
        }));
      }, 1000);
    } else {
      if (uptimeIntervalRef.current) {
        clearInterval(uptimeIntervalRef.current);
        uptimeIntervalRef.current = null;
      }
    }

    return () => {
      if (uptimeIntervalRef.current) {
        clearInterval(uptimeIntervalRef.current);
      }
    };
  }, [status.connectionStatus, connectionStartTime]);

  const handleConnect = useCallback(async () => {
    try {
      await connect();
    } catch (error) {
      // Error is emitted via events
    }
  }, []);

  const handleDisconnect = useCallback(async () => {
    await disconnect();
  }, []);

  const toggleVerbose = useCallback(() => {
    setVerboseLogs(prev => !prev);
    return !verboseLogs;
  }, [verboseLogs]);

  return {
    status,
    messages,
    verboseLogs,
    handleConnect,
    handleDisconnect,
    toggleVerbose,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/tui/hooks/useBotManager.ts
git commit -m "feat: add useBotManager hook for TUI state management"
```

### Task 8: Create Main App Component

**Files:**
- Create: `src/tui/App.tsx`

- [ ] **Step 1: Create App component with command handling**

```tsx
// src/tui/App.tsx
import React, { useState, useCallback, useMemo } from 'react';
import { render, Box, Text, useApp, useStdout } from 'ink';
import { StatusPanel } from './components/StatusPanel.js';
import { MessageLog } from './components/MessageLog.js';
import { CommandInput } from './components/CommandInput.js';
import { useBotManager } from './hooks/useBotManager.js';
import { getConfig, getDefaultWorkspace, getWorkspaceByName } from '../config.js';
import { updateChatSession, closeChatSession, getChatState, getAllChatSessions } from '../acpx/session.js';
import type { LogMessage } from '../lark/events.js';

const COMMANDS_HELP = `
Available commands:
  /start          - Connect to Feishu
  /stop           - Disconnect from Feishu
  /status         - Show detailed status
  /clear          - Clear chat session history
  /agent <name>   - Switch agent (claude, opencode, codex)
  /workspace <n>  - Switch workspace
  /logs           - Toggle verbose logging
  /config         - Display current configuration
  /help           - Show this help
  /exit           - Exit the application
`;

export function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const config = getConfig();

  const {
    status,
    messages,
    verboseLogs,
    handleConnect,
    handleDisconnect,
    toggleVerbose,
  } = useBotManager();

  const [localMessages, setLocalMessages] = useState<LogMessage[]>([]);

  // Combine bot messages with local messages
  const allMessages = useMemo(() => [...localMessages, ...messages], [localMessages, messages]);

  // Calculate log height based on terminal height
  const logHeight = Math.max(5, (stdout.rows || 24) - 10);

  const addLocalMessage = useCallback((type: LogMessage['type'], text: string) => {
    setLocalMessages(prev => [...prev, {
      timestamp: new Date(),
      type,
      text,
    }]);
  }, []);

  const handleCommand = useCallback(async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case '/start':
        if (status.connectionStatus === 'connected') {
          addLocalMessage('system', 'Already connected');
        } else {
          addLocalMessage('system', 'Connecting...');
          await handleConnect();
        }
        break;

      case '/stop':
        if (status.connectionStatus === 'disconnected') {
          addLocalMessage('system', 'Already disconnected');
        } else {
          await handleDisconnect();
        }
        break;

      case '/status':
        const sessions = getAllChatSessions();
        addLocalMessage('system', `Status: ${status.connectionStatus}`);
        addLocalMessage('system', `Uptime: ${status.uptime}s`);
        addLocalMessage('system', `Messages: ${status.messageCount}`);
        addLocalMessage('system', `Active sessions: ${sessions.length}`);
        addLocalMessage('system', `Agent: ${status.agent}`);
        addLocalMessage('system', `Workspace: ${status.workspace}`);
        break;

      case '/clear':
        addLocalMessage('system', 'Clear command is for Feishu chat sessions. Use /help for commands.');
        break;

      case '/agent':
        if (args.length === 0) {
          addLocalMessage('system', `Current agent: ${status.agent}`);
          addLocalMessage('system', `Available: ${config.agents.available.join(', ')}`);
        } else {
          const newAgent = args[0];
          if (!config.agents.available.includes(newAgent)) {
            addLocalMessage('error', `Unknown agent: ${newAgent}`);
            addLocalMessage('system', `Available: ${config.agents.available.join(', ')}`);
          } else {
            // Update default agent (simplified - in real app would update per-chat)
            addLocalMessage('system', `Switched to agent: ${newAgent}`);
          }
        }
        break;

      case '/workspace':
        if (args.length === 0) {
          addLocalMessage('system', `Current workspace: ${status.workspace}`);
          addLocalMessage('system', `Available: ${config.workspaces.map(w => w.name).join(', ')}`);
        } else {
          const ws = getWorkspaceByName(args[0]);
          if (!ws) {
            addLocalMessage('error', `Unknown workspace: ${args[0]}`);
            addLocalMessage('system', `Available: ${config.workspaces.map(w => w.name).join(', ')}`);
          } else {
            addLocalMessage('system', `Switched to workspace: ${args[0]}`);
          }
        }
        break;

      case '/logs':
        const newState = toggleVerbose();
        addLocalMessage('system', `Verbose logging: ${newState ? 'ON' : 'OFF'}`);
        break;

      case '/config':
        addLocalMessage('system', `Lark App ID: ${config.lark.appId}`);
        addLocalMessage('system', `Workspaces: ${config.workspaces.map(w => w.name).join(', ')}`);
        addLocalMessage('system', `Default agent: ${config.agents.default}`);
        addLocalMessage('system', `ACPX path: ${config.acpx.path}`);
        break;

      case '/help':
        addLocalMessage('system', COMMANDS_HELP);
        break;

      case '/exit':
        if (status.connectionStatus === 'connected') {
          await handleDisconnect();
        }
        addLocalMessage('system', 'Goodbye!');
        setTimeout(() => exit(), 100);
        break;

      default:
        addLocalMessage('error', `Unknown command: ${cmd}`);
        addLocalMessage('system', 'Type /help for available commands');
    }
  }, [status, config, handleConnect, handleDisconnect, toggleVerbose, addLocalMessage]);

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box
        borderStyle="single"
        borderColor="cyan"
        paddingX={1}
        justifyContent="space-between"
      >
        <Text bold color="cyan">Feishu ACP Code Bot</Text>
        <Text color={status.connectionStatus === 'connected' ? 'green' : 'gray'}>
          {status.connectionStatus === 'connected' ? '● Connected' : '○ Disconnected'}
        </Text>
      </Box>

      {/* Main content */}
      <Box flexGrow={1}>
        <StatusPanel
          connectionStatus={status.connectionStatus}
          uptime={status.uptime}
          messageCount={status.messageCount}
          sessionCount={status.sessionCount}
          agent={status.agent}
          workspace={status.workspace}
        />
        <Box borderStyle="single" borderColor="gray" flexGrow={1}>
          <MessageLog messages={allMessages} maxHeight={logHeight} />
        </Box>
      </Box>

      {/* Command input */}
      <CommandInput
        onSubmit={handleCommand}
        isConnected={status.connectionStatus === 'connected'}
      />
    </Box>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/tui/App.tsx
git commit -m "feat: add main App component with command handling"
```

### Task 9: Update Entry Point

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Replace auto-connect with TUI startup**

```typescript
// src/index.ts
import { render } from 'ink';
import { App } from './tui/App.js';
import { loadConfig } from './config.js';
import { logger } from './utils/logger.js';
import { registerCommand } from './commands/router.js';
import { sendTextMessage, type MessageContext } from './lark/message.js';
import { getConnectionStatus, connect, disconnect } from './lark/client.js';

// Register Feishu-side commands (these are used when bot receives messages in Feishu)
registerCommand('connect', async (ctx: MessageContext) => {
  if (getConnectionStatus()) {
    await sendTextMessage(ctx, 'Already connected');
    return;
  }
  try {
    await connect();
    await sendTextMessage(ctx, 'Connected successfully');
  } catch (error) {
    await sendTextMessage(ctx, `Connection failed: ${error}`);
  }
});

registerCommand('disconnect', async (ctx: MessageContext) => {
  await disconnect();
  await sendTextMessage(ctx, 'Disconnected');
});

registerCommand('reconnect', async (ctx: MessageContext) => {
  try {
    await disconnect();
    await connect();
    await sendTextMessage(ctx, 'Reconnected successfully');
  } catch (error) {
    await sendTextMessage(ctx, `Reconnection failed: ${error}`);
  }
});

registerCommand('clear', async (ctx: MessageContext) => {
  const { getChatState, closeChatSession } = await import('./acpx/session.js');
  const chatState = getChatState(ctx.chatId);
  if (chatState) {
    closeChatSession(ctx.chatId, chatState.currentWorkspace);
    await sendTextMessage(ctx, 'Session history cleared');
  } else {
    await sendTextMessage(ctx, 'No active session');
  }
});

// Main entry - start TUI
async function main(): Promise<void> {
  logger.info('Feishu ACP Code Bot starting...');

  try {
    // Load configuration
    loadConfig();
    logger.info('Configuration loaded');

    // Handle exit signals for graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM signal, shutting down...');
      if (getConnectionStatus()) {
        await disconnect();
      }
      process.exit(0);
    });

    // Start TUI
    const { waitUntilExit } = render(<App />);

    // Wait for TUI to exit
    await waitUntilExit();

    // Cleanup
    if (getConnectionStatus()) {
      await disconnect();
    }

    logger.info('Bot shutdown complete');
  } catch (error) {
    logger.error('Startup failed:', error);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: replace auto-connect with TUI startup"
```

### Task 10: Add Event Emissions in Parser

**Files:**
- Modify: `src/acpx/parser.ts`

- [ ] **Step 1: Add import for botEvents**

Add to the imports at the top of `src/acpx/parser.ts`:

```typescript
import { botEvents } from '../lark/events.js';
```

- [ ] **Step 2: Add event emissions in updateParsedOutput function**

In the `updateParsedOutput` function, find each of these blocks and add the emissions:

**For tool_call with running status** (around line 124-128, after `newOutput.toolCalls.set(...)`):
```typescript
botEvents.emit('message', {
  timestamp: new Date(),
  type: 'tool',
  text: `${toolName}: running`,
});
```

**For tool_call with completed/success status** (around line 129-135, after the set call):
```typescript
botEvents.emit('message', {
  timestamp: new Date(),
  type: 'tool',
  text: `${existing?.name || toolName}: completed`,
});
```

**For tool_call with error/failed status** (around line 136-142, after the set call):
```typescript
botEvents.emit('message', {
  timestamp: new Date(),
  type: 'error',
  text: `${existing?.name || toolName}: failed`,
});
```

**For agent_message_chunk** (around line 115-117, inside the else if block):
```typescript
else if (sessionUpdate === 'agent_message_chunk' && content?.text) {
  // Accumulate message chunks
  newOutput.text += content.text;

  // Emit on first chunk to show response started (check if output.text was empty before)
  if (output.text.length === 0) {
    botEvents.emit('message', {
      timestamp: new Date(),
      type: 'outgoing',
      text: 'Bot responding...',
    });
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/acpx/parser.ts
git commit -m "feat: add event emissions to parser for TUI logging"
```

---

## Chunk 4: Testing and Finalization

### Task 11: Test the TUI Application

**Files:**
- None (manual testing)

- [ ] **Step 1: Stop any running bot instances**

```bash
pkill -f "tsx src/index.ts"
```

- [ ] **Step 2: Start the TUI application**

```bash
npm run dev
```

Expected: TUI appears with:
- Header showing "Feishu ACP Code Bot" and "○ Disconnected"
- Left panel showing status and config
- Right panel showing "No messages yet. Use /start to connect."
- Bottom input bar with "❯" prompt

- [ ] **Step 3: Test /start command**

Type: `/start`
Expected:
- Status changes to "● Connected"
- Message log shows "Connecting..." then "Connected to Feishu"

- [ ] **Step 4: Test message handling**

Send a message to the bot from Feishu.
Expected: Message appears in log with "→ User message in chat xxx"

- [ ] **Step 5: Test /status command**

Type: `/status`
Expected: Detailed status info appears in log

- [ ] **Step 6: Test /help command**

Type: `/help`
Expected: Command list appears in log

- [ ] **Step 7: Test /stop command**

Type: `/stop`
Expected:
- Status changes to "○ Disconnected"
- Message log shows "Disconnected from Feishu"

- [ ] **Step 8: Test /exit command**

Type: `/exit`
Expected: Application exits cleanly

### Task 12: Final Commit and Cleanup

- [ ] **Step 1: Ensure all changes are committed**

```bash
git status
git add -A
git commit -m "feat: complete TUI dashboard implementation"
```

- [ ] **Step 2: Update any documentation if needed**

---

## Summary

This plan creates a complete TUI dashboard for the Feishu ACP Code Bot:

1. **Dependencies**: Ink + React for terminal UI
2. **Event System**: EventEmitter for bot → TUI communication
3. **Components**: StatusPanel, MessageLog, CommandInput
4. **Hook**: useBotManager for state management
5. **App**: Main layout and command routing
6. **Integration**: Updated client.ts and executor.ts to emit events

The result is a professional-looking terminal dashboard that:
- Shows connection status at a glance
- Displays real-time message activity
- Accepts commands for full bot control
- Works alongside existing Feishu message handling
