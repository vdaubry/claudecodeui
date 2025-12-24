/**
 * Cron Scheduler Service
 *
 * Manages scheduled agent executions:
 * - Runs every minute to check for due agents
 * - Calculates next run times
 * - Triggers agent conversations
 */

import { CronJob } from 'cron';
import { CronExpressionParser } from 'cron-parser';
import cronstrue from 'cronstrue';
import { agentsDb, conversationsDb } from '../database/db.js';
import { startAgentConversation } from './conversationAdapter.js';

// Main scheduler job (runs every minute)
let schedulerJob = null;

// Track active cron-triggered sessions to prevent overlapping runs
const activeCronRuns = new Set();

// Reference to WebSocket broadcast function
let globalBroadcastFn = null;

/**
 * Parse cron expression and get next run time
 * @param {string} cronExpression - Standard UNIX cron expression
 * @returns {Date|null} - Next run time or null if invalid
 */
export function getNextRunTime(cronExpression) {
  try {
    const interval = CronExpressionParser.parse(cronExpression);
    return interval.next().toDate();
  } catch (err) {
    console.error('[CronScheduler] Failed to parse cron expression:', cronExpression, err.message);
    return null;
  }
}

/**
 * Validate cron expression and return human-readable description
 * @param {string} expression - Cron expression to validate
 * @returns {{ valid: boolean, error?: string, description?: string, nextRun?: string }}
 */
export function validateCronExpression(expression) {
  if (!expression || typeof expression !== 'string') {
    return { valid: false, error: 'Expression is required' };
  }

  try {
    // Validate by parsing
    const interval = CronExpressionParser.parse(expression);
    const nextRun = interval.next().toDate();

    // Get human-readable description
    let description;
    try {
      description = cronstrue.toString(expression);
    } catch {
      description = 'Valid schedule';
    }

    return {
      valid: true,
      description,
      nextRun: nextRun.toISOString()
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Check and execute due agent schedules
 */
async function checkScheduledAgents() {
  const now = new Date();

  try {
    // Query agents due for execution
    const dueAgents = agentsDb.getScheduledAgentsDue(now);

    if (dueAgents.length > 0) {
      console.log(`[CronScheduler] Found ${dueAgents.length} agent(s) due for execution`);
    }

    for (const agent of dueAgents) {
      // Skip if already running
      if (activeCronRuns.has(agent.id)) {
        console.log(`[CronScheduler] Skipping agent ${agent.id} (${agent.name}) - already running`);
        continue;
      }

      activeCronRuns.add(agent.id);

      try {
        await runScheduledAgent(agent);
      } catch (err) {
        console.error(`[CronScheduler] Error running agent ${agent.id} (${agent.name}):`, err.message);
      } finally {
        activeCronRuns.delete(agent.id);

        // Update timestamps: set last_run_at to now, calculate next_run_at
        const nextRun = getNextRunTime(agent.schedule);
        agentsDb.updateScheduleStatus(agent.id, now, nextRun);
      }
    }
  } catch (err) {
    console.error('[CronScheduler] Error checking scheduled agents:', err.message);
  }
}

/**
 * Execute a scheduled agent run
 * @param {Object} agent - Agent object with schedule info
 */
async function runScheduledAgent(agent) {
  console.log(`[CronScheduler] Running scheduled agent: ${agent.name} (ID: ${agent.id})`);

  // Create conversation with triggered_by = 'cron'
  const conversation = conversationsDb.createForAgentWithTrigger(agent.id, 'cron');

  // Start the agent conversation
  await startAgentConversation(agent.id, agent.cron_prompt, {
    broadcastFn: globalBroadcastFn,
    conversationId: conversation.id,
    userId: agent.user_id,
    permissionMode: 'bypassPermissions'
  });

  console.log(`[CronScheduler] Started conversation ${conversation.id} for agent ${agent.id}`);
}

/**
 * Initialize the cron scheduler
 * @param {Function} broadcastFn - WebSocket broadcast function
 */
export function initCronScheduler(broadcastFn) {
  if (schedulerJob) {
    console.log('[CronScheduler] Already initialized');
    return;
  }

  globalBroadcastFn = broadcastFn;

  // Run every minute: '* * * * *'
  schedulerJob = new CronJob('* * * * *', () => {
    checkScheduledAgents();
  });

  schedulerJob.start();
  console.log('[CronScheduler] Scheduler initialized - checking every minute');

  // Also run immediately to catch any missed jobs during downtime
  checkScheduledAgents();
}

/**
 * Stop the scheduler (for graceful shutdown)
 */
export function stopCronScheduler() {
  if (schedulerJob) {
    schedulerJob.stop();
    schedulerJob = null;
    globalBroadcastFn = null;
    console.log('[CronScheduler] Scheduler stopped');
  }
}

/**
 * Recalculate next_run_at for an agent (after schedule update)
 * @param {number} agentId - Agent ID
 */
export function recalculateAgentNextRun(agentId) {
  const agent = agentsDb.getById(agentId);

  if (!agent || !agent.schedule_enabled || !agent.schedule) {
    agentsDb.updateNextRunAt(agentId, null);
    return null;
  }

  const nextRun = getNextRunTime(agent.schedule);
  agentsDb.updateNextRunAt(agentId, nextRun);
  return nextRun;
}

/**
 * Check if a specific agent is currently running via cron
 * @param {number} agentId - Agent ID
 * @returns {boolean}
 */
export function isAgentRunning(agentId) {
  return activeCronRuns.has(agentId);
}
