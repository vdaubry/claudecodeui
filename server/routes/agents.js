import express from 'express';
import { projectsDb, agentsDb, conversationsDb } from '../database/db.js';
import {
  readAgentPrompt,
  writeAgentPrompt,
  deleteAgentPrompt
} from '../services/documentation.js';

const router = express.Router();

/**
 * GET /api/projects/:projectId/agents
 * List all agents for a project
 */
router.get('/projects/:projectId/agents', (req, res) => {
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

    const agents = agentsDb.getByProject(projectId);
    res.json(agents);
  } catch (error) {
    console.error('Error listing agents:', error);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

/**
 * POST /api/projects/:projectId/agents
 * Create a new agent for a project
 */
router.post('/projects/:projectId/agents', (req, res) => {
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

    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Agent name is required' });
    }

    const agent = agentsDb.create(projectId, name.trim());

    // Auto-create agent-{id}.md file (empty)
    try {
      writeAgentPrompt(project.repo_folder_path, agent.id, '');
    } catch (fileError) {
      console.error('Failed to create agent prompt file:', fileError);
      // Don't fail the request, just log the error
    }

    res.status(201).json(agent);
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

/**
 * GET /api/agents/:id
 * Get a specific agent by ID
 */
router.get('/agents/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const agentId = parseInt(req.params.id, 10);

    if (isNaN(agentId)) {
      return res.status(400).json({ error: 'Invalid agent ID' });
    }

    // Get agent with project info to verify ownership
    const agentWithProject = agentsDb.getWithProject(agentId);

    if (!agentWithProject) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Verify the project belongs to the user
    if (agentWithProject.user_id !== userId) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Return just the agent fields
    const agent = agentsDb.getById(agentId);
    res.json(agent);
  } catch (error) {
    console.error('Error getting agent:', error);
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

/**
 * PUT /api/agents/:id
 * Update an agent
 */
router.put('/agents/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const agentId = parseInt(req.params.id, 10);

    if (isNaN(agentId)) {
      return res.status(400).json({ error: 'Invalid agent ID' });
    }

    // Get agent with project info to verify ownership
    const agentWithProject = agentsDb.getWithProject(agentId);

    if (!agentWithProject) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Verify the project belongs to the user
    if (agentWithProject.user_id !== userId) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const updates = {};
    if (req.body.name !== undefined) {
      if (!req.body.name || !req.body.name.trim()) {
        return res.status(400).json({ error: 'Agent name cannot be empty' });
      }
      updates.name = req.body.name.trim();
    }

    const agent = agentsDb.update(agentId, updates);
    res.json(agent);
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

/**
 * DELETE /api/agents/:id
 * Delete an agent
 */
router.delete('/agents/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const agentId = parseInt(req.params.id, 10);

    if (isNaN(agentId)) {
      return res.status(400).json({ error: 'Invalid agent ID' });
    }

    // Get agent with project info to verify ownership and get repo path
    const agentWithProject = agentsDb.getWithProject(agentId);

    if (!agentWithProject) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Verify the project belongs to the user
    if (agentWithProject.user_id !== userId) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Delete the agent from database (cascade deletes conversations)
    const deleted = agentsDb.delete(agentId);

    if (!deleted) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Delete agent-{id}.md file
    try {
      deleteAgentPrompt(agentWithProject.repo_folder_path, agentId);
    } catch (fileError) {
      console.error('Failed to delete agent prompt file:', fileError);
      // Don't fail the request, just log the error
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

/**
 * GET /api/agents/:id/prompt
 * Get agent prompt (agent-{id}.md)
 */
router.get('/agents/:id/prompt', (req, res) => {
  try {
    const userId = req.user.id;
    const agentId = parseInt(req.params.id, 10);

    if (isNaN(agentId)) {
      return res.status(400).json({ error: 'Invalid agent ID' });
    }

    // Get agent with project info to verify ownership
    const agentWithProject = agentsDb.getWithProject(agentId);

    if (!agentWithProject) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Verify the project belongs to the user
    if (agentWithProject.user_id !== userId) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const content = readAgentPrompt(agentWithProject.repo_folder_path, agentId);
    res.json({ content });
  } catch (error) {
    console.error('Error reading agent prompt:', error);
    res.status(500).json({ error: 'Failed to read agent prompt' });
  }
});

/**
 * PUT /api/agents/:id/prompt
 * Update agent prompt (agent-{id}.md)
 */
router.put('/agents/:id/prompt', (req, res) => {
  try {
    const userId = req.user.id;
    const agentId = parseInt(req.params.id, 10);

    if (isNaN(agentId)) {
      return res.status(400).json({ error: 'Invalid agent ID' });
    }

    // Get agent with project info to verify ownership
    const agentWithProject = agentsDb.getWithProject(agentId);

    if (!agentWithProject) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Verify the project belongs to the user
    if (agentWithProject.user_id !== userId) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const { content } = req.body;

    if (content === undefined) {
      return res.status(400).json({ error: 'Content is required' });
    }

    writeAgentPrompt(agentWithProject.repo_folder_path, agentId, content);
    res.json({ success: true });
  } catch (error) {
    console.error('Error writing agent prompt:', error);
    res.status(500).json({ error: 'Failed to write agent prompt' });
  }
});

/**
 * GET /api/agents/:agentId/conversations
 * List all conversations for an agent
 */
router.get('/agents/:agentId/conversations', (req, res) => {
  try {
    const userId = req.user.id;
    const agentId = parseInt(req.params.agentId, 10);

    if (isNaN(agentId)) {
      return res.status(400).json({ error: 'Invalid agent ID' });
    }

    // Get agent with project info to verify ownership
    const agentWithProject = agentsDb.getWithProject(agentId);

    if (!agentWithProject) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Verify the project belongs to the user
    if (agentWithProject.user_id !== userId) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const conversations = conversationsDb.getByAgent(agentId);
    res.json(conversations);
  } catch (error) {
    console.error('Error listing agent conversations:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

/**
 * POST /api/agents/:agentId/conversations
 * Create a new conversation for an agent
 */
router.post('/agents/:agentId/conversations', (req, res) => {
  try {
    const userId = req.user.id;
    const agentId = parseInt(req.params.agentId, 10);

    if (isNaN(agentId)) {
      return res.status(400).json({ error: 'Invalid agent ID' });
    }

    // Get agent with project info to verify ownership
    const agentWithProject = agentsDb.getWithProject(agentId);

    if (!agentWithProject) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Verify the project belongs to the user
    if (agentWithProject.user_id !== userId) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const conversation = conversationsDb.createForAgent(agentId);
    res.status(201).json(conversation);
  } catch (error) {
    console.error('Error creating agent conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

export default router;
