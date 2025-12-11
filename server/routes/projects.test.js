import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock the database module
vi.mock('../database/db.js', () => ({
  projectsDb: {
    create: vi.fn(),
    getAll: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }
}));

// Mock the documentation service
vi.mock('../services/documentation.js', () => ({
  ensureClaudeUIFolder: vi.fn(),
  readProjectDoc: vi.fn(),
  writeProjectDoc: vi.fn()
}));

import projectsRoutes from './projects.js';
import { projectsDb } from '../database/db.js';
import { ensureClaudeUIFolder, readProjectDoc, writeProjectDoc } from '../services/documentation.js';

describe('Projects Routes - Phase 3', () => {
  let app;
  const testUserId = 1;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create Express app with mocked auth
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: testUserId, username: 'testuser' };
      next();
    });
    app.use('/api/v2/projects', projectsRoutes);
  });

  describe('GET /api/v2/projects', () => {
    it('should return all projects for the user', async () => {
      const mockProjects = [
        { id: 1, user_id: testUserId, name: 'Project 1', repo_folder_path: '/path/1' },
        { id: 2, user_id: testUserId, name: 'Project 2', repo_folder_path: '/path/2' }
      ];
      projectsDb.getAll.mockReturnValue(mockProjects);

      const response = await request(app).get('/api/v2/projects');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockProjects);
      expect(projectsDb.getAll).toHaveBeenCalledWith(testUserId);
    });

    it('should return empty array when no projects', async () => {
      projectsDb.getAll.mockReturnValue([]);

      const response = await request(app).get('/api/v2/projects');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('POST /api/v2/projects', () => {
    it('should create a new project', async () => {
      const newProject = { id: 1, userId: testUserId, name: 'New Project', repoFolderPath: '/path/new' };
      projectsDb.create.mockReturnValue(newProject);
      ensureClaudeUIFolder.mockReturnValue(true);

      const response = await request(app)
        .post('/api/v2/projects')
        .send({ name: 'New Project', repoFolderPath: '/path/new' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(newProject);
      expect(projectsDb.create).toHaveBeenCalledWith(testUserId, 'New Project', '/path/new');
      expect(ensureClaudeUIFolder).toHaveBeenCalledWith('/path/new');
    });

    it('should return 400 if name is missing', async () => {
      const response = await request(app)
        .post('/api/v2/projects')
        .send({ repoFolderPath: '/path/new' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Project name is required');
    });

    it('should return 400 if repoFolderPath is missing', async () => {
      const response = await request(app)
        .post('/api/v2/projects')
        .send({ name: 'New Project' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Repository folder path is required');
    });

    it('should return 409 on duplicate repo path', async () => {
      projectsDb.create.mockImplementation(() => {
        const error = new Error('UNIQUE constraint failed');
        error.code = 'SQLITE_CONSTRAINT_UNIQUE';
        throw error;
      });

      const response = await request(app)
        .post('/api/v2/projects')
        .send({ name: 'New Project', repoFolderPath: '/path/existing' });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('A project with this repository path already exists');
    });
  });

  describe('GET /api/v2/projects/:id', () => {
    it('should return a project by ID', async () => {
      const mockProject = { id: 1, user_id: testUserId, name: 'Project 1', repo_folder_path: '/path/1' };
      projectsDb.getById.mockReturnValue(mockProject);

      const response = await request(app).get('/api/v2/projects/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockProject);
      expect(projectsDb.getById).toHaveBeenCalledWith(1, testUserId);
    });

    it('should return 404 if project not found', async () => {
      projectsDb.getById.mockReturnValue(undefined);

      const response = await request(app).get('/api/v2/projects/999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });

    it('should return 400 for invalid ID', async () => {
      const response = await request(app).get('/api/v2/projects/invalid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid project ID');
    });
  });

  describe('PUT /api/v2/projects/:id', () => {
    it('should update a project', async () => {
      const updatedProject = { id: 1, user_id: testUserId, name: 'Updated Name', repo_folder_path: '/path/1' };
      projectsDb.update.mockReturnValue(updatedProject);

      const response = await request(app)
        .put('/api/v2/projects/1')
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(updatedProject);
      expect(projectsDb.update).toHaveBeenCalledWith(1, testUserId, { name: 'Updated Name' });
    });

    it('should return 404 if project not found', async () => {
      projectsDb.update.mockReturnValue(null);

      const response = await request(app)
        .put('/api/v2/projects/999')
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });
  });

  describe('DELETE /api/v2/projects/:id', () => {
    it('should delete a project', async () => {
      projectsDb.delete.mockReturnValue(true);

      const response = await request(app).delete('/api/v2/projects/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(projectsDb.delete).toHaveBeenCalledWith(1, testUserId);
    });

    it('should return 404 if project not found', async () => {
      projectsDb.delete.mockReturnValue(false);

      const response = await request(app).delete('/api/v2/projects/999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });
  });

  describe('GET /api/v2/projects/:id/documentation', () => {
    it('should return project documentation', async () => {
      const mockProject = { id: 1, user_id: testUserId, repo_folder_path: '/path/1' };
      projectsDb.getById.mockReturnValue(mockProject);
      readProjectDoc.mockReturnValue('# Project Documentation');

      const response = await request(app).get('/api/v2/projects/1/documentation');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ content: '# Project Documentation' });
      expect(readProjectDoc).toHaveBeenCalledWith('/path/1');
    });

    it('should return 404 if project not found', async () => {
      projectsDb.getById.mockReturnValue(undefined);

      const response = await request(app).get('/api/v2/projects/999/documentation');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });
  });

  describe('PUT /api/v2/projects/:id/documentation', () => {
    it('should update project documentation', async () => {
      const mockProject = { id: 1, user_id: testUserId, repo_folder_path: '/path/1' };
      projectsDb.getById.mockReturnValue(mockProject);
      writeProjectDoc.mockReturnValue(undefined);

      const response = await request(app)
        .put('/api/v2/projects/1/documentation')
        .send({ content: '# Updated Documentation' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(writeProjectDoc).toHaveBeenCalledWith('/path/1', '# Updated Documentation');
    });

    it('should return 400 if content is missing', async () => {
      const mockProject = { id: 1, user_id: testUserId, repo_folder_path: '/path/1' };
      projectsDb.getById.mockReturnValue(mockProject);

      const response = await request(app)
        .put('/api/v2/projects/1/documentation')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Content is required');
    });

    it('should return 404 if project not found', async () => {
      projectsDb.getById.mockReturnValue(undefined);

      const response = await request(app)
        .put('/api/v2/projects/999/documentation')
        .send({ content: 'Content' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });
  });
});
