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
    it('should return empty string when no documentation exists', () => {
      const result = buildAgentContextPrompt(testRepoPath, 1);

      expect(result).toBe('');
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

    it('should return empty string when docs exist but are whitespace only', () => {
      writeProjectDoc(testRepoPath, '   \n\n   ');
      writeAgentPrompt(testRepoPath, 1, '   ');

      const result = buildAgentContextPrompt(testRepoPath, 1);

      expect(result).toBe('');
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
  });
});
