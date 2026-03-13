#!/usr/bin/env node

/**
 * Feishu ACP Code Bot CLI
 *
 * A Feishu bot that brings AI coding assistants (Claude Code, OpenCode, Codex)
 * directly into your Feishu chats.
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import and run the main entry point
import(resolve(__dirname, '../dist/index.js'));
