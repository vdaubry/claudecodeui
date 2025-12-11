import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the database module
vi.mock('../database/db.js', () => ({
  tasksDb: {
    getWithProject: vi.fn()
  },
  conversationsDb: {
    create: vi.fn(),
    getByTask: vi.fn(),
    getById: vi.fn(),
    updateClaudeId: vi.fn(),
    delete: vi.fn()
  }
}));

import conversationsRoutes from './conversations.js';
import { tasksDb, conversationsDb } from '../database/db.js';

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
    app.use('/api/v2', conversationsRoutes);
  });

  describe('GET /api/v2/tasks/:taskId/conversations', () => {
    it('should return all conversations for a task', async () => {
      const mockTaskWithProject = { id: 1, user_id: testUserId };
      const mockConversations = [
        { id: 1, task_id: 1, claude_conversation_id: 'claude-1' },
        { id: 2, task_id: 1, claude_conversation_id: 'claude-2' }
      ];
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      conversationsDb.getByTask.mockReturnValue(mockConversations);

      const response = await request(app).get('/api/v2/tasks/1/conversations');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockConversations);
      expect(tasksDb.getWithProject).toHaveBeenCalledWith(1);
      expect(conversationsDb.getByTask).toHaveBeenCalledWith(1);
    });

    it('should return 404 if task not found', async () => {
      tasksDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app).get('/api/v2/tasks/999/conversations');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });

    it('should return 404 if task belongs to different user', async () => {
      const mockTaskWithProject = { id: 1, user_id: 999 };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);

      const response = await request(app).get('/api/v2/tasks/1/conversations');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });
  });

  describe('POST /api/v2/tasks/:taskId/conversations', () => {
    it('should create a new conversation', async () => {
      const mockTaskWithProject = { id: 1, user_id: testUserId };
      const newConversation = { id: 1, taskId: 1, claudeConversationId: null };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      conversationsDb.create.mockReturnValue(newConversation);

      const response = await request(app)
        .post('/api/v2/tasks/1/conversations')
        .send({});

      expect(response.status).toBe(201);
      expect(response.body).toEqual(newConversation);
      expect(conversationsDb.create).toHaveBeenCalledWith(1);
    });

    it('should return 404 if task not found', async () => {
      tasksDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app)
        .post('/api/v2/tasks/999/conversations')
        .send({});

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });
  });

  describe('GET /api/v2/conversations/:id', () => {
    it('should return a conversation by ID', async () => {
      const mockConversation = { id: 1, task_id: 1, claude_conversation_id: 'claude-1' };
      const mockTaskWithProject = { id: 1, user_id: testUserId };
      conversationsDb.getById.mockReturnValue(mockConversation);
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);

      const response = await request(app).get('/api/v2/conversations/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockConversation);
    });

    it('should return 404 if conversation not found', async () => {
      conversationsDb.getById.mockReturnValue(undefined);

      const response = await request(app).get('/api/v2/conversations/999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Conversation not found');
    });

    it('should return 404 if task belongs to different user', async () => {
      const mockConversation = { id: 1, task_id: 1 };
      const mockTaskWithProject = { id: 1, user_id: 999 };
      conversationsDb.getById.mockReturnValue(mockConversation);
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);

      const response = await request(app).get('/api/v2/conversations/1');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Conversation not found');
    });
  });

  describe('DELETE /api/v2/conversations/:id', () => {
    it('should delete a conversation', async () => {
      const mockConversation = { id: 1, task_id: 1 };
      const mockTaskWithProject = { id: 1, user_id: testUserId };
      conversationsDb.getById.mockReturnValue(mockConversation);
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      conversationsDb.delete.mockReturnValue(true);

      const response = await request(app).delete('/api/v2/conversations/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(conversationsDb.delete).toHaveBeenCalledWith(1);
    });

    it('should return 404 if conversation not found', async () => {
      conversationsDb.getById.mockReturnValue(undefined);

      const response = await request(app).delete('/api/v2/conversations/999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Conversation not found');
    });
  });

  describe('PATCH /api/v2/conversations/:id/claude-id', () => {
    it('should update Claude conversation ID', async () => {
      const mockConversation = { id: 1, task_id: 1 };
      const mockTaskWithProject = { id: 1, user_id: testUserId };
      conversationsDb.getById.mockReturnValue(mockConversation);
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      conversationsDb.updateClaudeId.mockReturnValue(true);

      const response = await request(app)
        .patch('/api/v2/conversations/1/claude-id')
        .send({ claudeConversationId: 'claude-session-123' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(conversationsDb.updateClaudeId).toHaveBeenCalledWith(1, 'claude-session-123');
    });

    it('should return 400 if claudeConversationId is missing', async () => {
      const response = await request(app)
        .patch('/api/v2/conversations/1/claude-id')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Claude conversation ID is required');
    });

    it('should return 404 if conversation not found', async () => {
      conversationsDb.getById.mockReturnValue(undefined);

      const response = await request(app)
        .patch('/api/v2/conversations/999/claude-id')
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
        .patch('/api/v2/conversations/1/claude-id')
        .send({ claudeConversationId: 'claude-session-123' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Conversation not found');
    });
  });
});
