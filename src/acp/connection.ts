// src/acp/connection.ts
import { spawn, ChildProcess } from 'child_process';
import { Writable, Readable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import type {
  ACPAgentConfig,
  ACPSession,
  PromptResult,
  SessionUpdateCallback,
  PermissionRequestCallback
} from './types.js';
import { FeishuACPClient } from './client.js';
import { logger } from '../utils/logger.js';

/**
 * ACP Connection Manager
 *
 * Manages connections to ACP agents (Claude Code, OpenCode, Codex, etc.)
 */
export class ACPConnectionManager {
  private sessions = new Map<string, ACPSession>();
  private clients = new Map<string, FeishuACPClient>();

  /**
   * Create a new session with an ACP agent
   */
  async createSession(
    config: ACPAgentConfig,
    onUpdate?: SessionUpdateCallback,
    onPermission?: PermissionRequestCallback
  ): Promise<ACPSession> {
    const sessionKey = `${config.cwd}:${config.agentName}`;

    // Check if session already exists
    const existingSession = this.sessions.get(sessionKey);
    if (existingSession) {
      logger.info(`[ACP] Reusing existing session: ${existingSession.sessionId}`);
      existingSession.lastActiveAt = new Date();
      return existingSession;
    }

    // Create client
    const client = new FeishuACPClient(config.cwd, {
      readTextFile: true,
      writeTextFile: true,
      terminal: true,
    });

    if (onUpdate) {
      client.setSessionUpdateCallback(onUpdate);
    }
    if (onPermission) {
      client.setPermissionCallback(onPermission);
    }

    // Spawn agent process
    const agentProcess = this.spawnAgent(config);

    // Create streams using Node.js Readable/Writable to Web Streams conversion
    const input = Writable.toWeb(agentProcess.stdin!);
    const output = Readable.toWeb(agentProcess.stdout!) as ReadableStream<Uint8Array>;

    // Create connection using ndJsonStream
    const stream = acp.ndJsonStream(input, output);
    const connection = new acp.ClientSideConnection((_agent) => client, stream);

    // Initialize connection
    const initResult = await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
        terminal: true,
      },
    });

    logger.info(`[ACP] Connected to agent (protocol v${initResult.protocolVersion})`);
    logger.debug('[ACP] Agent capabilities:', initResult.agentCapabilities);

    // Create new session
    const sessionResult = await connection.newSession({
      cwd: config.cwd,
      mcpServers: [],
    });

    const sessionId = sessionResult.sessionId;
    logger.info(`[ACP] Created session: ${sessionId}`);

    const session: ACPSession = {
      sessionId,
      cwd: config.cwd,
      agentName: config.agentName,
      connection,
      process: agentProcess,
      createdAt: new Date(),
      lastActiveAt: new Date(),
    };

    this.sessions.set(sessionKey, session);
    this.clients.set(sessionKey, client);

    // Handle process events
    agentProcess.on('error', (err) => {
      logger.error(`[ACP] Agent process error:`, err);
      this.sessions.delete(sessionKey);
      this.clients.delete(sessionKey);
    });

    agentProcess.on('exit', (code, signal) => {
      logger.info(`[ACP] Agent process exited: code=${code}, signal=${signal}`);
      this.sessions.delete(sessionKey);
      this.clients.delete(sessionKey);
    });

    return session;
  }

  /**
   * Send a prompt to an existing session
   */
  async sendPrompt(
    session: ACPSession,
    prompt: string,
    onUpdate?: SessionUpdateCallback
  ): Promise<PromptResult> {
    // Update callback if provided
    if (onUpdate) {
      const sessionKey = `${session.cwd}:${session.agentName}`;
      const client = this.clients.get(sessionKey);
      if (client) {
        client.setSessionUpdateCallback(onUpdate);
      }
    }

    session.lastActiveAt = new Date();

    try {
      const result = await session.connection.prompt({
        sessionId: session.sessionId,
        prompt: [
          {
            type: 'text',
            text: prompt,
          },
        ],
      });

      return {
        stopReason: result.stopReason,
      };
    } catch (error) {
      logger.error('[ACP] Prompt error:', error);
      return {
        stopReason: 'cancelled',
        error: String(error),
      };
    }
  }

  /**
   * Cancel an ongoing prompt
   */
  async cancelPrompt(session: ACPSession): Promise<void> {
    try {
      await session.connection.cancel({
        sessionId: session.sessionId,
      });
      logger.info(`[ACP] Cancelled prompt for session: ${session.sessionId}`);
    } catch (error) {
      logger.error('[ACP] Cancel error:', error);
    }
  }

  /**
   * Close a session
   */
  async closeSession(session: ACPSession): Promise<void> {
    const sessionKey = `${session.cwd}:${session.agentName}`;

    try {
      // Try to close the session gracefully
      if (session.connection.unstable_closeSession) {
        await session.connection.unstable_closeSession({
          sessionId: session.sessionId,
        });
      }
    } catch (error) {
      logger.warn('[ACP] Error closing session:', error);
    }

    // Kill the process
    if (session.process && !session.process.killed) {
      session.process.kill('SIGTERM');
    }

    this.sessions.delete(sessionKey);
    this.clients.delete(sessionKey);

    logger.info(`[ACP] Closed session: ${session.sessionId}`);
  }

  /**
   * Get an existing session
   */
  getSession(cwd: string, agentName: string): ACPSession | undefined {
    const sessionKey = `${cwd}:${agentName}`;
    return this.sessions.get(sessionKey);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): ACPSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Close all sessions
   */
  async closeAllSessions(): Promise<void> {
    const closePromises = Array.from(this.sessions.values()).map(session =>
      this.closeSession(session)
    );
    await Promise.all(closePromises);
    logger.info(`[ACP] Closed all sessions (${closePromises.length})`);
  }

  /**
   * Spawn an agent process
   */
  private spawnAgent(config: ACPAgentConfig): ChildProcess {
    const args = config.args || [];

    // For different agents, we might need different spawn strategies
    // acpx format: acpx --cwd <path> <agent>
    // claude-code format: claude --agent

    let command = config.agentPath;
    let commandArgs = [...args];

    // If using acpx, the command structure is different
    if (config.agentPath === 'acpx' || config.agentPath.endsWith('/acpx')) {
      commandArgs = ['--cwd', config.cwd, config.agentName, ...args];
    } else if (config.agentName === 'claude') {
      // Direct claude-code invocation
      commandArgs = ['--cwd', config.cwd, ...args];
    }

    logger.info(`[ACP] Spawning agent: ${command} ${commandArgs.join(' ')}`);

    const proc = spawn(command, commandArgs, {
      cwd: config.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Enable ACP mode for claude-code
        CLAUDE_CODE_ACP: '1',
      },
    });

    // Log stderr for debugging
    proc.stderr?.on('data', (data) => {
      logger.debug(`[ACP] Agent stderr:`, data.toString());
    });

    return proc;
  }
}

// Singleton instance
let managerInstance: ACPConnectionManager | null = null;

export function getACPManager(): ACPConnectionManager {
  if (!managerInstance) {
    managerInstance = new ACPConnectionManager();
  }
  return managerInstance;
}

export async function shutdownACPManager(): Promise<void> {
  if (managerInstance) {
    await managerInstance.closeAllSessions();
    managerInstance = null;
  }
}
