# 飞书 ACP Code 机器人实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个飞书机器人,通过 WebSocket 长连接模式接收消息,使用 acpx 调用 Claude Code、OpenCode、Codex 等 ACP 兼容的编码代理。

**Architecture:** 单进程事件驱动架构。飞书 WebSocket 客户端接收消息 → 消息路由器分发 → acpx 执行器调用代理 → 流式解析输出 → 更新飞书消息卡片。

**Tech Stack:** TypeScript, @larksuiteoapi/node-sdk, acpx, zod, tsx

---

## Chunk 1: 项目初始化和配置系统

### Task 1: 项目初始化

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "feishu-acpcode",
  "version": "1.0.0",
  "description": "飞书机器人,通过 acpx 调用 Claude Code、OpenCode 等 ACP 代理",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@larksuiteoapi/node-sdk": "^1.30.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.21.0",
    "typescript": "^5.9.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "declaration": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: 创建 .gitignore**

```
node_modules/
dist/
config.json
*.log
.DS_Store
```

- [ ] **Step 4: 安装依赖**

Run: `bun install`
Expected: 依赖安装成功

- [ ] **Step 5: 提交项目初始化**

```bash
git init
git add package.json tsconfig.json .gitignore
git commit -m "chore: initialize project with TypeScript config"
```

---

### Task 2: 配置类型定义

**Files:**
- Create: `src/types/config.ts`

- [ ] **Step 1: 创建配置类型定义**

```typescript
// src/types/config.ts
import { z } from 'zod';

export const WorkspaceSchema = z.object({
  name: z.string(),
  path: z.string(),
  default: z.boolean().optional().default(false),
});

export const AgentsConfigSchema = z.object({
  default: z.string().default('claude'),
  available: z.array(z.string()).default(['claude', 'opencode', 'codex']),
});

export const ACPXConfigSchema = z.object({
  path: z.string().default('acpx'),
  timeout: z.number().default(300000),
  ttl: z.number().default(300),
  throttleInterval: z.number().default(1500),
});

export const LarkConfigSchema = z.object({
  appId: z.string(),
  appSecret: z.string(),
});

export const ConfigSchema = z.object({
  lark: LarkConfigSchema,
  workspaces: z.array(WorkspaceSchema).min(1),
  agents: AgentsConfigSchema.optional().default({}),
  acpx: ACPXConfigSchema.optional().default({}),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;
export type AgentsConfig = z.infer<typeof AgentsConfigSchema>;
export type ACPXConfig = z.infer<typeof ACPXConfigSchema>;
export type LarkConfig = z.infer<typeof LarkConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;
```

- [ ] **Step 2: 提交配置类型**

```bash
mkdir -p src/types
git add src/types/config.ts
git commit -m "feat: add configuration type definitions with zod schemas"
```

---

### Task 3: 配置加载器

**Files:**
- Create: `src/config.ts`

- [ ] **Step 1: 创建配置加载器**

```typescript
// src/config.ts
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ConfigSchema, type Config } from './types/config.js';

const CONFIG_FILE = 'config.json';

let cachedConfig: Config | null = null;

export function loadConfig(configPath?: string): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const path = configPath || join(process.cwd(), CONFIG_FILE);

  if (!existsSync(path)) {
    throw new Error(`配置文件不存在: ${path}\n请复制 config.example.json 为 config.json 并填写配置`);
  }

  const content = readFileSync(path, 'utf-8');
  const rawConfig = JSON.parse(content);

  const result = ConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`配置验证失败:\n${errors}`);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

export function getConfig(): Config {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}

export function getDefaultWorkspace(): Config['workspaces'][0] {
  const config = getConfig();
  const defaultWs = config.workspaces.find((w) => w.default);
  return defaultWs || config.workspaces[0];
}

export function getWorkspaceByName(name: string): Config['workspaces'][0] | undefined {
  return getConfig().workspaces.find((w) => w.name === name);
}

export function clearConfigCache(): void {
  cachedConfig = null;
}
```

- [ ] **Step 2: 提交配置加载器**

```bash
git add src/config.ts
git commit -m "feat: add configuration loader with validation"
```

---

### Task 4: 配置示例文件

**Files:**
- Create: `config.example.json`

- [ ] **Step 1: 创建配置示例文件**

```json
{
  "lark": {
    "appId": "cli_xxxxxxxxxxxx",
    "appSecret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  },
  "workspaces": [
    {
      "name": "my-project",
      "path": "/Users/xxx/projects/my-project",
      "default": true
    },
    {
      "name": "another-project",
      "path": "/Users/xxx/projects/another-project"
    }
  ],
  "agents": {
    "default": "claude",
    "available": ["claude", "opencode", "codex"]
  },
  "acpx": {
    "path": "acpx",
    "timeout": 300000,
    "ttl": 300,
    "throttleInterval": 1500
  }
}
```

- [ ] **Step 2: 提交配置示例**

```bash
git add config.example.json
git commit -m "docs: add example configuration file"
```

---

### Task 5: 日志工具

**Files:**
- Create: `src/utils/logger.ts`

- [ ] **Step 1: 创建日志工具**

```typescript
// src/utils/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function formatTime(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(level: LogLevel, ...args: unknown[]): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) {
    return;
  }

  const prefix = `[${formatTime()}] [${level.toUpperCase()}]`;

  switch (level) {
    case 'error':
      console.error(prefix, ...args);
      break;
    case 'warn':
      console.warn(prefix, ...args);
      break;
    default:
      console.log(prefix, ...args);
  }
}

export const logger = {
  debug: (...args: unknown[]) => log('debug', ...args),
  info: (...args: unknown[]) => log('info', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  error: (...args: unknown[]) => log('error', ...args),
};
```

- [ ] **Step 2: 提交日志工具**

```bash
mkdir -p src/utils
git add src/utils/logger.ts
git commit -m "feat: add logging utility"
```

---

## Chunk 2: 飞书客户端和消息处理

### Task 6: 会话状态类型定义

**Files:**
- Create: `src/types/session.ts`

- [ ] **Step 1: 创建会话状态类型**

```typescript
// src/types/session.ts
export interface ChatSession {
  chatId: string;
  workspace: string;
  agent: string;
  acpxSessionId?: string;
  createdAt: Date;
  lastActiveAt: Date;
}

export interface SessionState {
  currentWorkspace: string;
  currentAgent: string;
}

export interface ChatState {
  sessions: Map<string, ChatSession>;
  chatStates: Map<string, SessionState>;
}

export function createChatSessionKey(chatId: string, workspace: string): string {
  return `${chatId}:${workspace}`;
}

export function parseChatSessionKey(key: string): { chatId: string; workspace: string } {
  const [chatId, workspace] = key.split(':');
  return { chatId, workspace };
}
```

- [ ] **Step 2: 提交会话状态类型**

```bash
mkdir -p src/types
git add src/types/session.ts
git commit -m "feat: add session state type definitions"
```

---

### Task 7: 会话管理器

**Files:**
- Create: `src/acpx/session.ts`

- [ ] **Step 1: 创建会话管理器**

```typescript
// src/acpx/session.ts
import { getConfig } from '../config.js';
import { logger } from '../utils/logger.js';
import type { ChatSession, SessionState, ChatState } from '../types/session.js';
import { createChatSessionKey, parseChatSessionKey } from '../types/session.js';

const globalState: ChatState = {
  sessions: new Map(),
  chatStates: new Map(),
};

export function getOrCreateChatSession(
  chatId: string,
  workspace?: string,
  agent?: string
): ChatSession {
  const config = getConfig();

  // 获取或创建聊天状态
  let chatState = globalState.chatStates.get(chatId);
  if (!chatState) {
    const defaultWorkspace = config.workspaces.find((w) => w.default) || config.workspaces[0];
    chatState = {
      currentWorkspace: defaultWorkspace.name,
      currentAgent: config.agents.default,
    };
    globalState.chatStates.set(chatId, chatState);
  }

  const ws = workspace || chatState.currentWorkspace;
  const ag = agent || chatState.currentAgent;

  const key = createChatSessionKey(chatId, ws);
  let session = globalState.sessions.get(key);

  if (!session) {
    session = {
      chatId,
      workspace: ws,
      agent: ag,
      createdAt: new Date(),
      lastActiveAt: new Date(),
    };
    globalState.sessions.set(key, session);
    logger.info(`创建新会话: chatId=${chatId}, workspace=${ws}, agent=${ag}`);
  } else {
    session.lastActiveAt = new Date();
  }

  return session;
}

export function updateChatSession(
  chatId: string,
  updates: { workspace?: string; agent?: string; acpxSessionId?: string }
): ChatSession | null {
  const chatState = globalState.chatStates.get(chatId);
  if (!chatState) return null;

  if (updates.workspace) {
    chatState.currentWorkspace = updates.workspace;
  }
  if (updates.agent) {
    chatState.currentAgent = updates.agent;
  }

  const key = createChatSessionKey(chatId, chatState.currentWorkspace);
  const session = globalState.sessions.get(key);

  if (session) {
    if (updates.agent) session.agent = updates.agent;
    if (updates.acpxSessionId) session.acpxSessionId = updates.acpxSessionId;
    session.lastActiveAt = new Date();
  }

  return session || null;
}

export function getChatState(chatId: string): SessionState | undefined {
  return globalState.chatStates.get(chatId);
}

export function setChatState(chatId: string, state: SessionState): void {
  globalState.chatStates.set(chatId, state);
}

export function getAllChatSessions(): ChatSession[] {
  return Array.from(globalState.sessions.values());
}

export function closeChatSession(chatId: string, workspace?: string): boolean {
  const chatState = globalState.chatStates.get(chatId);
  if (!chatState) return false;

  const ws = workspace || chatState.currentWorkspace;
  const key = createChatSessionKey(chatId, ws);
  return globalState.sessions.delete(key);
}
```

- [ ] **Step 2: 提交会话管理器**

```bash
mkdir -p src/acpx
git add src/acpx/session.ts
git commit -m "feat: add session manager for chat session tracking"
```

---

### Task 8: 消息卡片构建器

**Files:**
- Create: `src/lark/card.ts`

- [ ] **Step 1: 创建消息卡片构建器**

```typescript
// src/lark/card.ts
import * as lark from '@larksuiteoapi/node-sdk';

export interface CardOptions {
  agent: string;
  workspace: string;
  status: 'thinking' | 'working' | 'done' | 'error';
  thinking?: string;
  toolCalls?: Array<{ name: string; status: 'running' | 'completed' | 'failed' }>;
  response?: string;
  error?: string;
}

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

  const elements: Array<{ tag: string; content?: string; text?: { content: string; tag: string } }> = [];

  // 状态
  elements.push({
    tag: 'markdown',
    content: `**状态:** ${statusIcon}`,
  });

  // 思考内容
  if (options.thinking) {
    elements.push({ tag: 'hr' });
    elements.push({
      tag: 'markdown',
      content: `**[思考]**\n${escapeMarkdown(options.thinking.slice(0, 500))}`,
    });
  }

  // 工具调用
  if (options.toolCalls && options.toolCalls.length > 0) {
    elements.push({ tag: 'hr' });
    elements.push({
      tag: 'markdown',
      content: `**[工具调用]**\n${formatToolCalls(options.toolCalls)}`,
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
```

- [ ] **Step 2: 提交消息卡片构建器**

```bash
mkdir -p src/lark
git add src/lark/card.ts
git commit -m "feat: add message card builder for Feishu"
```

---

### Task 9: 消息发送工具

**Files:**
- Create: `src/lark/message.ts`

- [ ] **Step 1: 创建消息发送工具**

```typescript
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
```

- [ ] **Step 2: 提交消息发送工具**

```bash
git add src/lark/message.ts
git commit -m "feat: add message sending utilities for Feishu"
```

---

## Chunk 3: acpx 执行器和流式解析

### Task 10: acpx JSON 解析器

**Files:**
- Create: `src/acpx/parser.ts`

- [ ] **Step 1: 创建 acpx JSON 解析器**

```typescript
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
  toolCallId?: string;
  toolName?: string;
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
  toolCalls: Map<string, { name: string; status: string; output?: string }>;
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
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('{')) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as ACPXEvent;
  } catch (error) {
    logger.debug('解析 JSON 行失败:', trimmed);
    return null;
  }
}

export function updateParsedOutput(output: ParsedOutput, event: ACPXEvent): void {
  switch (event.type) {
    case 'thinking':
      if (event.thinking) {
        output.thinking.push(event.thinking);
      }
      break;

    case 'tool_call':
      if (event.toolCallId) {
        const existing = output.toolCalls.get(event.toolCallId) || {
          name: event.toolName || event.title || 'unknown',
          status: event.status || 'pending',
        };
        output.toolCalls.set(event.toolCallId, {
          ...existing,
          name: event.toolName || event.title || existing.name,
          status: event.status || existing.status,
          output: event.output || existing.output,
        });
      }
      break;

    case 'text':
      if (event.text) {
        output.text += event.text;
      }
      break;

    case 'done':
      output.done = true;
      output.stopReason = event.stopReason;
      break;

    case 'error':
      output.error = event.error || 'Unknown error';
      output.done = true;
      break;
  }
}

export function getToolCallsArray(
  toolCalls: Map<string, { name: string; status: string }>
): Array<{ name: string; status: 'running' | 'completed' | 'failed' }> {
  return Array.from(toolCalls.values()).map((tc) => ({
    name: tc.name,
    status:
      tc.status === 'completed'
        ? 'completed'
        : tc.status === 'failed'
          ? 'failed'
          : 'running',
  }));
}

export function getLatestThinking(thinking: string[], maxLength = 500): string {
  if (thinking.length === 0) return '';
  const latest = thinking[thinking.length - 1];
  return latest.slice(0, maxLength);
}
```

- [ ] **Step 2: 提交解析器**

```bash
git add src/acpx/parser.ts
git commit -m "feat: add acpx JSON output parser"
```

---

### Task 11: acpx 执行器

**Files:**
- Create: `src/acpx/executor.ts`

- [ ] **Step 1: 创建 acpx 执行器**

```typescript
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

export async function executePrompt(options: ExecutorOptions): Promise<ParsedOutput> {
  const config = getConfig();
  const { session, workspacePath, prompt, messageCtx, onUpdate } = options;

  const output = createParsedOutput();
  const args = [
    '--cwd', workspacePath,
    '--format', 'json',
    '--approve-all',
    session.agent,
    prompt,
  ];

  logger.info(`执行 acpx: ${config.acpx.path} ${args.join(' ')}`);

  // 发送初始消息卡片
  const initialCard = buildMessageCard({
    agent: session.agent,
    workspace: session.workspace,
    status: 'thinking',
  });

  const messageId = await messageCtx.client.im.message.create({
    params: { receive_id_type: 'chat_id' },
    data: {
      receive_id: messageCtx.chatId,
      content: initialCard,
      msg_type: 'interactive',
    },
  }).then(res => res.data?.message_id);

  if (!messageId) {
    throw new Error('无法发送初始消息');
  }

  const task: RunningTask = {
    process: null as unknown as ChildProcess,
    output,
    messageId,
    lastUpdate: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const acpxProcess = spawn(config.acpx.path, args, {
      cwd: workspacePath,
      env: { ...process.env },
    });

    task.process = acpxProcess;
    runningTasks.set(messageId, task);

    let buffer = '';

    acpxProcess.stdout.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const event = parseACPXLine(line);
        if (event) {
          updateParsedOutput(output, event);
          onUpdate?.(output);

          // 节流更新消息卡片
          const now = Date.now();
          if (now - task.lastUpdate >= config.acpx.throttleInterval) {
            task.lastUpdate = now;
            updateMessageCard(messageCtx, messageId, session, output);
          }
        }
      }
    });

    acpxProcess.stderr.on('data', (data: Buffer) => {
      logger.error('acpx stderr:', data.toString());
    });

    acpxProcess.on('close', (code) => {
      runningTasks.delete(messageId);

      // 处理剩余的 buffer
      if (buffer.trim()) {
        const event = parseACPXLine(buffer);
        if (event) {
          updateParsedOutput(output, event);
        }
      }

      // 最终更新消息卡片
      const finalCard = buildMessageCard({
        agent: session.agent,
        workspace: session.workspace,
        status: output.error ? 'error' : 'done',
        thinking: getLatestThinking(output.thinking),
        toolCalls: getToolCallsArray(output.toolCalls),
        response: output.text,
        error: output.error,
      });

      updateCardMessage(messageCtx, messageId, finalCard);

      if (code === 0 || output.done) {
        resolve(output);
      } else {
        reject(new Error(`acpx 进程退出,代码: ${code}`));
      }
    });

    acpxProcess.on('error', (error) => {
      runningTasks.delete(messageId);

      const errorCard = buildErrorCard('执行错误', error.message, [
        '确保已安装 acpx: npm install -g acpx',
        '检查工作目录是否正确',
      ]);
      updateCardMessage(messageCtx, messageId, errorCard);

      reject(error);
    });
  });
}

export function cancelTask(messageId: string): boolean {
  const task = runningTasks.get(messageId);
  if (task) {
    task.process.kill('SIGTERM');
    runningTasks.delete(messageId);
    return true;
  }
  return false;
}

async function updateMessageCard(
  ctx: MessageContext,
  messageId: string,
  session: ChatSession,
  output: ParsedOutput
): Promise<void> {
  const card = buildMessageCard({
    agent: session.agent,
    workspace: session.workspace,
    status: output.done ? 'done' : output.toolCalls.size > 0 ? 'working' : 'thinking',
    thinking: getLatestThinking(output.thinking),
    toolCalls: getToolCallsArray(output.toolCalls),
    response: output.text,
    error: output.error,
  });

  await updateCardMessage(ctx, messageId, card);
}
```

- [ ] **Step 2: 提交执行器**

```bash
git add src/acpx/executor.ts
git commit -m "feat: add acpx executor with streaming output"
```

---

## Chunk 4: 命令系统和入口文件

### Task 12: 命令路由器

**Files:**
- Create: `src/commands/router.ts`

- [ ] **Step 1: 创建命令路由器**

```typescript
// src/commands/router.ts
import type * as lark from '@larksuiteoapi/node-sdk';
import { getConfig, getWorkspaceByName, getDefaultWorkspace } from '../config.js';
import { getOrCreateChatSession, getChatState, updateChatSession, closeChatSession } from '../acpx/session.js';
import { executePrompt } from '../acpx/executor.js';
import { buildHelpCard, buildStatusCard, buildErrorCard } from '../lark/card.js';
import { sendCardMessage, sendTextMessage, extractTextContent, type MessageContext } from '../lark/message.js';
import { logger } from '../utils/logger.js';
import { getAllChatSessions } from '../acpx/session.js';

export type CommandHandler = (
  ctx: MessageContext,
  args: string[],
  rawMessage: lark.im.MessageReceiveEvent
) => Promise<void>;

const commands = new Map<string, CommandHandler>();

export function registerCommand(name: string, handler: CommandHandler): void {
  commands.set(name, handler);
}

export async function routeMessage(
  client: lark.Client,
  message: lark.im.MessageReceiveEvent
): Promise<void> {
  const chatId = message.message.chat_id;
  const content = extractTextContent(message.message.content);

  if (!content.trim()) {
    return;
  }

  const ctx: MessageContext = { client, chatId };

  // 检查是否是命令
  if (content.startsWith('/')) {
    const parts = content.slice(1).trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    const handler = commands.get(cmd);
    if (handler) {
      await handler(ctx, args, message);
    } else {
      await sendTextMessage(ctx, `未知命令: /${cmd}\n使用 /help 查看可用命令`);
    }
    return;
  }

  // 作为 prompt 处理
  await handlePrompt(ctx, content, message);
}

async function handlePrompt(
  ctx: MessageContext,
  prompt: string,
  message: lark.im.MessageReceiveEvent
): Promise<void> {
  const config = getConfig();

  try {
    const session = getOrCreateChatSession(ctx.chatId);
    const workspace = config.workspaces.find((w) => w.name === session.workspace);

    if (!workspace) {
      const errorCard = buildErrorCard('工作空间不存在', `工作空间 "${session.workspace}" 未找到`, [
        '使用 /ws 查看可用工作空间',
      ]);
      await sendCardMessage(ctx, errorCard);
      return;
    }

    await executePrompt({
      session,
      workspacePath: workspace.path,
      prompt,
      messageCtx: ctx,
    });
  } catch (error) {
    logger.error('处理 prompt 失败:', error);
    const errorCard = buildErrorCard('处理失败', String(error), [
      '使用 /session new 创建新会话',
      '使用 /status 查看状态',
    ]);
    await sendCardMessage(ctx, errorCard);
  }
}

// 内置命令处理器
async function handleHelp(ctx: MessageContext): Promise<void> {
  await sendCardMessage(ctx, buildHelpCard());
}

async function handleStatus(ctx: MessageContext): Promise<void> {
  const config = getConfig();
  const chatState = getChatState(ctx.chatId);
  const sessions = getAllChatSessions().filter((s) => s.chatId === ctx.chatId);

  const card = buildStatusCard(
    true, // 已连接
    chatState?.currentAgent || config.agents.default,
    chatState?.currentWorkspace || getDefaultWorkspace().name,
    sessions.length
  );

  await sendCardMessage(ctx, card);
}

async function handleAgent(ctx: MessageContext, args: string[]): Promise<void> {
  const config = getConfig();

  if (args.length === 0) {
    const chatState = getChatState(ctx.chatId);
    const current = chatState?.currentAgent || config.agents.default;
    const available = config.agents.available.join(', ');
    await sendTextMessage(ctx, `当前代理: ${current}\n可用代理: ${available}`);
    return;
  }

  const newAgent = args[0].toLowerCase();
  if (!config.agents.available.includes(newAgent)) {
    await sendTextMessage(ctx, `不支持的代理: ${newAgent}\n可用: ${config.agents.available.join(', ')}`);
    return;
  }

  updateChatSession(ctx.chatId, { agent: newAgent });
  await sendTextMessage(ctx, `已切换到代理: ${newAgent}`);
}

async function handleWorkspace(ctx: MessageContext, args: string[]): Promise<void> {
  const config = getConfig();

  if (args.length === 0) {
    const chatState = getChatState(ctx.chatId);
    const current = chatState?.currentWorkspace || getDefaultWorkspace().name;
    const all = config.workspaces.map((w) => w.name).join(', ');
    await sendTextMessage(ctx, `当前工作空间: ${current}\n可用: ${all}`);
    return;
  }

  const newWorkspace = args[0];
  const workspace = getWorkspaceByName(newWorkspace);

  if (!workspace) {
    const all = config.workspaces.map((w) => w.name).join(', ');
    await sendTextMessage(ctx, `工作空间不存在: ${newWorkspace}\n可用: ${all}`);
    return;
  }

  updateChatSession(ctx.chatId, { workspace: newWorkspace });
  await sendTextMessage(ctx, `已切换到工作空间: ${newWorkspace}`);
}

async function handleSession(ctx: MessageContext, args: string[]): Promise<void> {
  const subCmd = args[0]?.toLowerCase();

  if (subCmd === 'new') {
    const chatState = getChatState(ctx.chatId);
    if (chatState) {
      // 关闭旧会话
      closeChatSession(ctx.chatId, chatState.currentWorkspace);
    }
    await sendTextMessage(ctx, '已创建新会话');
  } else if (subCmd === 'close') {
    const chatState = getChatState(ctx.chatId);
    if (chatState) {
      closeChatSession(ctx.chatId, chatState.currentWorkspace);
      await sendTextMessage(ctx, '已关闭当前会话');
    } else {
      await sendTextMessage(ctx, '没有活跃会话');
    }
  } else {
    await sendTextMessage(ctx, '用法:\n/session new - 创建新会话\n/session close - 关闭当前会话');
  }
}

// 注册内置命令
registerCommand('help', handleHelp);
registerCommand('status', handleStatus);
registerCommand('agent', handleAgent);
registerCommand('workspace', handleWorkspace);
registerCommand('ws', handleWorkspace);
registerCommand('session', handleSession);
```

- [ ] **Step 2: 提交命令路由器**

```bash
mkdir -p src/commands
git add src/commands/router.ts
git commit -m "feat: add command router with built-in commands"
```

---

### Task 13: 飞书 WebSocket 客户端

**Files:**
- Create: `src/lark/client.ts`

- [ ] **Step 1: 创建飞书客户端**

```typescript
// src/lark/client.ts
import * as lark from '@larksuiteoapi/node-sdk';
import { getConfig } from '../config.js';
import { routeMessage } from '../commands/router.js';
import { logger } from '../utils/logger.js';

let wsClient: lark.WSClient | null = null;
let client: lark.Client | null = null;
let isConnected = false;

export function getLarkClient(): lark.Client {
  if (!client) {
    const config = getConfig();
    client = new lark.Client({
      appId: config.lark.appId,
      appSecret: config.lark.appSecret,
    });
  }
  return client;
}

export function getConnectionStatus(): boolean {
  return isConnected;
}

export async function connect(): Promise<void> {
  const config = getConfig();

  if (wsClient) {
    logger.warn('WebSocket 客户端已存在');
    return;
  }

  client = new lark.Client({
    appId: config.lark.appId,
    appSecret: config.lark.appSecret,
  });

  const eventDispatcher = new lark.EventDispatcher({}).register({
    'im.message.receive_v1': async (data) => {
      logger.debug('收到消息:', data.message.message_id);

      try {
        await routeMessage(client!, data);
      } catch (error) {
        logger.error('处理消息失败:', error);
      }
    },
  });

  wsClient = new lark.WSClient({
    appId: config.lark.appId,
    appSecret: config.lark.appSecret,
    loggerLevel: lark.LoggerLevel.info,
  });

  logger.info('正在连接飞书 WebSocket...');

  try {
    await wsClient.start({ eventDispatcher });
    isConnected = true;
    logger.info('飞书 WebSocket 连接成功');
  } catch (error) {
    isConnected = false;
    logger.error('飞书 WebSocket 连接失败:', error);
    throw error;
  }
}

export async function disconnect(): Promise<void> {
  if (wsClient) {
    wsClient.stop();
    wsClient = null;
    isConnected = false;
    logger.info('已断开飞书 WebSocket 连接');
  }
}

export async function reconnect(): Promise<void> {
  await disconnect();
  await connect();
}
```

- [ ] **Step 2: 提交飞书客户端**

```bash
git add src/lark/client.ts
git commit -m "feat: add Feishu WebSocket client"
```

---

### Task 14: 入口文件

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: 创建入口文件**

```typescript
// src/index.ts
import { loadConfig } from './config.js';
import { connect, disconnect, reconnect, getConnectionStatus } from './lark/client.js';
import { logger } from './utils/logger.js';
import { registerCommand } from './commands/router.js';
import { sendTextMessage, type MessageContext } from './lark/message.js';
import type * as lark from '@larksuiteoapi/node-sdk';

// 注册连接管理命令
registerCommand('connect', async (ctx: MessageContext) => {
  if (getConnectionStatus()) {
    await sendTextMessage(ctx, '已处于连接状态');
    return;
  }
  try {
    await connect();
    await sendTextMessage(ctx, '连接成功');
  } catch (error) {
    await sendTextMessage(ctx, `连接失败: ${error}`);
  }
});

registerCommand('disconnect', async (ctx: MessageContext) => {
  await disconnect();
  await sendTextMessage(ctx, '已断开连接');
});

registerCommand('reconnect', async (ctx: MessageContext) => {
  try {
    await reconnect();
    await sendTextMessage(ctx, '重新连接成功');
  } catch (error) {
    await sendTextMessage(ctx, `重新连接失败: ${error}`);
  }
});

registerCommand('clear', async (ctx: MessageContext) => {
  // /clear 是 /session new 的别名 - 关闭当前会话并创建新的
  const { getChatState } = await import('./acpx/session.js');
  const { closeChatSession } = await import('./acpx/session.js');
  const chatState = getChatState(ctx.chatId);
  if (chatState) {
    closeChatSession(ctx.chatId, chatState.currentWorkspace);
    await sendTextMessage(ctx, '已清除会话历史');
  } else {
    await sendTextMessage(ctx, '没有活跃会话');
  }
});

async function main(): Promise<void> {
  logger.info('飞书 ACP Code 机器人启动中...');

  try {
    // 加载配置
    loadConfig();
    logger.info('配置加载成功');

    // 连接飞书
    await connect();

    // 处理退出信号
    process.on('SIGINT', async () => {
      logger.info('收到 SIGINT 信号,正在关闭...');
      await disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('收到 SIGTERM 信号,正在关闭...');
      await disconnect();
      process.exit(0);
    });

    logger.info('机器人已启动,等待消息...');
  } catch (error) {
    logger.error('启动失败:', error);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 2: 提交入口文件**

```bash
git add src/index.ts
git commit -m "feat: add main entry point"
```

---

### Task 15: 类型导出和最终检查

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: 创建类型导出文件**

```typescript
// src/types/index.ts
export * from './config.js';
export * from './session.js';
```

- [ ] **Step 2: 运行类型检查**

Run: `bun run typecheck`
Expected: 无类型错误

- [ ] **Step 3: 修复可能的类型错误** (如有)

- [ ] **Step 4: 最终提交**

```bash
git add src/types/index.ts
git commit -m "feat: add type exports"
```

---

## 执行摘要

| Chunk | 任务数 | 主要产出 |
|-------|--------|----------|
| 1 | 5 | 项目初始化、配置系统、日志工具 |
| 2 | 4 | 会话管理、消息卡片、消息发送 |
| 3 | 2 | acpx 解析器、执行器 |
| 4 | 4 | 命令系统、飞书客户端、入口文件 |

**总任务数:** 15

**预计完成时间:** 2-3 小时

**测试方式:**
1. 复制 `config.example.json` 为 `config.json` 并填写飞书应用配置
2. 运行 `bun run start` 启动机器人
3. 在飞书中发送消息测试
