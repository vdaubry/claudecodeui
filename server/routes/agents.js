import express from 'express';
import multer from 'multer';
import path from 'path';
import { projectsDb, agentsDb, conversationsDb } from '../database/db.js';
import {
  readAgentPrompt,
  writeAgentPrompt,
  deleteAgentPrompt,
  listAgentInputFiles,
  saveAgentInputFile,
  deleteAgentInputFile,
  listAgentOutputFiles,
  readAgentOutputFile,
  deleteAgentOutputFile,
  ATTACHMENT_CONFIG
} from '../services/documentation.js';
import { startAgentConversation } from '../services/conversationAdapter.js';
import { createConversationHandler } from './conversationHandlers.js';
import { validateCronExpression, recalculateAgentNextRun } from '../services/cronScheduler.js';

const router = express.Router();

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: ATTACHMENT_CONFIG.maxSizeBytes
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ATTACHMENT_CONFIG.allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed. Allowed types: ${ATTACHMENT_CONFIG.allowedExtensions.join(', ')}`), false);
    }
  }
});

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

    // Handle schedule fields
    if (req.body.schedule !== undefined) {
      if (req.body.schedule !== null && req.body.schedule !== '') {
        const validation = validateCronExpression(req.body.schedule);
        if (!validation.valid) {
          return res.status(400).json({ error: `Invalid cron expression: ${validation.error}` });
        }
      }
      updates.schedule = req.body.schedule || null;
    }

    if (req.body.cron_prompt !== undefined) {
      updates.cron_prompt = req.body.cron_prompt || null;
    }

    if (req.body.schedule_enabled !== undefined) {
      updates.schedule_enabled = req.body.schedule_enabled ? 1 : 0;
    }

    const agent = agentsDb.update(agentId, updates);

    // Recalculate next run time if schedule or enabled state changed
    if (updates.schedule !== undefined || updates.schedule_enabled !== undefined) {
      recalculateAgentNextRun(agentId);
    }

    // Return the updated agent (refetch to get all fields including next_run_at)
    const updatedAgent = agentsDb.getById(agentId);
    res.json(updatedAgent);
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
 *
 * If `message` is provided in the body, creates the conversation AND starts
 * the Claude session synchronously, returning the real claude_conversation_id.
 * This is the preferred method for new conversations (modal-first flow).
 *
 * Body (optional):
 * - message: string - First message to send to Claude
 * - permissionMode: string - Permission mode (default: 'bypassPermissions')
 */
const createAgentConversationHandler = createConversationHandler({
  getId: (req) => parseInt(req.params.agentId, 10),
  invalidIdMessage: 'Invalid agent ID',
  notFoundMessage: 'Agent not found',
  generalErrorMessage: 'Failed to create conversation',
  generalErrorLogPrefix: 'Error creating agent conversation:',
  sessionErrorLogPrefix: '[REST] Failed to create agent session:',
  precreateConversation: false,
  getEntityWithProject: (agentId) => agentsDb.getWithProject(agentId),
  createConversation: (agentId) => conversationsDb.createForAgent(agentId),
  deleteConversation: (conversationId) => conversationsDb.delete(conversationId),
  cleanupConversationOnSessionError: false,
  getConversationById: (conversationId) => conversationsDb.getById(conversationId),
  buildSystemPrompt: null,
  startSession: (agentId, message, options) => startAgentConversation(agentId, message, options),
});

router.post('/agents/:agentId/conversations', createAgentConversationHandler);

/**
 * GET /api/agents/:id/attachments
 * List all attachments for an agent
 */
router.get('/agents/:id/attachments', (req, res) => {
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

    const files = listAgentInputFiles(agentWithProject.repo_folder_path, agentId);
    res.json(files);
  } catch (error) {
    console.error('Error listing agent attachments:', error);
    res.status(500).json({ error: 'Failed to list attachments' });
  }
});

/**
 * POST /api/agents/:id/attachments
 * Upload a new attachment for an agent
 */
router.post('/agents/:id/attachments', (req, res) => {
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

  // Handle file upload with multer
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: `File size exceeds ${ATTACHMENT_CONFIG.maxSizeBytes / (1024 * 1024)} MB limit` });
        }
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    try {
      const fileInfo = saveAgentInputFile(
        agentWithProject.repo_folder_path,
        agentId,
        req.file.originalname,
        req.file.buffer
      );
      res.status(201).json({ success: true, file: fileInfo });
    } catch (saveError) {
      console.error('Error saving attachment:', saveError);
      res.status(500).json({ error: 'Failed to save attachment' });
    }
  });
});

/**
 * DELETE /api/agents/:id/attachments/:filename
 * Delete an attachment from an agent
 */
router.delete('/agents/:id/attachments/:filename', (req, res) => {
  try {
    const userId = req.user.id;
    const agentId = parseInt(req.params.id, 10);
    const filename = req.params.filename;

    if (isNaN(agentId)) {
      return res.status(400).json({ error: 'Invalid agent ID' });
    }

    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
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

    const deleted = deleteAgentInputFile(agentWithProject.repo_folder_path, agentId, filename);

    if (!deleted) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting agent attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

/**
 * GET /api/agents/:id/output-files
 * List all output files for an agent
 */
router.get('/agents/:id/output-files', (req, res) => {
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

    const files = listAgentOutputFiles(agentWithProject.repo_folder_path, agentId);
    res.json(files);
  } catch (error) {
    console.error('Error listing agent output files:', error);
    res.status(500).json({ error: 'Failed to list output files' });
  }
});

/**
 * GET /api/agents/:id/output-files/:filename
 * Download an output file from an agent
 */
router.get('/agents/:id/output-files/:filename', (req, res) => {
  try {
    const userId = req.user.id;
    const agentId = parseInt(req.params.id, 10);
    const filename = req.params.filename;

    if (isNaN(agentId)) {
      return res.status(400).json({ error: 'Invalid agent ID' });
    }

    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
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

    const fileData = readAgentOutputFile(agentWithProject.repo_folder_path, agentId, filename);

    if (!fileData) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Set headers for file download
    res.setHeader('Content-Type', fileData.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileData.filename}"`);
    res.setHeader('Content-Length', fileData.buffer.length);
    res.send(fileData.buffer);
  } catch (error) {
    console.error('Error downloading agent output file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

/**
 * DELETE /api/agents/:id/output-files/:filename
 * Delete an output file from an agent
 */
router.delete('/agents/:id/output-files/:filename', (req, res) => {
  try {
    const userId = req.user.id;
    const agentId = parseInt(req.params.id, 10);
    const filename = req.params.filename;

    if (isNaN(agentId)) {
      return res.status(400).json({ error: 'Invalid agent ID' });
    }

    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
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

    const deleted = deleteAgentOutputFile(agentWithProject.repo_folder_path, agentId, filename);

    if (!deleted) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting agent output file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

/**
 * POST /api/agents/validate-cron
 * Validate a cron expression and return human-readable description
 */
router.post('/agents/validate-cron', (req, res) => {
  try {
    const { expression } = req.body;

    if (!expression) {
      return res.status(400).json({ error: 'Expression is required' });
    }

    const validation = validateCronExpression(expression);
    res.json(validation);
  } catch (error) {
    console.error('Error validating cron expression:', error);
    res.status(500).json({ error: 'Failed to validate cron expression' });
  }
});

/**
 * POST /api/agents/:id/trigger
 * Manually trigger a scheduled agent run (uses cron_prompt)
 */
router.post('/agents/:id/trigger', async (req, res) => {
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

    // Check if agent has a cron_prompt configured
    if (!agentWithProject.cron_prompt) {
      return res.status(400).json({ error: 'Agent has no cron prompt configured' });
    }

    // Create conversation with triggered_by = 'manual' (even though using cron prompt)
    const conversation = conversationsDb.createForAgentWithTrigger(agentId, 'manual');

    // Get WebSocket server for broadcasting
    const wss = req.app.get('wss');
    const broadcastFn = wss ? (convId, msg) => {
      wss.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(JSON.stringify(msg));
        }
      });
    } : null;

    // Start agent conversation with cron_prompt
    await startAgentConversation(agentId, agentWithProject.cron_prompt, {
      broadcastFn,
      conversationId: conversation.id,
      userId,
      permissionMode: 'bypassPermissions'
    });

    res.json({ success: true, conversationId: conversation.id });
  } catch (error) {
    console.error('Error triggering agent:', error);
    res.status(500).json({ error: 'Failed to trigger agent' });
  }
});

export default router;
