import express from 'express';
import { tasksDb, conversationsDb } from '../database/db.js';

const router = express.Router();

/**
 * GET /api/v2/tasks/:taskId/conversations
 * List all conversations for a task
 */
router.get('/tasks/:taskId/conversations', (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = parseInt(req.params.taskId, 10);

    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    // Get task with project info to verify ownership
    const taskWithProject = tasksDb.getWithProject(taskId);

    if (!taskWithProject) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Verify the project belongs to the user
    if (taskWithProject.user_id !== userId) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const conversations = conversationsDb.getByTask(taskId);
    res.json(conversations);
  } catch (error) {
    console.error('Error listing conversations:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

/**
 * POST /api/v2/tasks/:taskId/conversations
 * Create a new conversation for a task
 */
router.post('/tasks/:taskId/conversations', (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = parseInt(req.params.taskId, 10);

    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    // Get task with project info to verify ownership
    const taskWithProject = tasksDb.getWithProject(taskId);

    if (!taskWithProject) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Verify the project belongs to the user
    if (taskWithProject.user_id !== userId) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const conversation = conversationsDb.create(taskId);
    res.status(201).json(conversation);
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

/**
 * GET /api/v2/conversations/:id
 * Get a specific conversation by ID
 */
router.get('/conversations/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = parseInt(req.params.id, 10);

    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    const conversation = conversationsDb.getById(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get task with project info to verify ownership
    const taskWithProject = tasksDb.getWithProject(conversation.task_id);

    if (!taskWithProject || taskWithProject.user_id !== userId) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json(conversation);
  } catch (error) {
    console.error('Error getting conversation:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

/**
 * DELETE /api/v2/conversations/:id
 * Delete a conversation
 */
router.delete('/conversations/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = parseInt(req.params.id, 10);

    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    const conversation = conversationsDb.getById(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get task with project info to verify ownership
    const taskWithProject = tasksDb.getWithProject(conversation.task_id);

    if (!taskWithProject || taskWithProject.user_id !== userId) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const deleted = conversationsDb.delete(conversationId);

    if (!deleted) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Note: We do NOT delete Claude's conversation files in ~/.claude/
    // They are orphaned but harmless (per design decision #15)

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

/**
 * PATCH /api/v2/conversations/:id/claude-id
 * Update the Claude conversation ID (called after SDK returns session_id)
 */
router.patch('/conversations/:id/claude-id', (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = parseInt(req.params.id, 10);

    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    const { claudeConversationId } = req.body;

    if (!claudeConversationId) {
      return res.status(400).json({ error: 'Claude conversation ID is required' });
    }

    const conversation = conversationsDb.getById(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get task with project info to verify ownership
    const taskWithProject = tasksDb.getWithProject(conversation.task_id);

    if (!taskWithProject || taskWithProject.user_id !== userId) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const updated = conversationsDb.updateClaudeId(conversationId, claudeConversationId);

    if (!updated) {
      return res.status(500).json({ error: 'Failed to update Claude conversation ID' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating Claude conversation ID:', error);
    res.status(500).json({ error: 'Failed to update Claude conversation ID' });
  }
});

export default router;
