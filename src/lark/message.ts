// src/lark/message.ts
import type * as lark from '@larksuiteoapi/node-sdk';
import { logger } from '../utils/logger.js';

export interface MessageContext {
  client: lark.Client;
  chatId: string;
  messageId?: string;
}

export async function sendTextMessage(ctx: MessageContext, text: string): Promise<string | undefined> {
  try {
    const res = await ctx.client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: ctx.chatId,
        content: JSON.stringify({ text }),
        msg_type: 'text',
      },
    });

    if (res.code !== 0) {
      logger.error('发送消息失败:', res.msg);
      return undefined;
    }

    return res.data?.message_id;
  } catch (error) {
    logger.error('发送消息异常:', error);
    return undefined;
  }
}

export async function sendCardMessage(ctx: MessageContext, cardJson: string): Promise<string | undefined> {
  try {
    const res = await ctx.client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: ctx.chatId,
        content: cardJson,
        msg_type: 'interactive',
      },
    });

    if (res.code !== 0) {
      logger.error('发送卡片消息失败:', res.msg);
      return undefined;
    }

    return res.data?.message_id;
  } catch (error) {
    logger.error('发送卡片消息异常:', error);
    return undefined;
  }
}

export async function updateCardMessage(
  ctx: MessageContext,
  messageId: string,
  cardJson: string
): Promise<boolean> {
  try {
    const res = await ctx.client.im.message.patch({
      path: { message_id: messageId },
      params: { receive_id_type: 'chat_id' },
      data: {
        content: cardJson,
      },
    });

    if (res.code !== 0) {
      logger.error('更新卡片消息失败:', res.msg);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('更新卡片消息异常:', error);
    return false;
  }
}

export function extractTextContent(messageContent: string): string {
  try {
    const parsed = JSON.parse(messageContent);
    return parsed.text || '';
  } catch {
    return messageContent;
  }
}
