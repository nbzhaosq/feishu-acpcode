// src/tui/App.tsx
import React, { useState, useCallback, useMemo } from 'react';
import { render, Box, Text, useApp, useStdout } from 'ink';
import { StatusPanel } from './components/StatusPanel.js';
import { MessageLog } from './components/MessageLog.js';
import { CommandInput } from './components/CommandInput.js';
import { useBotManager } from './hooks/useBotManager.js';
import { getConfig, getDefaultWorkspace, getWorkspaceByName } from '../config.js';
import { getAllChatSessions } from '../acpx/session.js';
import type { LogMessage } from '../lark/events.js';

const COMMANDS_HELP = `
Available commands:
  /start          - Connect to Feishu
  /stop           - Disconnect from Feishu (also stops all agents)
  /cancel         - Cancel all running agent tasks
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
    handleCancelAllTasks,
    toggleVerbose,
    addLocalMessage: addBotLocalMessage,
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

      case '/cancel':
        if (status.runningTaskCount === 0) {
          addLocalMessage('system', 'No running tasks to cancel');
        } else {
          const count = handleCancelAllTasks();
          addLocalMessage('system', `Cancelled ${count} running task(s)`);
        }
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
          runningTaskCount={status.runningTaskCount}
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
