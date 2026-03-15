// src/claude/executor.ts
import { query } from '@anthropic-ai/claude-agent-sdk';
import { getConfig } from '../config.js';
import { logger } from '../utils/logger.js';
import { buildMessageCard } from '../lark/card.js';
import { updateCardMessage, type MessageContext } from '../lark/message.js';
import type { ChatSession } from '../types/session.js';
import type { ParsedOutput, ToolCallInfo } from '../acpx/parser.js';
import { botEvents } from '../lark/events.js';
import {
  getOrCreateSession,
  updateSessionId,
  closeSession,
  closeAllSessions,
} from './session.js';
import type { ClaudeExecutorOptions, RunningClaudeTask } from './types.js';

/**
 * Running task tracking
 */
const runningTasks = new Map<string, RunningClaudeTask>();

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
      logger.warn(`[Claude] Task timed out, cancelling: ${chatId}`);
      cancelTask(chatId);
    }
  }
}, 60 * 1000);

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
 * Execute a prompt using Claude Agent SDK
 */
export async function executeClaude(options: ClaudeExecutorOptions): Promise<ParsedOutput> {
  const { session, workspacePath, prompt, messageCtx, onUpdate } = options;
  const config = getConfig();

  // Check if there's already a running task for this chat
  const existingTask = runningTasks.get(messageCtx.chatId);
  if (existingTask) {
    logger.warn('[Claude] Task already running, cancelling old task');
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

  // Get or create Claude session
  const claudeSession = getOrCreateSession(workspacePath);

  // Create abort controller for this task
  const abortController = new AbortController();

  // Track running task
  const task: RunningClaudeTask = {
    sessionId: claudeSession.sessionId || '',
    messageId,
    lastCardUpdate: 0,
    lastActivity: Date.now(),
    output,
    abortController,
  };
  runningTasks.set(messageCtx.chatId, task);

  try {
    // Query options - use default Claude Code configuration
    // Don't override env to let SDK use existing ~/.claude/ config
    const queryOptions: Parameters<typeof query>[0]['options'] = {
      cwd: workspacePath,
      executable: 'node',
      tools: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
      permissionMode: 'acceptEdits',
      // Capture stderr for debugging
      stderr: (data: string) => {
        logger.error(`[Claude SDK stderr] ${data.trim()}`);
      },
    };

    // Resume session if exists
    if (claudeSession.sessionId) {
      queryOptions.resume = claudeSession.sessionId;
      logger.debug(`[Claude] Resuming session: ${claudeSession.sessionId}`);
    }

    // Process streaming messages
    for await (const message of query({ prompt, options: queryOptions })) {
      // Check if cancelled
      if (abortController.signal.aborted) {
        output.done = true;
        output.error = 'Task cancelled';
        break;
      }

      // Update last activity
      task.lastActivity = Date.now();

      // Handle different message types
      if (message.type === 'result' && 'result' in message) {
        // Final result from SDK
        const resultMsg = message as { result: string; subtype?: string };
        output.text = resultMsg.result;
        output.done = true;
        output.stopReason = resultMsg.subtype === 'success' ? 'end_turn' : (resultMsg.subtype || 'end_turn');

        botEvents.emit('message', {
          timestamp: new Date(),
          type: 'outgoing',
          text: resultMsg.result.slice(0, 100) + (resultMsg.result.length > 100 ? '...' : ''),
        });
      } else if (message.type === 'system' && 'subtype' in message && message.subtype === 'init') {
        // Capture session ID for resumption
        if (message.session_id) {
          updateSessionId(workspacePath, message.session_id);
          task.sessionId = message.session_id;
          logger.debug(`[Claude] Session ID: ${message.session_id}`);
        }
      } else if ('type' in message) {
        // Handle content blocks
        await processMessageContent(message, output, messageCtx, messageId, session, task);
      }

      // Callback
      if (onUpdate) {
        onUpdate(output);
      }

      // Update message card (throttled)
      const now = Date.now();
      if (now - task.lastCardUpdate > 2000 || output.done) {
        task.lastCardUpdate = now;
        task.output = output;
        await updateCardWithOutput(messageCtx, messageId, session, output);
      }
    }

    // Clean up task
    runningTasks.delete(messageCtx.chatId);

    // Update final card
    await updateCardWithOutput(messageCtx, messageId, session, output);

    return output;
  } catch (error) {
    logger.error('[Claude] Execution error:', error);
    output.error = String(error);
    output.done = true;

    runningTasks.delete(messageCtx.chatId);

    await updateCardWithOutput(messageCtx, messageId, session, output);

    return output;
  }
}

/**
 * Process message content from Claude Agent SDK
 */
async function processMessageContent(
  message: any,
  output: ParsedOutput,
  _messageCtx: MessageContext,
  _messageId: string,
  _session: ChatSession,
  task: RunningClaudeTask
): Promise<void> {
  // Handle content_block_delta for streaming
  if (message.type === 'content_block_delta') {
    const delta = message.delta;

    if (delta.type === 'text_delta' && delta.text) {
      output.text += delta.text;

      // Emit on first chunk to show response started
      if (output.text.length === delta.text.length) {
        botEvents.emit('message', {
          timestamp: new Date(),
          type: 'outgoing',
          text: 'Bot responding...',
        });
      }
    } else if (delta.type === 'thinking_delta' && delta.thinking) {
      // Handle thinking
      const thinking = output.thinking as string[];
      thinking.push(delta.thinking);
      logger.debug(`[Claude] Thinking: ${delta.thinking.slice(0, 100)}...`);
    } else if (delta.type === 'input_json_delta') {
      // Tool input being streamed - we'll capture the full input on tool_use
    }
  }

  // Handle content_block_start
  if (message.type === 'content_block_start') {
    const block = message.content_block;

    if (block.type === 'tool_use') {
      const toolCallId = block.id || `tool-${Date.now()}`;
      const toolName = block.name || 'unknown';

      const toolCall: ToolCallInfo = {
        id: toolCallId,
        name: toolName,
        status: 'running',
      };
      output.toolCalls.set(toolCallId, toolCall);

      botEvents.emit('message', {
        timestamp: new Date(),
        type: 'tool',
        text: `${toolName}: running`,
      });
    }
  }

  // Handle content_block_stop for tool completion
  if (message.type === 'content_block_stop') {
    // Tool execution completed - check for tool result
    // This is handled by the tool_result message type
  }

  // Handle tool_result (if present in message)
  if (message.type === 'tool_result' || message.content_block?.type === 'tool_result') {
    const toolResult = message.content_block || message;
    if (toolResult.tool_use_id) {
      const existing = output.toolCalls.get(toolResult.tool_use_id);
      if (existing) {
        existing.status = toolResult.is_error ? 'failed' : 'completed';
        existing.output = typeof toolResult.content === 'string'
          ? toolResult.content
          : JSON.stringify(toolResult.content);

        botEvents.emit('message', {
          timestamp: new Date(),
          type: 'tool',
          text: `${existing.name}: ${existing.status}`,
        });
      }
    }
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

  // Abort the query
  if (task.abortController) {
    task.abortController.abort();
  }

  runningTasks.delete(chatId);
  return true;
}

/**
 * Cancel all running tasks
 */
export async function cancelAllTasks(): Promise<number> {
  const count = runningTasks.size;

  for (const [chatId, task] of runningTasks.entries()) {
    if (task.abortController) {
      task.abortController.abort();
    }
    runningTasks.delete(chatId);
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
export function getAllRunningTasks(): Map<string, RunningClaudeTask> {
  return new Map(runningTasks);
}

/**
 * Close Claude session for a workspace
 */
export async function closeClaudeSession(
  _workspacePath: string,
  _agent: string
): Promise<void> {
  // Claude Agent SDK sessions are managed internally
  // We just clear our tracking
  closeSession(_workspacePath);
}

/**
 * Close all Claude sessions
 */
export async function closeAllClaudeSessions(): Promise<void> {
  // Cancel all tasks first
  await cancelAllTasks();

  // Clear session tracking
  closeAllSessions();
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
  closeAllSessions();
}
