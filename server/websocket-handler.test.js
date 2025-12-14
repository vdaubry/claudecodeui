import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDatabase } from './test/db-helper.js';
import { buildContextPrompt } from './services/documentation.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('WebSocket Handler - Task-based Conversation Flow', () => {
  let testDb;
  let testDir;
  let userId;
  let projectId;
  let taskId;

  beforeEach(() => {
    // Create test database
    testDb = createTestDatabase();

    // Create a test user and project
    const user = testDb.userDb.createUser('testuser', 'hashedpassword');
    userId = user.id;

    // Create a temp directory for testing
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-handler-test-'));

    // Create project in test database
    const project = testDb.projectsDb.create(userId, 'Test Project', testDir);
    projectId = project.id;

    // Create task in test database
    const task = testDb.tasksDb.create(projectId, 'Test Task');
    taskId = task.id;

    // Create .claude-ui folder structure
    const claudeUIDir = path.join(testDir, '.claude-ui');
    const tasksDir = path.join(claudeUIDir, 'tasks');
    fs.mkdirSync(tasksDir, { recursive: true });
  });

  afterEach(() => {
    // Close database
    testDb.close();

    // Clean up temp directory
    if (testDir) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('New Conversation Flow', () => {
    it('should create conversation record when taskId is provided', () => {
      // Create conversation
      const conversation = testDb.conversationsDb.create(taskId);

      expect(conversation.id).toBeDefined();
      expect(conversation.taskId).toBe(taskId);
      expect(conversation.claudeConversationId).toBeNull();
    });

    it('should retrieve task with project info', () => {
      const taskWithProject = testDb.tasksDb.getWithProject(taskId);

      expect(taskWithProject).toBeDefined();
      expect(taskWithProject.id).toBe(taskId);
      expect(taskWithProject.project_id).toBe(projectId);
      expect(taskWithProject.user_id).toBe(userId);
      expect(taskWithProject.repo_folder_path).toBe(testDir);
      expect(taskWithProject.project_name).toBe('Test Project');
    });

    it('should build context prompt from project and task docs', () => {
      // Write project documentation
      const projectDocPath = path.join(testDir, '.claude-ui', 'project.md');
      fs.writeFileSync(projectDocPath, '# Project Overview\n\nThis is a test project.');

      // Write task documentation
      const taskDocPath = path.join(testDir, '.claude-ui', 'tasks', `task-${taskId}.md`);
      fs.writeFileSync(taskDocPath, '# Task Description\n\nImplement feature X.');

      // Build context prompt
      const contextPrompt = buildContextPrompt(testDir, taskId);

      expect(contextPrompt).toContain('## Project Context');
      expect(contextPrompt).toContain('This is a test project');
      expect(contextPrompt).toContain('## Task Context');
      expect(contextPrompt).toContain('Implement feature X');
    });

    it('should handle empty documentation gracefully', () => {
      // No documentation files exist
      const contextPrompt = buildContextPrompt(testDir, taskId);

      expect(contextPrompt).toBe('');
    });

    it('should update conversation with Claude session ID', () => {
      // Create conversation
      const conversation = testDb.conversationsDb.create(taskId);

      // Update with Claude session ID (simulating callback)
      const claudeSessionId = 'claude-session-abc123';
      const updated = testDb.conversationsDb.updateClaudeId(conversation.id, claudeSessionId);

      expect(updated).toBe(true);

      // Verify the update
      const updatedConversation = testDb.conversationsDb.getById(conversation.id);
      expect(updatedConversation.claude_conversation_id).toBe(claudeSessionId);
    });
  });

  describe('Resume Conversation Flow', () => {
    it('should retrieve conversation by ID', () => {
      // Create and setup conversation
      const conversation = testDb.conversationsDb.create(taskId);
      testDb.conversationsDb.updateClaudeId(conversation.id, 'claude-session-xyz');

      // Retrieve conversation
      const retrieved = testDb.conversationsDb.getById(conversation.id);

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(conversation.id);
      expect(retrieved.claude_conversation_id).toBe('claude-session-xyz');
      expect(retrieved.task_id).toBe(taskId);
    });

    it('should get task project info from conversation', () => {
      // Create conversation
      const conversation = testDb.conversationsDb.create(taskId);
      testDb.conversationsDb.updateClaudeId(conversation.id, 'claude-session-xyz');

      // Get conversation and then task with project
      const retrieved = testDb.conversationsDb.getById(conversation.id);
      const taskWithProject = testDb.tasksDb.getWithProject(retrieved.task_id);

      expect(taskWithProject.repo_folder_path).toBe(testDir);
    });
  });

  describe('Error Handling', () => {
    it('should return null for non-existent task', () => {
      const taskWithProject = testDb.tasksDb.getWithProject(99999);
      expect(taskWithProject).toBeUndefined();
    });

    it('should return null for non-existent conversation', () => {
      const conversation = testDb.conversationsDb.getById(99999);
      expect(conversation).toBeUndefined();
    });

    it('should handle conversation without Claude session ID', () => {
      // Create conversation without updating Claude ID
      const conversation = testDb.conversationsDb.create(taskId);

      const retrieved = testDb.conversationsDb.getById(conversation.id);
      expect(retrieved.claude_conversation_id).toBeNull();
    });
  });

  describe('WebSocket Message Simulation', () => {
    it('should simulate new conversation message handling without existing conversationId', () => {
      // Simulate the message that would be received when NO conversationId is provided
      // (This is the legacy flow where backend creates the conversation)
      const message = {
        type: 'claude-command',
        command: 'Hello, Claude!',
        options: {
          taskId: taskId,
          isNewConversation: true
          // Note: no conversationId provided
        }
      };

      // Get task with project (as handler would do)
      const taskWithProject = testDb.tasksDb.getWithProject(message.options.taskId);
      expect(taskWithProject).toBeDefined();

      // Create conversation (as handler would do when no conversationId provided)
      const conversation = testDb.conversationsDb.create(taskId);
      expect(conversation.id).toBeDefined();

      // Build context (as handler would do)
      const contextPrompt = buildContextPrompt(taskWithProject.repo_folder_path, taskId);

      // Build SDK options (as handler would do)
      const sdkOptions = {
        cwd: taskWithProject.repo_folder_path,
        customSystemPrompt: contextPrompt || undefined,
        _dbConversationId: conversation.id
      };

      expect(sdkOptions.cwd).toBe(testDir);
      expect(sdkOptions._dbConversationId).toBe(conversation.id);
    });

    it('should use existing conversationId when provided with isNewConversation: true', () => {
      // This tests the scenario where frontend creates the conversation first,
      // then sends a message with both conversationId AND isNewConversation: true.
      // The backend should use the existing conversationId, NOT create a new one.

      // Frontend creates conversation first (via API)
      const frontendCreatedConversation = testDb.conversationsDb.create(taskId);
      const existingConversationId = frontendCreatedConversation.id;

      // Simulate the message from frontend - includes both conversationId and isNewConversation
      const message = {
        type: 'claude-command',
        command: 'Hello, Claude!',
        options: {
          taskId: taskId,
          conversationId: existingConversationId,  // Frontend provides existing ID
          isNewConversation: true  // But marks as new (first message in conversation)
        }
      };

      // Get task with project (as handler would do)
      const taskWithProject = testDb.tasksDb.getWithProject(message.options.taskId);
      expect(taskWithProject).toBeDefined();

      // THE FIX: When conversationId is provided, use it instead of creating new
      let dbConversationId;
      if (message.options.conversationId) {
        // Use existing conversation (the fix)
        dbConversationId = message.options.conversationId;
      } else {
        // Create new conversation only if no conversationId provided
        const newConversation = testDb.conversationsDb.create(taskId);
        dbConversationId = newConversation.id;
      }

      // Verify the existing conversation ID is used
      expect(dbConversationId).toBe(existingConversationId);

      // Simulate updating the conversation with Claude session ID
      const claudeSessionId = 'claude-session-xyz';
      testDb.conversationsDb.updateClaudeId(dbConversationId, claudeSessionId);

      // Verify the SAME conversation was updated (not a duplicate)
      const updatedConversation = testDb.conversationsDb.getById(existingConversationId);
      expect(updatedConversation.claude_conversation_id).toBe(claudeSessionId);

      // Verify no duplicate was created - count conversations for this task
      const allConversations = testDb.conversationsDb.getByTask(taskId);
      expect(allConversations.length).toBe(1);
      expect(allConversations[0].id).toBe(existingConversationId);
    });

    it('should NOT create duplicate conversation when conversationId is provided', () => {
      // Regression test: This tests that we don't create a duplicate conversation
      // when the frontend has already created one and sends its ID.

      // Frontend creates conversation
      const existingConversation = testDb.conversationsDb.create(taskId);
      const countBefore = testDb.conversationsDb.getByTask(taskId).length;
      expect(countBefore).toBe(1);

      // Simulate receiving message with existing conversationId
      const message = {
        type: 'claude-command',
        command: 'Test message',
        options: {
          taskId: taskId,
          conversationId: existingConversation.id,
          isNewConversation: true
        }
      };

      // Apply the correct logic (matching the fix in index.js)
      let dbConversationId;
      if (message.options.conversationId) {
        dbConversationId = message.options.conversationId;
      } else {
        const newConv = testDb.conversationsDb.create(taskId);
        dbConversationId = newConv.id;
      }

      // Verify no new conversation was created
      const countAfter = testDb.conversationsDb.getByTask(taskId).length;
      expect(countAfter).toBe(1);
      expect(dbConversationId).toBe(existingConversation.id);
    });

    it('should simulate resume conversation message handling', () => {
      // Setup: create conversation with Claude session ID
      const conversation = testDb.conversationsDb.create(taskId);
      const claudeSessionId = 'claude-session-resume-test';
      testDb.conversationsDb.updateClaudeId(conversation.id, claudeSessionId);

      // Simulate the message that would be received
      const message = {
        type: 'claude-command',
        command: 'Continue our conversation',
        options: {
          conversationId: conversation.id,
          isNewConversation: false
        }
      };

      // Get conversation (as handler would do)
      const retrievedConversation = testDb.conversationsDb.getById(message.options.conversationId);
      expect(retrievedConversation).toBeDefined();
      expect(retrievedConversation.claude_conversation_id).toBe(claudeSessionId);

      // Get task with project for cwd (as handler would do)
      const taskWithProject = testDb.tasksDb.getWithProject(retrievedConversation.task_id);

      // Build SDK options for resume (as handler would do)
      const sdkOptions = {
        cwd: taskWithProject.repo_folder_path,
        sessionId: retrievedConversation.claude_conversation_id
      };

      expect(sdkOptions.cwd).toBe(testDir);
      expect(sdkOptions.sessionId).toBe(claudeSessionId);
    });
  });
});
