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

vi.mock('./conversationAdapter.js', () => ({
  startConversation: vi.fn()
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
import { startConversation } from './conversationAdapter.js';
import { updateUserBadge } from './notifications.js';
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
  });

  describe('startAgentRun', () => {
    beforeEach(() => {
      tasksDb.getWithProject.mockReturnValue(mockTaskWithProject);
      agentRunsDb.create.mockReturnValue(mockAgentRun);
      conversationsDb.create.mockReturnValue(mockConversation);
      agentRunsDb.linkConversation.mockReturnValue({ ...mockAgentRun, conversation_id: 1 });
      startConversation.mockResolvedValue({ conversationId: 1, claudeSessionId: 'session-123' });
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

      expect(generatePlanificationMessage).toHaveBeenCalledWith('.claude-ui/tasks/task-1.md', 1);
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

    it('should call startConversation with correct parameters', async () => {
      const broadcastFn = vi.fn();
      await startAgentRun(1, 'implementation', { broadcastFn, userId: 1 });

      expect(startConversation).toHaveBeenCalledWith(
        1,
        'implementation message',
        expect.objectContaining({
          broadcastFn,
          userId: 1,
          customSystemPrompt: 'test context prompt',
          permissionMode: 'bypassPermissions',
          conversationId: 1
        })
      );
    });

    it('should return claudeSessionId from adapter', async () => {
      const result = await startAgentRun(1, 'implementation');

      expect(result.claudeSessionId).toBe('session-123');
    });
  });

  describe('getRunningAgentForTask', () => {
    it('should return null when no agents are running', () => {
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
        runningAgent
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
    it('should return 0 when no agents are running', () => {
      agentRunsDb.getByTask.mockReturnValue([
        { id: 1, status: 'completed' },
        { id: 2, status: 'failed' }
      ]);

      const result = forceCompleteRunningAgents(1);

      expect(result).toBe(0);
      expect(agentRunsDb.updateStatus).not.toHaveBeenCalled();
    });

    it('should force-complete single running agent', () => {
      agentRunsDb.getByTask.mockReturnValue([
        { id: 1, status: 'completed' },
        { id: 2, status: 'running' }
      ]);

      const result = forceCompleteRunningAgents(1);

      expect(result).toBe(1);
      expect(agentRunsDb.updateStatus).toHaveBeenCalledWith(2, 'completed');
    });

    it('should force-complete multiple running agents', () => {
      agentRunsDb.getByTask.mockReturnValue([
        { id: 1, status: 'running' },
        { id: 2, status: 'completed' },
        { id: 3, status: 'running' }
      ]);

      const result = forceCompleteRunningAgents(1);

      expect(result).toBe(2);
      expect(agentRunsDb.updateStatus).toHaveBeenCalledWith(1, 'completed');
      expect(agentRunsDb.updateStatus).toHaveBeenCalledWith(3, 'completed');
    });
  });
});
