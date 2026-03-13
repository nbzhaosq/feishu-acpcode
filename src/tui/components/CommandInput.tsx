// src/tui/components/CommandInput.tsx
import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';

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
  const { exit } = useApp();

  const handleSubmit = useCallback((cmd: string) => {
    if (cmd.trim()) {
      setHistory(prev => [...prev, cmd]);
      setHistoryIndex(-1);
      onSubmit(cmd.trim());
      setInput('');
    }
  }, [onSubmit]);

  // Only use useInput if stdin is a TTY
  const isTTY = process.stdin.isTTY;

  useInput(isTTY ? (char, key) => {
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
    } else if (key.escape) {
      // ESC to clear input
      setInput('');
    } else if (key.ctrl && char === 'c') {
      // Ctrl+C to exit
      exit();
    } else if (!key.ctrl && !key.meta) {
      setInput(prev => prev + char);
    }
  } : () => {});

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text color="green" bold>❯ </Text>
      <Text>{input}</Text>
      <Text dimColor>▌</Text>
    </Box>
  );
};
