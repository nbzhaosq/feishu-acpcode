// src/types/agent.ts
/**
 * Shared agent types used across executors
 */

export interface ToolCallInfo {
  id?: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  input?: unknown;
  output?: string;
}

export interface ParsedOutput {
  thinking: string[];
  toolCalls: Map<string, ToolCallInfo>;
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
