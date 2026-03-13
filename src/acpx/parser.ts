// src/acpx/parser.ts
// Parser for ACP (Agent Client Protocol) JSON-RPC messages
import { logger } from '../utils/logger.js';
import { botEvents } from '../lark/events.js';

// ACP JSON-RPC message types
export interface ACPMessage {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: {
    sessionId?: string;
    sessionUpdate?: string;
    content?: {
      type: string;
      text?: string;
    };
    update?: {
      sessionUpdate: string;
      content?: {
        type: string;
        text?: string;
      };
    };
    [key: string]: unknown;
  };
  result?: {
    stopReason?: string;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
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

export function parseACPXLine(line: string): ACPMessage | null {
  line = line.trim();
  if (!line) return null;

  try {
    const msg = JSON.parse(line) as ACPMessage;

    // Validate it's a JSON-RPC 2.0 message
    if (msg.jsonrpc !== '2.0') {
      logger.debug('Not a JSON-RPC 2.0 message:', line);
      return null;
    }

    return msg;
  } catch (error) {
    logger.debug('Failed to parse JSON:', line);
    return null;
  }
}

export function updateParsedOutput(output: ParsedOutput, msg: ACPMessage): ParsedOutput {
  const newOutput: ParsedOutput = {
    thinking: [...output.thinking],
    toolCalls: new Map(output.toolCalls),
    text: output.text,
    done: output.done,
    error: output.error,
    stopReason: output.stopReason,
  };

  // Handle error response
  if (msg.error) {
    newOutput.error = msg.error.message || 'Unknown error';
    newOutput.done = true;
    return newOutput;
  }

  // Handle result (completion)
  if (msg.result) {
    if (msg.result.stopReason) {
      newOutput.stopReason = msg.result.stopReason;
      newOutput.done = true;
    }
    return newOutput;
  }

  // Handle session/update notifications
  if (msg.method === 'session/update' && msg.params) {
    const update = msg.params.update || msg.params;
    const sessionUpdate = update.sessionUpdate;
    const content = update.content;

    if (sessionUpdate === 'agent_thought_chunk' && content?.text) {
      // Accumulate thinking chunks
      newOutput.thinking.push(content.text);
    } else if (sessionUpdate === 'agent_message_chunk' && content?.text) {
      // Accumulate message chunks
      newOutput.text += content.text;
      // Emit on first chunk to show response started
      if (output.text.length === 0) {
        botEvents.emit('message', {
          timestamp: new Date(),
          type: 'outgoing',
          text: 'Bot responding...',
        });
      }
    } else if (sessionUpdate === 'tool_call') {
      // Tool call event
      const toolCallId = (msg.params as any).toolCallId || `tool-${Date.now()}`;
      const toolName = (msg.params as any).toolName || 'unknown';
      const status = (msg.params as any).status;

      if (status === 'running') {
        newOutput.toolCalls.set(toolCallId, {
          name: toolName,
          status: 'running',
        });
        botEvents.emit('message', {
          timestamp: new Date(),
          type: 'tool',
          text: `${toolName}: running`,
        });
      } else if (status === 'completed' || status === 'success') {
        const existing = newOutput.toolCalls.get(toolCallId);
        newOutput.toolCalls.set(toolCallId, {
          name: existing?.name || toolName,
          status: 'completed',
          output: (msg.params as any).output,
        });
        botEvents.emit('message', {
          timestamp: new Date(),
          type: 'tool',
          text: `${existing?.name || toolName}: completed`,
        });
      } else if (status === 'error' || status === 'failed') {
        const existing = newOutput.toolCalls.get(toolCallId);
        newOutput.toolCalls.set(toolCallId, {
          name: existing?.name || toolName,
          status: 'failed',
          output: (msg.params as any).error || (msg.params as any).output,
        });
        botEvents.emit('message', {
          timestamp: new Date(),
          type: 'error',
          text: `${existing?.name || toolName}: failed`,
        });
      }
    }
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
  // Join all thinking chunks for display
  return output.thinking.join('');
}
