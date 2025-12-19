import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all dependencies before importing the module under test
vi.mock('../database/db.js', () => ({
  tasksDb: {
    getById: vi.fn(),
    getWithProject: vi.fn(),
    update: vi.fn()
  },
  agentRunsDb: {
    create: vi.fn(),
    getByTask: vi.fn(),
    linkConversation: vi.fn(),
    updateStatus: vi.fn()
  },
  conversationsDb: {
    create: vi.fn(),
    updateClaudeId: vi.fn()
  }
}));

vi.mock('../claude-sdk.js', () => ({
  createSessionWithFirstMessage: vi.fn()
}));

vi.mock('./notifications.js', () => ({
  notifyClaudeComplete: vi.fn().mockResolvedValue(undefined),
  updateUserBadge: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('./documentation.js', () => ({
  buildContextPrompt: vi.fn().mockReturnValue('test context prompt')
}));

vi.mock('../constants/agentPrompts.js', () => ({
  generatePlanificationMessage: vi.fn().mockReturnValue('planification message'),
  generateImplementationMessage: vi.fn().mockReturnValue('implementation message'),
  generateReviewMessage: vi.fn().mockReturnValue('review message')
}));

import {
  startAgentRun,
  getRunningAgentForTask,
  forceCompleteRunningAgents
} from './agentRunner.js';

import { tasksDb, agentRunsDb, conversationsDb } from '../database/db.js';
import { createSessionWithFirstMessage } from '../claude-sdk.js';
import { notifyClaudeComplete, updateUserBadge } from './notifications.js';
import { buildContextPrompt } from './documentation.js';
import {
  generatePlanificationMessage,
  generateImplementationMessage,
  generateReviewMessage
} from '../constants/agentPrompts.js';

describe('agentRunner', () => {
  const mockTaskWithProject = {
    id: 1,
    project_id: 1,
    title: 'Test Task',
    status: 'pending',
    repo_folder_path: '/path/to/project',
    user_id: 1,
    workflow_complete: 0
  };

  const mockAgentRun = {
    id: 1,
    task_id: 1,
    agent_type: 'implementation',
    status: 'running',
    conversation_id: null
  };

  const mockConversation = {
    id: 1,
    task_id: 1,
    claude_session_id: null
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('startAgentRun', () => {
    beforeEach(() => {
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      agentRunsDb.create.mockReturnValue(mockAgentRun);
      conversationsDb.create.mockReturnValue(mockConversation);
      agentRunsDb.linkConversation.mockReturnValue({ ...mockAgentRun, conversation_id: 1 });
      createSessionWithFirstMessage.mockResolvedValue('session-123');
    });

    it('should throw error if task not found', async () => {
      tasksDb.getWithProject.mockReturnValue(null);

      await expect(startAgentRun(999, 'implementation')).rejects.toThrow('Task 999 not found');
    });

    it('should throw error for unknown agent type', async () => {
      await expect(startAgentRun(1, 'unknown')).rejects.toThrow('Unknown agent type: unknown');
    });

    it('should create agent run and conversation for planification agent', async () => {
      const result = await startAgentRun(1, 'planification');

      expect(generatePlanificationMessage).toHaveBeenCalledWith('.claude-ui/tasks/task-1.md');
      expect(agentRunsDb.create).toHaveBeenCalledWith(1, 'planification', null);
      expect(conversationsDb.create).toHaveBeenCalledWith(1);
      expect(agentRunsDb.linkConversation).toHaveBeenCalledWith(1, 1);
      expect(result.agentRun).toEqual(mockAgentRun);
      expect(result.conversation).toEqual(mockConversation);
    });

    it('should create agent run and conversation for implementation agent', async () => {
      const result = await startAgentRun(1, 'implementation');

      expect(generateImplementationMessage).toHaveBeenCalledWith('.claude-ui/tasks/task-1.md', 1);
      expect(agentRunsDb.create).toHaveBeenCalledWith(1, 'implementation', null);
      expect(conversationsDb.create).toHaveBeenCalledWith(1);
      expect(result.agentRun).toEqual(mockAgentRun);
    });

    it('should create agent run and conversation for review agent', async () => {
      const result = await startAgentRun(1, 'review');

      expect(generateReviewMessage).toHaveBeenCalledWith('.claude-ui/tasks/task-1.md', 1);
      expect(agentRunsDb.create).toHaveBeenCalledWith(1, 'review', null);
      expect(conversationsDb.create).toHaveBeenCalledWith(1);
      expect(result.agentRun).toEqual(mockAgentRun);
    });

    it('should update task status to in_progress when task is pending', async () => {
      await startAgentRun(1, 'implementation');

      expect(tasksDb.update).toHaveBeenCalledWith(1, { status: 'in_progress' });
    });

    it('should not update task status when task is already in_progress', async () => {
      tasksDb.getWithProject.mockReturnValue({
        ...mockTaskWithProject,
        status: 'in_progress'
      });

      await startAgentRun(1, 'implementation');

      expect(tasksDb.update).not.toHaveBeenCalled();
    });

    it('should send badge update notification when userId is provided', async () => {
      await startAgentRun(1, 'implementation', { userId: 1 });

      expect(updateUserBadge).toHaveBeenCalledWith(1);
    });

    it('should not send badge update notification when userId is not provided', async () => {
      await startAgentRun(1, 'implementation');

      expect(updateUserBadge).not.toHaveBeenCalled();
    });

    it('should build context prompt from project path', async () => {
      await startAgentRun(1, 'implementation');

      expect(buildContextPrompt).toHaveBeenCalledWith('/path/to/project', 1);
    });

    it('should call createSessionWithFirstMessage with correct parameters', async () => {
      const broadcastFn = vi.fn();
      await startAgentRun(1, 'implementation', { broadcastFn, userId: 1 });

      expect(createSessionWithFirstMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 1,
          taskId: 1,
          message: 'implementation message',
          projectPath: '/path/to/project',
          permissionMode: 'bypassPermissions',
          customSystemPrompt: 'test context prompt',
          broadcastToConversation: broadcastFn
        })
      );
    });

    it('should broadcast streaming-started event via broadcastFn', async () => {
      const broadcastFn = vi.fn();
      let onSessionCreatedCallback;

      createSessionWithFirstMessage.mockImplementation((params) => {
        onSessionCreatedCallback = params.onSessionCreated;
        return Promise.resolve('session-123');
      });

      await startAgentRun(1, 'implementation', { broadcastFn });

      // Simulate Claude session creation
      onSessionCreatedCallback('claude-session-456');

      expect(conversationsDb.updateClaudeId).toHaveBeenCalledWith(1, 'claude-session-456');
      expect(broadcastFn).toHaveBeenCalledWith(1, {
        type: 'streaming-started',
        taskId: 1,
        conversationId: 1,
        claudeSessionId: 'claude-session-456'
      });
    });
  });

  describe('handleAgentComplete (via onStreamingComplete callback)', () => {
    let onStreamingCompleteCallback;

    beforeEach(() => {
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      tasksDb.getById.mockReturnValue({ ...mockTaskWithProject, workflow_complete: 0 });
      agentRunsDb.create.mockReturnValue(mockAgentRun);
      conversationsDb.create.mockReturnValue(mockConversation);
      agentRunsDb.linkConversation.mockReturnValue({ ...mockAgentRun, conversation_id: 1 });
      agentRunsDb.getByTask.mockReturnValue([]);

      createSessionWithFirstMessage.mockImplementation((params) => {
        onStreamingCompleteCallback = params.onStreamingComplete;
        return Promise.resolve('session-123');
      });
    });

    it('should mark agent run as failed when streaming ends with error', async () => {
      await startAgentRun(1, 'implementation');
      await onStreamingCompleteCallback('session-123', true);

      expect(agentRunsDb.updateStatus).toHaveBeenCalledWith(1, 'failed');
    });

    it('should mark agent run as completed when streaming ends successfully', async () => {
      await startAgentRun(1, 'implementation');
      await onStreamingCompleteCallback('session-123', false);

      expect(agentRunsDb.updateStatus).toHaveBeenCalledWith(1, 'completed');
    });

    it('should broadcast streaming-ended event', async () => {
      const broadcastFn = vi.fn();
      await startAgentRun(1, 'implementation', { broadcastFn });
      await onStreamingCompleteCallback('session-123', false);

      expect(broadcastFn).toHaveBeenCalledWith(1, {
        type: 'streaming-ended',
        taskId: 1,
        conversationId: 1
      });
    });

    it('should send push notification on completion when userId is provided', async () => {
      await startAgentRun(1, 'implementation', { userId: 1 });
      await onStreamingCompleteCallback('session-123', false);

      expect(notifyClaudeComplete).toHaveBeenCalledWith(
        1,
        'Test Task',
        1,
        1,
        { agentType: 'implementation', workflowComplete: false }
      );
    });

    it('should not chain for planification agent', async () => {
      agentRunsDb.create.mockReturnValue({ ...mockAgentRun, agent_type: 'planification' });

      await startAgentRun(1, 'planification');
      await onStreamingCompleteCallback('session-123', false);

      // Should not set up chaining - only one call for the initial agent
      expect(agentRunsDb.create).toHaveBeenCalledTimes(1);

      // Advance timers to ensure no chaining happens
      await vi.advanceTimersByTimeAsync(2000);
      expect(agentRunsDb.create).toHaveBeenCalledTimes(1);
    });

    it('should not chain when workflow_complete is true', async () => {
      tasksDb.getById.mockReturnValue({ ...mockTaskWithProject, workflow_complete: 1 });

      await startAgentRun(1, 'implementation');
      await onStreamingCompleteCallback('session-123', false);

      // Advance timers
      await vi.advanceTimersByTimeAsync(2000);

      // Should not create another agent run
      expect(agentRunsDb.create).toHaveBeenCalledTimes(1);
    });

    it('should chain implementation -> review when workflow_complete is false', async () => {
      // Set up for chaining
      let callCount = 0;
      agentRunsDb.create.mockImplementation((taskId, agentType) => {
        callCount++;
        return {
          id: callCount,
          task_id: taskId,
          agent_type: agentType,
          status: 'running'
        };
      });

      await startAgentRun(1, 'implementation');
      await onStreamingCompleteCallback('session-123', false);

      // Advance timer to trigger chaining
      await vi.advanceTimersByTimeAsync(1500);

      // Should have created a second agent run for review
      expect(agentRunsDb.create).toHaveBeenCalledTimes(2);
      expect(agentRunsDb.create).toHaveBeenLastCalledWith(1, 'review', null);
    });

    it('should chain review -> implementation when workflow_complete is false', async () => {
      agentRunsDb.create.mockReturnValue({ ...mockAgentRun, agent_type: 'review' });

      let callCount = 0;
      agentRunsDb.create.mockImplementation((taskId, agentType) => {
        callCount++;
        return {
          id: callCount,
          task_id: taskId,
          agent_type: agentType,
          status: 'running'
        };
      });

      await startAgentRun(1, 'review');
      await onStreamingCompleteCallback('session-123', false);

      // Advance timer to trigger chaining
      await vi.advanceTimersByTimeAsync(1500);

      // Should have created a second agent run for implementation
      expect(agentRunsDb.create).toHaveBeenCalledTimes(2);
      expect(agentRunsDb.create).toHaveBeenLastCalledWith(1, 'implementation', null);
    });

    it('should re-check workflow_complete before chaining', async () => {
      let callCount = 0;
      tasksDb.getById.mockImplementation(() => {
        callCount++;
        // First call returns workflow_complete = 0, second call returns 1
        return {
          ...mockTaskWithProject,
          workflow_complete: callCount > 1 ? 1 : 0
        };
      });

      await startAgentRun(1, 'implementation');
      await onStreamingCompleteCallback('session-123', false);

      // Advance timer to trigger chaining
      await vi.advanceTimersByTimeAsync(1500);

      // Should not chain because workflow_complete became true
      expect(agentRunsDb.create).toHaveBeenCalledTimes(1);
    });

    it('should not chain if another agent is already running (race condition prevention)', async () => {
      agentRunsDb.getByTask.mockReturnValue([
        { id: 2, task_id: 1, agent_type: 'review', status: 'running' }
      ]);

      await startAgentRun(1, 'implementation');
      await onStreamingCompleteCallback('session-123', false);

      // Advance timer to trigger chaining
      await vi.advanceTimersByTimeAsync(1500);

      // Should not chain because another agent is running
      expect(agentRunsDb.create).toHaveBeenCalledTimes(1);
    });

    it('should create failed agent run record when chaining fails', async () => {
      let firstCall = true;
      agentRunsDb.create.mockImplementation((taskId, agentType) => {
        if (firstCall) {
          firstCall = false;
          return mockAgentRun;
        }
        throw new Error('Database error');
      });

      // Mock so that on error it tries to create a failed run
      const createMock = vi.fn();
      createMock.mockReturnValueOnce(mockAgentRun)
        .mockImplementationOnce(() => {
          throw new Error('Database error');
        })
        .mockReturnValueOnce({ id: 2, task_id: 1, agent_type: 'review', status: 'running' });

      agentRunsDb.create.mockImplementation(createMock);

      await startAgentRun(1, 'implementation');
      await onStreamingCompleteCallback('session-123', false);

      // Advance timer to trigger chaining
      await vi.advanceTimersByTimeAsync(1500);

      // Should have tried to create a failed run record
      expect(agentRunsDb.updateStatus).toHaveBeenCalledWith(2, 'failed');
    });
  });

  describe('getRunningAgentForTask', () => {
    it('should return null when no agents exist', () => {
      agentRunsDb.getByTask.mockReturnValue([]);

      const result = getRunningAgentForTask(1);

      expect(result).toBeNull();
      expect(agentRunsDb.getByTask).toHaveBeenCalledWith(1);
    });

    it('should return null when no running agents exist', () => {
      agentRunsDb.getByTask.mockReturnValue([
        { id: 1, status: 'completed' },
        { id: 2, status: 'failed' }
      ]);

      const result = getRunningAgentForTask(1);

      expect(result).toBeNull();
    });

    it('should return the running agent when one exists', () => {
      const runningAgent = { id: 2, status: 'running', agent_type: 'implementation' };
      agentRunsDb.getByTask.mockReturnValue([
        { id: 1, status: 'completed' },
        runningAgent,
        { id: 3, status: 'failed' }
      ]);

      const result = getRunningAgentForTask(1);

      expect(result).toEqual(runningAgent);
    });

    it('should return first running agent when multiple exist', () => {
      const firstRunning = { id: 2, status: 'running', agent_type: 'implementation' };
      agentRunsDb.getByTask.mockReturnValue([
        { id: 1, status: 'completed' },
        firstRunning,
        { id: 3, status: 'running', agent_type: 'review' }
      ]);

      const result = getRunningAgentForTask(1);

      expect(result).toEqual(firstRunning);
    });
  });

  describe('forceCompleteRunningAgents', () => {
    it('should return 0 when no agents exist', () => {
      agentRunsDb.getByTask.mockReturnValue([]);

      const count = forceCompleteRunningAgents(1);

      expect(count).toBe(0);
      expect(agentRunsDb.getByTask).toHaveBeenCalledWith(1);
    });

    it('should return 0 when no running agents exist', () => {
      agentRunsDb.getByTask.mockReturnValue([
        { id: 1, status: 'completed' },
        { id: 2, status: 'failed' }
      ]);

      const count = forceCompleteRunningAgents(1);

      expect(count).toBe(0);
      expect(agentRunsDb.updateStatus).not.toHaveBeenCalled();
    });

    it('should force-complete running agents and return count', () => {
      agentRunsDb.getByTask.mockReturnValue([
        { id: 1, status: 'completed' },
        { id: 2, status: 'running' },
        { id: 3, status: 'running' },
        { id: 4, status: 'failed' }
      ]);

      const count = forceCompleteRunningAgents(1);

      expect(count).toBe(2);
      expect(agentRunsDb.updateStatus).toHaveBeenCalledTimes(2);
      expect(agentRunsDb.updateStatus).toHaveBeenCalledWith(2, 'completed');
      expect(agentRunsDb.updateStatus).toHaveBeenCalledWith(3, 'completed');
    });

    it('should force-complete single running agent', () => {
      agentRunsDb.getByTask.mockReturnValue([
        { id: 1, status: 'running' }
      ]);

      const count = forceCompleteRunningAgents(1);

      expect(count).toBe(1);
      expect(agentRunsDb.updateStatus).toHaveBeenCalledWith(1, 'completed');
    });
  });
});
