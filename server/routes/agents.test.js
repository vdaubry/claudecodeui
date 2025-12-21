import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the database module
vi.mock('../database/db.js', () => ({
  projectsDb: {
    getById: vi.fn()
  },
  agentsDb: {
    getByProject: vi.fn(),
    create: vi.fn(),
    getById: vi.fn(),
    getWithProject: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  conversationsDb: {
    getByAgent: vi.fn(),
    createForAgent: vi.fn()
  }
}));

// Mock the documentation service
vi.mock('../services/documentation.js', () => ({
  readAgentPrompt: vi.fn(),
  writeAgentPrompt: vi.fn(),
  deleteAgentPrompt: vi.fn(),
  listAgentInputFiles: vi.fn().mockReturnValue([]),
  saveAgentInputFile: vi.fn(),
  deleteAgentInputFile: vi.fn(),
  ATTACHMENT_CONFIG: {
    maxSizeBytes: 5 * 1024 * 1024,
    allowedExtensions: ['.txt', '.md', '.json', '.yaml', '.yml', '.csv', '.png', '.jpg', '.jpeg', '.gif', '.pdf', '.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.css', '.scss', '.html', '.xml', '.sh', '.bash', '.sql']
  }
}));

import agentsRoutes from './agents.js';
import { projectsDb, agentsDb, conversationsDb } from '../database/db.js';
import { readAgentPrompt, writeAgentPrompt, deleteAgentPrompt, listAgentInputFiles, saveAgentInputFile, deleteAgentInputFile, ATTACHMENT_CONFIG } from '../services/documentation.js';

describe('Agents Routes', () => {
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
    app.use('/api', agentsRoutes);
  });

  describe('GET /api/projects/:projectId/agents', () => {
    it('should return all agents for a project', async () => {
      const mockProject = { id: 1, user_id: testUserId };
      const mockAgents = [
        { id: 1, project_id: 1, name: 'Agent 1' },
        { id: 2, project_id: 1, name: 'Agent 2' }
      ];
      projectsDb.getById.mockReturnValue(mockProject);
      agentsDb.getByProject.mockReturnValue(mockAgents);

      const response = await request(app).get('/api/projects/1/agents');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockAgents);
      expect(projectsDb.getById).toHaveBeenCalledWith(1, testUserId);
      expect(agentsDb.getByProject).toHaveBeenCalledWith(1);
    });

    it('should return 404 if project not found', async () => {
      projectsDb.getById.mockReturnValue(undefined);

      const response = await request(app).get('/api/projects/999/agents');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });

    it('should return 400 for invalid project ID', async () => {
      const response = await request(app).get('/api/projects/abc/agents');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid project ID');
    });
  });

  describe('POST /api/projects/:projectId/agents', () => {
    it('should create a new agent', async () => {
      const mockProject = { id: 1, user_id: testUserId, repo_folder_path: '/path/to/repo' };
      const newAgent = { id: 1, project_id: 1, name: 'New Agent' };
      projectsDb.getById.mockReturnValue(mockProject);
      agentsDb.create.mockReturnValue(newAgent);
      writeAgentPrompt.mockReturnValue(undefined);

      const response = await request(app)
        .post('/api/projects/1/agents')
        .send({ name: 'New Agent' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(newAgent);
      expect(agentsDb.create).toHaveBeenCalledWith(1, 'New Agent');
      expect(writeAgentPrompt).toHaveBeenCalledWith('/path/to/repo', 1, '');
    });

    it('should return 400 if name is missing', async () => {
      const mockProject = { id: 1, user_id: testUserId };
      projectsDb.getById.mockReturnValue(mockProject);

      const response = await request(app)
        .post('/api/projects/1/agents')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Agent name is required');
    });

    it('should return 400 if name is empty', async () => {
      const mockProject = { id: 1, user_id: testUserId };
      projectsDb.getById.mockReturnValue(mockProject);

      const response = await request(app)
        .post('/api/projects/1/agents')
        .send({ name: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Agent name is required');
    });

    it('should return 404 if project not found', async () => {
      projectsDb.getById.mockReturnValue(undefined);

      const response = await request(app)
        .post('/api/projects/999/agents')
        .send({ name: 'New Agent' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });

    it('should handle file creation error gracefully', async () => {
      const mockProject = { id: 1, user_id: testUserId, repo_folder_path: '/path/to/repo' };
      const newAgent = { id: 1, project_id: 1, name: 'New Agent' };
      projectsDb.getById.mockReturnValue(mockProject);
      agentsDb.create.mockReturnValue(newAgent);
      writeAgentPrompt.mockImplementation(() => { throw new Error('File error'); });

      const response = await request(app)
        .post('/api/projects/1/agents')
        .send({ name: 'New Agent' });

      // Should still succeed even if file creation fails
      expect(response.status).toBe(201);
      expect(response.body).toEqual(newAgent);
    });
  });

  describe('GET /api/agents/:id', () => {
    it('should return an agent by ID', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, name: 'Agent', user_id: testUserId };
      const mockAgent = { id: 1, project_id: 1, name: 'Agent' };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);
      agentsDb.getById.mockReturnValue(mockAgent);

      const response = await request(app).get('/api/agents/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockAgent);
    });

    it('should return 404 if agent not found', async () => {
      agentsDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app).get('/api/agents/999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });

    it('should return 404 if agent belongs to different user', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: 999 };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);

      const response = await request(app).get('/api/agents/1');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });

    it('should return 400 for invalid agent ID', async () => {
      const response = await request(app).get('/api/agents/abc');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid agent ID');
    });
  });

  describe('PUT /api/agents/:id', () => {
    it('should update an agent name', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: testUserId };
      const updatedAgent = { id: 1, project_id: 1, name: 'Updated Name' };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);
      agentsDb.update.mockReturnValue(updatedAgent);

      const response = await request(app)
        .put('/api/agents/1')
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(updatedAgent);
      expect(agentsDb.update).toHaveBeenCalledWith(1, { name: 'Updated Name' });
    });

    it('should return 400 if name is empty', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: testUserId };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);

      const response = await request(app)
        .put('/api/agents/1')
        .send({ name: '' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Agent name cannot be empty');
    });

    it('should return 404 if agent not found', async () => {
      agentsDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app)
        .put('/api/agents/999')
        .send({ name: 'Updated' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });

    it('should return 404 if agent belongs to different user', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: 999 };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);

      const response = await request(app)
        .put('/api/agents/1')
        .send({ name: 'Updated' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });
  });

  describe('DELETE /api/agents/:id', () => {
    it('should delete an agent', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: testUserId, repo_folder_path: '/path/to/repo' };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);
      agentsDb.delete.mockReturnValue(true);
      deleteAgentPrompt.mockReturnValue(undefined);

      const response = await request(app).delete('/api/agents/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(agentsDb.delete).toHaveBeenCalledWith(1);
      expect(deleteAgentPrompt).toHaveBeenCalledWith('/path/to/repo', 1);
    });

    it('should return 404 if agent not found', async () => {
      agentsDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app).delete('/api/agents/999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });

    it('should return 404 if agent belongs to different user', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: 999 };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);

      const response = await request(app).delete('/api/agents/1');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });

    it('should handle file deletion error gracefully', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: testUserId, repo_folder_path: '/path' };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);
      agentsDb.delete.mockReturnValue(true);
      deleteAgentPrompt.mockImplementation(() => { throw new Error('File error'); });

      const response = await request(app).delete('/api/agents/1');

      // Should still succeed even if file deletion fails
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
    });
  });

  describe('GET /api/agents/:id/prompt', () => {
    it('should return agent prompt content', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: testUserId, repo_folder_path: '/path' };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);
      readAgentPrompt.mockReturnValue('# My Agent Prompt');

      const response = await request(app).get('/api/agents/1/prompt');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ content: '# My Agent Prompt' });
      expect(readAgentPrompt).toHaveBeenCalledWith('/path', 1);
    });

    it('should return 404 if agent not found', async () => {
      agentsDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app).get('/api/agents/999/prompt');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });

    it('should return 404 if agent belongs to different user', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: 999 };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);

      const response = await request(app).get('/api/agents/1/prompt');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });
  });

  describe('PUT /api/agents/:id/prompt', () => {
    it('should update agent prompt content', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: testUserId, repo_folder_path: '/path' };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);
      writeAgentPrompt.mockReturnValue(undefined);

      const response = await request(app)
        .put('/api/agents/1/prompt')
        .send({ content: '# Updated prompt' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(writeAgentPrompt).toHaveBeenCalledWith('/path', 1, '# Updated prompt');
    });

    it('should return 400 if content is missing', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: testUserId };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);

      const response = await request(app)
        .put('/api/agents/1/prompt')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Content is required');
    });

    it('should allow empty content', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: testUserId, repo_folder_path: '/path' };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);
      writeAgentPrompt.mockReturnValue(undefined);

      const response = await request(app)
        .put('/api/agents/1/prompt')
        .send({ content: '' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(writeAgentPrompt).toHaveBeenCalledWith('/path', 1, '');
    });

    it('should return 404 if agent not found', async () => {
      agentsDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app)
        .put('/api/agents/999/prompt')
        .send({ content: 'test' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });
  });

  describe('GET /api/agents/:agentId/conversations', () => {
    it('should return all conversations for an agent', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: testUserId };
      const mockConversations = [
        { id: 1, agent_id: 1, claude_conversation_id: 'conv-1' },
        { id: 2, agent_id: 1, claude_conversation_id: 'conv-2' }
      ];
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);
      conversationsDb.getByAgent.mockReturnValue(mockConversations);

      const response = await request(app).get('/api/agents/1/conversations');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockConversations);
      expect(conversationsDb.getByAgent).toHaveBeenCalledWith(1);
    });

    it('should return 404 if agent not found', async () => {
      agentsDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app).get('/api/agents/999/conversations');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });

    it('should return 404 if agent belongs to different user', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: 999 };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);

      const response = await request(app).get('/api/agents/1/conversations');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });

    it('should return 400 for invalid agent ID', async () => {
      const response = await request(app).get('/api/agents/abc/conversations');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid agent ID');
    });
  });

  describe('POST /api/agents/:agentId/conversations', () => {
    it('should create a new conversation for an agent', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: testUserId };
      const newConversation = { id: 1, agent_id: 1, claude_conversation_id: null };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);
      conversationsDb.createForAgent.mockReturnValue(newConversation);

      const response = await request(app)
        .post('/api/agents/1/conversations')
        .send({});

      expect(response.status).toBe(201);
      expect(response.body).toEqual(newConversation);
      expect(conversationsDb.createForAgent).toHaveBeenCalledWith(1);
    });

    it('should return 404 if agent not found', async () => {
      agentsDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app)
        .post('/api/agents/999/conversations')
        .send({});

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });

    it('should return 404 if agent belongs to different user', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: 999 };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);

      const response = await request(app)
        .post('/api/agents/1/conversations')
        .send({});

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });

    it('should return 400 for invalid agent ID', async () => {
      const response = await request(app)
        .post('/api/agents/abc/conversations')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid agent ID');
    });
  });

  describe('GET /api/agents/:id/attachments', () => {
    it('should return all attachments for an agent', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: testUserId, repo_folder_path: '/path/to/repo' };
      const mockFiles = [
        { name: 'file1.txt', size: 1024, mimeType: 'text/plain' },
        { name: 'image.png', size: 2048, mimeType: 'image/png' }
      ];
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);
      listAgentInputFiles.mockReturnValue(mockFiles);

      const response = await request(app).get('/api/agents/1/attachments');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockFiles);
      expect(listAgentInputFiles).toHaveBeenCalledWith('/path/to/repo', 1);
    });

    it('should return empty array when no attachments exist', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: testUserId, repo_folder_path: '/path/to/repo' };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);
      listAgentInputFiles.mockReturnValue([]);

      const response = await request(app).get('/api/agents/1/attachments');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return 404 if agent not found', async () => {
      agentsDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app).get('/api/agents/999/attachments');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });

    it('should return 404 if agent belongs to different user', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: 999 };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);

      const response = await request(app).get('/api/agents/1/attachments');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });

    it('should return 400 for invalid agent ID', async () => {
      const response = await request(app).get('/api/agents/abc/attachments');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid agent ID');
    });
  });

  describe('POST /api/agents/:id/attachments', () => {
    it('should upload a file successfully', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: testUserId, repo_folder_path: '/path/to/repo' };
      const savedFile = { name: 'test.txt', size: 100, mimeType: 'text/plain' };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);
      saveAgentInputFile.mockReturnValue(savedFile);

      const response = await request(app)
        .post('/api/agents/1/attachments')
        .attach('file', Buffer.from('test content'), 'test.txt');

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.file).toEqual(savedFile);
      expect(saveAgentInputFile).toHaveBeenCalledWith(
        '/path/to/repo',
        1,
        'test.txt',
        expect.any(Buffer)
      );
    });

    it('should return 400 when no file is provided', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: testUserId, repo_folder_path: '/path/to/repo' };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);

      const response = await request(app)
        .post('/api/agents/1/attachments')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No file provided');
    });

    it('should return 400 for disallowed file type', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: testUserId, repo_folder_path: '/path/to/repo' };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);

      const response = await request(app)
        .post('/api/agents/1/attachments')
        .attach('file', Buffer.from('test content'), 'test.exe');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('File type .exe not allowed');
    });

    it('should return 404 if agent not found', async () => {
      agentsDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app)
        .post('/api/agents/999/attachments')
        .attach('file', Buffer.from('test content'), 'test.txt');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });

    it('should return 404 if agent belongs to different user', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: 999 };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);

      const response = await request(app)
        .post('/api/agents/1/attachments')
        .attach('file', Buffer.from('test content'), 'test.txt');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });

    it('should return 400 for invalid agent ID', async () => {
      const response = await request(app)
        .post('/api/agents/abc/attachments')
        .attach('file', Buffer.from('test content'), 'test.txt');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid agent ID');
    });

    it('should return 500 when save fails', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: testUserId, repo_folder_path: '/path/to/repo' };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);
      saveAgentInputFile.mockImplementation(() => { throw new Error('Save failed'); });

      const response = await request(app)
        .post('/api/agents/1/attachments')
        .attach('file', Buffer.from('test content'), 'test.txt');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to save attachment');
    });
  });

  describe('DELETE /api/agents/:id/attachments/:filename', () => {
    it('should delete an attachment successfully', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: testUserId, repo_folder_path: '/path/to/repo' };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);
      deleteAgentInputFile.mockReturnValue(true);

      const response = await request(app).delete('/api/agents/1/attachments/test.txt');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(deleteAgentInputFile).toHaveBeenCalledWith('/path/to/repo', 1, 'test.txt');
    });

    it('should handle URL-encoded filenames', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: testUserId, repo_folder_path: '/path/to/repo' };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);
      deleteAgentInputFile.mockReturnValue(true);

      const response = await request(app).delete('/api/agents/1/attachments/file%20with%20spaces.txt');

      expect(response.status).toBe(200);
      expect(deleteAgentInputFile).toHaveBeenCalledWith('/path/to/repo', 1, 'file with spaces.txt');
    });

    it('should return 404 if file not found', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: testUserId, repo_folder_path: '/path/to/repo' };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);
      deleteAgentInputFile.mockReturnValue(false);

      const response = await request(app).delete('/api/agents/1/attachments/nonexistent.txt');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Attachment not found');
    });

    it('should return 404 if agent not found', async () => {
      agentsDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app).delete('/api/agents/999/attachments/test.txt');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });

    it('should return 404 if agent belongs to different user', async () => {
      const mockAgentWithProject = { id: 1, project_id: 1, user_id: 999 };
      agentsDb.getWithProject.mockReturnValue(mockAgentWithProject);

      const response = await request(app).delete('/api/agents/1/attachments/test.txt');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });

    it('should return 400 for invalid agent ID', async () => {
      const response = await request(app).delete('/api/agents/abc/attachments/test.txt');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid agent ID');
    });
  });
});
