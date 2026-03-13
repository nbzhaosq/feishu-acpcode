// src/lark/client.ts
import * as lark from '@larksuiteoapi/node-sdk';
import { getConfig } from '../config.js';
import { routeMessage } from '../commands/router.js';
import { logger } from '../utils/logger.js';
import { botEvents, type BotStatus } from './events.js';

let wsClient: lark.WSClient | null = null;
let client: lark.Client | null = null;
let isConnected = false;

let connectionStartTime: number | null = null;
let messageCount = 0;

export function getLarkClient(): lark.Client {
  if (!client) {
    const config = getConfig();
    client = new lark.Client({
      appId: config.lark.appId,
      appSecret: config.lark.appSecret,
    });
  }
  return client;
}

export function getConnectionStatus(): boolean {
  return isConnected;
}

export async function connect(): Promise<void> {
  const config = getConfig();

  if (wsClient) {
    logger.warn('WebSocket 客户端已存在');
    return;
  }

  // Emit connecting status
  botEvents.emit('status', {
    connectionStatus: 'connecting',
    uptime: 0,
    messageCount,
    sessionCount: 0,
    runningTaskCount: 0,
    agent: config.agents.default,
    workspace: config.workspaces.find(w => w.default)?.name || config.workspaces[0].name,
  });

  client = new lark.Client({
    appId: config.lark.appId,
    appSecret: config.lark.appSecret,
  });

  const eventDispatcher = new lark.EventDispatcher({}).register({
    'im.message.receive_v1': async (data) => {
    logger.debug('收到消息:', data.message.message_id);
    messageCount++;

    botEvents.emit('message', {
      timestamp: new Date(),
      type: 'incoming',
      text: `User message in chat ${data.message.chat_id}`,
    });

    try {
      await routeMessage(client!, data);
    } catch (error) {
      logger.error('处理消息失败:', error);
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

  logger.info('正在连接飞书 WebSocket...');

  try {
    await wsClient.start({ eventDispatcher });
    isConnected = true;
    connectionStartTime = Date.now();
    logger.info('飞书 WebSocket 连接成功');

    botEvents.emit('status', {
      connectionStatus: 'connected',
      uptime: 0,
      messageCount,
      sessionCount: 0,
      runningTaskCount: 0,
      agent: config.agents.default,
      workspace: config.workspaces.find(w => w.default)?.name || config.workspaces[0].name,
    });

    botEvents.emit('message', {
      timestamp: new Date(),
      type: 'system',
      text: 'Connected to Feishu',
    });
  } catch (error) {
    isConnected = false;
    connectionStartTime = null;
    logger.error('飞书 WebSocket 连接失败:', error);

    botEvents.emit('status', {
      connectionStatus: 'error',
      uptime: 0,
      messageCount,
      sessionCount: 0,
      runningTaskCount: 0,
      agent: config.agents.default,
      workspace: config.workspaces.find(w => w.default)?.name || config.workspaces[0].name,
    });

    botEvents.emit('message', {
      timestamp: new Date(),
      type: 'error',
      text: `Failed to connect to Feishu: ${error}`,
    });

    throw error;
  }
}

export async function disconnect(): Promise<void> {
  if (wsClient) {
    // Cancel all running agent tasks first
    const { cancelAllTasks } = await import('../acpx/executor.js');
    const cancelledCount = cancelAllTasks();
    if (cancelledCount > 0) {
      logger.info(`Cancelled ${cancelledCount} running agent task(s)`);
      botEvents.emit('message', {
        timestamp: new Date(),
        type: 'system',
        text: `Cancelled ${cancelledCount} running agent task(s)`,
      });
    }

    wsClient.close();
    wsClient = null;
    isConnected = false;
    connectionStartTime = null;
    logger.info('Disconnected from Feishu WebSocket');

    botEvents.emit('status', {
      connectionStatus: 'disconnected',
      uptime: 0,
      messageCount,
      sessionCount: 0,
      runningTaskCount: 0,
      agent: '',
      workspace: '',
    });

    botEvents.emit('message', {
      timestamp: new Date(),
      type: 'system',
      text: 'Disconnected from Feishu',
    });
  }
}

export async function reconnect(): Promise<void> {
  await disconnect();
  await connect();
}

export function getBotStatus(): BotStatus {
  const config = getConfig();
  const { getRunningTaskCount } = require('../acpx/executor.js');

  return {
    connectionStatus: isConnected ? 'connected' : 'disconnected',
    uptime: connectionStartTime ? Math.floor((Date.now() - connectionStartTime) / 1000) : 0,
    messageCount,
    sessionCount: 0, // Session count tracked by useBotManager hook
    runningTaskCount: getRunningTaskCount(),
    agent: config.agents.default,
    workspace: config.workspaces.find(w => w.default)?.name || config.workspaces[0].name,
  };
}
