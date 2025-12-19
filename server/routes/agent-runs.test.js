import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the database module
vi.mock('../database/db.js', () => ({
  tasksDb: {
    getWithProject: vi.fn()
  },
  agentRunsDb: {
    create: vi.fn(),
    getById: vi.fn(),
    getByTask: vi.fn(),
    updateStatus: vi.fn(),
    linkConversation: vi.fn(),
    delete: vi.fn()
  }
}));

// Mock the agentRunner service
vi.mock('../services/agentRunner.js', () => ({
  startAgentRun: vi.fn(),
  getRunningAgentForTask: vi.fn()
}));

import agentRunsRoutes from './agent-runs.js';
import { tasksDb, agentRunsDb } from '../database/db.js';
import { startAgentRun, getRunningAgentForTask } from '../services/agentRunner.js';

describe('Agent Runs Routes', () => {
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
    // Mock WebSocket server
    app.locals.wss = {
      clients: new Set()
    };
    app.use('/api', agentRunsRoutes);
  });

  describe('GET /api/tasks/:taskId/agent-runs', () => {
    it('should return all agent runs for a task', async () => {
      const mockTaskWithProject = { id: 1, user_id: testUserId, repo_folder_path: '/path' };
      const mockAgentRuns = [
        { id: 1, task_id: 1, agent_type: 'implementation', status: 'completed' },
        { id: 2, task_id: 1, agent_type: 'review', status: 'running' }
      ];
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      agentRunsDb.getByTask.mockReturnValue(mockAgentRuns);

      const response = await request(app).get('/api/tasks/1/agent-runs');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockAgentRuns);
      expect(tasksDb.getWithProject).toHaveBeenCalledWith(1);
      expect(agentRunsDb.getByTask).toHaveBeenCalledWith(1);
    });

    it('should return 400 for invalid task ID', async () => {
      const response = await request(app).get('/api/tasks/invalid/agent-runs');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid task ID');
    });

    it('should return 404 if task not found', async () => {
      tasksDb.getWithProject.mockReturnValue(null);

      const response = await request(app).get('/api/tasks/999/agent-runs');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });

    it('should return 404 if task belongs to different user', async () => {
      tasksDb.getWithProject.mockReturnValue({ id: 1, user_id: 999 });

      const response = await request(app).get('/api/tasks/1/agent-runs');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });

    it('should return empty array when no agent runs exist', async () => {
      tasksDb.getWithProject.mockReturnValue({ id: 1, user_id: testUserId });
      agentRunsDb.getByTask.mockReturnValue([]);

      const response = await request(app).get('/api/tasks/1/agent-runs');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('POST /api/tasks/:taskId/agent-runs', () => {
    const mockTaskWithProject = {
      id: 1,
      user_id: testUserId,
      repo_folder_path: '/path/to/project'
    };

    const mockAgentRun = {
      id: 1,
      task_id: 1,
      agent_type: 'implementation',
      status: 'running',
      conversation_id: 1
    };

    beforeEach(() => {
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      getRunningAgentForTask.mockReturnValue(null);
      startAgentRun.mockResolvedValue({ agentRun: mockAgentRun });
    });

    it('should start a new implementation agent run', async () => {
      const response = await request(app)
        .post('/api/tasks/1/agent-runs')
        .send({ agentType: 'implementation' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockAgentRun);
      expect(startAgentRun).toHaveBeenCalledWith(
        1,
        'implementation',
        expect.objectContaining({ userId: testUserId })
      );
    });

    it('should start a new planification agent run', async () => {
      startAgentRun.mockResolvedValue({
        agentRun: { ...mockAgentRun, agent_type: 'planification' }
      });

      const response = await request(app)
        .post('/api/tasks/1/agent-runs')
        .send({ agentType: 'planification' });

      expect(response.status).toBe(201);
      expect(startAgentRun).toHaveBeenCalledWith(
        1,
        'planification',
        expect.any(Object)
      );
    });

    it('should start a new review agent run', async () => {
      startAgentRun.mockResolvedValue({
        agentRun: { ...mockAgentRun, agent_type: 'review' }
      });

      const response = await request(app)
        .post('/api/tasks/1/agent-runs')
        .send({ agentType: 'review' });

      expect(response.status).toBe(201);
      expect(startAgentRun).toHaveBeenCalledWith(
        1,
        'review',
        expect.any(Object)
      );
    });

    it('should return 400 for invalid task ID', async () => {
      const response = await request(app)
        .post('/api/tasks/invalid/agent-runs')
        .send({ agentType: 'implementation' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid task ID');
    });

    it('should return 400 for missing agentType', async () => {
      const response = await request(app)
        .post('/api/tasks/1/agent-runs')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid agent type');
    });

    it('should return 400 for invalid agentType', async () => {
      const response = await request(app)
        .post('/api/tasks/1/agent-runs')
        .send({ agentType: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid agent type');
      expect(response.body.error).toContain('planification');
      expect(response.body.error).toContain('implementation');
      expect(response.body.error).toContain('review');
    });

    it('should return 404 if task not found', async () => {
      tasksDb.getWithProject.mockReturnValue(null);

      const response = await request(app)
        .post('/api/tasks/999/agent-runs')
        .send({ agentType: 'implementation' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });

    it('should return 404 if task belongs to different user', async () => {
      tasksDb.getWithProject.mockReturnValue({ id: 1, user_id: 999 });

      const response = await request(app)
        .post('/api/tasks/1/agent-runs')
        .send({ agentType: 'implementation' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });

    it('should return 409 if an agent is already running', async () => {
      const runningAgent = {
        id: 1,
        task_id: 1,
        agent_type: 'review',
        status: 'running'
      };
      getRunningAgentForTask.mockReturnValue(runningAgent);

      const response = await request(app)
        .post('/api/tasks/1/agent-runs')
        .send({ agentType: 'implementation' });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('An agent is already running for this task');
      expect(response.body.runningAgent).toEqual(runningAgent);
      expect(startAgentRun).not.toHaveBeenCalled();
    });

    it('should return 500 if startAgentRun throws an error', async () => {
      startAgentRun.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/tasks/1/agent-runs')
        .send({ agentType: 'implementation' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to start agent run');
    });
  });

  describe('GET /api/agent-runs/:id', () => {
    const mockAgentRun = {
      id: 1,
      task_id: 1,
      agent_type: 'implementation',
      status: 'running'
    };

    it('should return agent run by ID', async () => {
      agentRunsDb.getById.mockReturnValue(mockAgentRun);
      tasksDb.getWithProject.mockReturnValue({ id: 1, user_id: testUserId });

      const response = await request(app).get('/api/agent-runs/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockAgentRun);
    });

    it('should return 400 for invalid agent run ID', async () => {
      const response = await request(app).get('/api/agent-runs/invalid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid agent run ID');
    });

    it('should return 404 if agent run not found', async () => {
      agentRunsDb.getById.mockReturnValue(null);

      const response = await request(app).get('/api/agent-runs/999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent run not found');
    });

    it('should return 404 if agent run belongs to different user', async () => {
      agentRunsDb.getById.mockReturnValue(mockAgentRun);
      tasksDb.getWithProject.mockReturnValue({ id: 1, user_id: 999 });

      const response = await request(app).get('/api/agent-runs/1');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent run not found');
    });
  });

  describe('PUT /api/agent-runs/:id/complete', () => {
    const mockAgentRun = {
      id: 1,
      task_id: 1,
      agent_type: 'implementation',
      status: 'running'
    };

    it('should mark agent run as completed', async () => {
      const completedRun = { ...mockAgentRun, status: 'completed' };
      agentRunsDb.getById.mockReturnValue(mockAgentRun);
      tasksDb.getWithProject.mockReturnValue({ id: 1, user_id: testUserId });
      agentRunsDb.updateStatus.mockReturnValue(completedRun);

      const response = await request(app).put('/api/agent-runs/1/complete');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('completed');
      expect(agentRunsDb.updateStatus).toHaveBeenCalledWith(1, 'completed');
    });

    it('should return 400 for invalid agent run ID', async () => {
      const response = await request(app).put('/api/agent-runs/invalid/complete');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid agent run ID');
    });

    it('should return 404 if agent run not found', async () => {
      agentRunsDb.getById.mockReturnValue(null);

      const response = await request(app).put('/api/agent-runs/999/complete');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent run not found');
    });

    it('should return 404 if agent run belongs to different user', async () => {
      agentRunsDb.getById.mockReturnValue(mockAgentRun);
      tasksDb.getWithProject.mockReturnValue({ id: 1, user_id: 999 });

      const response = await request(app).put('/api/agent-runs/1/complete');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent run not found');
    });
  });

  describe('PUT /api/agent-runs/:id/link-conversation', () => {
    const mockAgentRun = {
      id: 1,
      task_id: 1,
      agent_type: 'implementation',
      status: 'running',
      conversation_id: null
    };

    it('should link conversation to agent run', async () => {
      const linkedRun = { ...mockAgentRun, conversation_id: 5 };
      agentRunsDb.getById.mockReturnValue(mockAgentRun);
      tasksDb.getWithProject.mockReturnValue({ id: 1, user_id: testUserId });
      agentRunsDb.linkConversation.mockReturnValue(linkedRun);

      const response = await request(app)
        .put('/api/agent-runs/1/link-conversation')
        .send({ conversationId: 5 });

      expect(response.status).toBe(200);
      expect(response.body.conversation_id).toBe(5);
      expect(agentRunsDb.linkConversation).toHaveBeenCalledWith(1, 5);
    });

    it('should return 400 for invalid agent run ID', async () => {
      const response = await request(app)
        .put('/api/agent-runs/invalid/link-conversation')
        .send({ conversationId: 5 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid agent run ID');
    });

    it('should return 400 if conversationId is missing', async () => {
      const response = await request(app)
        .put('/api/agent-runs/1/link-conversation')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Conversation ID is required');
    });

    it('should return 404 if agent run not found', async () => {
      agentRunsDb.getById.mockReturnValue(null);

      const response = await request(app)
        .put('/api/agent-runs/999/link-conversation')
        .send({ conversationId: 5 });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent run not found');
    });

    it('should return 404 if agent run belongs to different user', async () => {
      agentRunsDb.getById.mockReturnValue(mockAgentRun);
      tasksDb.getWithProject.mockReturnValue({ id: 1, user_id: 999 });

      const response = await request(app)
        .put('/api/agent-runs/1/link-conversation')
        .send({ conversationId: 5 });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent run not found');
    });
  });

  describe('DELETE /api/agent-runs/:id', () => {
    const mockAgentRun = {
      id: 1,
      task_id: 1,
      agent_type: 'implementation',
      status: 'completed'
    };

    it('should delete agent run', async () => {
      agentRunsDb.getById.mockReturnValue(mockAgentRun);
      tasksDb.getWithProject.mockReturnValue({ id: 1, user_id: testUserId });
      agentRunsDb.delete.mockReturnValue(true);

      const response = await request(app).delete('/api/agent-runs/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(agentRunsDb.delete).toHaveBeenCalledWith(1);
    });

    it('should return 400 for invalid agent run ID', async () => {
      const response = await request(app).delete('/api/agent-runs/invalid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid agent run ID');
    });

    it('should return 404 if agent run not found', async () => {
      agentRunsDb.getById.mockReturnValue(null);

      const response = await request(app).delete('/api/agent-runs/999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent run not found');
    });

    it('should return 404 if agent run belongs to different user', async () => {
      agentRunsDb.getById.mockReturnValue(mockAgentRun);
      tasksDb.getWithProject.mockReturnValue({ id: 1, user_id: 999 });

      const response = await request(app).delete('/api/agent-runs/1');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent run not found');
    });

    it('should return 404 if delete returns false', async () => {
      agentRunsDb.getById.mockReturnValue(mockAgentRun);
      tasksDb.getWithProject.mockReturnValue({ id: 1, user_id: testUserId });
      agentRunsDb.delete.mockReturnValue(false);

      const response = await request(app).delete('/api/agent-runs/1');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent run not found');
    });
  });
});
