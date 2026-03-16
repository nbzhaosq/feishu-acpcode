// src/acp/client.ts
import type * as acp from '@agentclientprotocol/sdk';
import type { SessionUpdateCallback, PermissionRequestCallback, ClientCapabilities } from './types.js';
import { logger } from '../utils/logger.js';
import { readFile, writeFile } from 'fs/promises';
import { spawn } from 'child_process';

/**
 * Feishu ACP Client implementation
 *
 * This class implements the ACP Client interface to handle
 * requests from agents (permission requests, session updates, file operations).
 */
export class FeishuACPClient implements acp.Client {
  private sessionUpdateCallback?: SessionUpdateCallback;
  private permissionCallback?: PermissionRequestCallback;
  private capabilities: ClientCapabilities;
  private workingDirectory: string;

  constructor(
    workingDirectory: string,
    capabilities: ClientCapabilities = {}
  ) {
    this.workingDirectory = workingDirectory;
    this.capabilities = capabilities;
  }

  /**
   * Set the session update callback
   */
  setSessionUpdateCallback(callback: SessionUpdateCallback): void {
    this.sessionUpdateCallback = callback;
  }

  /**
   * Set the permission request callback
   */
  setPermissionCallback(callback: PermissionRequestCallback): void {
    this.permissionCallback = callback;
  }

  /**
   * Handle session updates from the agent
   */
  async sessionUpdate(params: acp.SessionNotification): Promise<void> {
    const updateType = params.update.sessionUpdate;
    logger.debug(`[ACP] Session update: ${updateType}`);

    if (this.sessionUpdateCallback) {
      this.sessionUpdateCallback(params);
    }
  }

  /**
   * Handle permission requests from the agent
   */
  async requestPermission(params: acp.RequestPermissionRequest): Promise<acp.RequestPermissionResponse> {
    logger.info('[ACP] Permission requested:', params.toolCall.title);

    // If we have a custom callback, use it
    if (this.permissionCallback) {
      return this.permissionCallback(params);
    }

    // Default: auto-allow all tool calls (for unattended operation)
    // Find an "allow_once" or "allow_always" option
    const allowOption = params.options.find(
      opt => opt.kind === 'allow_once' || opt.kind === 'allow_always'
    );

    if (allowOption) {
      return {
        outcome: {
          outcome: 'selected',
          optionId: allowOption.optionId,
        },
      };
    }

    // If no allow option, select the first option
    if (params.options.length > 0) {
      return {
        outcome: {
          outcome: 'selected',
          optionId: params.options[0].optionId,
        },
      };
    }

    // No options available
    return {
      outcome: {
        outcome: 'cancelled',
      },
    };
  }

  /**
   * Read a text file (if capability is enabled)
   */
  async readTextFile(params: acp.ReadTextFileRequest): Promise<acp.ReadTextFileResponse> {
    if (!this.capabilities.readTextFile) {
      throw new Error('readTextFile capability not enabled');
    }

    try {
      const content = await readFile(params.path, 'utf-8');
      return { content };
    } catch (error) {
      throw new Error(`Failed to read file: ${params.path}`);
    }
  }

  /**
   * Write a text file (if capability is enabled)
   */
  async writeTextFile(params: acp.WriteTextFileRequest): Promise<acp.WriteTextFileResponse> {
    if (!this.capabilities.writeTextFile) {
      throw new Error('writeTextFile capability not enabled');
    }

    try {
      await writeFile(params.path, params.content, 'utf-8');
      return {};
    } catch (error) {
      throw new Error(`Failed to write file: ${params.path}`);
    }
  }

  /**
   * Create a terminal (if capability is enabled)
   */
  async createTerminal(params: acp.CreateTerminalRequest): Promise<acp.CreateTerminalResponse> {
    if (!this.capabilities.terminal) {
      throw new Error('terminal capability not enabled');
    }

    // Generate a terminal ID
    const terminalId = `terminal-${Date.now()}`;

    // Execute the command
    const proc = spawn(params.command, params.args || [], {
      cwd: params.cwd || this.workingDirectory,
      env: { ...process.env } as Record<string, string>,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Store the process for later reference
    // (In a real implementation, you'd store this in a map)

    return {
      terminalId,
    };
  }
}
