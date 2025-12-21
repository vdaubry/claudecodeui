import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  ensureClaudeUIFolder,
  readProjectDoc,
  writeProjectDoc,
  readTaskDoc,
  writeTaskDoc,
  deleteTaskDoc,
  buildContextPrompt,
  writeAgentPrompt,
  buildAgentContextPrompt,
  ensureAgentInputFilesFolder,
  listAgentInputFiles,
  saveAgentInputFile,
  deleteAgentInputFile,
  ensureAgentOutputFilesFolder,
  listAgentOutputFiles,
  deleteAgentOutputFile,
  readAgentOutputFile,
  ATTACHMENT_CONFIG,
  _internal
} from './documentation.js';

describe('Documentation Service - Phase 2', () => {
  let testRepoPath;

  beforeEach(() => {
    // Create a unique temp directory for each test
    testRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-ui-test-'));
  });

  afterEach(() => {
    // Clean up temp directory after each test
    if (testRepoPath && fs.existsSync(testRepoPath)) {
      fs.rmSync(testRepoPath, { recursive: true, force: true });
    }
  });

  describe('_internal path helpers', () => {
    it('should return correct .claude-ui path', () => {
      const result = _internal.getClaudeUIPath('/home/user/project');
      expect(result).toBe('/home/user/project/.claude-ui');
    });

    it('should return correct tasks folder path', () => {
      const result = _internal.getTasksFolderPath('/home/user/project');
      expect(result).toBe('/home/user/project/.claude-ui/tasks');
    });

    it('should return correct project doc path', () => {
      const result = _internal.getProjectDocPath('/home/user/project');
      expect(result).toBe('/home/user/project/.claude-ui/project.md');
    });

    it('should return correct task doc path', () => {
      const result = _internal.getTaskDocPath('/home/user/project', 42);
      expect(result).toBe('/home/user/project/.claude-ui/tasks/task-42.md');
    });

    it('should return correct agents folder path', () => {
      const result = _internal.getAgentsFolderPath('/home/user/project');
      expect(result).toBe('/home/user/project/.claude-ui/agents');
    });

    it('should return correct agent folder path', () => {
      const result = _internal.getAgentFolderPath('/home/user/project', 42);
      expect(result).toBe('/home/user/project/.claude-ui/agents/agent-42');
    });

    it('should return correct agent doc path', () => {
      const result = _internal.getAgentDocPath('/home/user/project', 42);
      expect(result).toBe('/home/user/project/.claude-ui/agents/agent-42/prompt.md');
    });

    it('should return correct agent input files path', () => {
      const result = _internal.getAgentInputFilesPath('/home/user/project', 42);
      expect(result).toBe('/home/user/project/.claude-ui/agents/agent-42/input_files');
    });

    it('should return correct agent output files path', () => {
      const result = _internal.getAgentOutputFilesPath('/home/user/project', 42);
      expect(result).toBe('/home/user/project/.claude-ui/agents/agent-42/output_files');
    });
  });

  describe('ensureClaudeUIFolder', () => {
    it('should create .claude-ui folder if it does not exist', () => {
      const result = ensureClaudeUIFolder(testRepoPath);

      expect(result).toBe(true);
      expect(fs.existsSync(path.join(testRepoPath, '.claude-ui'))).toBe(true);
    });

    it('should create tasks subfolder', () => {
      ensureClaudeUIFolder(testRepoPath);

      expect(fs.existsSync(path.join(testRepoPath, '.claude-ui', 'tasks'))).toBe(true);
    });

    it('should not fail if folders already exist', () => {
      // Create folders first
      fs.mkdirSync(path.join(testRepoPath, '.claude-ui', 'tasks'), { recursive: true });

      const result = ensureClaudeUIFolder(testRepoPath);

      expect(result).toBe(true);
    });

    it('should throw error for invalid path', () => {
      expect(() => {
        ensureClaudeUIFolder('/nonexistent/path/that/cannot/be/created/\0invalid');
      }).toThrow();
    });
  });

  describe('readProjectDoc', () => {
    it('should return empty string if project.md does not exist', () => {
      const result = readProjectDoc(testRepoPath);

      expect(result).toBe('');
    });

    it('should return content of project.md if it exists', () => {
      const content = '# My Project\n\nThis is the project documentation.';
      ensureClaudeUIFolder(testRepoPath);
      fs.writeFileSync(path.join(testRepoPath, '.claude-ui', 'project.md'), content);

      const result = readProjectDoc(testRepoPath);

      expect(result).toBe(content);
    });

    it('should return empty string if .claude-ui folder does not exist', () => {
      const result = readProjectDoc(testRepoPath);

      expect(result).toBe('');
    });
  });

  describe('writeProjectDoc', () => {
    it('should create project.md with content', () => {
      const content = '# My Project\n\nDocumentation content here.';

      writeProjectDoc(testRepoPath, content);

      const result = fs.readFileSync(path.join(testRepoPath, '.claude-ui', 'project.md'), 'utf8');
      expect(result).toBe(content);
    });

    it('should auto-create .claude-ui folder if it does not exist', () => {
      writeProjectDoc(testRepoPath, 'Some content');

      expect(fs.existsSync(path.join(testRepoPath, '.claude-ui'))).toBe(true);
    });

    it('should overwrite existing project.md', () => {
      writeProjectDoc(testRepoPath, 'Old content');
      writeProjectDoc(testRepoPath, 'New content');

      const result = fs.readFileSync(path.join(testRepoPath, '.claude-ui', 'project.md'), 'utf8');
      expect(result).toBe('New content');
    });

    it('should handle empty content', () => {
      writeProjectDoc(testRepoPath, '');

      const result = fs.readFileSync(path.join(testRepoPath, '.claude-ui', 'project.md'), 'utf8');
      expect(result).toBe('');
    });
  });

  describe('readTaskDoc', () => {
    it('should return empty string if task file does not exist', () => {
      const result = readTaskDoc(testRepoPath, 1);

      expect(result).toBe('');
    });

    it('should return content of task file if it exists', () => {
      const content = '# Task 1\n\nImplement feature X.';
      ensureClaudeUIFolder(testRepoPath);
      fs.writeFileSync(path.join(testRepoPath, '.claude-ui', 'tasks', 'task-1.md'), content);

      const result = readTaskDoc(testRepoPath, 1);

      expect(result).toBe(content);
    });

    it('should read correct task file based on ID', () => {
      ensureClaudeUIFolder(testRepoPath);
      fs.writeFileSync(path.join(testRepoPath, '.claude-ui', 'tasks', 'task-1.md'), 'Task 1 content');
      fs.writeFileSync(path.join(testRepoPath, '.claude-ui', 'tasks', 'task-2.md'), 'Task 2 content');

      expect(readTaskDoc(testRepoPath, 1)).toBe('Task 1 content');
      expect(readTaskDoc(testRepoPath, 2)).toBe('Task 2 content');
    });
  });

  describe('writeTaskDoc', () => {
    it('should create task file with content', () => {
      const content = '# Task 1\n\nTask description.';

      writeTaskDoc(testRepoPath, 1, content);

      const result = fs.readFileSync(path.join(testRepoPath, '.claude-ui', 'tasks', 'task-1.md'), 'utf8');
      expect(result).toBe(content);
    });

    it('should auto-create .claude-ui/tasks folder if it does not exist', () => {
      writeTaskDoc(testRepoPath, 1, 'Content');

      expect(fs.existsSync(path.join(testRepoPath, '.claude-ui', 'tasks'))).toBe(true);
    });

    it('should overwrite existing task file', () => {
      writeTaskDoc(testRepoPath, 1, 'Old content');
      writeTaskDoc(testRepoPath, 1, 'New content');

      const result = fs.readFileSync(path.join(testRepoPath, '.claude-ui', 'tasks', 'task-1.md'), 'utf8');
      expect(result).toBe('New content');
    });

    it('should use correct filename based on task ID', () => {
      writeTaskDoc(testRepoPath, 42, 'Task 42 content');

      expect(fs.existsSync(path.join(testRepoPath, '.claude-ui', 'tasks', 'task-42.md'))).toBe(true);
    });
  });

  describe('deleteTaskDoc', () => {
    it('should delete task file and return true', () => {
      writeTaskDoc(testRepoPath, 1, 'Content');

      const result = deleteTaskDoc(testRepoPath, 1);

      expect(result).toBe(true);
      expect(fs.existsSync(path.join(testRepoPath, '.claude-ui', 'tasks', 'task-1.md'))).toBe(false);
    });

    it('should return false if task file does not exist', () => {
      ensureClaudeUIFolder(testRepoPath);

      const result = deleteTaskDoc(testRepoPath, 999);

      expect(result).toBe(false);
    });

    it('should only delete the specified task file', () => {
      writeTaskDoc(testRepoPath, 1, 'Task 1');
      writeTaskDoc(testRepoPath, 2, 'Task 2');

      deleteTaskDoc(testRepoPath, 1);

      expect(fs.existsSync(path.join(testRepoPath, '.claude-ui', 'tasks', 'task-1.md'))).toBe(false);
      expect(fs.existsSync(path.join(testRepoPath, '.claude-ui', 'tasks', 'task-2.md'))).toBe(true);
    });
  });

  describe('buildContextPrompt', () => {
    it('should return empty string when no documentation exists', () => {
      const result = buildContextPrompt(testRepoPath, 1);

      expect(result).toBe('');
    });

    it('should include only project context when task doc is missing', () => {
      writeProjectDoc(testRepoPath, 'Project documentation');

      const result = buildContextPrompt(testRepoPath, 1);

      expect(result).toContain('## Project Context');
      expect(result).toContain('Project documentation');
      expect(result).not.toContain('## Task Context');
    });

    it('should include only task context when project doc is missing', () => {
      writeTaskDoc(testRepoPath, 1, 'Task documentation');

      const result = buildContextPrompt(testRepoPath, 1);

      expect(result).toContain('## Task Context');
      expect(result).toContain('Task documentation');
      expect(result).not.toContain('## Project Context');
    });

    it('should include both project and task context when both exist', () => {
      writeProjectDoc(testRepoPath, 'Project documentation');
      writeTaskDoc(testRepoPath, 1, 'Task documentation');

      const result = buildContextPrompt(testRepoPath, 1);

      expect(result).toContain('## Project Context');
      expect(result).toContain('Project documentation');
      expect(result).toContain('## Task Context');
      expect(result).toContain('Task documentation');
      expect(result).toContain('---'); // Section separator
    });

    it('should trim whitespace from documentation', () => {
      writeProjectDoc(testRepoPath, '  Project with whitespace  \n\n');
      writeTaskDoc(testRepoPath, 1, '\n  Task with whitespace  ');

      const result = buildContextPrompt(testRepoPath, 1);

      expect(result).toContain('Project with whitespace');
      expect(result).toContain('Task with whitespace');
      expect(result).not.toMatch(/## Project Context\n\n\s+Project/);
    });

    it('should return empty string when docs exist but are whitespace only', () => {
      writeProjectDoc(testRepoPath, '   \n\n   ');
      writeTaskDoc(testRepoPath, 1, '   ');

      const result = buildContextPrompt(testRepoPath, 1);

      expect(result).toBe('');
    });

    it('should use correct task ID for context', () => {
      writeTaskDoc(testRepoPath, 1, 'Task 1 docs');
      writeTaskDoc(testRepoPath, 2, 'Task 2 docs');

      const result1 = buildContextPrompt(testRepoPath, 1);
      const result2 = buildContextPrompt(testRepoPath, 2);

      expect(result1).toContain('Task 1 docs');
      expect(result1).not.toContain('Task 2 docs');
      expect(result2).toContain('Task 2 docs');
      expect(result2).not.toContain('Task 1 docs');
    });
  });

  describe('buildAgentContextPrompt', () => {
    it('should include output files section even when no other documentation exists', () => {
      const result = buildAgentContextPrompt(testRepoPath, 1);

      expect(result).toContain('## Output Files');
      expect(result).toContain('output_files');
      expect(result).not.toContain('## Project Context');
      expect(result).not.toContain('## Agent Instructions');
    });

    it('should include only project context when agent prompt is missing', () => {
      writeProjectDoc(testRepoPath, 'Project documentation');

      const result = buildAgentContextPrompt(testRepoPath, 1);

      expect(result).toContain('## Project Context');
      expect(result).toContain('Project documentation');
      expect(result).not.toContain('## Agent Instructions');
    });

    it('should include only agent instructions when project doc is missing', () => {
      writeAgentPrompt(testRepoPath, 1, 'You are a helpful coding assistant');

      const result = buildAgentContextPrompt(testRepoPath, 1);

      expect(result).toContain('## Agent Instructions');
      expect(result).toContain('You are a helpful coding assistant');
      expect(result).not.toContain('## Project Context');
    });

    it('should include both project and agent context when both exist', () => {
      writeProjectDoc(testRepoPath, 'Project documentation');
      writeAgentPrompt(testRepoPath, 1, 'Agent prompt content');

      const result = buildAgentContextPrompt(testRepoPath, 1);

      expect(result).toContain('## Project Context');
      expect(result).toContain('Project documentation');
      expect(result).toContain('## Agent Instructions');
      expect(result).toContain('Agent prompt content');
      expect(result).toContain('---'); // Section separator
    });

    it('should trim whitespace from documentation', () => {
      writeProjectDoc(testRepoPath, '  Project with whitespace  \n\n');
      writeAgentPrompt(testRepoPath, 1, '\n  Agent with whitespace  ');

      const result = buildAgentContextPrompt(testRepoPath, 1);

      expect(result).toContain('Project with whitespace');
      expect(result).toContain('Agent with whitespace');
      expect(result).not.toMatch(/## Project Context\n\n\s+Project/);
    });

    it('should only include output files section when docs are whitespace only', () => {
      writeProjectDoc(testRepoPath, '   \n\n   ');
      writeAgentPrompt(testRepoPath, 1, '   ');

      const result = buildAgentContextPrompt(testRepoPath, 1);

      expect(result).toContain('## Output Files');
      expect(result).not.toContain('## Project Context');
      expect(result).not.toContain('## Agent Instructions');
    });

    it('should use correct agent ID for context', () => {
      writeAgentPrompt(testRepoPath, 1, 'Agent 1 prompt');
      writeAgentPrompt(testRepoPath, 2, 'Agent 2 prompt');

      const result1 = buildAgentContextPrompt(testRepoPath, 1);
      const result2 = buildAgentContextPrompt(testRepoPath, 2);

      expect(result1).toContain('Agent 1 prompt');
      expect(result1).not.toContain('Agent 2 prompt');
      expect(result2).toContain('Agent 2 prompt');
      expect(result2).not.toContain('Agent 1 prompt');
    });

    it('should share project context across different agents', () => {
      writeProjectDoc(testRepoPath, 'Shared project context');
      writeAgentPrompt(testRepoPath, 1, 'Agent 1 specific');
      writeAgentPrompt(testRepoPath, 2, 'Agent 2 specific');

      const result1 = buildAgentContextPrompt(testRepoPath, 1);
      const result2 = buildAgentContextPrompt(testRepoPath, 2);

      // Both should have project context
      expect(result1).toContain('Shared project context');
      expect(result2).toContain('Shared project context');
      // But different agent prompts
      expect(result1).toContain('Agent 1 specific');
      expect(result2).toContain('Agent 2 specific');
    });

    it('should include input files section when files exist', () => {
      writeAgentPrompt(testRepoPath, 1, 'Agent prompt content');
      // Create input files
      const inputFilesPath = ensureAgentInputFilesFolder(testRepoPath, 1);
      fs.writeFileSync(path.join(inputFilesPath, 'context.txt'), 'some context');
      fs.writeFileSync(path.join(inputFilesPath, 'data.json'), '{}');

      const result = buildAgentContextPrompt(testRepoPath, 1);

      expect(result).toContain('## Input Files');
      expect(result).toContain('IMPORTANT: At the start of this conversation');
      expect(result).toContain('context.txt');
      expect(result).toContain('data.json');
      expect(result).toContain('Use the Read tool to read each file');
    });

    it('should not include input files section when no files exist', () => {
      writeAgentPrompt(testRepoPath, 1, 'Agent prompt content');

      const result = buildAgentContextPrompt(testRepoPath, 1);

      expect(result).not.toContain('## Input Files');
      expect(result).toContain('Agent prompt content');
    });
  });

  describe('ATTACHMENT_CONFIG', () => {
    it('should have correct max size of 5 MB', () => {
      expect(ATTACHMENT_CONFIG.maxSizeBytes).toBe(5 * 1024 * 1024);
    });

    it('should include text file extensions', () => {
      expect(ATTACHMENT_CONFIG.allowedExtensions).toContain('.txt');
      expect(ATTACHMENT_CONFIG.allowedExtensions).toContain('.md');
      expect(ATTACHMENT_CONFIG.allowedExtensions).toContain('.json');
    });

    it('should include image extensions', () => {
      expect(ATTACHMENT_CONFIG.allowedExtensions).toContain('.png');
      expect(ATTACHMENT_CONFIG.allowedExtensions).toContain('.jpg');
      expect(ATTACHMENT_CONFIG.allowedExtensions).toContain('.jpeg');
      expect(ATTACHMENT_CONFIG.allowedExtensions).toContain('.gif');
    });

    it('should include pdf extension', () => {
      expect(ATTACHMENT_CONFIG.allowedExtensions).toContain('.pdf');
    });

    it('should include code file extensions', () => {
      expect(ATTACHMENT_CONFIG.allowedExtensions).toContain('.js');
      expect(ATTACHMENT_CONFIG.allowedExtensions).toContain('.ts');
      expect(ATTACHMENT_CONFIG.allowedExtensions).toContain('.py');
      expect(ATTACHMENT_CONFIG.allowedExtensions).toContain('.go');
    });
  });

  describe('ensureAgentInputFilesFolder', () => {
    it('should create input_files folder for agent', () => {
      const result = ensureAgentInputFilesFolder(testRepoPath, 1);

      expect(result).toBe(path.join(testRepoPath, '.claude-ui', 'agents', 'agent-1', 'input_files'));
      expect(fs.existsSync(result)).toBe(true);
    });

    it('should create parent folders if they do not exist', () => {
      ensureAgentInputFilesFolder(testRepoPath, 1);

      expect(fs.existsSync(path.join(testRepoPath, '.claude-ui'))).toBe(true);
      expect(fs.existsSync(path.join(testRepoPath, '.claude-ui', 'agents'))).toBe(true);
      expect(fs.existsSync(path.join(testRepoPath, '.claude-ui', 'agents', 'agent-1'))).toBe(true);
    });

    it('should not fail if folder already exists', () => {
      ensureAgentInputFilesFolder(testRepoPath, 1);
      const result = ensureAgentInputFilesFolder(testRepoPath, 1);

      expect(result).toBe(path.join(testRepoPath, '.claude-ui', 'agents', 'agent-1', 'input_files'));
    });

    it('should use correct agent ID in path', () => {
      const result = ensureAgentInputFilesFolder(testRepoPath, 42);

      expect(result).toContain('agent-42');
    });
  });

  describe('listAgentInputFiles', () => {
    it('should return empty array when input_files folder does not exist', () => {
      const result = listAgentInputFiles(testRepoPath, 1);

      expect(result).toEqual([]);
    });

    it('should return empty array when input_files folder is empty', () => {
      ensureAgentInputFilesFolder(testRepoPath, 1);

      const result = listAgentInputFiles(testRepoPath, 1);

      expect(result).toEqual([]);
    });

    it('should return list of files with name, size, and mimeType', () => {
      const inputFilesPath = ensureAgentInputFilesFolder(testRepoPath, 1);
      fs.writeFileSync(path.join(inputFilesPath, 'test.txt'), 'hello world');

      const result = listAgentInputFiles(testRepoPath, 1);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test.txt');
      expect(result[0].size).toBe(11); // 'hello world'.length
      expect(result[0].mimeType).toBe('text/plain');
    });

    it('should return correct mimeType for different file types', () => {
      const inputFilesPath = ensureAgentInputFilesFolder(testRepoPath, 1);
      fs.writeFileSync(path.join(inputFilesPath, 'doc.md'), '# Title');
      fs.writeFileSync(path.join(inputFilesPath, 'data.json'), '{}');
      fs.writeFileSync(path.join(inputFilesPath, 'script.py'), 'print()');

      const result = listAgentInputFiles(testRepoPath, 1);

      const mdFile = result.find(f => f.name === 'doc.md');
      const jsonFile = result.find(f => f.name === 'data.json');
      const pyFile = result.find(f => f.name === 'script.py');

      expect(mdFile.mimeType).toBe('text/markdown');
      expect(jsonFile.mimeType).toBe('application/json');
      expect(pyFile.mimeType).toBe('text/x-python');
    });

    it('should return application/octet-stream for unknown extensions', () => {
      const inputFilesPath = ensureAgentInputFilesFolder(testRepoPath, 1);
      fs.writeFileSync(path.join(inputFilesPath, 'file.xyz'), 'data');

      const result = listAgentInputFiles(testRepoPath, 1);

      expect(result[0].mimeType).toBe('application/octet-stream');
    });

    it('should only list files, not subdirectories', () => {
      const inputFilesPath = ensureAgentInputFilesFolder(testRepoPath, 1);
      fs.writeFileSync(path.join(inputFilesPath, 'file.txt'), 'content');
      fs.mkdirSync(path.join(inputFilesPath, 'subdir'));

      const result = listAgentInputFiles(testRepoPath, 1);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('file.txt');
    });
  });

  describe('saveAgentInputFile', () => {
    it('should save file and return file info', () => {
      const buffer = Buffer.from('test content');

      const result = saveAgentInputFile(testRepoPath, 1, 'test.txt', buffer);

      expect(result.name).toBe('test.txt');
      expect(result.size).toBe(12); // 'test content'.length
      expect(result.mimeType).toBe('text/plain');
    });

    it('should create input_files folder if it does not exist', () => {
      const buffer = Buffer.from('content');

      saveAgentInputFile(testRepoPath, 1, 'file.txt', buffer);

      const inputFilesPath = path.join(testRepoPath, '.claude-ui', 'agents', 'agent-1', 'input_files');
      expect(fs.existsSync(inputFilesPath)).toBe(true);
    });

    it('should write correct content to file', () => {
      const content = 'Hello, World!';
      const buffer = Buffer.from(content);

      saveAgentInputFile(testRepoPath, 1, 'greeting.txt', buffer);

      const inputFilesPath = path.join(testRepoPath, '.claude-ui', 'agents', 'agent-1', 'input_files');
      const savedContent = fs.readFileSync(path.join(inputFilesPath, 'greeting.txt'), 'utf8');
      expect(savedContent).toBe(content);
    });

    it('should sanitize filename by removing path components', () => {
      const buffer = Buffer.from('content');

      const result = saveAgentInputFile(testRepoPath, 1, '../../../etc/passwd', buffer);

      expect(result.name).toBe('passwd');
    });

    it('should sanitize filename by replacing dangerous characters', () => {
      const buffer = Buffer.from('content');

      const result = saveAgentInputFile(testRepoPath, 1, 'file name with spaces!@#.txt', buffer);

      expect(result.name).toBe('file_name_with_spaces___.txt');
    });

    it('should overwrite existing file', () => {
      const inputFilesPath = ensureAgentInputFilesFolder(testRepoPath, 1);
      fs.writeFileSync(path.join(inputFilesPath, 'file.txt'), 'old content');

      saveAgentInputFile(testRepoPath, 1, 'file.txt', Buffer.from('new content'));

      const savedContent = fs.readFileSync(path.join(inputFilesPath, 'file.txt'), 'utf8');
      expect(savedContent).toBe('new content');
    });

    it('should return correct mimeType for image files', () => {
      const buffer = Buffer.from('fake image data');

      const result = saveAgentInputFile(testRepoPath, 1, 'image.png', buffer);

      expect(result.mimeType).toBe('image/png');
    });
  });

  describe('deleteAgentInputFile', () => {
    it('should delete file and return true', () => {
      const inputFilesPath = ensureAgentInputFilesFolder(testRepoPath, 1);
      fs.writeFileSync(path.join(inputFilesPath, 'file.txt'), 'content');

      const result = deleteAgentInputFile(testRepoPath, 1, 'file.txt');

      expect(result).toBe(true);
      expect(fs.existsSync(path.join(inputFilesPath, 'file.txt'))).toBe(false);
    });

    it('should return false if file does not exist', () => {
      ensureAgentInputFilesFolder(testRepoPath, 1);

      const result = deleteAgentInputFile(testRepoPath, 1, 'nonexistent.txt');

      expect(result).toBe(false);
    });

    it('should return false if input_files folder does not exist', () => {
      const result = deleteAgentInputFile(testRepoPath, 1, 'file.txt');

      expect(result).toBe(false);
    });

    it('should only delete the specified file', () => {
      const inputFilesPath = ensureAgentInputFilesFolder(testRepoPath, 1);
      fs.writeFileSync(path.join(inputFilesPath, 'file1.txt'), 'content1');
      fs.writeFileSync(path.join(inputFilesPath, 'file2.txt'), 'content2');

      deleteAgentInputFile(testRepoPath, 1, 'file1.txt');

      expect(fs.existsSync(path.join(inputFilesPath, 'file1.txt'))).toBe(false);
      expect(fs.existsSync(path.join(inputFilesPath, 'file2.txt'))).toBe(true);
    });

    it('should sanitize filename to prevent directory traversal', () => {
      const inputFilesPath = ensureAgentInputFilesFolder(testRepoPath, 1);
      fs.writeFileSync(path.join(inputFilesPath, 'safe.txt'), 'content');

      // Try to delete a file outside the input_files folder
      const result = deleteAgentInputFile(testRepoPath, 1, '../prompt.md');

      // Should try to delete 'prompt.md' in input_files, which doesn't exist
      expect(result).toBe(false);
      // The safe file should still exist
      expect(fs.existsSync(path.join(inputFilesPath, 'safe.txt'))).toBe(true);
    });
  });

  describe('ensureAgentOutputFilesFolder', () => {
    it('should create output_files folder for agent', () => {
      const result = ensureAgentOutputFilesFolder(testRepoPath, 1);

      expect(result).toBe(path.join(testRepoPath, '.claude-ui', 'agents', 'agent-1', 'output_files'));
      expect(fs.existsSync(result)).toBe(true);
    });

    it('should create parent folders if they do not exist', () => {
      ensureAgentOutputFilesFolder(testRepoPath, 1);

      expect(fs.existsSync(path.join(testRepoPath, '.claude-ui'))).toBe(true);
      expect(fs.existsSync(path.join(testRepoPath, '.claude-ui', 'agents'))).toBe(true);
      expect(fs.existsSync(path.join(testRepoPath, '.claude-ui', 'agents', 'agent-1'))).toBe(true);
    });

    it('should not fail if folder already exists', () => {
      ensureAgentOutputFilesFolder(testRepoPath, 1);
      const result = ensureAgentOutputFilesFolder(testRepoPath, 1);

      expect(result).toBe(path.join(testRepoPath, '.claude-ui', 'agents', 'agent-1', 'output_files'));
    });

    it('should use correct agent ID in path', () => {
      const result = ensureAgentOutputFilesFolder(testRepoPath, 42);

      expect(result).toContain('agent-42');
    });
  });

  describe('listAgentOutputFiles', () => {
    it('should return empty array when output_files folder does not exist', () => {
      const result = listAgentOutputFiles(testRepoPath, 1);

      expect(result).toEqual([]);
    });

    it('should return empty array when output_files folder is empty', () => {
      ensureAgentOutputFilesFolder(testRepoPath, 1);

      const result = listAgentOutputFiles(testRepoPath, 1);

      expect(result).toEqual([]);
    });

    it('should return list of files with name, size, and mimeType', () => {
      const outputFilesPath = ensureAgentOutputFilesFolder(testRepoPath, 1);
      fs.writeFileSync(path.join(outputFilesPath, 'test.txt'), 'hello world');

      const result = listAgentOutputFiles(testRepoPath, 1);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test.txt');
      expect(result[0].size).toBe(11); // 'hello world'.length
      expect(result[0].mimeType).toBe('text/plain');
    });

    it('should return correct mimeType for different file types', () => {
      const outputFilesPath = ensureAgentOutputFilesFolder(testRepoPath, 1);
      fs.writeFileSync(path.join(outputFilesPath, 'doc.md'), '# Title');
      fs.writeFileSync(path.join(outputFilesPath, 'data.json'), '{}');
      fs.writeFileSync(path.join(outputFilesPath, 'script.py'), 'print()');

      const result = listAgentOutputFiles(testRepoPath, 1);

      const mdFile = result.find(f => f.name === 'doc.md');
      const jsonFile = result.find(f => f.name === 'data.json');
      const pyFile = result.find(f => f.name === 'script.py');

      expect(mdFile.mimeType).toBe('text/markdown');
      expect(jsonFile.mimeType).toBe('application/json');
      expect(pyFile.mimeType).toBe('text/x-python');
    });

    it('should return application/octet-stream for unknown extensions', () => {
      const outputFilesPath = ensureAgentOutputFilesFolder(testRepoPath, 1);
      fs.writeFileSync(path.join(outputFilesPath, 'file.xyz'), 'data');

      const result = listAgentOutputFiles(testRepoPath, 1);

      expect(result[0].mimeType).toBe('application/octet-stream');
    });

    it('should only list files, not subdirectories', () => {
      const outputFilesPath = ensureAgentOutputFilesFolder(testRepoPath, 1);
      fs.writeFileSync(path.join(outputFilesPath, 'file.txt'), 'content');
      fs.mkdirSync(path.join(outputFilesPath, 'subdir'));

      const result = listAgentOutputFiles(testRepoPath, 1);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('file.txt');
    });
  });

  describe('deleteAgentOutputFile', () => {
    it('should delete file and return true', () => {
      const outputFilesPath = ensureAgentOutputFilesFolder(testRepoPath, 1);
      fs.writeFileSync(path.join(outputFilesPath, 'file.txt'), 'content');

      const result = deleteAgentOutputFile(testRepoPath, 1, 'file.txt');

      expect(result).toBe(true);
      expect(fs.existsSync(path.join(outputFilesPath, 'file.txt'))).toBe(false);
    });

    it('should return false if file does not exist', () => {
      ensureAgentOutputFilesFolder(testRepoPath, 1);

      const result = deleteAgentOutputFile(testRepoPath, 1, 'nonexistent.txt');

      expect(result).toBe(false);
    });

    it('should return false if output_files folder does not exist', () => {
      const result = deleteAgentOutputFile(testRepoPath, 1, 'file.txt');

      expect(result).toBe(false);
    });

    it('should only delete the specified file', () => {
      const outputFilesPath = ensureAgentOutputFilesFolder(testRepoPath, 1);
      fs.writeFileSync(path.join(outputFilesPath, 'file1.txt'), 'content1');
      fs.writeFileSync(path.join(outputFilesPath, 'file2.txt'), 'content2');

      deleteAgentOutputFile(testRepoPath, 1, 'file1.txt');

      expect(fs.existsSync(path.join(outputFilesPath, 'file1.txt'))).toBe(false);
      expect(fs.existsSync(path.join(outputFilesPath, 'file2.txt'))).toBe(true);
    });

    it('should sanitize filename to prevent directory traversal', () => {
      const outputFilesPath = ensureAgentOutputFilesFolder(testRepoPath, 1);
      fs.writeFileSync(path.join(outputFilesPath, 'safe.txt'), 'content');

      // Try to delete a file outside the output_files folder
      const result = deleteAgentOutputFile(testRepoPath, 1, '../prompt.md');

      // Should try to delete 'prompt.md' in output_files, which doesn't exist
      expect(result).toBe(false);
      // The safe file should still exist
      expect(fs.existsSync(path.join(outputFilesPath, 'safe.txt'))).toBe(true);
    });
  });

  describe('readAgentOutputFile', () => {
    it('should return file data when file exists', () => {
      const outputFilesPath = ensureAgentOutputFilesFolder(testRepoPath, 1);
      fs.writeFileSync(path.join(outputFilesPath, 'test.txt'), 'hello world');

      const result = readAgentOutputFile(testRepoPath, 1, 'test.txt');

      expect(result).not.toBeNull();
      expect(result.filename).toBe('test.txt');
      expect(result.mimeType).toBe('text/plain');
      expect(result.buffer.toString()).toBe('hello world');
    });

    it('should return null if file does not exist', () => {
      ensureAgentOutputFilesFolder(testRepoPath, 1);

      const result = readAgentOutputFile(testRepoPath, 1, 'nonexistent.txt');

      expect(result).toBeNull();
    });

    it('should return null if output_files folder does not exist', () => {
      const result = readAgentOutputFile(testRepoPath, 1, 'file.txt');

      expect(result).toBeNull();
    });

    it('should return correct mimeType for different file types', () => {
      const outputFilesPath = ensureAgentOutputFilesFolder(testRepoPath, 1);
      fs.writeFileSync(path.join(outputFilesPath, 'image.png'), 'fake png data');

      const result = readAgentOutputFile(testRepoPath, 1, 'image.png');

      expect(result.mimeType).toBe('image/png');
    });

    it('should sanitize filename to prevent directory traversal', () => {
      const outputFilesPath = ensureAgentOutputFilesFolder(testRepoPath, 1);
      fs.writeFileSync(path.join(outputFilesPath, 'safe.txt'), 'content');

      // Create a file outside output_files
      writeAgentPrompt(testRepoPath, 1, 'secret prompt');

      // Try to read a file outside the output_files folder
      const result = readAgentOutputFile(testRepoPath, 1, '../prompt.md');

      // Should try to read 'prompt.md' in output_files, which doesn't exist
      expect(result).toBeNull();
    });

    it('should return application/octet-stream for unknown extensions', () => {
      const outputFilesPath = ensureAgentOutputFilesFolder(testRepoPath, 1);
      fs.writeFileSync(path.join(outputFilesPath, 'file.xyz'), 'data');

      const result = readAgentOutputFile(testRepoPath, 1, 'file.xyz');

      expect(result.mimeType).toBe('application/octet-stream');
    });
  });
});
