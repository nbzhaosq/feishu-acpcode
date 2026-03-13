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
