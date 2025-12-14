import express from 'express';
import { projectsDb, tasksDb } from '../database/db.js';
import {
  readTaskDoc,
  writeTaskDoc,
  deleteTaskDoc
} from '../services/documentation.js';

const router = express.Router();

/**
 * GET /api/tasks
 * List all tasks across all projects for the current user
 * Query params:
 *   - status: Filter by status ('pending', 'in_progress', 'completed')
 * Returns max 50 tasks, ordered by updated_at DESC
 */
router.get('/tasks', (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    // Validate status if provided
    if (status && !['pending', 'in_progress', 'completed'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Must be one of: pending, in_progress, completed'
      });
    }

    const tasks = tasksDb.getAll(userId, status || null);
    res.json({ tasks });
  } catch (error) {
    console.error('Error listing all tasks:', error);
    res.status(500).json({ error: 'Failed to list tasks' });
  }
});

/**
 * GET /api/projects/:projectId/tasks
 * List all tasks for a project
 */
router.get('/projects/:projectId/tasks', (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = parseInt(req.params.projectId, 10);

    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // Verify the project belongs to the user
    const project = projectsDb.getById(projectId, userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const tasks = tasksDb.getByProject(projectId);
    res.json(tasks);
  } catch (error) {
    console.error('Error listing tasks:', error);
    res.status(500).json({ error: 'Failed to list tasks' });
  }
});

/**
 * POST /api/projects/:projectId/tasks
 * Create a new task for a project
 */
router.post('/projects/:projectId/tasks', (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = parseInt(req.params.projectId, 10);

    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // Verify the project belongs to the user
    const project = projectsDb.getById(projectId, userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { title } = req.body;
    const task = tasksDb.create(projectId, title?.trim() || null);

    // Auto-create task-{id}.md file (empty)
    try {
      writeTaskDoc(project.repo_folder_path, task.id, '');
    } catch (fileError) {
      console.error('Failed to create task documentation file:', fileError);
      // Don't fail the request, just log the error
    }

    res.status(201).json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/**
 * GET /api/tasks/:id
 * Get a specific task by ID
 */
router.get('/tasks/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = parseInt(req.params.id, 10);

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

    // Return just the task fields
    const task = tasksDb.getById(taskId);
    res.json(task);
  } catch (error) {
    console.error('Error getting task:', error);
    res.status(500).json({ error: 'Failed to get task' });
  }
});

/**
 * PUT /api/tasks/:id
 * Update a task
 */
router.put('/tasks/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = parseInt(req.params.id, 10);

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

    const updates = {};
    if (req.body.title !== undefined) {
      updates.title = req.body.title?.trim() || null;
    }
    if (req.body.status !== undefined) {
      const validStatuses = ['pending', 'in_progress', 'completed'];
      if (!validStatuses.includes(req.body.status)) {
        return res.status(400).json({
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }
      updates.status = req.body.status;
    }

    const task = tasksDb.update(taskId, updates);
    res.json(task);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/**
 * DELETE /api/tasks/:id
 * Delete a task
 */
router.delete('/tasks/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = parseInt(req.params.id, 10);

    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    // Get task with project info to verify ownership and get repo path
    const taskWithProject = tasksDb.getWithProject(taskId);

    if (!taskWithProject) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Verify the project belongs to the user
    if (taskWithProject.user_id !== userId) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Delete the task from database (cascade deletes conversations)
    const deleted = tasksDb.delete(taskId);

    if (!deleted) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Delete task-{id}.md file
    try {
      deleteTaskDoc(taskWithProject.repo_folder_path, taskId);
    } catch (fileError) {
      console.error('Failed to delete task documentation file:', fileError);
      // Don't fail the request, just log the error
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

/**
 * GET /api/tasks/:id/documentation
 * Get task documentation (task-{id}.md)
 */
router.get('/tasks/:id/documentation', (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = parseInt(req.params.id, 10);

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

    const content = readTaskDoc(taskWithProject.repo_folder_path, taskId);
    res.json({ content });
  } catch (error) {
    console.error('Error reading task documentation:', error);
    res.status(500).json({ error: 'Failed to read task documentation' });
  }
});

/**
 * PUT /api/tasks/:id/documentation
 * Update task documentation (task-{id}.md)
 */
router.put('/tasks/:id/documentation', (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = parseInt(req.params.id, 10);

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

    const { content } = req.body;

    if (content === undefined) {
      return res.status(400).json({ error: 'Content is required' });
    }

    writeTaskDoc(taskWithProject.repo_folder_path, taskId, content);
    res.json({ success: true });
  } catch (error) {
    console.error('Error writing task documentation:', error);
    res.status(500).json({ error: 'Failed to write task documentation' });
  }
});

export default router;
