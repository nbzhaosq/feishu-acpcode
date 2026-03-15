// src/acp/executor.ts
import * as acp from '@agentclientprotocol/sdk';
import { getConfig } from '../config.js';
import { logger } from '../utils/logger.js';
import { getACPManager, shutdownACPManager } from './connection.js';
import { buildMessageCard } from '../lark/card.js';
import { updateCardMessage, type MessageContext } from '../lark/message.js';
import type { ChatSession } from '../types/session.js';
import type { ACPSession, SessionUpdateCallback } from './types.js';
import type { ParsedOutput, ToolCallInfo } from '../acpx/parser.js';
import { botEvents } from '../lark/events.js';

/**
 * Options for executing an ACP prompt
 */
export interface ACPExecutorOptions {
  session: ChatSession;
  workspacePath: string;
  prompt: string;
  messageCtx: MessageContext;
  onUpdate?: (output: ParsedOutput) => void;
}

/**
 * Running task tracking
 */
interface RunningTask {
  session: ACPSession;
  messageId: string;
  lastCardUpdate: number;
  lastActivity: number;
  output: ParsedOutput;
}

const runningTasks = new Map<string, RunningTask>();

// Cleanup interval (30 minutes default)
const DEFAULT_TASK_TIMEOUT = 30 * 60 * 1000;
let cleanupInterval: NodeJS.Timeout | null = setInterval(() => {
  const now = Date.now();
  let timeout = DEFAULT_TASK_TIMEOUT;
  try {
    const config = getConfig();
    timeout = config.acpx.timeout || DEFAULT_TASK_TIMEOUT;
  } catch {
    // Config not loaded yet
  }

  for (const [chatId, task] of runningTasks.entries()) {
    if (now - task.lastActivity > timeout) {
      logger.warn(`[ACP] Task timed out, cancelling: ${chatId}`);
      cancelTask(chatId);
    }
  }
}, 60 * 1000);

/**
 * Map ACP ToolCallStatus to our internal status
 */
function mapToolCallStatus(status: acp.ToolCallStatus | undefined | null): 'running' | 'completed' | 'failed' {
  if (!status) return 'running';
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'in_progress':
    case 'pending':
    default:
      return 'running';
  }
}

/**
 * Check if content is text content
 */
function isTextContent(content: acp.ContentBlock): content is acp.TextContent & { type: 'text' } {
  return content.type === 'text';
}

/**
 * Convert ACP session update to ParsedOutput format
 */
function sessionUpdateToOutput(
  output: ParsedOutput,
  notification: acp.SessionNotification
): ParsedOutput {
  const update = notification.update;

  switch (update.sessionUpdate) {
    case 'agent_message_chunk':
      // ContentChunk type
      if (isTextContent(update.content)) {
        output.text += update.content.text;
        // Emit on first chunk to show response started
        if (output.text.length === update.content.text.length) {
          botEvents.emit('message', {
            timestamp: new Date(),
            type: 'outgoing',
            text: 'Bot responding...',
          });
        }
      }
      break;

    case 'agent_thought_chunk':
      // ContentChunk type for thinking
      if (isTextContent(update.content)) {
        const thinking = (output.thinking as string[]) || [];
        thinking.push(update.content.text);
        output.thinking = thinking;
        logger.debug(`[ACP] Thinking chunk: ${update.content.text.slice(0, 100)}...`);
      }
      break;

    case 'tool_call':
      // ToolCall type
      {
        const toolCallId = update.toolCallId || `tool-${Date.now()}`;
        const toolName = update.title || 'unknown';
        const status = mapToolCallStatus(update.status);

        const toolCall: ToolCallInfo = {
          id: toolCallId,
          name: toolName,
          status,
          input: update.rawInput,
          output: update.rawOutput ? String(update.rawOutput) : undefined,
        };
        output.toolCalls.set(toolCallId, toolCall);

        botEvents.emit('message', {
          timestamp: new Date(),
          type: 'tool',
          text: `${toolName}: ${status}`,
        });
      }
      break;

    case 'tool_call_update':
      // ToolCallUpdate type
      {
        const existing = output.toolCalls.get(update.toolCallId);
        if (existing) {
          if (update.status) {
            existing.status = mapToolCallStatus(update.status);
          }
          if (update.content) {
            // Convert content array to string
            existing.output = update.content
              .map(c => {
                if ('text' in c) return c.text;
                if ('output' in c) return `[terminal: ${c.output}]`;
                return `[${c.type}]`;
              })
              .join('');
          }
        }
      }
      break;

    case 'plan':
    case 'available_commands_update':
    case 'current_mode_update':
    case 'config_option_update':
    case 'session_info_update':
    case 'usage_update':
    case 'user_message_chunk':
      // Handle other updates if needed
      break;
  }

  return output;
}

/**
 * Create initial empty parsed output
 */
function createParsedOutput(): ParsedOutput {
  return {
    thinking: [],
    toolCalls: new Map(),
    text: '',
    done: false,
  };
}

/**
 * Execute a prompt using ACP SDK
 */
export async function executeACP(options: ACPExecutorOptions): Promise<ParsedOutput> {
  const { session, workspacePath, prompt, messageCtx, onUpdate } = options;
  const config = getConfig();

  // Check if there's already a running task for this chat
  const existingTask = runningTasks.get(messageCtx.chatId);
  if (existingTask) {
    logger.warn('[ACP] Task already running, cancelling old task');
    await cancelTask(messageCtx.chatId);
  }

  // Send initial message card
  const initialCard = buildMessageCard({
    agent: session.agent,
    workspace: session.workspace,
    status: 'thinking',
  });

  const createRes = await messageCtx.client.im.message.create({
    params: { receive_id_type: 'chat_id' },
    data: {
      receive_id: messageCtx.chatId,
      content: initialCard,
      msg_type: 'interactive',
    },
  });

  if (createRes.code !== 0 || !createRes.data?.message_id) {
    throw new Error('Failed to send initial message');
  }

  const messageId = createRes.data.message_id;
  let output = createParsedOutput();

  // Get ACP manager
  const manager = getACPManager();

  // Session update callback
  const handleSessionUpdate: SessionUpdateCallback = (notification) => {
    output = sessionUpdateToOutput(output, notification);
    output.done = false;

    // Callback
    if (onUpdate) {
      onUpdate(output);
    }

    // Update message card (throttled)
    const task = runningTasks.get(messageCtx.chatId);
    if (task) {
      task.output = output;
      task.lastActivity = Date.now();

      const now = Date.now();
      if (now - task.lastCardUpdate > 2000) {
        task.lastCardUpdate = now;
        updateCardWithOutput(messageCtx, messageId, session, output).catch(err => {
          logger.error('[ACP] Failed to update message card:', err);
        });
      }
    }
  };

  try {
    // Get or create ACP session
    const acpSession = await manager.createSession(
      {
        agentPath: config.acpx.path,
        cwd: workspacePath,
        agentName: session.agent,
        timeout: config.acpx.timeout,
      },
      handleSessionUpdate
    );

    // Track running task
    const task: RunningTask = {
      session: acpSession,
      messageId,
      lastCardUpdate: 0,
      lastActivity: Date.now(),
      output,
    };
    runningTasks.set(messageCtx.chatId, task);

    // Send prompt
    const result = await manager.sendPrompt(acpSession, prompt, handleSessionUpdate);

    // Mark as done
    output.done = true;
    if (result.error) {
      output.error = result.error;
    }
    output.stopReason = result.stopReason;

    // Clean up task
    runningTasks.delete(messageCtx.chatId);

    // Update final card
    await updateCardWithOutput(messageCtx, messageId, session, output);

    return output;
  } catch (error) {
    logger.error('[ACP] Execution error:', error);
    output.error = String(error);
    output.done = true;

    runningTasks.delete(messageCtx.chatId);

    await updateCardWithOutput(messageCtx, messageId, session, output);

    return output;
  }
}

/**
 * Update message card with output
 */
async function updateCardWithOutput(
  ctx: MessageContext,
  messageId: string,
  session: ChatSession,
  output: ParsedOutput
): Promise<void> {
  let status: 'thinking' | 'working' | 'done' | 'error';

  if (output.error) {
    status = 'error';
  } else if (output.done) {
    status = 'done';
  } else if (output.toolCalls.size > 0) {
    status = 'working';
  } else {
    status = 'thinking';
  }

  // Get latest thinking
  const thinking = Array.isArray(output.thinking)
    ? output.thinking.join('')
    : String(output.thinking || '');

  // Get tool calls array
  const toolCalls = Array.from(output.toolCalls.values());

  const card = buildMessageCard({
    agent: session.agent,
    workspace: session.workspace,
    status,
    thinking: thinking || undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    response: output.text || undefined,
    error: output.error,
  });

  await updateCardMessage(ctx, messageId, card);
}

/**
 * Cancel a running task
 */
export async function cancelTask(chatId: string): Promise<boolean> {
  const task = runningTasks.get(chatId);
  if (!task) return false;

  const manager = getACPManager();
  await manager.cancelPrompt(task.session);

  runningTasks.delete(chatId);
  return true;
}

/**
 * Cancel all running tasks
 */
export async function cancelAllTasks(): Promise<number> {
  const count = runningTasks.size;

  for (const [chatId] of runningTasks.entries()) {
    await cancelTask(chatId);
  }

  return count;
}

/**
 * Get running task count
 */
export function getRunningTaskCount(): number {
  return runningTasks.size;
}

/**
 * Get all running tasks
 */
export function getAllRunningTasks(): Map<string, RunningTask> {
  return new Map(runningTasks);
}

/**
 * Close ACP session for a workspace
 */
export async function closeACPXSession(
  _acpxPath: string,
  workspacePath: string,
  agent: string
): Promise<void> {
  const manager = getACPManager();
  const session = manager.getSession(workspacePath, agent);

  if (session) {
    await manager.closeSession(session);
  }
}

/**
 * Close all ACP sessions
 */
export async function closeAllACPXSessions(): Promise<void> {
  await shutdownACPManager();
}

/**
 * Shutdown executor
 */
export async function shutdownExecutor(): Promise<void> {
  // Clear cleanup interval
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }

  // Cancel all tasks
  await cancelAllTasks();

  // Close all sessions
  await shutdownACPManager();
}
