// src/claude/session.ts
import { logger } from '../utils/logger.js';
import type { ClaudeSession } from './types.js';

// In-memory session storage
const sessions = new Map<string, ClaudeSession>();

/**
 * Create session key from workspace path and agent
 */
export function createSessionKey(workspacePath: string): string {
  return `claude:${workspacePath}`;
}

/**
 * Get or create a Claude session
 */
export function getOrCreateSession(workspacePath: string): ClaudeSession {
  const key = createSessionKey(workspacePath);
  let session = sessions.get(key);

  if (!session) {
    session = {
      sessionId: '', // Will be populated after first query
      cwd: workspacePath,
      createdAt: new Date(),
      lastActiveAt: new Date(),
    };
    sessions.set(key, session);
    logger.info(`[Claude] Created new session for workspace: ${workspacePath}`);
  } else {
    session.lastActiveAt = new Date();
  }

  return session;
}

/**
 * Update session with new session ID
 */
export function updateSessionId(workspacePath: string, sessionId: string): void {
  const key = createSessionKey(workspacePath);
  const session = sessions.get(key);

  if (session) {
    session.sessionId = sessionId;
    session.lastActiveAt = new Date();
    logger.debug(`[Claude] Updated session ID: ${sessionId}`);
  }
}

/**
 * Get session by workspace path
 */
export function getSession(workspacePath: string): ClaudeSession | undefined {
  return sessions.get(createSessionKey(workspacePath));
}

/**
 * Close a session
 */
export function closeSession(workspacePath: string): void {
  const key = createSessionKey(workspacePath);
  const session = sessions.get(key);

  if (session) {
    sessions.delete(key);
    logger.info(`[Claude] Closed session for workspace: ${workspacePath}`);
  }
}

/**
 * Close all sessions
 */
export function closeAllSessions(): void {
  sessions.clear();
  logger.info('[Claude] Closed all sessions');
}

/**
 * Get all sessions
 */
export function getAllSessions(): ClaudeSession[] {
  return Array.from(sessions.values());
}

/**
 * Get session count
 */
export function getSessionCount(): number {
  return sessions.size;
}
