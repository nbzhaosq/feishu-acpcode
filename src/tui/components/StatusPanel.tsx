// src/tui/components/StatusPanel.tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { ConnectionStatus } from '../../lark/events.js';

interface StatusPanelProps {
  connectionStatus: ConnectionStatus;
  uptime: number;
  messageCount: number;
  sessionCount: number;
  runningTaskCount: number;
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
  runningTaskCount,
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

      {/* Running tasks - show if any */}
      {runningTaskCount > 0 && (
        <Box marginTop={1}>
          <Text bold color="red">🤖 Agents ({runningTaskCount})</Text>
          <Text color="yellow">{runningTaskCount} task(s) running</Text>
        </Box>
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
