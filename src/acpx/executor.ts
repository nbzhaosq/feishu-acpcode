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
  lastUpdate: number;
}

const runningTasks = new Map<string, RunningTask>();

// 清理超时的任务
setInterval(() => {
  const now = Date.now();
  const TIMEOUT = 5 * 60 * 1000; // 5分钟

  for (const [messageId, task] of runningTasks.entries()) {
    if (now - task.lastUpdate > TIMEOUT) {
      logger.warn(`任务超时，终止进程: ${messageId}`);
      task.process.kill('SIGTERM');
      runningTasks.delete(messageId);
    }
  }
}, 60 * 1000); // 每分钟检查一次

export async function executeACPX(options: ExecutorOptions): Promise<ParsedOutput> {
  const { session, workspacePath, prompt, messageCtx, onUpdate } = options;
  const config = getConfig();

  // 检查是否有正在运行的任务
  const existingTask = runningTasks.get(messageCtx.chatId);
  if (existingTask) {
    logger.warn('已有任务正在运行，终止旧任务');
    existingTask.process.kill('SIGTERM');
    runningTasks.delete(messageCtx.chatId);
  }

  // 发送初始消息卡片
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
    throw new Error('无法发送初始消息');
  }

  const messageId = createRes.data.message_id;
  let output = createParsedOutput();

  // 构建 acpx 命令
  const acpxPath = config.acpx.path;
  const args = [
    'chat',
    '--agent', session.agent,
    '--workspace', workspacePath,
    '--format', 'json',
    '--prompt', prompt,
  ];

  // 如果有会话 ID，传递给 acpx
  if (session.acpxSessionId) {
    args.push('--session', session.acpxSessionId);
  }

  logger.info(`执行 acpx: ${acpxPath} ${args.join(' ')}`);

  // 启动进程
  const process = spawn(acpxPath, args, {
    cwd: workspacePath,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const task: RunningTask = {
    process,
    output,
    messageId,
    lastUpdate: Date.now(),
  };
  runningTasks.set(messageCtx.chatId, task);

  // 处理输出
  return new Promise((resolve, reject) => {
    let buffer = '';

    process.stdout.on('data', (data) => {
      buffer += data.toString();

      // 按行处理
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留不完整的行

      for (const line of lines) {
        const event = parseACPXLine(line);
        if (!event) continue;

        logger.debug('收到 acpx 事件:', event.type);

        // 更新输出
        output = updateParsedOutput(output, event);

        // 更新任务状态
        task.output = output;
        task.lastUpdate = Date.now();

        // 回调
        if (onUpdate) {
          onUpdate(output);
        }

        // 更新消息卡片（节流：最多每 2 秒更新一次）
        if (Date.now() - task.lastUpdate > 2000 || output.done) {
          updateCard(messageCtx, messageId, session, output).catch(err => {
            logger.error('更新消息卡片失败:', err);
          });
        }

        // 如果完成，解析结果
        if (output.done) {
          break;
        }
      }
    });

    process.stderr.on('data', (data) => {
      logger.error('acpx stderr:', data.toString());
    });

    process.on('close', (code) => {
      runningTasks.delete(messageCtx.chatId);

      if (code !== 0 && !output.done) {
        output.error = output.error || `进程异常退出，退出码: ${code}`;
        output.done = true;
      }

      // 更新最终状态
      updateCard(messageCtx, messageId, session, output).then(() => {
        resolve(output);
      }).catch(err => {
        logger.error('更新最终消息卡片失败:', err);
        resolve(output);
      });
    });

    process.on('error', (err) => {
      runningTasks.delete(messageCtx.chatId);
      logger.error('acpx 进程错误:', err);
      output.error = err.message;
      output.done = true;

      updateCard(messageCtx, messageId, session, output).then(() => {
        resolve(output);
      }).catch(updateErr => {
        logger.error('更新错误消息卡片失败:', updateErr);
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

  task.process.kill('SIGTERM');
  runningTasks.delete(chatId);
  return true;
}

export function getRunningTask(chatId: string): RunningTask | undefined {
  return runningTasks.get(chatId);
}

export function getAllRunningTasks(): Map<string, RunningTask> {
  return new Map(runningTasks);
}
