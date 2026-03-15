// src/acpx/executor.ts
import { spawn, ChildProcess, execSync } from 'child_process';
import { getConfig } from '../config.js';
import { logger } from '../utils/logger.js';
import {
  createParsedOutput,
  parseACPXLine,
  updateParsedOutput,
  getToolCallsArray,
  getLatestThinking,
  type ParsedOutput,
} from './parser.js';
import { buildMessageCard, buildErrorCard } from '../lark/card.js';
import { updateCardMessage, type MessageContext } from '../lark/message.js';
import type { ChatSession } from '../types/session.js';
import { updateChatSession, getOrCreateChatSession, getAllChatSessions } from './session.js';

export interface ExecutorOptions {
  session: ChatSession;
  workspacePath: string;
  prompt: string;
  messageCtx: MessageContext;
  onUpdate?: (output: ParsedOutput) => void;
}

interface RunningTask {
  process: ChildProcess;
  output: ParsedOutput;
  messageId: string;
  lastCardUpdate: number;
  lastActivity: number;
  sessionKey: string;  // chatId:workspace
}

const runningTasks = new Map<string, RunningTask>();

// Track PIDs per session (sessionKey -> PID)
const sessionPids = new Map<string, number>();

// Cleanup timed-out tasks (uses configured timeout, default 30 minutes)
const DEFAULT_TASK_TIMEOUT = 30 * 60 * 1000; // 30 minutes
let cleanupInterval: NodeJS.Timeout | null = setInterval(() => {
  const now = Date.now();
  let timeout = DEFAULT_TASK_TIMEOUT;
  try {
    const config = getConfig();
    timeout = config.acpx.timeout || DEFAULT_TASK_TIMEOUT;
  } catch {
    // Config not loaded yet, use default
  }

  for (const [messageId, task] of runningTasks.entries()) {
    if (now - task.lastActivity > timeout) {
      logger.warn(`Task timed out (no activity for ${timeout / 1000}s), terminating process: ${messageId}`);
      killProcessTree(task.process);
      runningTasks.delete(messageId);
    }
  }
}, 60 * 1000); // Check every minute

/**
 * Kill a process and all its children using process group.
 * When spawn is called with detached: true, -pid kills the entire process group.
 */
function killProcessTree(proc: ChildProcess): void {
  if (proc.pid) {
    try {
      // Negative PID kills the entire process group
      process.kill(-proc.pid, 'SIGKILL');
    } catch {
      // Fallback to regular kill if process group kill fails
      proc.kill('SIGKILL');
    }
  }
}

/**
 * Close an acpx session for a specific workspace and agent.
 * Uses --cwd to identify which session to close.
 */
export async function closeACPXSession(
  acpxPath: string,
  workspacePath: string,
  agent: string
): Promise<void> {
  return new Promise((resolve) => {
    const args = [
      '--cwd', workspacePath,
      agent,
      'sessions',
      'close',
    ];

    logger.info(`Closing acpx session: ${acpxPath} ${args.join(' ')}`);

    const proc = spawn(acpxPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        logger.info(`Acpx session closed for ${workspacePath}`);
      } else {
        logger.warn(`Failed to close acpx session (code ${code})`);
      }
      resolve();
    });

    proc.on('error', (err) => {
      logger.error('Failed to close acpx session:', err);
      resolve();
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      proc.kill();
      resolve();
    }, 5000);
  });
}

/**
 * Close all acpx sessions for all active chats.
 */
export async function closeAllACPXSessions(): Promise<void> {
  const config = getConfig();
  const sessions = getAllChatSessions();
  const acpxPath = config.acpx.path;

  const closePromises: Promise<void>[] = [];

  for (const session of sessions) {
    const workspace = config.workspaces.find(w => w.name === session.workspace);
    if (workspace) {
      closePromises.push(
        closeACPXSession(acpxPath, workspace.path, session.agent)
      );
    }
  }

  await Promise.all(closePromises);
  logger.info(`Closed ${closePromises.length} acpx sessions`);
}

/**
 * Kill all tracked processes and acpx-related processes.
 */
async function killAllACPXProcesses(): Promise<void> {
  // Kill all session PIDs
  for (const [sessionKey, pid] of sessionPids.entries()) {
    try {
      process.kill(-pid, 'SIGKILL');
      logger.debug(`Killed process ${pid} for session ${sessionKey}`);
    } catch {
      // Process might already be dead
    }
  }
  sessionPids.clear();

  // Close all acpx sessions properly
  await closeAllACPXSessions();

  // Use pkill to kill any remaining acpx-related processes
  // This handles processes spawned by acpx internally (like __queue-owner)
  try {
    execSync('pkill -f "acpx.*__queue-owner" 2>/dev/null || true', { timeout: 1000 });
    execSync('pkill -f "claude-agent-acp" 2>/dev/null || true', { timeout: 1000 });
  } catch {
    // Ignore errors from pkill
  }
}

/**
 * Shutdown executor - clear intervals, cancel tasks, and close sessions.
 * Call this before process exit to ensure clean shutdown.
 */
export async function shutdownExecutor(): Promise<void> {
  // Clear the cleanup interval
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  // Cancel any running tasks
  cancelAllTasks();
  // Kill all acpx-related processes and close sessions
  await killAllACPXProcesses();
}

/**
 * Ensure an acpx session exists for the given workspace and agent.
 * Returns the session ID if successful, null otherwise.
 */
async function ensureACPXSession(
  acpxPath: string,
  workspacePath: string,
  agent: string
): Promise<string | null> {
  return new Promise((resolve) => {
    const args = [
      '--cwd', workspacePath,
      '--format', 'json',
      agent,
      'sessions',
      'ensure',
    ];

    logger.info(`Ensuring acpx session: ${acpxPath} ${args.join(' ')}`);

    const process = spawn(acpxPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code !== 0) {
        logger.error(`Failed to ensure session: ${stderr}`);
        resolve(null);
        return;
      }

      // Parse the session info from stdout
      try {
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          const parsed = JSON.parse(line);
          if (parsed.acpxSessionId) {
            logger.info(`Acpx session ensured: ${parsed.acpxSessionId}`);
            resolve(parsed.acpxSessionId);
            return;
          }
        }
      } catch (e) {
        logger.error('Failed to parse session response:', stdout);
      }
      resolve(null);
    });

    process.on('error', (err) => {
      logger.error('Failed to ensure acpx session:', err);
      resolve(null);
    });
  });
}

export async function executeACPX(options: ExecutorOptions): Promise<ParsedOutput> {
  const { session, workspacePath, prompt, messageCtx, onUpdate } = options;
  const config = getConfig();

  // Create session key for tracking
  const sessionKey = `${messageCtx.chatId}:${session.workspace}`;

  // Check if there's already a running task for this chat
  const existingTask = runningTasks.get(messageCtx.chatId);
  if (existingTask) {
    logger.warn('Task already running, terminating old task');
    killProcessTree(existingTask.process);
    runningTasks.delete(messageCtx.chatId);
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

  const acpxPath = config.acpx.path;

  // Ensure acpx session exists
  if (!session.acpxSessionId) {
    const sessionId = await ensureACPXSession(acpxPath, workspacePath, session.agent);
    if (sessionId) {
      session.acpxSessionId = sessionId;
      updateChatSession(messageCtx.chatId, { acpxSessionId: sessionId });
    }
  }

  // Build acpx command with timeout and ttl from config
  // Example: acpx --cwd /path --format json --timeout 300 --ttl 300 claude "prompt"
  const args = [
    '--cwd', workspacePath,
    '--format', 'json',
  ];

  // Add timeout from config (config is in ms, acpx expects seconds)
  if (config.acpx.timeout) {
    args.push('--timeout', String(Math.floor(config.acpx.timeout / 1000)));
  }

  // Add ttl from config (config is already in seconds)
  if (config.acpx.ttl) {
    args.push('--ttl', String(config.acpx.ttl));
  }

  // Add agent and prompt
  args.push(session.agent, prompt);

  logger.info(`Executing acpx: ${acpxPath} ${args.join(' ')}`);

  // Start process with detached mode for proper cleanup
  const childProcess = spawn(acpxPath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true, // Create new process group for clean termination
  });

  // Track PID per session
  if (childProcess.pid) {
    sessionPids.set(sessionKey, childProcess.pid);
    updateChatSession(messageCtx.chatId, { acpxPid: childProcess.pid } as any);
  }

  const task: RunningTask = {
    process: childProcess,
    output,
    messageId,
    lastCardUpdate: 0,
    lastActivity: Date.now(),
    sessionKey,
  };
  runningTasks.set(messageCtx.chatId, task);

  // Handle output
  return new Promise((resolve, reject) => {
    let buffer = '';

    childProcess.stdout.on('data', (data) => {
      buffer += data.toString();

      // Process line by line
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line

      for (const line of lines) {
        const event = parseACPXLine(line);
        if (!event) continue;

        logger.debug('Received acpx event:', event.method || 'response');

        // Update output
        output = updateParsedOutput(output, event);

        // Update task state
        task.output = output;
        task.lastActivity = Date.now();

        // Callback
        if (onUpdate) {
          onUpdate(output);
        }

        // Update message card (throttled: max every 2 seconds)
        const now = Date.now();
        if (now - task.lastCardUpdate > 2000 || output.done) {
          task.lastCardUpdate = now;
          updateCard(messageCtx, messageId, session, output).catch(err => {
            logger.error('Failed to update message card:', err);
          });
        }

        // If done, parse result
        if (output.done) {
          break;
        }
      }
    });

    childProcess.stderr.on('data', (data) => {
      logger.error('acpx stderr:', data.toString());
    });

    childProcess.on('close', (code) => {
      runningTasks.delete(messageCtx.chatId);
      // Remove PID from session tracking
      sessionPids.delete(sessionKey);
      if (childProcess.pid) {
        updateChatSession(messageCtx.chatId, { acpxPid: undefined } as any);
      }

      // Only treat as error if code is explicitly non-zero (not null/undefined)
      // null means process was killed by signal, which may be intentional
      if (typeof code === 'number' && code !== 0 && !output.done) {
        output.error = output.error || `Process exited with code: ${code}`;
        output.done = true;
      }

      // Ensure done is set if not already
      if (!output.done) {
        output.done = true;
      }

      // Update final state
      updateCard(messageCtx, messageId, session, output).then(() => {
        resolve(output);
      }).catch(err => {
        logger.error('Failed to update final message card:', err);
        resolve(output);
      });
    });

    childProcess.on('error', (err) => {
      runningTasks.delete(messageCtx.chatId);
      sessionPids.delete(sessionKey);
      logger.error('acpx process error:', err);
      output.error = err.message;
      output.done = true;

      updateCard(messageCtx, messageId, session, output).then(() => {
        resolve(output);
      }).catch(updateErr => {
        logger.error('Failed to update error message card:', updateErr);
        resolve(output);
      });
    });
  });
}

async function updateCard(
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

  const card = buildMessageCard({
    agent: session.agent,
    workspace: session.workspace,
    status,
    thinking: getLatestThinking(output),
    toolCalls: getToolCallsArray(output),
    response: output.text || undefined,
    error: output.error,
  });

  await updateCardMessage(ctx, messageId, card);
}

export function cancelTask(chatId: string): boolean {
  const task = runningTasks.get(chatId);
  if (!task) return false;

  killProcessTree(task.process);
  runningTasks.delete(chatId);
  sessionPids.delete(task.sessionKey);
  return true;
}

export function cancelAllTasks(): number {
  const count = runningTasks.size;
  for (const [chatId, task] of runningTasks.entries()) {
    logger.info(`Cancelling task: ${chatId}`);
    killProcessTree(task.process);
    runningTasks.delete(chatId);
    sessionPids.delete(task.sessionKey);
  }
  return count;
}

// Async version for use with ACP SDK
export async function cancelAllTasksAsync(): Promise<number> {
  const count = runningTasks.size;
  for (const [chatId, task] of runningTasks.entries()) {
    logger.info(`Cancelling task: ${chatId}`);
    killProcessTree(task.process);
    runningTasks.delete(chatId);
    sessionPids.delete(task.sessionKey);
  }
  return count;
}

export function getRunningTask(chatId: string): RunningTask | undefined {
  return runningTasks.get(chatId);
}

export function getAllRunningTasks(): Map<string, RunningTask> {
  return new Map(runningTasks);
}

export function getRunningTaskCount(): number {
  return runningTasks.size;
}
