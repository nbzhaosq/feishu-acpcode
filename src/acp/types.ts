// src/acp/types.ts
import type * as acp from '@agentclientprotocol/sdk';

/**
 * Configuration for ACP agent connection
 */
export interface ACPAgentConfig {
  /** Agent executable path (e.g., 'claude', 'acpx', 'opencode') */
  agentPath: string;
  /** Working directory for the agent */
  cwd: string;
  /** Agent name (claude, opencode, codex) */
  agentName: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Additional arguments for the agent */
  args?: string[];
}

/**
 * Session update callback
 */
export type SessionUpdateCallback = (update: acp.SessionNotification) => void;

/**
 * Permission request callback
 */
export type PermissionRequestCallback = (params: acp.RequestPermissionRequest) => Promise<acp.RequestPermissionResponse>;

/**
 * Client capabilities configuration
 */
export interface ClientCapabilities {
  /** Allow reading text files */
  readTextFile?: boolean;
  /** Allow writing text files */
  writeTextFile?: boolean;
  /** Allow terminal operations */
  terminal?: boolean;
}

/**
 * ACP session state
 */
export interface ACPSession {
  /** Session ID from the agent */
  sessionId: string;
  /** Working directory */
  cwd: string;
  /** Agent name */
  agentName: string;
  /** Connection instance */
  connection: acp.ClientSideConnection;
  /** Child process */
  process: import('child_process').ChildProcess;
  /** Creation time */
  createdAt: Date;
  /** Last activity time */
  lastActiveAt: Date;
}

/**
 * Prompt result
 */
export interface PromptResult {
  /** Stop reason */
  stopReason: acp.StopReason;
  /** Error if any */
  error?: string;
}
