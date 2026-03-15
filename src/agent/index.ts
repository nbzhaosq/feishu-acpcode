// src/agent/index.ts
export {
  executeAgent,
  cancelTask,
  cancelAllTasks,
  closeAgentSession,
  closeAllAgentSessions,
  getRunningTaskCount,
  shutdownAllExecutors,
  type AgentExecutorOptions,
} from './router.js';
