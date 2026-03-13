// src/lark/card.ts
export interface CardOptions {
  agent: string;
  workspace: string;
  status: 'thinking' | 'working' | 'done' | 'error';
  thinking?: string;
  toolCalls?: Array<{ name: string; status: 'running' | 'completed' | 'failed' }>;
  response?: string;
  error?: string;
}

interface CollapsibleElement {
  tag: 'collapsible';
  header: {
    title: { tag: 'plain_text'; content: string };
    template?: string;
  };
  collapsed?: boolean;
  elements: Array<{ tag: string; content?: string }>;
}

type CardElement = { tag: string; content?: string } | CollapsibleElement;

function escapeMarkdown(text: string): string {
  return text.replace(/([*_`\[\]()#+\-.!])/g, '\\$1');
}

function formatToolCalls(toolCalls: CardOptions['toolCalls']): string {
  if (!toolCalls || toolCalls.length === 0) return '';

  return toolCalls
    .map((tc) => {
      const icon = tc.status === 'completed' ? '✓' : tc.status === 'failed' ? '✗' : '⏳';
      return `${icon} ${escapeMarkdown(tc.name)}`;
    })
    .join('\n');
}

export function buildMessageCard(options: CardOptions): string {
  const statusIcon =
    options.status === 'thinking'
      ? '🔄 思考中...'
      : options.status === 'working'
        ? '⚡ 执行中...'
        : options.status === 'error'
          ? '❌ 出错'
          : '✅ 完成';

  const elements: CardElement[] = [];

  // 状态
  elements.push({
    tag: 'markdown',
    content: `**状态:** ${statusIcon}`,
  });

  // 思考内容 - 可折叠
  if (options.thinking) {
    elements.push({ tag: 'hr' });
    elements.push({
      tag: 'collapsible',
      header: {
        title: { tag: 'plain_text', content: '🧠 思考过程' },
        template: 'grey',
      },
      collapsed: true,
      elements: [
        {
          tag: 'markdown',
          content: escapeMarkdown(options.thinking.slice(0, 500)),
        },
      ],
    });
  }

  // 工具调用 - 可折叠
  if (options.toolCalls && options.toolCalls.length > 0) {
    elements.push({ tag: 'hr' });
    elements.push({
      tag: 'collapsible',
      header: {
        title: { tag: 'plain_text', content: '🔧 工具调用' },
        template: 'grey',
      },
      collapsed: true,
      elements: [
        {
          tag: 'markdown',
          content: formatToolCalls(options.toolCalls),
        },
      ],
    });
  }

  // 回复内容
  if (options.response) {
    elements.push({ tag: 'hr' });
    elements.push({
      tag: 'markdown',
      content: `**[回复]**\n${options.response.slice(0, 4000)}`,
    });
  }

  // 错误信息
  if (options.error) {
    elements.push({ tag: 'hr' });
    elements.push({
      tag: 'markdown',
      content: `**错误:** ${escapeMarkdown(options.error)}`,
    });
  }

  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: options.status === 'error' ? 'red' : 'blue',
      title: {
        content: `🤖 ${options.agent} (${options.workspace})`,
        tag: 'plain_text',
      },
    },
    elements,
  };

  return JSON.stringify(card);
}

export function buildErrorCard(title: string, message: string, suggestions?: string[]): string {
  const elements: Array<{ tag: string; content?: string }> = [
    { tag: 'markdown', content: escapeMarkdown(message) },
  ];

  if (suggestions && suggestions.length > 0) {
    elements.push({ tag: 'hr' });
    elements.push({
      tag: 'markdown',
      content: '**建议:**\n' + suggestions.map((s) => `• ${escapeMarkdown(s)}`).join('\n'),
    });
  }

  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: 'red',
      title: { content: `❌ ${title}`, tag: 'plain_text' },
    },
    elements,
  };

  return JSON.stringify(card);
}

export function buildStatusCard(
  connected: boolean,
  agent: string,
  workspace: string,
  sessions: number
): string {
  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: connected ? 'green' : 'grey',
      title: {
        content: connected ? '✅ 已连接' : '⭕ 未连接',
        tag: 'plain_text',
      },
    },
    elements: [
      { tag: 'markdown', content: `**当前代理:** ${agent}` },
      { tag: 'markdown', content: `**工作空间:** ${workspace}` },
      { tag: 'markdown', content: `**活跃会话:** ${sessions}` },
    ],
  };

  return JSON.stringify(card);
}

export function buildHelpCard(): string {
  const commands = [
    ['**/help**', '显示帮助信息'],
    ['**/status**', '查看连接和会话状态'],
    ['**/agent** [name]', '查看/切换代理'],
    ['**/ws** [name]', '查看/切换工作空间'],
    ['**/session new**', '创建新会话'],
    ['**/session close**', '关闭当前会话'],
    ['**/connect**', '连接飞书'],
    ['**/disconnect**', '断开连接'],
    ['**/reconnect**', '重新连接'],
    ['**/clear**', '清除当前会话历史'],
  ];

  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: 'blue',
      title: { content: '📖 帮助信息', tag: 'plain_text' },
    },
    elements: [
      {
        tag: 'markdown',
        content: commands.map(([cmd, desc]) => `${cmd} - ${desc}`).join('\n'),
      },
    ],
  };

  return JSON.stringify(card);
}
