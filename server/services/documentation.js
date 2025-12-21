import fs from 'fs';
import path from 'path';

const CLAUDE_UI_FOLDER = '.claude-ui';
const TASKS_FOLDER = 'tasks';
const AGENTS_FOLDER = 'agents';
const PROJECT_DOC_FILE = 'project.md';

/**
 * Get the path to the .claude-ui folder for a repo
 */
function getClaudeUIPath(repoPath) {
  return path.join(repoPath, CLAUDE_UI_FOLDER);
}

/**
 * Get the path to the tasks folder for a repo
 */
function getTasksFolderPath(repoPath) {
  return path.join(repoPath, CLAUDE_UI_FOLDER, TASKS_FOLDER);
}

/**
 * Get the path to the project documentation file
 */
function getProjectDocPath(repoPath) {
  return path.join(repoPath, CLAUDE_UI_FOLDER, PROJECT_DOC_FILE);
}

/**
 * Get the path to a task documentation file
 */
function getTaskDocPath(repoPath, taskId) {
  return path.join(repoPath, CLAUDE_UI_FOLDER, TASKS_FOLDER, `task-${taskId}.md`);
}

/**
 * Get the path to the agents folder for a repo
 */
function getAgentsFolderPath(repoPath) {
  return path.join(repoPath, CLAUDE_UI_FOLDER, AGENTS_FOLDER);
}

/**
 * Get the path to an agent prompt file
 */
function getAgentDocPath(repoPath, agentId) {
  return path.join(repoPath, CLAUDE_UI_FOLDER, AGENTS_FOLDER, `agent-${agentId}.md`);
}

/**
 * Create .claude-ui/, .claude-ui/tasks/, and .claude-ui/agents/ folders if they don't exist
 * @param {string} repoPath - Absolute path to the repository
 * @returns {boolean} - True if folders were created or already exist
 */
export function ensureClaudeUIFolder(repoPath) {
  try {
    const claudeUIPath = getClaudeUIPath(repoPath);
    const tasksPath = getTasksFolderPath(repoPath);
    const agentsPath = getAgentsFolderPath(repoPath);

    // Create .claude-ui folder if it doesn't exist
    if (!fs.existsSync(claudeUIPath)) {
      fs.mkdirSync(claudeUIPath, { recursive: true });
    }

    // Create tasks subfolder if it doesn't exist
    if (!fs.existsSync(tasksPath)) {
      fs.mkdirSync(tasksPath, { recursive: true });
    }

    // Create agents subfolder if it doesn't exist
    if (!fs.existsSync(agentsPath)) {
      fs.mkdirSync(agentsPath, { recursive: true });
    }

    return true;
  } catch (error) {
    console.error(`Failed to create .claude-ui folder structure: ${error.message}`);
    throw error;
  }
}

/**
 * Read project documentation from .claude-ui/project.md
 * @param {string} repoPath - Absolute path to the repository
 * @returns {string} - Content of project.md or empty string if missing
 */
export function readProjectDoc(repoPath) {
  try {
    const docPath = getProjectDocPath(repoPath);

    if (!fs.existsSync(docPath)) {
      return '';
    }

    return fs.readFileSync(docPath, 'utf8');
  } catch (error) {
    console.error(`Failed to read project documentation: ${error.message}`);
    throw error;
  }
}

/**
 * Write project documentation to .claude-ui/project.md
 * @param {string} repoPath - Absolute path to the repository
 * @param {string} content - Content to write
 */
export function writeProjectDoc(repoPath, content) {
  try {
    // Ensure the folder exists before writing
    ensureClaudeUIFolder(repoPath);

    const docPath = getProjectDocPath(repoPath);
    fs.writeFileSync(docPath, content, 'utf8');
  } catch (error) {
    console.error(`Failed to write project documentation: ${error.message}`);
    throw error;
  }
}

/**
 * Read task documentation from .claude-ui/tasks/task-{taskId}.md
 * @param {string} repoPath - Absolute path to the repository
 * @param {number} taskId - The task ID
 * @returns {string} - Content of task markdown or empty string if missing
 */
export function readTaskDoc(repoPath, taskId) {
  try {
    const docPath = getTaskDocPath(repoPath, taskId);

    if (!fs.existsSync(docPath)) {
      return '';
    }

    return fs.readFileSync(docPath, 'utf8');
  } catch (error) {
    console.error(`Failed to read task documentation: ${error.message}`);
    throw error;
  }
}

/**
 * Write task documentation to .claude-ui/tasks/task-{taskId}.md
 * @param {string} repoPath - Absolute path to the repository
 * @param {number} taskId - The task ID
 * @param {string} content - Content to write
 */
export function writeTaskDoc(repoPath, taskId, content) {
  try {
    // Ensure the folder exists before writing
    ensureClaudeUIFolder(repoPath);

    const docPath = getTaskDocPath(repoPath, taskId);
    fs.writeFileSync(docPath, content, 'utf8');
  } catch (error) {
    console.error(`Failed to write task documentation: ${error.message}`);
    throw error;
  }
}

/**
 * Delete task documentation file .claude-ui/tasks/task-{taskId}.md
 * @param {string} repoPath - Absolute path to the repository
 * @param {number} taskId - The task ID
 * @returns {boolean} - True if file was deleted, false if it didn't exist
 */
export function deleteTaskDoc(repoPath, taskId) {
  try {
    const docPath = getTaskDocPath(repoPath, taskId);

    if (!fs.existsSync(docPath)) {
      return false;
    }

    fs.unlinkSync(docPath);
    return true;
  } catch (error) {
    console.error(`Failed to delete task documentation: ${error.message}`);
    throw error;
  }
}

/**
 * Read agent prompt from .claude-ui/agents/agent-{agentId}.md
 * @param {string} repoPath - Absolute path to the repository
 * @param {number} agentId - The agent ID
 * @returns {string} - Content of agent markdown or empty string if missing
 */
export function readAgentPrompt(repoPath, agentId) {
  try {
    const docPath = getAgentDocPath(repoPath, agentId);

    if (!fs.existsSync(docPath)) {
      return '';
    }

    return fs.readFileSync(docPath, 'utf8');
  } catch (error) {
    console.error(`Failed to read agent prompt: ${error.message}`);
    throw error;
  }
}

/**
 * Write agent prompt to .claude-ui/agents/agent-{agentId}.md
 * @param {string} repoPath - Absolute path to the repository
 * @param {number} agentId - The agent ID
 * @param {string} content - Content to write
 */
export function writeAgentPrompt(repoPath, agentId, content) {
  try {
    // Ensure the folder exists before writing
    ensureClaudeUIFolder(repoPath);

    const docPath = getAgentDocPath(repoPath, agentId);
    fs.writeFileSync(docPath, content, 'utf8');
  } catch (error) {
    console.error(`Failed to write agent prompt: ${error.message}`);
    throw error;
  }
}

/**
 * Delete agent prompt file .claude-ui/agents/agent-{agentId}.md
 * @param {string} repoPath - Absolute path to the repository
 * @param {number} agentId - The agent ID
 * @returns {boolean} - True if file was deleted, false if it didn't exist
 */
export function deleteAgentPrompt(repoPath, agentId) {
  try {
    const docPath = getAgentDocPath(repoPath, agentId);

    if (!fs.existsSync(docPath)) {
      return false;
    }

    fs.unlinkSync(docPath);
    return true;
  } catch (error) {
    console.error(`Failed to delete agent prompt: ${error.message}`);
    throw error;
  }
}

/**
 * Build a combined context prompt from project and task documentation
 * @param {string} repoPath - Absolute path to the repository
 * @param {number} taskId - The task ID
 * @returns {string} - Combined system prompt with project and task context
 */
export function buildContextPrompt(repoPath, taskId) {
  const projectDoc = readProjectDoc(repoPath);
  const taskDoc = readTaskDoc(repoPath, taskId);

  const sections = [];

  if (projectDoc.trim()) {
    sections.push(`## Project Context\n\n${projectDoc.trim()}`);
  }

  if (taskDoc.trim()) {
    sections.push(`## Task Context\n\n${taskDoc.trim()}`);
  }

  if (sections.length === 0) {
    return '';
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Build a combined context prompt from project documentation and agent prompt
 * @param {string} repoPath - Absolute path to the repository
 * @param {number} agentId - The agent ID
 * @returns {string} - Combined system prompt with project context and agent prompt
 */
export function buildAgentContextPrompt(repoPath, agentId) {
  const projectDoc = readProjectDoc(repoPath);
  const agentPrompt = readAgentPrompt(repoPath, agentId);

  const sections = [];

  if (projectDoc.trim()) {
    sections.push(`## Project Context\n\n${projectDoc.trim()}`);
  }

  if (agentPrompt.trim()) {
    sections.push(`## Agent Instructions\n\n${agentPrompt.trim()}`);
  }

  if (sections.length === 0) {
    return '';
  }

  return sections.join('\n\n---\n\n');
}

// Export path helper functions for testing
export const _internal = {
  getClaudeUIPath,
  getTasksFolderPath,
  getAgentsFolderPath,
  getProjectDocPath,
  getTaskDocPath,
  getAgentDocPath
};
