import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all dependencies before importing the module under test
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn()
}));

vi.mock('../database/db.js', () => ({
  conversationsDb: {
    create: vi.fn(),
    getById: vi.fn(),
    updateClaudeId: vi.fn()
  },
  tasksDb: {
    getById: vi.fn(),
    getWithProject: vi.fn()
  },
  agentRunsDb: {
    getByTask: vi.fn(),
    updateStatus: vi.fn(),
    create: vi.fn()
  }
}));

vi.mock('./notifications.js', () => ({
  notifyClaudeComplete: vi.fn().mockResolvedValue(undefined),
  updateUserBadge: vi.fn().mockResolvedValue(undefined)
}));

// Import after mocks
import { query } from '@anthropic-ai/claude-agent-sdk';
import { conversationsDb, tasksDb, agentRunsDb } from '../database/db.js';
import { notifyClaudeComplete } from './notifications.js';

import {
  startConversation,
  sendMessage,
  abortSession,
  isSessionActive,
  getActiveSessions,
  getActiveStreamingByConversation,
  getAllActiveStreamingSessions
} from './conversationAdapter.js';

describe('conversationAdapter', () => {
  const mockTaskWithProject = {
    id: 1,
    project_id: 1,
    title: 'Test Task',
    status: 'pending',
    repo_folder_path: '/path/to/project',
    user_id: 1,
    workflow_complete: 0
  };

  const mockConversation = {
    id: 1,
    task_id: 1,
    claude_conversation_id: null
  };

  const mockConversationWithSession = {
    id: 1,
    task_id: 1,
    claude_conversation_id: 'existing-session-123'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('startConversation', () => {
    beforeEach(() => {
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      conversationsDb.create.mockReturnValue(mockConversation);
      agentRunsDb.getByTask.mockReturnValue([]);
      tasksDb.getById.mockReturnValue(mockTaskWithProject);
    });

    it('should throw error if task not found', async () => {
      tasksDb.getWithProject.mockReturnValue(null);

      await expect(startConversation(999, 'Hello')).rejects.toThrow('Task 999 not found');
    });

    it('should create conversation if conversationId not provided', async () => {
      // Create mock async iterator
      const mockMessages = [
        { session_id: 'session-123', type: 'message' },
        { type: 'result', modelUsage: {} }
      ];
      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn()
            .mockResolvedValueOnce({ value: mockMessages[0], done: false })
            .mockResolvedValueOnce({ value: mockMessages[1], done: false })
            .mockResolvedValueOnce({ done: true })
        })
      };
      query.mockReturnValue(mockIterator);

      const result = await startConversation(1, 'Hello');

      expect(conversationsDb.create).toHaveBeenCalledWith(1);
      expect(result.conversationId).toBe(1);
    });

    it('should use provided conversationId', async () => {
      const mockMessages = [
        { session_id: 'session-123', type: 'message' },
        { type: 'result', modelUsage: {} }
      ];
      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn()
            .mockResolvedValueOnce({ value: mockMessages[0], done: false })
            .mockResolvedValueOnce({ value: mockMessages[1], done: false })
            .mockResolvedValueOnce({ done: true })
        })
      };
      query.mockReturnValue(mockIterator);

      const result = await startConversation(1, 'Hello', { conversationId: 5 });

      expect(conversationsDb.create).not.toHaveBeenCalled();
      expect(result.conversationId).toBe(5);
    });

    it('should update conversation with Claude session ID', async () => {
      const mockMessages = [
        { session_id: 'session-456', type: 'message' },
        { type: 'result', modelUsage: {} }
      ];
      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn()
            .mockResolvedValueOnce({ value: mockMessages[0], done: false })
            .mockResolvedValueOnce({ value: mockMessages[1], done: false })
            .mockResolvedValueOnce({ done: true })
        })
      };
      query.mockReturnValue(mockIterator);

      const result = await startConversation(1, 'Hello');

      expect(conversationsDb.updateClaudeId).toHaveBeenCalledWith(1, 'session-456');
      expect(result.claudeSessionId).toBe('session-456');
    });

    it('should broadcast streaming-started event', async () => {
      const mockMessages = [
        { session_id: 'session-123', type: 'message' },
        { type: 'result', modelUsage: {} }
      ];
      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn()
            .mockResolvedValueOnce({ value: mockMessages[0], done: false })
            .mockResolvedValueOnce({ value: mockMessages[1], done: false })
            .mockResolvedValueOnce({ done: true })
        })
      };
      query.mockReturnValue(mockIterator);

      const broadcastFn = vi.fn();
      await startConversation(1, 'Hello', { broadcastFn });

      // Wait for streaming to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(broadcastFn).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ type: 'streaming-started' })
      );
    });

    it('should broadcast claude-response messages', async () => {
      const mockMessages = [
        { session_id: 'session-123', type: 'text', content: 'Hello!' },
        { type: 'result', modelUsage: {} }
      ];
      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn()
            .mockResolvedValueOnce({ value: mockMessages[0], done: false })
            .mockResolvedValueOnce({ value: mockMessages[1], done: false })
            .mockResolvedValueOnce({ done: true })
        })
      };
      query.mockReturnValue(mockIterator);

      const broadcastFn = vi.fn();
      await startConversation(1, 'Hello', { broadcastFn });

      // Wait for streaming to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(broadcastFn).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          type: 'claude-response',
          data: expect.objectContaining({ type: 'text' })
        })
      );
    });

    it('should broadcast claude-complete when streaming ends', async () => {
      const mockMessages = [
        { session_id: 'session-123', type: 'message' },
        { type: 'result', modelUsage: {} }
      ];
      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn()
            .mockResolvedValueOnce({ value: mockMessages[0], done: false })
            .mockResolvedValueOnce({ value: mockMessages[1], done: false })
            .mockResolvedValueOnce({ done: true })
        })
      };
      query.mockReturnValue(mockIterator);

      const broadcastFn = vi.fn();
      await startConversation(1, 'Hello', { broadcastFn });

      // Wait for streaming to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(broadcastFn).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          type: 'claude-complete',
          sessionId: 'session-123',
          exitCode: 0,
          isNewSession: true
        })
      );
    });

    it('should call query with correct SDK options', async () => {
      const mockMessages = [
        { session_id: 'session-123', type: 'message' },
        { type: 'result', modelUsage: {} }
      ];
      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn()
            .mockResolvedValueOnce({ value: mockMessages[0], done: false })
            .mockResolvedValueOnce({ value: mockMessages[1], done: false })
            .mockResolvedValueOnce({ done: true })
        })
      };
      query.mockReturnValue(mockIterator);

      await startConversation(1, 'Hello', { customSystemPrompt: 'Custom prompt' });

      expect(query).toHaveBeenCalledWith({
        prompt: 'Hello',
        options: expect.objectContaining({
          cwd: '/path/to/project',
          model: 'sonnet',
          systemPrompt: expect.objectContaining({
            type: 'preset',
            preset: 'claude_code',
            append: 'Custom prompt'
          }),
          settingSources: ['project', 'user', 'local']
        })
      });
    });

    it('should include permissionMode when specified', async () => {
      const mockMessages = [
        { session_id: 'session-123', type: 'message' },
        { type: 'result', modelUsage: {} }
      ];
      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn()
            .mockResolvedValueOnce({ value: mockMessages[0], done: false })
            .mockResolvedValueOnce({ value: mockMessages[1], done: false })
            .mockResolvedValueOnce({ done: true })
        })
      };
      query.mockReturnValue(mockIterator);

      await startConversation(1, 'Hello', { permissionMode: 'bypassPermissions' });

      expect(query).toHaveBeenCalledWith({
        prompt: 'Hello',
        options: expect.objectContaining({
          permissionMode: 'bypassPermissions'
        })
      });
    });

    it('should send push notification on completion', async () => {
      const mockMessages = [
        { session_id: 'session-123', type: 'message' },
        { type: 'result', modelUsage: {} }
      ];
      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn()
            .mockResolvedValueOnce({ value: mockMessages[0], done: false })
            .mockResolvedValueOnce({ value: mockMessages[1], done: false })
            .mockResolvedValueOnce({ done: true })
        })
      };
      query.mockReturnValue(mockIterator);

      await startConversation(1, 'Hello', { userId: 42 });

      // Wait for streaming to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(notifyClaudeComplete).toHaveBeenCalledWith(
        42,
        'Test Task',
        1,
        1,
        expect.objectContaining({ agentType: null, workflowComplete: false })
      );
    });

    it('should update agent run status to completed when linked', async () => {
      const mockAgentRun = {
        id: 5,
        conversation_id: 1,
        agent_type: 'implementation',
        status: 'running'
      };
      agentRunsDb.getByTask.mockReturnValue([mockAgentRun]);

      const mockMessages = [
        { session_id: 'session-123', type: 'message' },
        { type: 'result', modelUsage: {} }
      ];
      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn()
            .mockResolvedValueOnce({ value: mockMessages[0], done: false })
            .mockResolvedValueOnce({ value: mockMessages[1], done: false })
            .mockResolvedValueOnce({ done: true })
        })
      };
      query.mockReturnValue(mockIterator);

      await startConversation(1, 'Hello', { conversationId: 1 });

      // Wait for streaming to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(agentRunsDb.updateStatus).toHaveBeenCalledWith(5, 'completed');
    });

    it('should update agent run status to failed on error', async () => {
      const mockAgentRun = {
        id: 5,
        conversation_id: 1,
        agent_type: 'implementation',
        status: 'running'
      };
      agentRunsDb.getByTask.mockReturnValue([mockAgentRun]);

      // First message returns session, then throws error
      let callCount = 0;
      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: () => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve({ value: { session_id: 'session-123' }, done: false });
            }
            return Promise.reject(new Error('SDK Error'));
          }
        })
      };
      query.mockReturnValue(mockIterator);

      const broadcastFn = vi.fn();
      await startConversation(1, 'Hello', { conversationId: 1, broadcastFn });

      // Wait for error handling
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(agentRunsDb.updateStatus).toHaveBeenCalledWith(5, 'failed');
    });

    it('should timeout if session ID not received', async () => {
      // Mock iterator that never provides session_id
      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: () => new Promise(() => {}) // Never resolves
        })
      };
      query.mockReturnValue(mockIterator);

      await expect(startConversation(1, 'Hello')).rejects.toThrow('Session creation timeout');
    }, 35000);

    it('should broadcast token-budget when result contains modelUsage', async () => {
      const mockMessages = [
        { session_id: 'session-123', type: 'message' },
        {
          type: 'result',
          modelUsage: {
            'claude-sonnet': {
              cumulativeInputTokens: 1000,
              cumulativeOutputTokens: 500,
              cumulativeCacheReadInputTokens: 200,
              cumulativeCacheCreationInputTokens: 100
            }
          }
        }
      ];
      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn()
            .mockResolvedValueOnce({ value: mockMessages[0], done: false })
            .mockResolvedValueOnce({ value: mockMessages[1], done: false })
            .mockResolvedValueOnce({ done: true })
        })
      };
      query.mockReturnValue(mockIterator);

      const broadcastFn = vi.fn();
      await startConversation(1, 'Hello', { broadcastFn });

      // Wait for streaming to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(broadcastFn).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          type: 'token-budget',
          data: expect.objectContaining({
            used: 1800, // 1000 + 500 + 200 + 100
            total: expect.any(Number)
          })
        })
      );
    });
  });

  describe('sendMessage', () => {
    beforeEach(() => {
      conversationsDb.getById.mockReturnValue(mockConversationWithSession);
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      tasksDb.getById.mockReturnValue(mockTaskWithProject);
      agentRunsDb.getByTask.mockReturnValue([]);
    });

    it('should throw error if conversation not found', async () => {
      conversationsDb.getById.mockReturnValue(null);

      await expect(sendMessage(999, 'Hello')).rejects.toThrow('Conversation 999 not found');
    });

    it('should throw error if conversation has no Claude session ID', async () => {
      conversationsDb.getById.mockReturnValue(mockConversation); // No session ID

      await expect(sendMessage(1, 'Hello')).rejects.toThrow('Conversation 1 has no Claude session ID yet');
    });

    it('should throw error if task not found', async () => {
      tasksDb.getWithProject.mockReturnValue(null);

      await expect(sendMessage(1, 'Hello')).rejects.toThrow('Task 1 not found');
    });

    it('should call query with resume option', async () => {
      const mockMessages = [
        { session_id: 'existing-session-123', type: 'message' },
        { type: 'result', modelUsage: {} }
      ];
      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn()
            .mockResolvedValueOnce({ value: mockMessages[0], done: false })
            .mockResolvedValueOnce({ value: mockMessages[1], done: false })
            .mockResolvedValueOnce({ done: true })
        })
      };
      query.mockReturnValue(mockIterator);

      await sendMessage(1, 'Hello');

      expect(query).toHaveBeenCalledWith({
        prompt: 'Hello',
        options: expect.objectContaining({
          cwd: '/path/to/project',
          resume: 'existing-session-123'
        })
      });
    });

    it('should broadcast streaming-started event', async () => {
      const mockMessages = [
        { session_id: 'existing-session-123', type: 'message' },
        { type: 'result', modelUsage: {} }
      ];
      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn()
            .mockResolvedValueOnce({ value: mockMessages[0], done: false })
            .mockResolvedValueOnce({ value: mockMessages[1], done: false })
            .mockResolvedValueOnce({ done: true })
        })
      };
      query.mockReturnValue(mockIterator);

      const broadcastFn = vi.fn();
      await sendMessage(1, 'Hello', { broadcastFn });

      expect(broadcastFn).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ type: 'streaming-started' })
      );
    });

    it('should broadcast claude-complete with isNewSession=false', async () => {
      const mockMessages = [
        { session_id: 'existing-session-123', type: 'message' },
        { type: 'result', modelUsage: {} }
      ];
      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn()
            .mockResolvedValueOnce({ value: mockMessages[0], done: false })
            .mockResolvedValueOnce({ value: mockMessages[1], done: false })
            .mockResolvedValueOnce({ done: true })
        })
      };
      query.mockReturnValue(mockIterator);

      const broadcastFn = vi.fn();
      await sendMessage(1, 'Hello', { broadcastFn });

      expect(broadcastFn).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          type: 'claude-complete',
          sessionId: 'existing-session-123',
          exitCode: 0,
          isNewSession: false
        })
      );
    });

    it('should update agent run status when linked', async () => {
      const mockAgentRun = {
        id: 3,
        conversation_id: 1,
        agent_type: 'review',
        status: 'running'
      };
      agentRunsDb.getByTask.mockReturnValue([mockAgentRun]);

      const mockMessages = [
        { session_id: 'existing-session-123', type: 'message' },
        { type: 'result', modelUsage: {} }
      ];
      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn()
            .mockResolvedValueOnce({ value: mockMessages[0], done: false })
            .mockResolvedValueOnce({ value: mockMessages[1], done: false })
            .mockResolvedValueOnce({ done: true })
        })
      };
      query.mockReturnValue(mockIterator);

      await sendMessage(1, 'Hello');

      expect(agentRunsDb.updateStatus).toHaveBeenCalledWith(3, 'completed');
    });

    it('should throw error on SDK failure', async () => {
      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.reject(new Error('SDK Error'))
        })
      };
      query.mockReturnValue(mockIterator);

      const broadcastFn = vi.fn();
      await expect(sendMessage(1, 'Hello', { broadcastFn })).rejects.toThrow('SDK Error');

      expect(broadcastFn).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ type: 'claude-error' })
      );
    });
  });

  describe('abortSession', () => {
    it('should return false for non-existent session', async () => {
      const result = await abortSession('non-existent-session');
      expect(result).toBe(false);
    });

    it('should abort active session and return true', async () => {
      // First start a session to track it
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      conversationsDb.create.mockReturnValue(mockConversation);
      agentRunsDb.getByTask.mockReturnValue([]);
      tasksDb.getById.mockReturnValue(mockTaskWithProject);

      const mockInterrupt = vi.fn().mockResolvedValue(undefined);
      const mockMessages = [
        { session_id: 'abort-test-session', type: 'message' }
      ];
      let messageIndex = 0;
      const mockIterator = {
        interrupt: mockInterrupt,
        [Symbol.asyncIterator]: () => ({
          next: () => {
            if (messageIndex < mockMessages.length) {
              return Promise.resolve({ value: mockMessages[messageIndex++], done: false });
            }
            // Wait indefinitely to simulate streaming
            return new Promise(() => {});
          }
        })
      };
      query.mockReturnValue(mockIterator);

      // Start conversation (don't await, it will hang)
      startConversation(1, 'Hello');

      // Wait for session to be tracked
      await new Promise(resolve => setTimeout(resolve, 100));

      // Now abort
      const result = await abortSession('abort-test-session');

      expect(result).toBe(true);
      expect(mockInterrupt).toHaveBeenCalled();
    });
  });

  describe('session tracking', () => {
    it('isSessionActive should return falsy for non-existent session', () => {
      expect(isSessionActive('non-existent')).toBeFalsy();
    });

    it('getActiveSessions should return empty array when no sessions', () => {
      expect(getActiveSessions()).toEqual([]);
    });

    it('getActiveStreamingByConversation should return null when not found', () => {
      expect(getActiveStreamingByConversation(999)).toBeNull();
    });

    it('getAllActiveStreamingSessions should return empty array when no sessions', () => {
      expect(getAllActiveStreamingSessions()).toEqual([]);
    });
  });

  // Note: MCP configuration loading and image handling tests are omitted
  // because they require fs mocking which is complex with ES modules.
  // These features are covered by integration/e2e tests.

  describe('agent chaining', () => {
    beforeEach(() => {
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      conversationsDb.create.mockReturnValue(mockConversation);
      tasksDb.getById.mockReturnValue(mockTaskWithProject);
    });

    it('should not chain when workflow_complete is true', async () => {
      const completedTask = { ...mockTaskWithProject, workflow_complete: 1 };
      tasksDb.getById.mockReturnValue(completedTask);

      const mockAgentRun = {
        id: 1,
        conversation_id: 1,
        agent_type: 'implementation',
        status: 'running'
      };
      agentRunsDb.getByTask.mockReturnValue([mockAgentRun]);

      const mockMessages = [
        { session_id: 'session-chain', type: 'message' },
        { type: 'result', modelUsage: {} }
      ];
      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn()
            .mockResolvedValueOnce({ value: mockMessages[0], done: false })
            .mockResolvedValueOnce({ value: mockMessages[1], done: false })
            .mockResolvedValueOnce({ done: true })
        })
      };
      query.mockReturnValue(mockIterator);

      await startConversation(1, 'Hello', { conversationId: 1 });

      // Wait for potential chaining
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Query should only be called once (no chaining)
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('should not chain for planification agent', async () => {
      const mockAgentRun = {
        id: 1,
        conversation_id: 1,
        agent_type: 'planification',
        status: 'running'
      };
      agentRunsDb.getByTask.mockReturnValue([mockAgentRun]);

      const mockMessages = [
        { session_id: 'session-plan', type: 'message' },
        { type: 'result', modelUsage: {} }
      ];
      const mockIterator = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn()
            .mockResolvedValueOnce({ value: mockMessages[0], done: false })
            .mockResolvedValueOnce({ value: mockMessages[1], done: false })
            .mockResolvedValueOnce({ done: true })
        })
      };
      query.mockReturnValue(mockIterator);

      await startConversation(1, 'Hello', { conversationId: 1 });

      // Wait for potential chaining
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Query should only be called once (no chaining)
      expect(query).toHaveBeenCalledTimes(1);
    });
  });
});
