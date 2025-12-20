/**
 * Agent Runner Service
 *
 * Core agent execution and chaining logic for server-side agent loop.
 * Handles starting agents, tracking completion, and auto-chaining
 * implementation <-> review agents.
 */

import { tasksDb, agentRunsDb, conversationsDb } from '../database/db.js';
import { createSessionWithFirstMessage } from '../claude-sdk.js';
import { notifyClaudeComplete, updateUserBadge } from './notifications.js';
import { buildContextPrompt } from './documentation.js';
import {
  generateImplementationMessage,
  generateReviewMessage,
  generatePlanificationMessage
} from '../constants/agentPrompts.js';

/**
 * Start an agent run for a task
 * Creates conversation, starts streaming, handles chaining on completion
 *
 * @param {number} taskId - Task ID
 * @param {string} agentType - 'planification' | 'implementation' | 'review'
 * @param {Object} options - Options including broadcastFn and userId
 * @returns {Promise<{agentRun: Object, conversation: Object, sessionId: string}>}
 */
export async function startAgentRun(taskId, agentType, options = {}) {
  const { broadcastFn, userId } = options;

  // Get task and project info
  const taskWithProject = tasksDb.getWithProject(taskId);
  if (!taskWithProject) {
    throw new Error(`Task ${taskId} not found`);
  }

  const projectPath = taskWithProject.repo_folder_path;
  const taskDocPath = `.claude-ui/tasks/task-${taskId}.md`;

  // Generate message based on agent type
  let message;
  switch (agentType) {
    case 'planification':
      message = generatePlanificationMessage(taskDocPath);
      break;
    case 'implementation':
      message = generateImplementationMessage(taskDocPath, taskId);
      break;
    case 'review':
      message = generateReviewMessage(taskDocPath, taskId);
      break;
    default:
      throw new Error(`Unknown agent type: ${agentType}`);
  }

  // Create agent run record
  const agentRun = agentRunsDb.create(taskId, agentType, null);
  console.log(`[AgentRunner] Created agent run ${agentRun.id} (${agentType}) for task ${taskId}`);

  // Create conversation
  const conversation = conversationsDb.create(taskId);
  console.log(`[AgentRunner] Created conversation ${conversation.id} for task ${taskId}`);

  // Link conversation to agent run
  agentRunsDb.linkConversation(agentRun.id, conversation.id);
  console.log(`[AgentRunner] Linked conversation ${conversation.id} to agent run ${agentRun.id}`);

  // Update task status to 'in_progress' if it's currently 'pending'
  if (taskWithProject.status === 'pending') {
    tasksDb.update(taskId, { status: 'in_progress' });
    console.log(`[AgentRunner] Updated task ${taskId} status to in_progress`);

    // Send badge update notification (fire and forget)
    if (userId) {
      updateUserBadge(userId).catch(err => {
        console.error('[AgentRunner] Failed to update badge:', err);
      });
    }
  }

  // Build context prompt from project.md and task markdown
  const contextPrompt = buildContextPrompt(projectPath, taskId);

  // Start streaming (returns immediately, streaming continues in background)
  const sessionId = await createSessionWithFirstMessage({
    conversationId: conversation.id,
    taskId,
    message,
    projectPath,
    permissionMode: 'bypassPermissions',
    customSystemPrompt: contextPrompt,
    broadcastToConversation: broadcastFn,
    onSessionCreated: (claudeSessionId) => {
      conversationsDb.updateClaudeId(conversation.id, claudeSessionId);
      console.log(`[AgentRunner] Updated conversation ${conversation.id} with Claude session ${claudeSessionId}`);

      // Broadcast streaming-started event
      if (broadcastFn) {
        broadcastFn(conversation.id, {
          type: 'streaming-started',
          taskId,
          conversationId: conversation.id,
          claudeSessionId
        });
      }
    },
    onStreamingComplete: async (claudeSessionId, isError) => {
      console.log(`[AgentRunner] Streaming complete for agent run ${agentRun.id}, isError: ${isError}`);

      // Handle completion and chaining
      await handleAgentComplete(taskId, agentRun.id, agentType, isError, {
        ...options,
        conversationId: conversation.id
      });
    }
  });

  return { agentRun, conversation, sessionId };
}

/**
 * Handle agent completion - mark complete and chain if needed
 *
 * @param {number} taskId - Task ID
 * @param {number} agentRunId - Agent run ID
 * @param {string} agentType - Agent type
 * @param {boolean} isError - Whether streaming ended with error
 * @param {Object} options - Options including broadcastFn and userId
 */
async function handleAgentComplete(taskId, agentRunId, agentType, isError, options) {
  const { broadcastFn, userId, conversationId } = options;

  // Broadcast streaming-ended event
  if (broadcastFn) {
    broadcastFn(conversationId, {
      type: 'streaming-ended',
      taskId,
      conversationId
    });
  }

  // On error: mark failed and stop
  if (isError) {
    agentRunsDb.updateStatus(agentRunId, 'failed');
    console.log(`[AgentRunner] Agent run ${agentRunId} failed, stopping loop`);
    return;
  }

  // Mark current run as completed
  agentRunsDb.updateStatus(agentRunId, 'completed');
  console.log(`[AgentRunner] Agent run ${agentRunId} (${agentType}) completed`);

  // Send push notification for completion
  if (userId) {
    const taskInfo = tasksDb.getById(taskId);
    const taskTitle = taskInfo?.title || null;
    const workflowComplete = !!taskInfo?.workflow_complete;

    notifyClaudeComplete(
      userId,
      taskTitle,
      taskId,
      conversationId,
      { agentType, workflowComplete }
    ).catch(err => {
      console.error('[AgentRunner] Failed to send notification:', err);
    });
  }

  // Only chain for implementation/review agents
  if (agentType !== 'implementation' && agentType !== 'review') {
    console.log(`[AgentRunner] No chaining for ${agentType} agent`);
    return;
  }

  // Fetch fresh task data to check workflow_complete flag
  // (agent may have set this via CLI script during execution)
  const task = tasksDb.getById(taskId);
  if (!task) {
    console.log(`[AgentRunner] Task ${taskId} no longer exists, stopping loop`);
    return;
  }
  if (task.workflow_complete) {
    console.log(`[AgentRunner] Task ${taskId} workflow complete, stopping loop`);
    // TODO: Could send a special "workflow complete" push notification here
    return;
  }

  // Chain to next agent
  const nextType = agentType === 'implementation' ? 'review' : 'implementation';
  console.log(`[AgentRunner] Chaining ${agentType} -> ${nextType} for task ${taskId}`);

  // Small delay before starting next agent (allows DB to settle)
  setTimeout(async () => {
    try {
      // Re-check workflow_complete before chaining (may have changed during streaming)
      const freshTask = tasksDb.getById(taskId);
      if (freshTask?.workflow_complete) {
        console.log(`[AgentRunner] Task ${taskId} workflow complete (re-check), stopping loop`);
        return;
      }

      // Check for concurrent runs before chaining (race condition prevention)
      const runningAgent = getRunningAgentForTask(taskId);
      if (runningAgent) {
        console.log(`[AgentRunner] Another agent (${runningAgent.agent_type}) already running for task ${taskId}, skipping chain`);
        return;
      }

      await startAgentRun(taskId, nextType, options);
    } catch (err) {
      console.error(`[AgentRunner] Failed to chain to ${nextType}:`, err);

      // Create a failed agent run record to track the chaining failure
      try {
        const failedRun = agentRunsDb.create(taskId, nextType, null);
        agentRunsDb.updateStatus(failedRun.id, 'failed');
        console.log(`[AgentRunner] Created failed agent run ${failedRun.id} to record chaining failure`);
      } catch (recordErr) {
        console.error(`[AgentRunner] Failed to record chaining failure:`, recordErr);
      }
    }
  }, 1000);
}

/**
 * Check if an agent is currently running for a task
 *
 * @param {number} taskId - Task ID
 * @returns {Object|null} Running agent run or null
 */
export function getRunningAgentForTask(taskId) {
  const allRuns = agentRunsDb.getByTask(taskId);
  return allRuns.find(r => r.status === 'running') || null;
}

/**
 * Force-complete all running agent runs for a task
 * Used for recovery from stuck states
 *
 * @param {number} taskId - Task ID
 * @returns {number} Number of agents force-completed
 */
export function forceCompleteRunningAgents(taskId) {
  const agentRuns = agentRunsDb.getByTask(taskId);
  let count = 0;

  for (const run of agentRuns) {
    if (run.status === 'running') {
      agentRunsDb.updateStatus(run.id, 'completed');
      console.log(`[AgentRunner] Force-completed stuck agent run ${run.id}`);
      count++;
    }
  }

  return count;
}
