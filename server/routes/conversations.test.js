import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the database module
vi.mock('../database/db.js', () => ({
  tasksDb: {
    getWithProject: vi.fn(),
    updateStatus: vi.fn()
  },
  conversationsDb: {
    create: vi.fn(),
    getByTask: vi.fn(),
    getById: vi.fn(),
    updateClaudeId: vi.fn(),
    delete: vi.fn()
  },
  projectsDb: {
    getById: vi.fn()
  }
}));

// Mock the sessions service
vi.mock('../services/sessions.js', () => ({
  getSessionMessages: vi.fn()
}));

// Mock the conversationAdapter service
vi.mock('../services/conversationAdapter.js', () => ({
  startConversation: vi.fn()
}));

// Mock the documentation service
vi.mock('../services/documentation.js', () => ({
  buildContextPrompt: vi.fn()
}));

// Mock the notifications service
vi.mock('../services/notifications.js', () => ({
  updateUserBadge: vi.fn().mockResolvedValue()
}));

import conversationsRoutes from './conversations.js';
import { tasksDb, conversationsDb, projectsDb } from '../database/db.js';
import { getSessionMessages } from '../services/sessions.js';
import { startConversation } from '../services/conversationAdapter.js';
import { buildContextPrompt } from '../services/documentation.js';

describe('Conversations Routes - Phase 3', () => {
  let app;
  const testUserId = 1;

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: testUserId, username: 'testuser' };
      next();
    });
    app.use('/api', conversationsRoutes);
  });

  describe('GET /api/tasks/:taskId/conversations', () => {
    it('should return all conversations for a task', async () => {
      const mockTaskWithProject = { id: 1, user_id: testUserId };
      const mockConversations = [
        { id: 1, task_id: 1, claude_conversation_id: 'claude-1' },
        { id: 2, task_id: 1, claude_conversation_id: 'claude-2' }
      ];
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      conversationsDb.getByTask.mockReturnValue(mockConversations);

      const response = await request(app).get('/api/tasks/1/conversations');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockConversations);
      expect(tasksDb.getWithProject).toHaveBeenCalledWith(1);
      expect(conversationsDb.getByTask).toHaveBeenCalledWith(1);
    });

    it('should return 404 if task not found', async () => {
      tasksDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app).get('/api/tasks/999/conversations');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });

    it('should return 404 if task belongs to different user', async () => {
      const mockTaskWithProject = { id: 1, user_id: 999 };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);

      const response = await request(app).get('/api/tasks/1/conversations');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });
  });

  describe('POST /api/tasks/:taskId/conversations', () => {
    it('should create a new conversation', async () => {
      const mockTaskWithProject = { id: 1, user_id: testUserId, status: 'in_progress' };
      const newConversation = { id: 1, taskId: 1, claudeConversationId: null };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      conversationsDb.create.mockReturnValue(newConversation);

      const response = await request(app)
        .post('/api/tasks/1/conversations')
        .send({});

      expect(response.status).toBe(201);
      expect(response.body).toEqual(newConversation);
      expect(conversationsDb.create).toHaveBeenCalledWith(1);
    });

    it('should return 404 if task not found', async () => {
      tasksDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app)
        .post('/api/tasks/999/conversations')
        .send({});

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });

    it('should set task status to in_progress when pending', async () => {
      const mockTaskWithProject = { id: 1, user_id: testUserId, status: 'pending' };
      const newConversation = { id: 1, taskId: 1, claudeConversationId: null };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      conversationsDb.create.mockReturnValue(newConversation);
      tasksDb.updateStatus.mockReturnValue({ ...mockTaskWithProject, status: 'in_progress' });

      const response = await request(app)
        .post('/api/tasks/1/conversations')
        .send({});

      expect(response.status).toBe(201);
      expect(tasksDb.updateStatus).toHaveBeenCalledWith(1, 'in_progress');
    });

    it('should not change status if already in_progress', async () => {
      const mockTaskWithProject = { id: 1, user_id: testUserId, status: 'in_progress' };
      const newConversation = { id: 1, taskId: 1, claudeConversationId: null };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      conversationsDb.create.mockReturnValue(newConversation);

      const response = await request(app)
        .post('/api/tasks/1/conversations')
        .send({});

      expect(response.status).toBe(201);
      expect(tasksDb.updateStatus).not.toHaveBeenCalled();
    });

    it('should not change status if completed', async () => {
      const mockTaskWithProject = { id: 1, user_id: testUserId, status: 'completed' };
      const newConversation = { id: 1, taskId: 1, claudeConversationId: null };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      conversationsDb.create.mockReturnValue(newConversation);

      const response = await request(app)
        .post('/api/tasks/1/conversations')
        .send({});

      expect(response.status).toBe(201);
      expect(tasksDb.updateStatus).not.toHaveBeenCalled();
    });

    // Tests for the "with message" flow (modal-first conversation creation)
    describe('with message parameter (modal-first flow)', () => {
      it('should create conversation and start Claude session when message is provided', async () => {
        const mockTaskWithProject = {
          id: 1,
          user_id: testUserId,
          status: 'pending',
          project_id: 1,
          repo_folder_path: '/path/to/repo'
        };
        const newConversation = { id: 5, task_id: 1, claude_conversation_id: null };

        tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
        conversationsDb.create.mockReturnValue(newConversation);
        conversationsDb.getById.mockReturnValue({ ...newConversation, claude_conversation_id: 'real-claude-session-id' });
        buildContextPrompt.mockReturnValue('Task context prompt');
        startConversation.mockResolvedValue({
          conversationId: 5,
          claudeSessionId: 'real-claude-session-id'
        });

        const response = await request(app)
          .post('/api/tasks/1/conversations')
          .send({
            message: 'Hello Claude, help me with this task',
            permissionMode: 'bypassPermissions'
          });

        expect(response.status).toBe(201);
        expect(response.body.claude_conversation_id).toBe('real-claude-session-id');
        expect(startConversation).toHaveBeenCalledWith(
          1, // taskId
          'Hello Claude, help me with this task', // message
          expect.objectContaining({
            permissionMode: 'bypassPermissions',
            customSystemPrompt: 'Task context prompt'
          })
        );
      });

      it('should build context prompt from project and task docs', async () => {
        const mockTaskWithProject = {
          id: 1,
          user_id: testUserId,
          status: 'in_progress',
          project_id: 1,
          repo_folder_path: '/path/to/repo'
        };
        const newConversation = { id: 5, task_id: 1, claude_conversation_id: null };

        tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
        conversationsDb.create.mockReturnValue(newConversation);
        conversationsDb.getById.mockReturnValue({ ...newConversation, claude_conversation_id: 'session-123' });
        buildContextPrompt.mockReturnValue('# Task Context\nThis is the task context.');
        startConversation.mockResolvedValue({
          conversationId: 5,
          claudeSessionId: 'session-123'
        });

        await request(app)
          .post('/api/tasks/1/conversations')
          .send({ message: 'Test message' });

        expect(buildContextPrompt).toHaveBeenCalledWith('/path/to/repo', 1);
      });

      it('should use default permissionMode when not provided', async () => {
        const mockTaskWithProject = {
          id: 1,
          user_id: testUserId,
          status: 'in_progress',
          repo_folder_path: '/path/to/repo'
        };
        const newConversation = { id: 5, task_id: 1, claude_conversation_id: null };

        tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
        conversationsDb.create.mockReturnValue(newConversation);
        conversationsDb.getById.mockReturnValue({ ...newConversation, claude_conversation_id: 'session-123' });
        startConversation.mockResolvedValue({
          conversationId: 5,
          claudeSessionId: 'session-123'
        });

        const response = await request(app)
          .post('/api/tasks/1/conversations')
          .send({ message: 'Test message' });

        expect(response.status).toBe(201);
        expect(startConversation).toHaveBeenCalledWith(
          1,
          'Test message',
          expect.objectContaining({
            permissionMode: 'bypassPermissions'
          })
        );
      });

      it('should return 500 if startConversation fails', async () => {
        const mockTaskWithProject = {
          id: 1,
          user_id: testUserId,
          status: 'in_progress',
          repo_folder_path: '/path/to/repo'
        };
        const newConversation = { id: 5, task_id: 1, claude_conversation_id: null };

        tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
        conversationsDb.create.mockReturnValue(newConversation);
        startConversation.mockRejectedValue(new Error('Claude SDK error'));

        const response = await request(app)
          .post('/api/tasks/1/conversations')
          .send({ message: 'Test message' });

        expect(response.status).toBe(500);
        expect(response.body.error).toContain('Session creation failed');
      });

      it('should delete conversation if session creation fails', async () => {
        const mockTaskWithProject = {
          id: 1,
          user_id: testUserId,
          status: 'in_progress',
          repo_folder_path: '/path/to/repo'
        };
        const newConversation = { id: 5, task_id: 1, claude_conversation_id: null };

        tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
        conversationsDb.create.mockReturnValue(newConversation);
        conversationsDb.delete.mockReturnValue(true);
        startConversation.mockRejectedValue(new Error('Claude SDK error'));

        await request(app)
          .post('/api/tasks/1/conversations')
          .send({ message: 'Test message' });

        // Conversation should be cleaned up on failure
        expect(conversationsDb.delete).toHaveBeenCalledWith(5);
      });

      it('should trim message whitespace before sending to Claude', async () => {
        const mockTaskWithProject = {
          id: 1,
          user_id: testUserId,
          status: 'in_progress',
          repo_folder_path: '/path/to/repo'
        };
        const newConversation = { id: 5, task_id: 1, claude_conversation_id: null };

        tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
        conversationsDb.create.mockReturnValue(newConversation);
        conversationsDb.getById.mockReturnValue({ ...newConversation, claude_conversation_id: 'session-123' });
        startConversation.mockResolvedValue({
          conversationId: 5,
          claudeSessionId: 'session-123'
        });

        const response = await request(app)
          .post('/api/tasks/1/conversations')
          .send({ message: '  Hello with whitespace  ' });

        expect(response.status).toBe(201);
        expect(startConversation).toHaveBeenCalledWith(
          1,
          'Hello with whitespace', // Trimmed
          expect.any(Object)
        );
      });

      it('should update task status to in_progress when pending and message provided', async () => {
        const mockTaskWithProject = {
          id: 1,
          user_id: testUserId,
          status: 'pending',
          repo_folder_path: '/path/to/repo'
        };
        const newConversation = { id: 5, task_id: 1, claude_conversation_id: null };

        tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
        tasksDb.updateStatus.mockReturnValue({ ...mockTaskWithProject, status: 'in_progress' });
        conversationsDb.create.mockReturnValue(newConversation);
        conversationsDb.getById.mockReturnValue({ ...newConversation, claude_conversation_id: 'session-123' });
        startConversation.mockResolvedValue({
          conversationId: 5,
          claudeSessionId: 'session-123'
        });

        const response = await request(app)
          .post('/api/tasks/1/conversations')
          .send({ message: 'Start working on this task' });

        expect(response.status).toBe(201);
        expect(tasksDb.updateStatus).toHaveBeenCalledWith(1, 'in_progress');
      });
    });
  });

  describe('GET /api/conversations/:id', () => {
    it('should return a conversation by ID', async () => {
      const mockConversation = { id: 1, task_id: 1, claude_conversation_id: 'claude-1', metadata: null };
      const mockTaskWithProject = { id: 1, user_id: testUserId };
      conversationsDb.getById.mockReturnValue(mockConversation);
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);

      const response = await request(app).get('/api/conversations/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockConversation);
    });

    it('should return 404 if conversation not found', async () => {
      conversationsDb.getById.mockReturnValue(undefined);

      const response = await request(app).get('/api/conversations/999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Conversation not found');
    });

    it('should return 404 if task belongs to different user', async () => {
      const mockConversation = { id: 1, task_id: 1 };
      const mockTaskWithProject = { id: 1, user_id: 999 };
      conversationsDb.getById.mockReturnValue(mockConversation);
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);

      const response = await request(app).get('/api/conversations/1');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Conversation not found');
    });
  });

  describe('DELETE /api/conversations/:id', () => {
    it('should delete a conversation', async () => {
      const mockConversation = { id: 1, task_id: 1 };
      const mockTaskWithProject = { id: 1, user_id: testUserId };
      conversationsDb.getById.mockReturnValue(mockConversation);
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      conversationsDb.delete.mockReturnValue(true);

      const response = await request(app).delete('/api/conversations/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(conversationsDb.delete).toHaveBeenCalledWith(1);
    });

    it('should return 404 if conversation not found', async () => {
      conversationsDb.getById.mockReturnValue(undefined);

      const response = await request(app).delete('/api/conversations/999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Conversation not found');
    });
  });

  describe('PATCH /api/conversations/:id/claude-id', () => {
    it('should update Claude conversation ID', async () => {
      const mockConversation = { id: 1, task_id: 1 };
      const mockTaskWithProject = { id: 1, user_id: testUserId };
      conversationsDb.getById.mockReturnValue(mockConversation);
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      conversationsDb.updateClaudeId.mockReturnValue(true);

      const response = await request(app)
        .patch('/api/conversations/1/claude-id')
        .send({ claudeConversationId: 'claude-session-123' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(conversationsDb.updateClaudeId).toHaveBeenCalledWith(1, 'claude-session-123');
    });

    it('should return 400 if claudeConversationId is missing', async () => {
      const response = await request(app)
        .patch('/api/conversations/1/claude-id')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Claude conversation ID is required');
    });

    it('should return 404 if conversation not found', async () => {
      conversationsDb.getById.mockReturnValue(undefined);

      const response = await request(app)
        .patch('/api/conversations/999/claude-id')
        .send({ claudeConversationId: 'claude-session-123' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Conversation not found');
    });

    it('should return 404 if task belongs to different user', async () => {
      const mockConversation = { id: 1, task_id: 1 };
      const mockTaskWithProject = { id: 1, user_id: 999 };
      conversationsDb.getById.mockReturnValue(mockConversation);
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);

      const response = await request(app)
        .patch('/api/conversations/1/claude-id')
        .send({ claudeConversationId: 'claude-session-123' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Conversation not found');
    });
  });

  describe('GET /api/conversations/:id/messages', () => {
    it('should return messages for a conversation', async () => {
      const mockConversation = { id: 1, task_id: 1, claude_conversation_id: 'claude-session-123' };
      const mockTaskWithProject = { id: 1, project_id: 1, user_id: testUserId };
      const mockProject = { id: 1, user_id: testUserId, repo_folder_path: '/path/to/project' };
      const mockMessages = {
        messages: [
          { type: 'user', message: { content: 'Hello' }, timestamp: '2024-01-01T00:00:00Z' },
          { type: 'assistant', message: { content: 'Hi there!' }, timestamp: '2024-01-01T00:00:01Z' }
        ],
        total: 2,
        hasMore: false
      };

      conversationsDb.getById.mockReturnValue(mockConversation);
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      projectsDb.getById.mockReturnValue(mockProject);
      getSessionMessages.mockResolvedValue(mockMessages);

      const response = await request(app).get('/api/conversations/1/messages');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockMessages);
      expect(getSessionMessages).toHaveBeenCalledWith('claude-session-123', '/path/to/project', null, 0);
    });

    it('should return empty messages when no claude_conversation_id', async () => {
      const mockConversation = { id: 1, task_id: 1, claude_conversation_id: null };
      const mockTaskWithProject = { id: 1, project_id: 1, user_id: testUserId };

      conversationsDb.getById.mockReturnValue(mockConversation);
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);

      const response = await request(app).get('/api/conversations/1/messages');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ messages: [], total: 0, hasMore: false });
      expect(getSessionMessages).not.toHaveBeenCalled();
    });

    it('should pass limit and offset query params', async () => {
      const mockConversation = { id: 1, task_id: 1, claude_conversation_id: 'claude-session-123' };
      const mockTaskWithProject = { id: 1, project_id: 1, user_id: testUserId };
      const mockProject = { id: 1, user_id: testUserId, repo_folder_path: '/path/to/project' };
      const mockMessages = { messages: [], total: 0, hasMore: false };

      conversationsDb.getById.mockReturnValue(mockConversation);
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      projectsDb.getById.mockReturnValue(mockProject);
      getSessionMessages.mockResolvedValue(mockMessages);

      const response = await request(app).get('/api/conversations/1/messages?limit=50&offset=10');

      expect(response.status).toBe(200);
      expect(getSessionMessages).toHaveBeenCalledWith('claude-session-123', '/path/to/project', 50, 10);
    });

    it('should return 404 if conversation not found', async () => {
      conversationsDb.getById.mockReturnValue(undefined);

      const response = await request(app).get('/api/conversations/999/messages');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Conversation not found');
    });

    it('should return 404 if task belongs to different user', async () => {
      const mockConversation = { id: 1, task_id: 1 };
      const mockTaskWithProject = { id: 1, user_id: 999 };
      conversationsDb.getById.mockReturnValue(mockConversation);
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);

      const response = await request(app).get('/api/conversations/1/messages');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Conversation not found');
    });

    it('should return 404 if project not found', async () => {
      const mockConversation = { id: 1, task_id: 1, claude_conversation_id: 'claude-session-123' };
      const mockTaskWithProject = { id: 1, project_id: 1, user_id: testUserId };
      conversationsDb.getById.mockReturnValue(mockConversation);
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      projectsDb.getById.mockReturnValue(undefined);

      const response = await request(app).get('/api/conversations/1/messages');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });
  });
});
