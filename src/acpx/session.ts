// src/acpx/session.ts
import { getConfig } from '../config.js';
import { logger } from '../utils/logger.js';
import type { ChatSession, SessionState, ChatState } from '../types/session.js';
import { createChatSessionKey, parseChatSessionKey } from '../types/session.js';

const globalState: ChatState = {
  sessions: new Map(),
  chatStates: new Map(),
};

export function getOrCreateChatSession(
  chatId: string,
  workspace?: string,
  agent?: string
): ChatSession {
  const config = getConfig();

  // 获取或创建聊天状态
  let chatState = globalState.chatStates.get(chatId);
  if (!chatState) {
    const defaultWorkspace = config.workspaces.find((w) => w.default) || config.workspaces[0];
    chatState = {
      currentWorkspace: defaultWorkspace.name,
      currentAgent: config.agents.default,
    };
    globalState.chatStates.set(chatId, chatState);
  }

  const ws = workspace || chatState.currentWorkspace;
  const ag = agent || chatState.currentAgent;

  const key = createChatSessionKey(chatId, ws);
  let session = globalState.sessions.get(key);

  if (!session) {
    session = {
      chatId,
      workspace: ws,
      agent: ag,
      createdAt: new Date(),
      lastActiveAt: new Date(),
    };
    globalState.sessions.set(key, session);
    logger.info(`创建新会话: chatId=${chatId}, workspace=${ws}, agent=${ag}`);
  } else {
    session.lastActiveAt = new Date();
  }

  return session;
}

export function updateChatSession(
  chatId: string,
  updates: { workspace?: string; agent?: string; acpxSessionId?: string }
): ChatSession | null {
  const chatState = globalState.chatStates.get(chatId);
  if (!chatState) return null;

  if (updates.workspace) {
    chatState.currentWorkspace = updates.workspace;
  }
  if (updates.agent) {
    chatState.currentAgent = updates.agent;
  }

  const key = createChatSessionKey(chatId, chatState.currentWorkspace);
  const session = globalState.sessions.get(key);

  if (session) {
    if (updates.agent) session.agent = updates.agent;
    if (updates.acpxSessionId) session.acpxSessionId = updates.acpxSessionId;
    session.lastActiveAt = new Date();
  }

  return session || null;
}

export function getChatState(chatId: string): SessionState | undefined {
  return globalState.chatStates.get(chatId);
}

export function setChatState(chatId: string, state: SessionState): void {
  globalState.chatStates.set(chatId, state);
}

export function getAllChatSessions(): ChatSession[] {
  return Array.from(globalState.sessions.values());
}

export function closeChatSession(chatId: string, workspace?: string): boolean {
  const chatState = globalState.chatStates.get(chatId);
  if (!chatState) return false;

  const ws = workspace || chatState.currentWorkspace;
  const key = createChatSessionKey(chatId, ws);
  return globalState.sessions.delete(key);
}
