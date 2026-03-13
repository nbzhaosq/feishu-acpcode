// src/acpx/executor.ts
import { spawn, ChildProcess } from 'child_process';
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
import { updateChatSession } from './session.js';

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
}

const runningTasks = new Map<string, RunningTask>();

// Track all spawned process PIDs for cleanup
const spawnedPids = new Set<number>();

// Cleanup timed-out tasks
let cleanupInterval: NodeJS.Timeout | null = setInterval(() => {
  const now = Date.now();
  const TIMEOUT = 5 * 60 * 1000; // 5 minutes

  for (const [messageId, task] of runningTasks.entries()) {
    if (now - task.lastActivity > TIMEOUT) {
      logger.warn(`Task timed out, terminating process: ${messageId}`);
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
 * Kill all tracked processes and acpx-related processes.
 */
function killAllACPXProcesses(): void {
  // Kill all tracked PIDs
  for (const pid of spawnedPids) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // Process might already be dead
    }
  }
  spawnedPids.clear();

  // Use pkill to kill any remaining acpx-related processes
  // This handles processes spawned by acpx internally (like __queue-owner)
  try {
    const { execSync } = require('child_process');
    // Kill acpx and claude-agent-acp processes
    execSync('pkill -f "acpx.*__queue-owner" 2>/dev/null || true', { timeout: 1000 });
    execSync('pkill -f "claude-agent-acp" 2>/dev/null || true', { timeout: 1000 });
  } catch {
    // Ignore errors from pkill
  }
}

/**
 * Shutdown executor - clear intervals and cancel all tasks.
 * Call this before process exit to ensure clean shutdown.
 */
export function shutdownExecutor(): void {
  // Clear the cleanup interval
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  // Cancel any running tasks
  cancelAllTasks();
  // Kill all acpx-related processes
  killAllACPXProcesses();
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

  // Check if there's already a running task
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

  // Build acpx command: acpx --cwd <workspace> --format json <agent> <prompt>
  const args = [
    '--cwd', workspacePath,
    '--format', 'json',
    session.agent,
    prompt,
  ];

  logger.info(`Executing acpx: ${acpxPath} ${args.join(' ')}`);

  // Start process with detached mode for proper cleanup
  const childProcess = spawn(acpxPath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true, // Create new process group for clean termination
  });

  // Track PID for cleanup
  if (childProcess.pid) {
    spawnedPids.add(childProcess.pid);
  }

  const task: RunningTask = {
    process: childProcess,
    output,
    messageId,
    lastCardUpdate: 0,
    lastActivity: Date.now(),
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
      // Remove PID from tracking
      if (childProcess.pid) {
        spawnedPids.delete(childProcess.pid);
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
  return true;
}

export function cancelAllTasks(): number {
  const count = runningTasks.size;
  for (const [chatId, task] of runningTasks.entries()) {
    logger.info(`Cancelling task: ${chatId}`);
    killProcessTree(task.process);
    runningTasks.delete(chatId);
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
