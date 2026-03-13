# 飞书 ACP Code 机器人设计文档

## 概述

构建一个飞书机器人,通过 WebSocket 长连接模式接收消息,使用 acpx 调用 Claude Code、OpenCode、Codex 等 ACP 兼容的编码代理,实现个人助手功能。

## 需求总结

| 项目 | 需求 |
|------|------|
| 使用场景 | 个人助手 |
| 交互模式 | 多轮会话 + 流式输出 |
| 代理支持 | Claude Code, OpenCode, Codex, 可扩展 |
| 工作目录 | 配置文件预设 |
| 消息功能 | 文本消息、代码高亮、消息卡片、斜杠命令 |
| 部署方式 | 本地运行 (WebSocket模式) |

## 架构设计

### 方案选择

采用 **单进程事件驱动架构**:

```
┌─────────────────────────────────────────────────────────┐
│                     Node.js 主进程                       │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐  │
│  │ 飞书WS客户端  │←→│  消息路由器   │←→│ acpx执行器│  │
│  └──────────────┘    └──────────────┘    └───────────┘  │
│         ↓                   ↓                   ↓        │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐  │
│  │ 会话管理器   │    │ 斜杠命令处理 │    │ 流式解析  │  │
│  └──────────────┘    └──────────────┘    └───────────┘  │
└─────────────────────────────────────────────────────────┘
```

**优点:**
- 架构简单,易于开发和调试
- 资源占用低,适合本地运行
- acpx本身支持会话管理,无需额外实现

## 项目结构

```
feishu-acpcode/
├── src/
│   ├── index.ts              # 入口文件
│   ├── config.ts             # 配置管理
│   ├── lark/
│   │   ├── client.ts         # 飞书WebSocket客户端
│   │   ├── message.ts        # 消息发送/更新
│   │   └── card.ts           # 消息卡片构建
│   ├── acpx/
│   │   ├── executor.ts       # acpx 执行器
│   │   ├── parser.ts         # JSON流解析器
│   │   └── session.ts        # 会话映射管理
│   ├── commands/
│   │   ├── router.ts         # 命令路由
│   │   ├── agent.ts          # /agent 命令
│   │   ├── session.ts        # /session 命令
│   │   ├── connect.ts        # /connect 命令
│   │   └── help.ts           # /help 命令
│   └── utils/
│       ├── formatter.ts      # 消息格式化(代码高亮)
│       └── logger.ts         # 日志工具
├── config.example.json       # 配置示例
├── package.json
└── tsconfig.json
```

## 核心组件

### 配置系统

配置文件 `config.json`:

```json
{
  "lark": {
    "appId": "cli_xxx",
    "appSecret": "xxx"
  },
  "workspaces": [
    {
      "name": "my-project",
      "path": "/Users/xxx/projects/my-project",
      "default": true
    }
  ],
  "agents": {
    "default": "claude",
    "available": ["claude", "opencode", "codex"]
  },
  "acpx": {
    "path": "acpx",
    "timeout": 300000,
    "ttl": 300
  }
}
```

### 会话映射

飞书聊天与acpx会话的映射关系:

```
飞书 chat_id + workspace  →  acpx session_id
```

- 每个飞书聊天+工作空间组合对应一个独立的acpx会话
- 支持在同一个飞书聊天中切换工作空间

### 消息流

```
飞书消息 → 解析命令/普通消息 → 获取/创建acpx会话
    ↓
执行acpx prompt → 流式解析JSON → 更新飞书消息
    ↓
完成 → 更新最终消息卡片
```

## 斜杠命令系统

### 连接管理命令

| 命令 | 描述 |
|------|------|
| `/connect` | 连接到飞书 WebSocket |
| `/disconnect` | 断开飞书连接 |
| `/status` | 查看连接和会话状态 |
| `/reconnect` | 重新连接 |

### 会话管理命令

| 命令 | 描述 |
|------|------|
| `/session new` | 创建新会话 |
| `/session status` | 查看会话状态 |
| `/session close` | 关闭当前会话 |
| `/clear` | 清除当前会话历史 |

### 配置命令

| 命令 | 描述 |
|------|------|
| `/agent` | 查看/切换当前代理 |
| `/workspace` / `/ws` | 查看/切换工作空间 |
| `/config` | 查看当前配置 |
| `/help` | 显示帮助信息 |

### 命令示例

```
/agent              # 查看当前代理
/agent claude       # 切换到 claude
/agent opencode     # 切换到 opencode

/ws                 # 列出所有工作空间
/ws my-project      # 切换到 my-project

/connect            # 连接飞书
/disconnect         # 断开连接
/status             # 查看状态
```

## 流式输出实现

### 消息卡片设计

```
┌────────────────────────────────────────────────────┐
│ 🤖 Claude Code (my-project)                        │
├────────────────────────────────────────────────────┤
│ 状态: 🔄 思考中...                                  │
├────────────────────────────────────────────────────┤
│ [思考]                                             │
│ 我需要检查测试文件...                              │
│                                                    │
│ [工具调用]                                         │
│ ✓ Read src/test.ts                                 │
│ ⏳ Run npm test                                    │
├────────────────────────────────────────────────────┤
│ 📝 回复:                                           │
│ 发现问题在 test.ts 第 42 行...                     │
│                                                    │
│ ```typescript                                      │
│ // 修复后的代码                                    │
│ const result = await fetch(...)                    │
│ ```                                                │
└────────────────────────────────────────────────────┘
```

### 更新策略

1. 收到第一个事件 → 发送初始消息卡片
2. 每 1-2 秒更新一次卡片 (节流)
3. 收到 `done` 事件 → 最终更新,移除"进行中"状态

### acpx JSON 输出解析

```typescript
interface ACPXEvent {
  eventVersion: 1;
  sessionId: string;
  requestId: string;
  seq: number;
  stream: "prompt";
  type: "thinking" | "tool_call" | "text" | "done" | "error";
  // ... 其他字段
}
```

## 错误处理

### 主要错误场景

| 场景 | 处理方式 |
|------|----------|
| acpx 未安装 | 提示用户安装: `npm install -g acpx` |
| 工作目录不存在 | 发送错误消息卡片,提示检查配置 |
| acpx 执行超时 | 发送超时提示,提供 `/session new` 选项 |
| 飞书连接断开 | 自动重连,最多重试 3 次 |
| 代理未安装 | 提示代理需要单独安装 (如 claude code) |
| 权限不足 | 提示用户配置权限或使用 `/approve-all` |

### 错误消息卡片

```
┌────────────────────────────────────────────────────┐
│ ❌ 执行错误                                        │
├────────────────────────────────────────────────────┤
│ acpx 执行超时 (300s)                               │
│                                                    │
│ 建议:                                              │
│ • 使用 /session new 创建新会话                     │
│ • 检查工作目录是否正确                             │
└────────────────────────────────────────────────────┘
```

## 技术栈和依赖

### 主要依赖

| 包名 | 用途 |
|------|------|
| `@larksuiteoapi/node-sdk` | 飞书 WebSocket 客户端 |
| `acpx` (全局安装) | ACP 代理执行器 |
| `typescript` | 类型安全 |
| `tsx` | TypeScript 执行 |
| `zod` | 配置验证 |

### 环境要求

- Node.js >= 18 (支持原生 fetch)
- acpx 全局安装: `npm install -g acpx`

### 启动命令

```bash
# 开发
bun run dev

# 生产
bun run start

# 或直接
npx tsx src/index.ts
```

## 启动流程

```
1. 加载配置文件 (config.json)
2. 验证配置 (zod schema)
3. 初始化飞书 WebSocket 客户端
4. 连接飞书,等待消息
5. 收到消息 → 处理 → 响应
```

## 扩展性

### 添加新代理

在配置文件的 `agents.available` 数组中添加代理名称即可:

```json
{
  "agents": {
    "default": "claude",
    "available": ["claude", "opencode", "codex", "pi", "gemini"]
  }
}
```

acpx 内置支持多种代理,无需额外代码。

### 添加新命令

1. 在 `src/commands/` 目录创建新命令模块
2. 在 `src/commands/router.ts` 中注册命令
3. 实现命令处理逻辑
