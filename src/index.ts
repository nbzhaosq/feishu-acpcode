// src/index.ts
import { render } from 'ink';
import React from 'react';
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
    const { waitUntilExit } = render(React.createElement(App));

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
