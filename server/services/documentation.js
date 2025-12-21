import fs from 'fs';
import path from 'path';

const CLAUDE_UI_FOLDER = '.claude-ui';
const TASKS_FOLDER = 'tasks';
const AGENTS_FOLDER = 'agents';
const INPUT_FILES_FOLDER = 'input_files';
const PROJECT_DOC_FILE = 'project.md';

/**
 * Attachment validation configuration
 */
export const ATTACHMENT_CONFIG = {
  maxSizeBytes: 5 * 1024 * 1024, // 5 MB
  allowedExtensions: [
    // Text files
    '.txt', '.md', '.json', '.yaml', '.yml', '.csv',
    // Images
    '.png', '.jpg', '.jpeg', '.gif',
    // PDFs
    '.pdf',
    // Code files
    '.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.css', '.scss', '.html', '.xml', '.sh', '.bash', '.sql'
  ]
};

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
 * Get the path to a specific agent's folder
 */
function getAgentFolderPath(repoPath, agentId) {
  return path.join(repoPath, CLAUDE_UI_FOLDER, AGENTS_FOLDER, `agent-${agentId}`);
}

/**
 * Get the path to an agent prompt file
 */
function getAgentDocPath(repoPath, agentId) {
  return path.join(repoPath, CLAUDE_UI_FOLDER, AGENTS_FOLDER, `agent-${agentId}`, 'prompt.md');
}

/**
 * Get the path to an agent's input_files folder
 */
function getAgentInputFilesPath(repoPath, agentId) {
  return path.join(repoPath, CLAUDE_UI_FOLDER, AGENTS_FOLDER, `agent-${agentId}`, INPUT_FILES_FOLDER);
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
 * Read agent prompt from .claude-ui/agents/agent-{agentId}/prompt.md
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
 * Write agent prompt to .claude-ui/agents/agent-{agentId}/prompt.md
 * @param {string} repoPath - Absolute path to the repository
 * @param {number} agentId - The agent ID
 * @param {string} content - Content to write
 */
export function writeAgentPrompt(repoPath, agentId, content) {
  try {
    // Ensure the base folder structure exists
    ensureClaudeUIFolder(repoPath);

    // Ensure the agent-specific folder exists
    const agentFolder = getAgentFolderPath(repoPath, agentId);
    if (!fs.existsSync(agentFolder)) {
      fs.mkdirSync(agentFolder, { recursive: true });
    }

    const docPath = getAgentDocPath(repoPath, agentId);
    fs.writeFileSync(docPath, content, 'utf8');
  } catch (error) {
    console.error(`Failed to write agent prompt: ${error.message}`);
    throw error;
  }
}

/**
 * Delete agent folder .claude-ui/agents/agent-{agentId}/
 * @param {string} repoPath - Absolute path to the repository
 * @param {number} agentId - The agent ID
 * @returns {boolean} - True if folder was deleted, false if it didn't exist
 */
export function deleteAgentPrompt(repoPath, agentId) {
  try {
    const agentFolder = getAgentFolderPath(repoPath, agentId);

    if (!fs.existsSync(agentFolder)) {
      return false;
    }

    fs.rmSync(agentFolder, { recursive: true, force: true });
    return true;
  } catch (error) {
    console.error(`Failed to delete agent folder: ${error.message}`);
    throw error;
  }
}

/**
 * Ensure the input_files folder exists for an agent
 * @param {string} repoPath - Absolute path to the repository
 * @param {number} agentId - The agent ID
 * @returns {string} - Path to the input_files folder
 */
export function ensureAgentInputFilesFolder(repoPath, agentId) {
  try {
    // Ensure base folder structure exists
    ensureClaudeUIFolder(repoPath);

    // Ensure agent folder exists
    const agentFolder = getAgentFolderPath(repoPath, agentId);
    if (!fs.existsSync(agentFolder)) {
      fs.mkdirSync(agentFolder, { recursive: true });
    }

    // Ensure input_files folder exists
    const inputFilesPath = getAgentInputFilesPath(repoPath, agentId);
    if (!fs.existsSync(inputFilesPath)) {
      fs.mkdirSync(inputFilesPath, { recursive: true });
    }

    return inputFilesPath;
  } catch (error) {
    console.error(`Failed to ensure input_files folder: ${error.message}`);
    throw error;
  }
}

/**
 * List all files in an agent's input_files folder
 * @param {string} repoPath - Absolute path to the repository
 * @param {number} agentId - The agent ID
 * @returns {Array<{name: string, size: number, mimeType: string}>} - List of files
 */
export function listAgentInputFiles(repoPath, agentId) {
  try {
    const inputFilesPath = getAgentInputFilesPath(repoPath, agentId);

    if (!fs.existsSync(inputFilesPath)) {
      return [];
    }

    const files = fs.readdirSync(inputFilesPath);
    return files
      .filter(name => {
        const filePath = path.join(inputFilesPath, name);
        return fs.statSync(filePath).isFile();
      })
      .map(name => {
        const filePath = path.join(inputFilesPath, name);
        const stats = fs.statSync(filePath);
        const ext = path.extname(name).toLowerCase();

        // Simple mime type mapping
        const mimeTypes = {
          '.txt': 'text/plain',
          '.md': 'text/markdown',
          '.json': 'application/json',
          '.yaml': 'text/yaml',
          '.yml': 'text/yaml',
          '.csv': 'text/csv',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.pdf': 'application/pdf',
          '.js': 'text/javascript',
          '.ts': 'text/typescript',
          '.jsx': 'text/javascript',
          '.tsx': 'text/typescript',
          '.py': 'text/x-python',
          '.rb': 'text/x-ruby',
          '.go': 'text/x-go',
          '.rs': 'text/x-rust',
          '.java': 'text/x-java',
          '.c': 'text/x-c',
          '.cpp': 'text/x-c++',
          '.h': 'text/x-c',
          '.hpp': 'text/x-c++',
          '.css': 'text/css',
          '.scss': 'text/x-scss',
          '.html': 'text/html',
          '.xml': 'text/xml',
          '.sh': 'application/x-sh',
          '.bash': 'application/x-sh',
          '.sql': 'text/x-sql'
        };

        return {
          name,
          size: stats.size,
          mimeType: mimeTypes[ext] || 'application/octet-stream'
        };
      });
  } catch (error) {
    console.error(`Failed to list agent input files: ${error.message}`);
    throw error;
  }
}

/**
 * Save an uploaded file to agent's input_files folder
 * @param {string} repoPath - Absolute path to the repository
 * @param {number} agentId - The agent ID
 * @param {string} filename - Original filename
 * @param {Buffer} buffer - File content buffer
 * @returns {{name: string, size: number, mimeType: string}} - Saved file info
 */
export function saveAgentInputFile(repoPath, agentId, filename, buffer) {
  try {
    // Ensure folder exists
    const inputFilesPath = ensureAgentInputFilesFolder(repoPath, agentId);

    // Sanitize filename - remove path components and dangerous characters
    const sanitizedName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(inputFilesPath, sanitizedName);

    // Write file
    fs.writeFileSync(filePath, buffer);

    // Get file info
    const stats = fs.statSync(filePath);
    const ext = path.extname(sanitizedName).toLowerCase();

    const mimeTypes = {
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.yaml': 'text/yaml',
      '.yml': 'text/yaml',
      '.csv': 'text/csv',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.jsx': 'text/javascript',
      '.tsx': 'text/typescript',
      '.py': 'text/x-python',
      '.rb': 'text/x-ruby',
      '.go': 'text/x-go',
      '.rs': 'text/x-rust',
      '.java': 'text/x-java',
      '.c': 'text/x-c',
      '.cpp': 'text/x-c++',
      '.h': 'text/x-c',
      '.hpp': 'text/x-c++',
      '.css': 'text/css',
      '.scss': 'text/x-scss',
      '.html': 'text/html',
      '.xml': 'text/xml',
      '.sh': 'application/x-sh',
      '.bash': 'application/x-sh',
      '.sql': 'text/x-sql'
    };

    return {
      name: sanitizedName,
      size: stats.size,
      mimeType: mimeTypes[ext] || 'application/octet-stream'
    };
  } catch (error) {
    console.error(`Failed to save agent input file: ${error.message}`);
    throw error;
  }
}

/**
 * Delete a file from agent's input_files folder
 * @param {string} repoPath - Absolute path to the repository
 * @param {number} agentId - The agent ID
 * @param {string} filename - Filename to delete
 * @returns {boolean} - True if file was deleted, false if it didn't exist
 */
export function deleteAgentInputFile(repoPath, agentId, filename) {
  try {
    const inputFilesPath = getAgentInputFilesPath(repoPath, agentId);
    const filePath = path.join(inputFilesPath, path.basename(filename));

    if (!fs.existsSync(filePath)) {
      return false;
    }

    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    console.error(`Failed to delete agent input file: ${error.message}`);
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
  const inputFiles = listAgentInputFiles(repoPath, agentId);

  const sections = [];

  if (projectDoc.trim()) {
    sections.push(`## Project Context\n\n${projectDoc.trim()}`);
  }

  if (agentPrompt.trim()) {
    sections.push(`## Agent Instructions\n\n${agentPrompt.trim()}`);
  }

  // Add input files instructions if files exist
  if (inputFiles.length > 0) {
    const inputFilesPath = getAgentInputFilesPath(repoPath, agentId);
    const fileList = inputFiles.map(f => `- ${f.name}`).join('\n');

    sections.push(`## Input Files

IMPORTANT: At the start of this conversation, you MUST read ALL files in the following directory to get context:
${inputFilesPath}

Files to read:
${fileList}

Use the Read tool to read each file before proceeding with any other actions. These files contain important context for this conversation.`);
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
  getAgentFolderPath,
  getProjectDocPath,
  getTaskDocPath,
  getAgentDocPath,
  getAgentInputFilesPath
};
