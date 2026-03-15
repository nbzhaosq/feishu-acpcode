// src/agent/router.ts
import { logger } from '../utils/logger.js';
import type { ChatSession } from '../types/session.js';
import type { ParsedOutput, ToolCallInfo } from '../acpx/parser.js';
import type { MessageContext } from '../lark/message.js';
import {
  executeClaude,
  cancelTask as cancelClaudeTask,
  cancelAllTasks as cancelAllClaudeTasks,
  closeClaudeSession,
  closeAllClaudeSessions,
  getRunningTaskCount as getClaudeTaskCount,
  shutdownExecutor as shutdownClaudeExecutor,
} from '../claude/executor.js';
import {
  executeACP,
  closeACPXSession,
  closeAllACPXSessions,
  cancelTask as cancelACPTask,
  cancelAllTasks as cancelAllACPTasks,
  getRunningTaskCount as getACPTaskCount,
  shutdownExecutor as shutdownACPExecutor,
} from '../acp/executor.js';

/**
 * Options for executing an agent
 */
export interface AgentExecutorOptions {
  session: ChatSession;
  workspacePath: string;
  prompt: string;
  messageCtx: MessageContext;
  onUpdate?: (output: ParsedOutput) => void;
}

/**
 * Execute an agent based on the session's agent type.
 * Routes to Claude Agent SDK for 'claude', ACP SDK for others.
 */
export async function executeAgent(options: AgentExecutorOptions): Promise<ParsedOutput> {
  const { session } = options;
  const agent = session.agent.toLowerCase();

  if (agent === 'claude') {
    // Use Claude Agent SDK for native Claude integration
    logger.debug(`[AgentRouter] Using Claude Agent SDK for ${agent}`);
    return executeClaude(options);
  } else {
    // Use ACP SDK for OpenCode, Codex, and other agents
    logger.debug(`[AgentRouter] Using ACP SDK for ${agent}`);
    return executeACP(options);
  }
}

/**
 * Cancel a running task for a chat
 */
export async function cancelTask(chatId: string): Promise<number> {
  // Try cancelling from both executors
  const claudeCancelled = await cancelClaudeTask(chatId);
  const acpCancelled = await cancelACPTask(chatId);

  const total = (claudeCancelled ? 1 : 0) + (acpCancelled ? 1 : 0);
  if (total > 0) {
    logger.info(`[AgentRouter] Cancelled ${total} task(s) for chat ${chatId}`);
  }
  return total;
}

/**
 * Cancel all running tasks
 */
export async function cancelAllTasks(): Promise<number> {
  const claudeCount = await cancelAllClaudeTasks();
  const acpCount = await cancelAllACPTasks();

  const total = claudeCount + acpCount;
  if (total > 0) {
    logger.info(`[AgentRouter] Cancelled ${total} total task(s)`);
  }
  return total;
}

/**
 * Close agent session for a workspace
 */
export async function closeAgentSession(
  agent: string,
  workspacePath: string
): Promise<void> {
  if (agent.toLowerCase() === 'claude') {
    await closeClaudeSession(workspacePath, agent);
  } else {
    const config = (await import('../config.js')).getConfig();
    await closeACPXSession(config.acpx.path, workspacePath, agent);
  }
}

/**
 * Close all agent sessions
 */
export async function closeAllAgentSessions(): Promise<void> {
  await Promise.all([
    closeAllClaudeSessions(),
    closeAllACPXSessions(),
  ]);
  logger.info('[AgentRouter] All sessions closed');
}

/**
 * Get total running task count across all executors
 */
export function getRunningTaskCount(): number {
  return getClaudeTaskCount() + getACPTaskCount();
}

/**
 * Shutdown all executors
 */
export async function shutdownAllExecutors(): Promise<void> {
  await Promise.all([
    shutdownClaudeExecutor(),
    shutdownACPExecutor(),
  ]);
  logger.info('[AgentRouter] All executors shut down');
}

// Re-export types
export type { ParsedOutput, ToolCallInfo } from '../acpx/parser.js';
