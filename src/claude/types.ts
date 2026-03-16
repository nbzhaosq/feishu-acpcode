// src/claude/types.ts
import type { ParsedOutput, ToolCallInfo } from '../types/agent.js';

/**
 * Claude session state
 */
export interface ClaudeSession {
  sessionId: string;
  cwd: string;
  createdAt: Date;
  lastActiveAt: Date;
}

/**
 * Options for Claude executor
 */
export interface ClaudeExecutorOptions {
  session: import('../types/session.js').ChatSession;
  workspacePath: string;
  prompt: string;
  messageCtx: import('../lark/message.js').MessageContext;
  onUpdate?: (output: ParsedOutput) => void;
}

/**
 * Running Claude task
 */
export interface RunningClaudeTask {
  sessionId: string;
  messageId: string;
  lastCardUpdate: number;
  lastActivity: number;
  output: ParsedOutput;
  abortController?: AbortController;
}

/**
 * Claude-specific message types from Agent SDK
 */
export type ClaudeMessage =
  | { type: 'system'; subtype: string; session_id?: string }
  | { type: 'assistant'; content: ClaudeContentBlock[] }
  | { result: string; stop_reason?: string };

/**
 * Claude content block types
 */
export type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };
