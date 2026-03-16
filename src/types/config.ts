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

/**
 * Agent execution configuration
 * Configures timeouts and execution settings
 */
export const AgentExecutionConfigSchema = z.object({
  /** Task timeout in milliseconds */
  timeout: z.number().default(300000),
  /** Throttle interval for card updates in milliseconds */
  throttleInterval: z.number().default(1500),
});

/**
 * API configuration for Claude/Anthropic API
 * Allows customizing the API endpoint and authentication
 */
export const ApiConfigSchema = z.object({
  /** Custom API base URL (e.g., for proxy servers) */
  baseUrl: z.string().url().optional(),
  /** API key (optional, will use ANTHROPIC_API_KEY env var if not set) */
  apiKey: z.string().optional(),
});

/**
 * MCP Server configuration
 * Defines how to spawn an MCP server process
 */
export const McpServerConfigSchema = z.object({
  /** Command to run the MCP server (e.g., "npx", "node") */
  command: z.string(),
  /** Arguments to pass to the command */
  args: z.array(z.string()).optional().default([]),
  /** Environment variables for the server process */
  env: z.record(z.string(), z.string()).optional(),
});

/**
 * Agent options configuration
 * Configures MCP servers, tools, and skills for Claude Agent SDK
 */
export const AgentOptionsSchema = z.object({
  /** MCP servers to make available to the agent */
  mcpServers: z.record(z.string(), McpServerConfigSchema).optional().default({}),
  /** Tools allowed for the agent (use "mcp__servername__*" for all tools from a server) */
  allowedTools: z.array(z.string()).optional().default([]),
  /** Setting sources for loading Skills (user = ~/.claude/, project = .claude/) */
  settingSources: z.array(z.enum(['user', 'project'])).optional().default(['user', 'project']),
  /** Enable Skills capability */
  enableSkills: z.boolean().optional().default(true),
});

/**
 * Logging configuration
 * Configures log level and file output
 */
export const LoggingConfigSchema = z.object({
  /** Log level: debug, info, warn, error */
  level: z.enum(['debug', 'info', 'warn', 'error']).optional().default('info'),
  /** File logging configuration */
  file: z.object({
    /** Enable file logging */
    enabled: z.boolean().optional().default(true),
    /** Log file path (default: ~/.claude/logs/feishu-acpcode.log) */
    path: z.string().optional(),
    /** Max log file size in bytes before rotation (default: 10MB) */
    maxSize: z.number().optional().default(10 * 1024 * 1024),
  }).optional().default({}),
});

export const LarkConfigSchema = z.object({
  appId: z.string(),
  appSecret: z.string(),
});

export const ConfigSchema = z.object({
  lark: LarkConfigSchema,
  workspaces: z.array(WorkspaceSchema).min(1),
  agents: AgentsConfigSchema.optional().default({}),
  agent: AgentExecutionConfigSchema.optional().default({}),
  api: ApiConfigSchema.optional().default({}),
  agentOptions: AgentOptionsSchema.optional().default({}),
  logging: LoggingConfigSchema.optional().default({}),
});

// Export types
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type AgentsConfig = z.infer<typeof AgentsConfigSchema>;
export type AgentExecutionConfig = z.infer<typeof AgentExecutionConfigSchema>;
export type ApiConfig = z.infer<typeof ApiConfigSchema>;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export type AgentOptions = z.infer<typeof AgentOptionsSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type LarkConfig = z.infer<typeof LarkConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;
