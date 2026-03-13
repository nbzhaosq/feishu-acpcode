// src/acpx/parser.ts
import { logger } from '../utils/logger.js';

export interface ACPXEvent {
  eventVersion: number;
  sessionId: string;
  requestId: string;
  seq: number;
  stream: string;
  type: string;
  // 思考事件
  thinking?: string;
  // 工具调用事件
  toolName?: string;
  toolCallId?: string;
  status?: string;
  title?: string;
  output?: string;
  // 文本事件
  text?: string;
  // 错误事件
  error?: string;
  // 完成事件
  stopReason?: string;
}

export interface ParsedOutput {
  thinking: string[];
  toolCalls: Map<string, { name: string; status: 'running' | 'completed' | 'failed'; output?: string }>;
  text: string;
  done: boolean;
  error?: string;
  stopReason?: string;
}

export function createParsedOutput(): ParsedOutput {
  return {
    thinking: [],
    toolCalls: new Map(),
    text: '',
    done: false,
  };
}

export function parseACPXLine(line: string): ACPXEvent | null {
  line = line.trim();
  if (!line) return null;

  try {
    const event = JSON.parse(line) as ACPXEvent;

    // 验证必要字段
    if (
      typeof event.eventVersion !== 'number' ||
      typeof event.sessionId !== 'string' ||
      typeof event.requestId !== 'string' ||
      typeof event.seq !== 'number' ||
      typeof event.stream !== 'string' ||
      typeof event.type !== 'string'
    ) {
      logger.warn('无效的 acpx 事件:', line);
      return null;
    }

    return event;
  } catch (error) {
    logger.debug('解析 JSON 失败:', line);
    return null;
  }
}

export function updateParsedOutput(output: ParsedOutput, event: ACPXEvent): ParsedOutput {
  const newOutput: ParsedOutput = {
    thinking: [...output.thinking],
    toolCalls: new Map(output.toolCalls),
    text: output.text,
    done: output.done,
    error: output.error,
    stopReason: output.stopReason,
  };

  switch (event.type) {
    case 'thinking':
      if (event.thinking) {
        newOutput.thinking.push(event.thinking);
      }
      break;

    case 'tool_start':
      if (event.toolCallId && event.toolName) {
        newOutput.toolCalls.set(event.toolCallId, {
          name: event.toolName,
          status: 'running',
        });
      }
      break;

    case 'tool_output':
      if (event.toolCallId && newOutput.toolCalls.has(event.toolCallId)) {
        const existing = newOutput.toolCalls.get(event.toolCallId)!;
        newOutput.toolCalls.set(event.toolCallId, {
          ...existing,
          output: event.output,
        });
      }
      break;

    case 'tool_end':
      if (event.toolCallId && newOutput.toolCalls.has(event.toolCallId)) {
        const existing = newOutput.toolCalls.get(event.toolCallId)!;
        const status = event.status === 'error' ? 'failed' : 'completed';
        newOutput.toolCalls.set(event.toolCallId, {
          ...existing,
          status,
        });
      }
      break;

    case 'text':
      if (event.text) {
        newOutput.text += event.text;
      }
      break;

    case 'error':
      newOutput.error = event.error || 'Unknown error';
      newOutput.done = true;
      break;

    case 'done':
      newOutput.done = true;
      if (event.stopReason) {
        newOutput.stopReason = event.stopReason;
      }
      break;
  }

  return newOutput;
}

export function getToolCallsArray(output: ParsedOutput): Array<{ name: string; status: 'running' | 'completed' | 'failed' }> {
  return Array.from(output.toolCalls.values()).map(tc => ({
    name: tc.name,
    status: tc.status,
  }));
}

export function getLatestThinking(output: ParsedOutput): string | undefined {
  if (output.thinking.length === 0) return undefined;
  return output.thinking[output.thinking.length - 1];
}
