// src/config.ts
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ConfigSchema, type Config } from './types/config.js';
import { configureLogger } from './utils/logger.js';

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

  // Configure logger with logging settings
  if (cachedConfig.logging) {
    configureLogger({
      level: cachedConfig.logging.level,
      file: {
        enabled: cachedConfig.logging.file?.enabled ?? true,
        path: cachedConfig.logging.file?.path,
        maxSize: cachedConfig.logging.file?.maxSize,
      },
    });
  }

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
