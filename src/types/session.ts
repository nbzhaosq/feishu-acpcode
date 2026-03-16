// src/types/session.ts
export interface ChatSession {
  chatId: string;
  workspace: string;
  agent: string;
  // Unified session ID (used by both Claude SDK and ACP SDK)
  sessionId?: string;
  // Process PID for ACP-based agents (OpenCode, Codex)
  processPid?: number;
  // Legacy fields kept for backward compatibility
  /** @deprecated Use sessionId instead */
  acpxSessionId?: string;
  /** @deprecated Use processPid instead */
  acpxPid?: number;
  createdAt: Date;
  lastActiveAt: Date;
}

export interface SessionState {
  currentWorkspace: string;
  currentAgent: string;
}

export interface ChatState {
  sessions: Map<string, ChatSession>;
  chatStates: Map<string, SessionState>;
}

export function createChatSessionKey(chatId: string, workspace: string): string {
  return `${chatId}:${workspace}`;
}

export function parseChatSessionKey(key: string): { chatId: string; workspace: string } {
  const [chatId, workspace] = key.split(':');
  return { chatId, workspace };
}
