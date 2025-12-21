import express from 'express';
import { WebSocket } from 'ws';
import { tasksDb, conversationsDb, projectsDb, agentsDb } from '../database/db.js';
import { getSessionMessages, getSessionTokenUsage } from '../services/sessions.js';
import { updateUserBadge } from '../services/notifications.js';
import { startConversation } from '../services/conversationAdapter.js';
import { buildContextPrompt } from '../services/documentation.js';

const router = express.Router();

// Broadcast message to all WebSocket clients
function broadcastToAll(req, message) {
  const wss = req.app.locals.wss;
  if (!wss) return;

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

/**
 * GET /api/tasks/:taskId/conversations
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
 * POST /api/tasks/:taskId/conversations
 * Create a new conversation for a task
 *
 * If `message` is provided in the body, creates the conversation AND starts
 * the Claude session synchronously, returning the real claude_conversation_id.
 * This is the preferred method for new conversations (modal-first flow).
 *
 * Body (optional):
 * - message: string - First message to send to Claude
 * - projectPath: string - Project working directory (optional, uses task's project)
 * - permissionMode: string - Permission mode (default: 'bypassPermissions')
 */
router.post('/tasks/:taskId/conversations', async (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = parseInt(req.params.taskId, 10);
    const { message, projectPath, permissionMode } = req.body || {};

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

    // Create conversation record
    const conversation = conversationsDb.create(taskId);

    // Set task status to 'in_progress' if it's currently 'pending'
    if (taskWithProject.status === 'pending') {
      tasksDb.updateStatus(taskId, 'in_progress');

      // Send badge update notification (fire and forget)
      updateUserBadge(userId).catch(err => {
        console.error('[Notifications] Failed to update badge on conversation creation:', err);
      });
    }

    // If no message provided, return immediately (backward compatible)
    if (!message) {
      return res.status(201).json(conversation);
    }

    // Message provided - create session synchronously via adapter
    console.log('[REST] Creating conversation with first message for task:', taskId);

    try {
      // Build context prompt from project.md and task markdown
      const contextPrompt = buildContextPrompt(taskWithProject.repo_folder_path, taskId);

      // Create broadcast function for WebSocket
      const wss = req.app.locals.wss;
      const broadcastFn = (convId, msg) => {
        if (!wss) return;
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(msg));
          }
        });
      };

      // Use adapter to start conversation (handles all lifecycle events)
      const { conversationId: convId, claudeSessionId } = await startConversation(taskId, message.trim(), {
        broadcastFn,
        userId,
        customSystemPrompt: contextPrompt,
        permissionMode: permissionMode || 'bypassPermissions',
        conversationId: conversation.id
      });

      // Return complete conversation with real session ID
      return res.status(201).json({
        ...conversation,
        claude_conversation_id: claudeSessionId
      });

    } catch (sessionError) {
      console.error('[REST] Failed to create session:', sessionError);
      // Clean up the conversation record since session creation failed
      conversationsDb.delete(conversation.id);
      return res.status(500).json({ error: 'Session creation failed: ' + sessionError.message });
    }

  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

/**
 * GET /api/conversations/:id
 * Get a specific conversation by ID, including token usage metadata
 */
router.get('/conversations/:id', async (req, res) => {
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

    // Determine if this is a task or agent conversation and verify ownership
    let projectId = null;
    let repoPath = null;

    if (conversation.task_id) {
      // Task conversation - verify via task ownership
      const taskWithProject = tasksDb.getWithProject(conversation.task_id);
      if (!taskWithProject || taskWithProject.user_id !== userId) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      projectId = taskWithProject.project_id;
    } else if (conversation.agent_id) {
      // Agent conversation - verify via agent ownership
      const agentWithProject = agentsDb.getWithProject(conversation.agent_id);
      if (!agentWithProject || agentWithProject.user_id !== userId) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      projectId = agentWithProject.project_id;
    } else {
      // Neither task nor agent - orphan conversation
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Extract token usage metadata if conversation has a Claude session
    let metadata = null;
    if (conversation.claude_conversation_id && projectId) {
      const project = projectsDb.getById(projectId, userId);
      if (project) {
        repoPath = project.repo_folder_path;
        const tokenUsage = await getSessionTokenUsage(
          conversation.claude_conversation_id,
          project.repo_folder_path
        );
        metadata = { tokenUsage };
      }
    }

    res.json({
      ...conversation,
      metadata
    });
  } catch (error) {
    console.error('Error getting conversation:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

/**
 * DELETE /api/conversations/:id
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

    // Verify ownership based on conversation type (task or agent)
    if (conversation.task_id) {
      const taskWithProject = tasksDb.getWithProject(conversation.task_id);
      if (!taskWithProject || taskWithProject.user_id !== userId) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    } else if (conversation.agent_id) {
      const agentWithProject = agentsDb.getWithProject(conversation.agent_id);
      if (!agentWithProject || agentWithProject.user_id !== userId) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    } else {
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
 * PATCH /api/conversations/:id/claude-id
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

    // Verify ownership based on conversation type (task or agent)
    if (conversation.task_id) {
      const taskWithProject = tasksDb.getWithProject(conversation.task_id);
      if (!taskWithProject || taskWithProject.user_id !== userId) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    } else if (conversation.agent_id) {
      const agentWithProject = agentsDb.getWithProject(conversation.agent_id);
      if (!agentWithProject || agentWithProject.user_id !== userId) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    } else {
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

/**
 * GET /api/conversations/:id/messages
 * Get messages for a conversation from Claude's JSONL session files
 */
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = parseInt(req.params.id, 10);
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;
    const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;

    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    const conversation = conversationsDb.getById(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Verify ownership and get project ID based on conversation type
    let projectId = null;
    if (conversation.task_id) {
      const taskWithProject = tasksDb.getWithProject(conversation.task_id);
      if (!taskWithProject || taskWithProject.user_id !== userId) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      projectId = taskWithProject.project_id;
    } else if (conversation.agent_id) {
      const agentWithProject = agentsDb.getWithProject(conversation.agent_id);
      if (!agentWithProject || agentWithProject.user_id !== userId) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      projectId = agentWithProject.project_id;
    } else {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check if conversation has a Claude session ID
    if (!conversation.claude_conversation_id) {
      return res.json({ messages: [], total: 0, hasMore: false });
    }

    // Get the project to find the repo folder path
    const project = projectsDb.getById(projectId, userId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Read messages from Claude's JSONL files
    const result = await getSessionMessages(
      conversation.claude_conversation_id,
      project.repo_folder_path,
      limit,
      offset
    );

    res.json(result);
  } catch (error) {
    console.error('Error getting conversation messages:', error);
    res.status(500).json({ error: 'Failed to get conversation messages' });
  }
});

export default router;
