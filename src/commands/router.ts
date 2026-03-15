// src/commands/router.ts
import type * as lark from '@larksuiteoapi/node-sdk';
import { getConfig, getWorkspaceByName, getDefaultWorkspace } from '../config.js';
import { getOrCreateChatSession, getChatState, updateChatSession, closeChatSession, getAllChatSessions, getChatSession } from '../acpx/session.js';
// Use ACP SDK executor instead of acpx CLI executor
import { executeACP, closeACPXSession } from '../acp/executor.js';
import { buildHelpCard, buildStatusCard, buildErrorCard } from '../lark/card.js';
import { sendCardMessage, sendTextMessage, extractTextContent, type MessageContext } from '../lark/message.js';
import { logger } from '../utils/logger.js';
import type { MessageReceiveEvent } from '../types/lark.js';

export type CommandHandler = (
  ctx: MessageContext,
  args: string[],
  rawMessage: MessageReceiveEvent
) => Promise<void>;

const commands = new Map<string, CommandHandler>();

export function registerCommand(name: string, handler: CommandHandler): void {
  commands.set(name, handler);
}

export async function routeMessage(
  client: lark.Client,
  message: MessageReceiveEvent
): Promise<void> {
  const chatId = message.message.chat_id;
  const content = extractTextContent(message.message.content);

  if (!content.trim()) {
    return;
  }

  const ctx: MessageContext = { client, chatId };

  // Check if it's a command
  if (content.startsWith('/')) {
    const parts = content.slice(1).trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    const handler = commands.get(cmd);
    if (handler) {
      await handler(ctx, args, message);
    } else {
      await sendTextMessage(ctx, `Unknown command: /${cmd}\nUse /help to see available commands`);
    }
    return;
  }

  // Handle as prompt
  await handlePrompt(ctx, content, message);
}

async function handlePrompt(
  ctx: MessageContext,
  prompt: string,
  message: MessageReceiveEvent
): Promise<void> {
  const config = getConfig();

  try {
    const session = getOrCreateChatSession(ctx.chatId);
    const workspace = config.workspaces.find((w) => w.name === session.workspace);

    if (!workspace) {
      const errorCard = buildErrorCard('Workspace Not Found', `Workspace "${session.workspace}" not found`, [
        'Use /ws to view available workspaces',
      ]);
      await sendCardMessage(ctx, errorCard);
      return;
    }

    await executeACP({
      session,
      workspacePath: workspace.path,
      prompt,
      messageCtx: ctx,
    });
  } catch (error) {
    logger.error('Failed to process prompt:', error);
    const errorCard = buildErrorCard('Processing Failed', String(error), [
      'Use /session new to create a new session',
      'Use /status to check status',
    ]);
    await sendCardMessage(ctx, errorCard);
  }
}

// Built-in command handlers
async function handleHelp(ctx: MessageContext): Promise<void> {
  await sendCardMessage(ctx, buildHelpCard());
}

async function handleStatus(ctx: MessageContext): Promise<void> {
  const config = getConfig();
  const chatState = getChatState(ctx.chatId);
  const sessions = getAllChatSessions().filter((s) => s.chatId === ctx.chatId);

  const card = buildStatusCard(
    true, // connected
    chatState?.currentAgent || config.agents.default,
    chatState?.currentWorkspace || getDefaultWorkspace().name,
    sessions.length
  );

  await sendCardMessage(ctx, card);
}

async function handleAgent(ctx: MessageContext, args: string[]): Promise<void> {
  const config = getConfig();

  if (args.length === 0) {
    const chatState = getChatState(ctx.chatId);
    const current = chatState?.currentAgent || config.agents.default;
    const available = config.agents.available.join(', ');
    await sendTextMessage(ctx, `Current agent: ${current}\nAvailable agents: ${available}`);
    return;
  }

  const newAgent = args[0].toLowerCase();
  if (!config.agents.available.includes(newAgent)) {
    await sendTextMessage(ctx, `Unsupported agent: ${newAgent}\nAvailable: ${config.agents.available.join(', ')}`);
    return;
  }

  updateChatSession(ctx.chatId, { agent: newAgent });
  await sendTextMessage(ctx, `Switched to agent: ${newAgent}`);
}

async function handleWorkspace(ctx: MessageContext, args: string[]): Promise<void> {
  const config = getConfig();

  if (args.length === 0) {
    const chatState = getChatState(ctx.chatId);
    const current = chatState?.currentWorkspace || getDefaultWorkspace().name;
    const all = config.workspaces.map((w) => w.name).join(', ');
    await sendTextMessage(ctx, `Current workspace: ${current}\nAvailable: ${all}`);
    return;
  }

  const newWorkspace = args[0];
  const workspace = getWorkspaceByName(newWorkspace);

  if (!workspace) {
    const all = config.workspaces.map((w) => w.name).join(', ');
    await sendTextMessage(ctx, `Workspace not found: ${newWorkspace}\nAvailable: ${all}`);
    return;
  }

  updateChatSession(ctx.chatId, { workspace: newWorkspace });
  await sendTextMessage(ctx, `Switched to workspace: ${newWorkspace}`);
}

async function handleSession(ctx: MessageContext, args: string[]): Promise<void> {
  const subCmd = args[0]?.toLowerCase();
  const config = getConfig();

  if (subCmd === 'new') {
    const chatState = getChatState(ctx.chatId);
    if (chatState) {
      // Close existing acpx session if any
      const session = getChatSession(ctx.chatId, chatState.currentWorkspace);
      if (session) {
        const workspace = config.workspaces.find(w => w.name === session.workspace);
        if (workspace) {
          await closeACPXSession(config.acpx.path, workspace.path, session.agent);
        }
      }
      closeChatSession(ctx.chatId, chatState.currentWorkspace);
    }
    await sendTextMessage(ctx, 'Created new session');
  } else if (subCmd === 'close') {
    const chatState = getChatState(ctx.chatId);
    if (chatState) {
      // Close existing acpx session if any
      const session = getChatSession(ctx.chatId, chatState.currentWorkspace);
      if (session) {
        const workspace = config.workspaces.find(w => w.name === session.workspace);
        if (workspace) {
          await closeACPXSession(config.acpx.path, workspace.path, session.agent);
        }
      }
      closeChatSession(ctx.chatId, chatState.currentWorkspace);
      await sendTextMessage(ctx, 'Current session closed');
    } else {
      await sendTextMessage(ctx, 'No active session');
    }
  } else {
    await sendTextMessage(ctx, 'Usage:\n/session new - Create new session\n/session close - Close current session');
  }
}

// Register built-in commands
registerCommand('help', handleHelp);
registerCommand('status', handleStatus);
registerCommand('agent', handleAgent);
registerCommand('workspace', handleWorkspace);
registerCommand('ws', handleWorkspace);
registerCommand('session', handleSession);
