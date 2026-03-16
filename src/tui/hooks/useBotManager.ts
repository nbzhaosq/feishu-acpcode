// src/tui/hooks/useBotManager.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  connect,
  disconnect,
  getConnectionStatus,
} from '../../lark/client.js';
import { botEvents, type LogMessage, type BotStatus } from '../../lark/events.js';
import { getConfig, getDefaultWorkspace } from '../../config.js';
import { getAllChatSessions } from '../../session/index.js';
import { getRunningTaskCount, cancelAllTasks } from '../../agent/router.js';

const MAX_MESSAGES = 100;

export function useBotManager() {
  const config = getConfig();

  const [status, setStatus] = useState<BotStatus>({
    connectionStatus: getConnectionStatus() ? 'connected' : 'disconnected',
    uptime: 0,
    messageCount: 0,
    sessionCount: 0,
    runningTaskCount: 0,
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
        const taskCount = getRunningTaskCount();
        setStatus(prev => ({
          ...prev,
          uptime,
          sessionCount: sessions.length,
          runningTaskCount: taskCount,
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

  const handleCancelAllTasks = useCallback(async () => {
    const count = await cancelAllTasks();
    if (count > 0) {
      addLocalMessage('system', `Cancelled ${count} running task(s)`);
    }
    setStatus(prev => ({ ...prev, runningTaskCount: 0 }));
    return count;
  }, []);

  const toggleVerbose = useCallback(() => {
    setVerboseLogs(prev => !prev);
    return !verboseLogs;
  }, [verboseLogs]);

  const addLocalMessage = useCallback((type: LogMessage['type'], text: string) => {
    setMessages(prev => [...prev, {
      timestamp: new Date(),
      type,
      text,
    }]);
  }, []);

  return {
    status,
    messages,
    verboseLogs,
    handleConnect,
    handleDisconnect,
    handleCancelAllTasks,
    toggleVerbose,
    addLocalMessage,
  };
}
