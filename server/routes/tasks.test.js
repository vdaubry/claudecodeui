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

import tasksRoutes from './tasks.js';
import { projectsDb, tasksDb } from '../database/db.js';
import { readTaskDoc, writeTaskDoc, deleteTaskDoc } from '../services/documentation.js';

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
});
