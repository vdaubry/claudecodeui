import express from 'express';
import { projectsDb } from '../database/db.js';
import {
  ensureClaudeUIFolder,
  readProjectDoc,
  writeProjectDoc
} from '../services/documentation.js';

const router = express.Router();

/**
 * GET /api/projects
 * List all projects for the authenticated user
 */
router.get('/', (req, res) => {
  try {
    const userId = req.user.id;
    const projects = projectsDb.getAll(userId);
    res.json(projects);
  } catch (error) {
    console.error('Error listing projects:', error);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

/**
 * POST /api/projects
 * Create a new project
 */
router.post('/', (req, res) => {
  try {
    const userId = req.user.id;
    const { name, repoFolderPath } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    if (!repoFolderPath || !repoFolderPath.trim()) {
      return res.status(400).json({ error: 'Repository folder path is required' });
    }

    // Create the project in the database
    const project = projectsDb.create(userId, name.trim(), repoFolderPath.trim());

    // Auto-create .claude-ui/ folder structure
    try {
      ensureClaudeUIFolder(repoFolderPath.trim());
    } catch (folderError) {
      console.error('Failed to create .claude-ui folder:', folderError);
      // Don't fail the request, just log the error
    }

    res.status(201).json(project);
  } catch (error) {
    console.error('Error creating project:', error);

    // Handle unique constraint violation
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A project with this repository path already exists' });
    }

    res.status(500).json({ error: 'Failed to create project' });
  }
});

/**
 * GET /api/projects/:id
 * Get a specific project by ID
 */
router.get('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = parseInt(req.params.id, 10);

    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const project = projectsDb.getById(projectId, userId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    console.error('Error getting project:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

/**
 * PUT /api/projects/:id
 * Update a project
 */
router.put('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = parseInt(req.params.id, 10);

    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const updates = {};
    if (req.body.name !== undefined) {
      updates.name = req.body.name.trim();
    }
    if (req.body.repoFolderPath !== undefined) {
      updates.repo_folder_path = req.body.repoFolderPath.trim();
    }

    const project = projectsDb.update(projectId, userId, updates);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    console.error('Error updating project:', error);

    // Handle unique constraint violation
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A project with this repository path already exists' });
    }

    res.status(500).json({ error: 'Failed to update project' });
  }
});

/**
 * DELETE /api/projects/:id
 * Delete a project
 */
router.delete('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = parseInt(req.params.id, 10);

    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const deleted = projectsDb.delete(projectId, userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

/**
 * GET /api/projects/:id/documentation
 * Get project documentation (project.md)
 */
router.get('/:id/documentation', (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = parseInt(req.params.id, 10);

    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const project = projectsDb.getById(projectId, userId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const content = readProjectDoc(project.repo_folder_path);
    res.json({ content });
  } catch (error) {
    console.error('Error reading project documentation:', error);
    res.status(500).json({ error: 'Failed to read project documentation' });
  }
});

/**
 * PUT /api/projects/:id/documentation
 * Update project documentation (project.md)
 */
router.put('/:id/documentation', (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = parseInt(req.params.id, 10);

    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const project = projectsDb.getById(projectId, userId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { content } = req.body;

    if (content === undefined) {
      return res.status(400).json({ error: 'Content is required' });
    }

    writeProjectDoc(project.repo_folder_path, content);
    res.json({ success: true });
  } catch (error) {
    console.error('Error writing project documentation:', error);
    res.status(500).json({ error: 'Failed to write project documentation' });
  }
});

export default router;
