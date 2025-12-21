/**
 * Agent Runner Service
 *
 * Manages agent runs - creating records, linking to conversations,
 * and initiating streaming via the ConversationAdapter.
 *
 * Agent lifecycle (status updates, chaining) is handled centrally
 * by the ConversationAdapter when streaming completes.
 */

import { tasksDb, agentRunsDb, conversationsDb } from '../database/db.js';
import { startConversation } from './conversationAdapter.js';
import { updateUserBadge } from './notifications.js';
import { buildContextPrompt } from './documentation.js';
import {
  generateImplementationMessage,
  generateReviewMessage,
  generatePlanificationMessage
} from '../constants/agentPrompts.js';

/**
 * Start an agent run for a task
 * Creates agent run record, conversation, and starts streaming via adapter
 *
 * @param {number} taskId - Task ID
 * @param {string} agentType - 'planification' | 'implementation' | 'review'
 * @param {Object} options - Options including broadcastFn and userId
 * @returns {Promise<{agentRun: Object, conversation: Object, claudeSessionId: string}>}
 */
export async function startAgentRun(taskId, agentType, options = {}) {
  const { broadcastFn, broadcastToTaskSubscribersFn, userId } = options;

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
      message = generatePlanificationMessage(taskDocPath, taskId);
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

  // Set agent run status to 'running' immediately
  agentRunsDb.updateStatus(agentRun.id, 'running');
  agentRun.status = 'running';

  // Create conversation
  const conversation = conversationsDb.create(taskId);
  console.log(`[AgentRunner] Created conversation ${conversation.id} for task ${taskId}`);

  // Link conversation to agent run
  agentRunsDb.linkConversation(agentRun.id, conversation.id);
  console.log(`[AgentRunner] Linked conversation ${conversation.id} to agent run ${agentRun.id}`);

  // Broadcast agent run created/running to task subscribers
  if (broadcastToTaskSubscribersFn) {
    broadcastToTaskSubscribersFn(taskId, {
      type: 'agent-run-updated',
      agentRun: {
        id: agentRun.id,
        status: 'running',
        agent_type: agentType,
        conversation_id: conversation.id
      }
    });
  }

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

  // Start conversation via adapter
  // The adapter handles all lifecycle events (streaming-started, streaming-ended,
  // agent status updates, notifications, and chaining)
  const { conversationId, claudeSessionId } = await startConversation(taskId, message, {
    broadcastFn,
    broadcastToTaskSubscribersFn,
    userId,
    customSystemPrompt: contextPrompt,
    permissionMode: 'bypassPermissions',
    conversationId: conversation.id
  });

  return { agentRun, conversation, claudeSessionId };
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
