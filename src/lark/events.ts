import { EventEmitter } from 'events';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type MessageType = 'incoming' | 'outgoing' | 'tool' | 'system' | 'error';

export interface LogMessage {
  timestamp: Date;
  type: MessageType;
  text: string;
  details?: string;
}

export interface BotStatus {
  connectionStatus: ConnectionStatus;
  uptime: number;
  messageCount: number;
  sessionCount: number;
  agent: string;
  workspace: string;
}

export interface BotEvents {
  'status': (status: BotStatus) => void;
  'message': (message: LogMessage) => void;
}

class BotEventEmitter extends EventEmitter {
  emit<K extends keyof BotEvents>(event: K, ...args: Parameters<BotEvents[K]>): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof BotEvents>(event: K, listener: BotEvents[K]): this {
    return super.on(event, listener);
  }

  off<K extends keyof BotEvents>(event: K, listener: BotEvents[K]): this {
    return super.off(event, listener);
  }
}

export const botEvents = new BotEventEmitter();
