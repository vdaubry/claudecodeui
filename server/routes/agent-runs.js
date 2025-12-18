import express from 'express';
import { tasksDb, agentRunsDb } from '../database/db.js';

const router = express.Router();

/**
 * GET /api/tasks/:taskId/agent-runs
 * List all agent runs for a task
 */
router.get('/tasks/:taskId/agent-runs', (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = parseInt(req.params.taskId, 10);

    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    // Verify task ownership through project
    const taskWithProject = tasksDb.getWithProject(taskId);
    if (!taskWithProject || taskWithProject.user_id !== userId) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const agentRuns = agentRunsDb.getByTask(taskId);
    res.json(agentRuns);
  } catch (error) {
    console.error('Error listing agent runs:', error);
    res.status(500).json({ error: 'Failed to list agent runs' });
  }
});

/**
 * POST /api/tasks/:taskId/agent-runs
 * Create a new agent run for a task
 * Body: { agentType: 'planification' | 'implementation' | 'review' }
 */
router.post('/tasks/:taskId/agent-runs', (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = parseInt(req.params.taskId, 10);
    const { agentType } = req.body;

    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    const validAgentTypes = ['planification', 'implementation', 'review'];
    if (!agentType || !validAgentTypes.includes(agentType)) {
      return res.status(400).json({
        error: `Invalid agent type. Must be one of: ${validAgentTypes.join(', ')}`
      });
    }

    // Verify task ownership through project
    const taskWithProject = tasksDb.getWithProject(taskId);
    if (!taskWithProject || taskWithProject.user_id !== userId) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check if an agent run of this type already exists and is not completed/failed
    const existing = agentRunsDb.getByTaskAndType(taskId, agentType);
    if (existing && (existing.status === 'running' || existing.status === 'pending')) {
      // Return existing running/pending agent run
      return res.json(existing);
    }

    // Create new agent run
    const agentRun = agentRunsDb.create(taskId, agentType, null);
    res.status(201).json(agentRun);
  } catch (error) {
    console.error('Error creating agent run:', error);
    res.status(500).json({ error: 'Failed to create agent run' });
  }
});

/**
 * GET /api/agent-runs/:id
 * Get a specific agent run by ID
 */
router.get('/agent-runs/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const agentRunId = parseInt(req.params.id, 10);

    if (isNaN(agentRunId)) {
      return res.status(400).json({ error: 'Invalid agent run ID' });
    }

    const agentRun = agentRunsDb.getById(agentRunId);
    if (!agentRun) {
      return res.status(404).json({ error: 'Agent run not found' });
    }

    // Verify ownership through task -> project
    const taskWithProject = tasksDb.getWithProject(agentRun.task_id);
    if (!taskWithProject || taskWithProject.user_id !== userId) {
      return res.status(404).json({ error: 'Agent run not found' });
    }

    res.json(agentRun);
  } catch (error) {
    console.error('Error getting agent run:', error);
    res.status(500).json({ error: 'Failed to get agent run' });
  }
});

/**
 * PUT /api/agent-runs/:id/complete
 * Mark an agent run as completed
 */
router.put('/agent-runs/:id/complete', (req, res) => {
  try {
    const userId = req.user.id;
    const agentRunId = parseInt(req.params.id, 10);

    if (isNaN(agentRunId)) {
      return res.status(400).json({ error: 'Invalid agent run ID' });
    }

    const agentRun = agentRunsDb.getById(agentRunId);
    if (!agentRun) {
      return res.status(404).json({ error: 'Agent run not found' });
    }

    // Verify ownership through task -> project
    const taskWithProject = tasksDb.getWithProject(agentRun.task_id);
    if (!taskWithProject || taskWithProject.user_id !== userId) {
      return res.status(404).json({ error: 'Agent run not found' });
    }

    const updated = agentRunsDb.updateStatus(agentRunId, 'completed');
    res.json(updated);
  } catch (error) {
    console.error('Error completing agent run:', error);
    res.status(500).json({ error: 'Failed to complete agent run' });
  }
});

/**
 * PUT /api/agent-runs/:id/link-conversation
 * Link a conversation to an agent run
 * Body: { conversationId: number }
 */
router.put('/agent-runs/:id/link-conversation', (req, res) => {
  try {
    const userId = req.user.id;
    const agentRunId = parseInt(req.params.id, 10);
    const { conversationId } = req.body;

    if (isNaN(agentRunId)) {
      return res.status(400).json({ error: 'Invalid agent run ID' });
    }

    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID is required' });
    }

    const agentRun = agentRunsDb.getById(agentRunId);
    if (!agentRun) {
      return res.status(404).json({ error: 'Agent run not found' });
    }

    // Verify ownership through task -> project
    const taskWithProject = tasksDb.getWithProject(agentRun.task_id);
    if (!taskWithProject || taskWithProject.user_id !== userId) {
      return res.status(404).json({ error: 'Agent run not found' });
    }

    const updated = agentRunsDb.linkConversation(agentRunId, conversationId);
    res.json(updated);
  } catch (error) {
    console.error('Error linking conversation to agent run:', error);
    res.status(500).json({ error: 'Failed to link conversation' });
  }
});

/**
 * DELETE /api/agent-runs/:id
 * Delete an agent run
 */
router.delete('/agent-runs/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const agentRunId = parseInt(req.params.id, 10);

    if (isNaN(agentRunId)) {
      return res.status(400).json({ error: 'Invalid agent run ID' });
    }

    const agentRun = agentRunsDb.getById(agentRunId);
    if (!agentRun) {
      return res.status(404).json({ error: 'Agent run not found' });
    }

    // Verify ownership through task -> project
    const taskWithProject = tasksDb.getWithProject(agentRun.task_id);
    if (!taskWithProject || taskWithProject.user_id !== userId) {
      return res.status(404).json({ error: 'Agent run not found' });
    }

    const deleted = agentRunsDb.delete(agentRunId);
    if (!deleted) {
      return res.status(404).json({ error: 'Agent run not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting agent run:', error);
    res.status(500).json({ error: 'Failed to delete agent run' });
  }
});

export default router;
