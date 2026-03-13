// src/types/session.ts
export interface ChatSession {
  chatId: string;
  workspace: string;
  agent: string;
  acpxSessionId?: string;
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
