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
