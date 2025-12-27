import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the database module
vi.mock('../database/db.js', () => ({
  projectsDb: {
    getById: vi.fn()
  },
  tasksDb: {
    create: vi.fn(),
    getAll: vi.fn(),
    getByProject: vi.fn(),
    getById: vi.fn(),
    getWithProject: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }
}));

// Mock the documentation service
vi.mock('../services/documentation.js', () => ({
  readTaskDoc: vi.fn(),
  writeTaskDoc: vi.fn(),
  deleteTaskDoc: vi.fn()
}));

// Mock the notifications service
vi.mock('../services/notifications.js', () => ({
  notifyTaskStatusChange: vi.fn().mockResolvedValue(undefined)
}));

// Mock the agentRunner service
vi.mock('../services/agentRunner.js', () => ({
  forceCompleteRunningAgents: vi.fn()
}));

// Mock the worktree service
vi.mock('../services/worktree.js', () => ({
  isGitRepository: vi.fn(),
  createWorktree: vi.fn(),
  removeWorktree: vi.fn(),
  worktreeExists: vi.fn(),
  getWorktreeStatus: vi.fn(),
  syncWithMain: vi.fn(),
  createPullRequest: vi.fn(),
  getPullRequestStatus: vi.fn(),
  mergeAndCleanup: vi.fn()
}));

import tasksRoutes from './tasks.js';
import { projectsDb, tasksDb } from '../database/db.js';
import { readTaskDoc, writeTaskDoc, deleteTaskDoc } from '../services/documentation.js';
import { forceCompleteRunningAgents } from '../services/agentRunner.js';
import {
  isGitRepository,
  createWorktree,
  removeWorktree,
  worktreeExists,
  getWorktreeStatus,
  syncWithMain,
  createPullRequest,
  getPullRequestStatus,
  mergeAndCleanup
} from '../services/worktree.js';

describe('Tasks Routes - Phase 3', () => {
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
    app.use('/api', tasksRoutes);
  });

  describe('GET /api/tasks', () => {
    it('should return all tasks for user', async () => {
      const mockTasks = [
        { id: 1, title: 'Task 1', status: 'pending', project_name: 'Project A' },
        { id: 2, title: 'Task 2', status: 'in_progress', project_name: 'Project B' }
      ];
      tasksDb.getAll.mockReturnValue(mockTasks);

      const response = await request(app).get('/api/tasks');

      expect(response.status).toBe(200);
      expect(response.body.tasks).toEqual(mockTasks);
      expect(tasksDb.getAll).toHaveBeenCalledWith(testUserId, null);
    });

    it('should filter by status=pending', async () => {
      const mockTasks = [
        { id: 1, title: 'Pending Task', status: 'pending', project_name: 'Project A' }
      ];
      tasksDb.getAll.mockReturnValue(mockTasks);

      const response = await request(app).get('/api/tasks?status=pending');

      expect(response.status).toBe(200);
      expect(response.body.tasks).toEqual(mockTasks);
      expect(tasksDb.getAll).toHaveBeenCalledWith(testUserId, 'pending');
    });

    it('should filter by status=in_progress', async () => {
      const mockTasks = [
        { id: 2, title: 'In Progress Task', status: 'in_progress', project_name: 'Project B' }
      ];
      tasksDb.getAll.mockReturnValue(mockTasks);

      const response = await request(app).get('/api/tasks?status=in_progress');

      expect(response.status).toBe(200);
      expect(response.body.tasks).toEqual(mockTasks);
      expect(tasksDb.getAll).toHaveBeenCalledWith(testUserId, 'in_progress');
    });

    it('should filter by status=completed', async () => {
      const mockTasks = [
        { id: 3, title: 'Completed Task', status: 'completed', project_name: 'Project C' }
      ];
      tasksDb.getAll.mockReturnValue(mockTasks);

      const response = await request(app).get('/api/tasks?status=completed');

      expect(response.status).toBe(200);
      expect(response.body.tasks).toEqual(mockTasks);
      expect(tasksDb.getAll).toHaveBeenCalledWith(testUserId, 'completed');
    });

    it('should return 400 for invalid status', async () => {
      const response = await request(app).get('/api/tasks?status=invalid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid status. Must be one of: pending, in_progress, completed');
      expect(tasksDb.getAll).not.toHaveBeenCalled();
    });

    it('should include project_name on tasks', async () => {
      const mockTasks = [
        { id: 1, title: 'Task 1', status: 'pending', project_name: 'My Project', repo_folder_path: '/path/to/project' }
      ];
      tasksDb.getAll.mockReturnValue(mockTasks);

      const response = await request(app).get('/api/tasks');

      expect(response.status).toBe(200);
      expect(response.body.tasks[0].project_name).toBe('My Project');
      expect(response.body.tasks[0].repo_folder_path).toBe('/path/to/project');
    });
  });

  describe('GET /api/projects/:projectId/tasks', () => {
    it('should return all tasks for a project', async () => {
      const mockProject = { id: 1, user_id: testUserId, repo_folder_path: '/path/1' };
      const mockTasks = [
        { id: 1, project_id: 1, title: 'Task 1' },
        { id: 2, project_id: 1, title: 'Task 2' }
      ];
      projectsDb.getById.mockReturnValue(mockProject);
      tasksDb.getByProject.mockReturnValue(mockTasks);

      const response = await request(app).get('/api/projects/1/tasks');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockTasks);
      expect(projectsDb.getById).toHaveBeenCalledWith(1, testUserId);
      expect(tasksDb.getByProject).toHaveBeenCalledWith(1);
    });

    it('should return 404 if project not found', async () => {
      projectsDb.getById.mockReturnValue(undefined);

      const response = await request(app).get('/api/projects/999/tasks');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });
  });

  describe('POST /api/projects/:projectId/tasks', () => {
    it('should create a new task', async () => {
      const mockProject = { id: 1, user_id: testUserId, repo_folder_path: '/path/1' };
      const newTask = { id: 1, projectId: 1, title: 'New Task' };
      projectsDb.getById.mockReturnValue(mockProject);
      tasksDb.create.mockReturnValue(newTask);
      writeTaskDoc.mockReturnValue(undefined);

      const response = await request(app)
        .post('/api/projects/1/tasks')
        .send({ title: 'New Task' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(newTask);
      expect(tasksDb.create).toHaveBeenCalledWith(1, 'New Task');
      expect(writeTaskDoc).toHaveBeenCalledWith('/path/1', 1, '');
    });

    it('should create a task without title', async () => {
      const mockProject = { id: 1, user_id: testUserId, repo_folder_path: '/path/1' };
      const newTask = { id: 1, projectId: 1, title: null };
      projectsDb.getById.mockReturnValue(mockProject);
      tasksDb.create.mockReturnValue(newTask);

      const response = await request(app)
        .post('/api/projects/1/tasks')
        .send({});

      expect(response.status).toBe(201);
      expect(tasksDb.create).toHaveBeenCalledWith(1, null);
    });

    it('should return 404 if project not found', async () => {
      projectsDb.getById.mockReturnValue(undefined);

      const response = await request(app)
        .post('/api/projects/999/tasks')
        .send({ title: 'New Task' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('should return a task by ID', async () => {
      const mockTaskWithProject = { id: 1, project_id: 1, title: 'Task 1', user_id: testUserId };
      const mockTask = { id: 1, project_id: 1, title: 'Task 1' };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      tasksDb.getById.mockReturnValue(mockTask);

      const response = await request(app).get('/api/tasks/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockTask);
    });

    it('should return 404 if task not found', async () => {
      tasksDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app).get('/api/tasks/999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });

    it('should return 404 if task belongs to different user', async () => {
      const mockTaskWithProject = { id: 1, project_id: 1, title: 'Task 1', user_id: 999 };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);

      const response = await request(app).get('/api/tasks/1');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });
  });

  describe('PUT /api/tasks/:id', () => {
    it('should update a task', async () => {
      const mockTaskWithProject = { id: 1, project_id: 1, user_id: testUserId };
      const updatedTask = { id: 1, project_id: 1, title: 'Updated Title' };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      tasksDb.update.mockReturnValue(updatedTask);

      const response = await request(app)
        .put('/api/tasks/1')
        .send({ title: 'Updated Title' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(updatedTask);
      expect(tasksDb.update).toHaveBeenCalledWith(1, { title: 'Updated Title' });
    });

    it('should return 404 if task not found', async () => {
      tasksDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app)
        .put('/api/tasks/999')
        .send({ title: 'Updated Title' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });

    it('should update task status', async () => {
      const mockTaskWithProject = { id: 1, project_id: 1, user_id: testUserId, status: 'pending' };
      const updatedTask = { id: 1, project_id: 1, title: 'Task 1', status: 'in_progress' };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      tasksDb.update.mockReturnValue(updatedTask);

      const response = await request(app)
        .put('/api/tasks/1')
        .send({ status: 'in_progress' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('in_progress');
      expect(tasksDb.update).toHaveBeenCalledWith(1, { status: 'in_progress' });
    });

    it('should return 400 for invalid status', async () => {
      const mockTaskWithProject = { id: 1, project_id: 1, user_id: testUserId };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);

      const response = await request(app)
        .put('/api/tasks/1')
        .send({ status: 'invalid_status' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid status. Must be one of: pending, in_progress, completed');
      expect(tasksDb.update).not.toHaveBeenCalled();
    });

    it('should update workflow_complete to 1', async () => {
      const mockTaskWithProject = { id: 1, project_id: 1, user_id: testUserId, workflow_complete: 0 };
      const updatedTask = { id: 1, project_id: 1, title: 'Task 1', workflow_complete: 1 };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      tasksDb.update.mockReturnValue(updatedTask);

      const response = await request(app)
        .put('/api/tasks/1')
        .send({ workflow_complete: 1 });

      expect(response.status).toBe(200);
      expect(response.body.workflow_complete).toBe(1);
      expect(tasksDb.update).toHaveBeenCalledWith(1, { workflow_complete: 1 });
    });

    it('should update workflow_complete to 0', async () => {
      const mockTaskWithProject = { id: 1, project_id: 1, user_id: testUserId, workflow_complete: 1 };
      const updatedTask = { id: 1, project_id: 1, title: 'Task 1', workflow_complete: 0 };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      tasksDb.update.mockReturnValue(updatedTask);

      const response = await request(app)
        .put('/api/tasks/1')
        .send({ workflow_complete: 0 });

      expect(response.status).toBe(200);
      expect(response.body.workflow_complete).toBe(0);
      expect(tasksDb.update).toHaveBeenCalledWith(1, { workflow_complete: 0 });
    });

    it('should update workflow_complete along with status', async () => {
      const mockTaskWithProject = { id: 1, project_id: 1, user_id: testUserId, status: 'pending', workflow_complete: 0 };
      const updatedTask = { id: 1, project_id: 1, title: 'Task 1', status: 'completed', workflow_complete: 1 };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      tasksDb.update.mockReturnValue(updatedTask);

      const response = await request(app)
        .put('/api/tasks/1')
        .send({ status: 'completed', workflow_complete: 1 });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('completed');
      expect(response.body.workflow_complete).toBe(1);
      expect(tasksDb.update).toHaveBeenCalledWith(1, { status: 'completed', workflow_complete: 1 });
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('should delete a task', async () => {
      const mockTaskWithProject = { id: 1, project_id: 1, user_id: testUserId, repo_folder_path: '/path/1' };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      tasksDb.delete.mockReturnValue(true);
      deleteTaskDoc.mockReturnValue(true);

      const response = await request(app).delete('/api/tasks/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(tasksDb.delete).toHaveBeenCalledWith(1);
      expect(deleteTaskDoc).toHaveBeenCalledWith('/path/1', 1);
    });

    it('should return 404 if task not found', async () => {
      tasksDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app).delete('/api/tasks/999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });
  });

  describe('GET /api/tasks/:id/documentation', () => {
    it('should return task documentation', async () => {
      const mockTaskWithProject = { id: 1, user_id: testUserId, repo_folder_path: '/path/1' };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      readTaskDoc.mockReturnValue('# Task Documentation');

      const response = await request(app).get('/api/tasks/1/documentation');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ content: '# Task Documentation' });
      expect(readTaskDoc).toHaveBeenCalledWith('/path/1', 1);
    });

    it('should return 404 if task not found', async () => {
      tasksDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app).get('/api/tasks/999/documentation');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });
  });

  describe('PUT /api/tasks/:id/documentation', () => {
    it('should update task documentation', async () => {
      const mockTaskWithProject = { id: 1, user_id: testUserId, repo_folder_path: '/path/1' };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      writeTaskDoc.mockReturnValue(undefined);

      const response = await request(app)
        .put('/api/tasks/1/documentation')
        .send({ content: '# Updated Documentation' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(writeTaskDoc).toHaveBeenCalledWith('/path/1', 1, '# Updated Documentation');
    });

    it('should return 400 if content is missing', async () => {
      const mockTaskWithProject = { id: 1, user_id: testUserId, repo_folder_path: '/path/1' };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);

      const response = await request(app)
        .put('/api/tasks/1/documentation')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Content is required');
    });
  });

  describe('PUT /api/tasks/:id/workflow-complete', () => {
    it('should set workflow_complete to true', async () => {
      const mockTaskWithProject = { id: 1, project_id: 1, user_id: testUserId, workflow_complete: 0 };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      tasksDb.update.mockReturnValue({ ...mockTaskWithProject, workflow_complete: 1 });
      forceCompleteRunningAgents.mockReturnValue(0);

      const response = await request(app)
        .put('/api/tasks/1/workflow-complete')
        .send({ complete: true });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        workflow_complete: true,
        forceCompletedAgents: 0
      });
      expect(tasksDb.update).toHaveBeenCalledWith(1, { workflow_complete: 1 });
    });

    it('should set workflow_complete to false', async () => {
      const mockTaskWithProject = { id: 1, project_id: 1, user_id: testUserId, workflow_complete: 1 };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      tasksDb.update.mockReturnValue({ ...mockTaskWithProject, workflow_complete: 0 });

      const response = await request(app)
        .put('/api/tasks/1/workflow-complete')
        .send({ complete: false });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        workflow_complete: false,
        forceCompletedAgents: 0
      });
      expect(tasksDb.update).toHaveBeenCalledWith(1, { workflow_complete: 0 });
      // Should not call forceCompleteRunningAgents when setting to false
      expect(forceCompleteRunningAgents).not.toHaveBeenCalled();
    });

    it('should force-complete running agents when setting complete=true', async () => {
      const mockTaskWithProject = { id: 1, project_id: 1, user_id: testUserId, workflow_complete: 0 };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      tasksDb.update.mockReturnValue({ ...mockTaskWithProject, workflow_complete: 1 });
      forceCompleteRunningAgents.mockReturnValue(2); // 2 agents were force-completed

      const response = await request(app)
        .put('/api/tasks/1/workflow-complete')
        .send({ complete: true });

      expect(response.status).toBe(200);
      expect(response.body.forceCompletedAgents).toBe(2);
      expect(forceCompleteRunningAgents).toHaveBeenCalledWith(1);
    });

    it('should return 400 for invalid task ID', async () => {
      const response = await request(app)
        .put('/api/tasks/invalid/workflow-complete')
        .send({ complete: true });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid task ID');
    });

    it('should return 400 if complete is missing', async () => {
      const response = await request(app)
        .put('/api/tasks/1/workflow-complete')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('complete must be a boolean');
    });

    it('should return 400 if complete is not a boolean', async () => {
      const response = await request(app)
        .put('/api/tasks/1/workflow-complete')
        .send({ complete: 'yes' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('complete must be a boolean');
    });

    it('should return 400 if complete is a number', async () => {
      const response = await request(app)
        .put('/api/tasks/1/workflow-complete')
        .send({ complete: 1 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('complete must be a boolean');
    });

    it('should return 404 if task not found', async () => {
      tasksDb.getWithProject.mockReturnValue(null);

      const response = await request(app)
        .put('/api/tasks/999/workflow-complete')
        .send({ complete: true });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });

    it('should return 404 if task belongs to different user', async () => {
      tasksDb.getWithProject.mockReturnValue({ id: 1, user_id: 999 });

      const response = await request(app)
        .put('/api/tasks/1/workflow-complete')
        .send({ complete: true });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Task not found');
    });

    it('should handle recovery scenario: stuck agent gets force-completed', async () => {
      // Simulate a stuck agent scenario
      const mockTaskWithProject = { id: 1, project_id: 1, user_id: testUserId, workflow_complete: 0 };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      tasksDb.update.mockReturnValue({ ...mockTaskWithProject, workflow_complete: 1 });
      forceCompleteRunningAgents.mockReturnValue(1); // 1 stuck agent

      const response = await request(app)
        .put('/api/tasks/1/workflow-complete')
        .send({ complete: true });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.workflow_complete).toBe(true);
      expect(response.body.forceCompletedAgents).toBe(1);
    });
  });

  // ============================================================================
  // Worktree Endpoints Tests
  // ============================================================================

  describe('POST /api/projects/:projectId/tasks (with worktree)', () => {
    it('should create worktree for git repository projects', async () => {
      const mockProject = { id: 1, user_id: testUserId, repo_folder_path: '/path/to/repo' };
      const newTask = { id: 5, projectId: 1, title: 'New Feature' };
      projectsDb.getById.mockReturnValue(mockProject);
      tasksDb.create.mockReturnValue(newTask);
      isGitRepository.mockResolvedValue(true);
      createWorktree.mockResolvedValue({
        success: true,
        worktreePath: '/path/to/repo-worktrees/task-5',
        branch: 'task/5-new-feature'
      });
      writeTaskDoc.mockReturnValue(undefined);

      const response = await request(app)
        .post('/api/projects/1/tasks')
        .send({ title: 'New Feature' });

      expect(response.status).toBe(201);
      expect(isGitRepository).toHaveBeenCalledWith('/path/to/repo');
      expect(createWorktree).toHaveBeenCalledWith('/path/to/repo', 5, 'New Feature');
      expect(response.body.worktree_path).toBe('/path/to/repo-worktrees/task-5');
      expect(response.body.worktree_branch).toBe('task/5-new-feature');
    });

    it('should skip worktree creation for non-git projects', async () => {
      const mockProject = { id: 1, user_id: testUserId, repo_folder_path: '/path/to/folder' };
      const newTask = { id: 5, projectId: 1, title: 'Task' };
      projectsDb.getById.mockReturnValue(mockProject);
      tasksDb.create.mockReturnValue(newTask);
      isGitRepository.mockResolvedValue(false);
      writeTaskDoc.mockReturnValue(undefined);

      const response = await request(app)
        .post('/api/projects/1/tasks')
        .send({ title: 'Task' });

      expect(response.status).toBe(201);
      expect(createWorktree).not.toHaveBeenCalled();
    });

    it('should skip worktree creation when skip_worktree is true', async () => {
      const mockProject = { id: 1, user_id: testUserId, repo_folder_path: '/path/to/repo' };
      const newTask = { id: 5, projectId: 1, title: 'Task' };
      projectsDb.getById.mockReturnValue(mockProject);
      tasksDb.create.mockReturnValue(newTask);
      isGitRepository.mockResolvedValue(true);
      writeTaskDoc.mockReturnValue(undefined);

      const response = await request(app)
        .post('/api/projects/1/tasks')
        .send({ title: 'Task', skip_worktree: true });

      expect(response.status).toBe(201);
      expect(createWorktree).not.toHaveBeenCalled();
    });

    it('should rollback task on worktree creation failure', async () => {
      const mockProject = { id: 1, user_id: testUserId, repo_folder_path: '/path/to/repo' };
      const newTask = { id: 5, projectId: 1, title: 'Task' };
      projectsDb.getById.mockReturnValue(mockProject);
      tasksDb.create.mockReturnValue(newTask);
      isGitRepository.mockResolvedValue(true);
      createWorktree.mockResolvedValue({
        success: false,
        error: 'Branch already exists'
      });

      const response = await request(app)
        .post('/api/projects/1/tasks')
        .send({ title: 'Task' });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to create worktree');
      expect(tasksDb.delete).toHaveBeenCalledWith(5);
    });
  });

  describe('DELETE /api/tasks/:id (with worktree)', () => {
    it('should remove worktree when deleting task', async () => {
      const mockTaskWithProject = {
        id: 1,
        project_id: 1,
        user_id: testUserId,
        repo_folder_path: '/path/to/repo'
      };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      tasksDb.delete.mockReturnValue(true);
      deleteTaskDoc.mockReturnValue(true);
      worktreeExists.mockResolvedValue(true);
      removeWorktree.mockResolvedValue({ success: true });

      const response = await request(app).delete('/api/tasks/1');

      expect(response.status).toBe(200);
      expect(worktreeExists).toHaveBeenCalledWith('/path/to/repo', 1);
      expect(removeWorktree).toHaveBeenCalledWith('/path/to/repo', 1);
    });

    it('should continue deletion if worktree removal fails', async () => {
      const mockTaskWithProject = {
        id: 1,
        project_id: 1,
        user_id: testUserId,
        repo_folder_path: '/path/to/repo'
      };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      tasksDb.delete.mockReturnValue(true);
      deleteTaskDoc.mockReturnValue(true);
      worktreeExists.mockResolvedValue(true);
      removeWorktree.mockResolvedValue({ success: false, error: 'Worktree locked' });

      const response = await request(app).delete('/api/tasks/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
    });

    it('should skip worktree removal if worktree does not exist', async () => {
      const mockTaskWithProject = {
        id: 1,
        project_id: 1,
        user_id: testUserId,
        repo_folder_path: '/path/to/repo'
      };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      tasksDb.delete.mockReturnValue(true);
      deleteTaskDoc.mockReturnValue(true);
      worktreeExists.mockResolvedValue(false);

      const response = await request(app).delete('/api/tasks/1');

      expect(response.status).toBe(200);
      expect(removeWorktree).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/tasks/:id/worktree', () => {
    it('should return worktree status', async () => {
      const mockTaskWithProject = {
        id: 1,
        project_id: 1,
        user_id: testUserId,
        repo_folder_path: '/path/to/repo'
      };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      getWorktreeStatus.mockResolvedValue({
        success: true,
        branch: 'task/1-feature',
        ahead: 3,
        behind: 1,
        mainBranch: 'main',
        worktreePath: '/path/to/repo-worktrees/task-1'
      });

      const response = await request(app).get('/api/tasks/1/worktree');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.branch).toBe('task/1-feature');
      expect(response.body.ahead).toBe(3);
      expect(response.body.behind).toBe(1);
    });

    it('should return 404 for non-existent task', async () => {
      tasksDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app).get('/api/tasks/999/worktree');

      expect(response.status).toBe(404);
    });

    it('should return 404 for different user task', async () => {
      tasksDb.getWithProject.mockReturnValue({ id: 1, user_id: 999 });

      const response = await request(app).get('/api/tasks/1/worktree');

      expect(response.status).toBe(404);
    });

    it('should return 400 for invalid task ID', async () => {
      const response = await request(app).get('/api/tasks/invalid/worktree');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid task ID');
    });
  });

  describe('POST /api/tasks/:id/sync', () => {
    it('should sync worktree with main', async () => {
      const mockTaskWithProject = {
        id: 1,
        project_id: 1,
        user_id: testUserId,
        repo_folder_path: '/path/to/repo'
      };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      syncWithMain.mockResolvedValue({ success: true });

      const response = await request(app).post('/api/tasks/1/sync');

      expect(response.status).toBe(200);
      expect(syncWithMain).toHaveBeenCalledWith('/path/to/repo', 1);
      expect(response.body.success).toBe(true);
    });

    it('should return sync error', async () => {
      const mockTaskWithProject = {
        id: 1,
        project_id: 1,
        user_id: testUserId,
        repo_folder_path: '/path/to/repo'
      };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      syncWithMain.mockResolvedValue({ success: false, error: 'Merge conflict' });

      const response = await request(app).post('/api/tasks/1/sync');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Merge conflict');
    });

    it('should return 404 for non-existent task', async () => {
      tasksDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app).post('/api/tasks/999/sync');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/tasks/:id/pull-request', () => {
    it('should create pull request', async () => {
      const mockTaskWithProject = {
        id: 1,
        project_id: 1,
        user_id: testUserId,
        repo_folder_path: '/path/to/repo'
      };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      createPullRequest.mockResolvedValue({
        success: true,
        url: 'https://github.com/user/repo/pull/123'
      });

      const response = await request(app)
        .post('/api/tasks/1/pull-request')
        .send({ title: 'Add feature', body: 'Description' });

      expect(response.status).toBe(200);
      expect(createPullRequest).toHaveBeenCalledWith('/path/to/repo', 1, 'Add feature', 'Description');
      expect(response.body.success).toBe(true);
      expect(response.body.url).toBe('https://github.com/user/repo/pull/123');
    });

    it('should return 400 if title is missing', async () => {
      const mockTaskWithProject = {
        id: 1,
        project_id: 1,
        user_id: testUserId,
        repo_folder_path: '/path/to/repo'
      };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);

      const response = await request(app)
        .post('/api/tasks/1/pull-request')
        .send({ body: 'Description' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('PR title is required');
    });

    it('should use empty string for missing body', async () => {
      const mockTaskWithProject = {
        id: 1,
        project_id: 1,
        user_id: testUserId,
        repo_folder_path: '/path/to/repo'
      };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      createPullRequest.mockResolvedValue({ success: true, url: 'https://github.com/...' });

      await request(app)
        .post('/api/tasks/1/pull-request')
        .send({ title: 'Title only' });

      expect(createPullRequest).toHaveBeenCalledWith('/path/to/repo', 1, 'Title only', '');
    });

    it('should return 404 for non-existent task', async () => {
      tasksDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app)
        .post('/api/tasks/999/pull-request')
        .send({ title: 'Title' });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/tasks/:id/pull-request', () => {
    it('should return pull request status when PR exists', async () => {
      const mockTaskWithProject = {
        id: 1,
        project_id: 1,
        user_id: testUserId,
        repo_folder_path: '/path/to/repo'
      };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      getPullRequestStatus.mockResolvedValue({
        success: true,
        exists: true,
        url: 'https://github.com/user/repo/pull/123',
        state: 'OPEN',
        mergeable: 'MERGEABLE'
      });

      const response = await request(app).get('/api/tasks/1/pull-request');

      expect(response.status).toBe(200);
      expect(response.body.exists).toBe(true);
      expect(response.body.url).toBe('https://github.com/user/repo/pull/123');
    });

    it('should return exists:false when no PR', async () => {
      const mockTaskWithProject = {
        id: 1,
        project_id: 1,
        user_id: testUserId,
        repo_folder_path: '/path/to/repo'
      };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      getPullRequestStatus.mockResolvedValue({ success: true, exists: false });

      const response = await request(app).get('/api/tasks/1/pull-request');

      expect(response.status).toBe(200);
      expect(response.body.exists).toBe(false);
    });

    it('should return 404 for non-existent task', async () => {
      tasksDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app).get('/api/tasks/999/pull-request');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/tasks/:id/merge-cleanup', () => {
    it('should merge PR and cleanup worktree', async () => {
      const mockTaskWithProject = {
        id: 1,
        project_id: 1,
        user_id: testUserId,
        repo_folder_path: '/path/to/repo'
      };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      mergeAndCleanup.mockResolvedValue({ success: true });

      const response = await request(app).post('/api/tasks/1/merge-cleanup');

      expect(response.status).toBe(200);
      expect(mergeAndCleanup).toHaveBeenCalledWith('/path/to/repo', 1);
      expect(response.body.success).toBe(true);
    });

    it('should return error on merge failure', async () => {
      const mockTaskWithProject = {
        id: 1,
        project_id: 1,
        user_id: testUserId,
        repo_folder_path: '/path/to/repo'
      };
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      mergeAndCleanup.mockResolvedValue({ success: false, error: 'PR not mergeable' });

      const response = await request(app).post('/api/tasks/1/merge-cleanup');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('PR not mergeable');
    });

    it('should return 404 for non-existent task', async () => {
      tasksDb.getWithProject.mockReturnValue(undefined);

      const response = await request(app).post('/api/tasks/999/merge-cleanup');

      expect(response.status).toBe(404);
    });

    it('should return 404 for different user task', async () => {
      tasksDb.getWithProject.mockReturnValue({ id: 1, user_id: 999 });

      const response = await request(app).post('/api/tasks/1/merge-cleanup');

      expect(response.status).toBe(404);
    });

    it('should return 400 for invalid task ID', async () => {
      const response = await request(app).post('/api/tasks/invalid/merge-cleanup');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid task ID');
    });
  });
});
