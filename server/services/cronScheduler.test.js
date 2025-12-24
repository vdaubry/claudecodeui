import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the database module
vi.mock('../database/db.js', () => ({
  agentsDb: {
    getById: vi.fn(),
    getScheduledAgentsDue: vi.fn(),
    updateScheduleStatus: vi.fn(),
    updateNextRunAt: vi.fn()
  },
  conversationsDb: {
    createForAgentWithTrigger: vi.fn()
  }
}));

// Mock the conversationAdapter service
vi.mock('./conversationAdapter.js', () => ({
  startAgentConversation: vi.fn()
}));

// Mock the cron package with a proper class mock
const mockCronJobInstances = [];
vi.mock('cron', () => {
  return {
    CronJob: class MockCronJob {
      constructor(schedule, callback) {
        this.schedule = schedule;
        this._callback = callback;
        this.start = vi.fn();
        this.stop = vi.fn();
        mockCronJobInstances.push(this);
      }
    }
  };
});

import {
  validateCronExpression,
  getNextRunTime,
  initCronScheduler,
  stopCronScheduler,
  recalculateAgentNextRun,
  isAgentRunning
} from './cronScheduler.js';
import { agentsDb, conversationsDb } from '../database/db.js';
import { startAgentConversation } from './conversationAdapter.js';
import { CronJob } from 'cron';

describe('Cron Scheduler Service', () => {
  beforeEach(async () => {
    // Clear mock call history (but keep implementations)
    vi.clearAllMocks();
    // Clear mock CronJob instances
    mockCronJobInstances.length = 0;
    // Reset scheduler state by stopping it
    stopCronScheduler();
    // Wait for any async operations from previous test
    await new Promise(resolve => setTimeout(resolve, 50));
    // Reset mock implementations to default
    agentsDb.getScheduledAgentsDue.mockReturnValue([]);
    conversationsDb.createForAgentWithTrigger.mockReturnValue({ id: 1 });
    startAgentConversation.mockResolvedValue({});
  });

  afterEach(async () => {
    stopCronScheduler();
    // Allow any pending async operations to complete
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  describe('validateCronExpression', () => {
    it('should validate a correct cron expression', () => {
      const result = validateCronExpression('0 9 * * *');

      expect(result.valid).toBe(true);
      expect(result.description).toBeDefined();
      expect(result.nextRun).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should return human-readable description for common patterns', () => {
      const hourly = validateCronExpression('0 * * * *');
      expect(hourly.valid).toBe(true);
      expect(hourly.description).toContain('hour');

      const daily = validateCronExpression('0 9 * * *');
      expect(daily.valid).toBe(true);
      expect(daily.description).toBeDefined();
    });

    it('should return nextRun as ISO string', () => {
      const result = validateCronExpression('0 9 * * *');

      expect(result.valid).toBe(true);
      expect(result.nextRun).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should reject invalid cron expression', () => {
      const result = validateCronExpression('invalid cron');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.description).toBeUndefined();
      expect(result.nextRun).toBeUndefined();
    });

    it('should reject empty string', () => {
      const result = validateCronExpression('');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Expression is required');
    });

    it('should reject null', () => {
      const result = validateCronExpression(null);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Expression is required');
    });

    it('should reject undefined', () => {
      const result = validateCronExpression(undefined);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Expression is required');
    });

    it('should reject non-string values', () => {
      const result = validateCronExpression(12345);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Expression is required');
    });

    it('should validate every minute expression', () => {
      const result = validateCronExpression('* * * * *');

      expect(result.valid).toBe(true);
      expect(result.description).toContain('minute');
    });

    it('should validate every 5 minutes expression', () => {
      const result = validateCronExpression('*/5 * * * *');

      expect(result.valid).toBe(true);
    });

    it('should validate weekly expression', () => {
      const result = validateCronExpression('0 9 * * 1');

      expect(result.valid).toBe(true);
    });

    it('should validate monthly expression', () => {
      const result = validateCronExpression('0 9 1 * *');

      expect(result.valid).toBe(true);
    });

    it('should reject cron with too many fields', () => {
      const result = validateCronExpression('0 0 0 0 0 0 0');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject cron with too few fields', () => {
      const result = validateCronExpression('0 0 0');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject invalid minute value', () => {
      const result = validateCronExpression('60 * * * *');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject invalid hour value', () => {
      const result = validateCronExpression('0 25 * * *');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getNextRunTime', () => {
    it('should return a Date for valid cron expression', () => {
      const result = getNextRunTime('0 9 * * *');

      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBeGreaterThan(Date.now());
    });

    it('should return null for invalid cron expression', () => {
      const result = getNextRunTime('invalid');

      expect(result).toBeNull();
    });

    it('should return a date for empty string (interpreted as every minute)', () => {
      // cron-parser interprets empty string as a valid pattern
      const result = getNextRunTime('');

      // Implementation depends on cron-parser behavior
      // Since empty string is treated as valid by cron-parser, this returns a date
      expect(result).toBeInstanceOf(Date);
    });

    it('should return a future date', () => {
      const result = getNextRunTime('* * * * *');

      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBeGreaterThanOrEqual(Date.now());
    });
  });

  describe('initCronScheduler', () => {
    it('should create a CronJob with every-minute schedule', () => {
      const mockBroadcast = vi.fn();
      agentsDb.getScheduledAgentsDue.mockReturnValue([]);

      initCronScheduler(mockBroadcast);

      expect(mockCronJobInstances).toHaveLength(1);
      expect(mockCronJobInstances[0].schedule).toBe('* * * * *');
      expect(typeof mockCronJobInstances[0]._callback).toBe('function');
    });

    it('should start the CronJob', () => {
      const mockBroadcast = vi.fn();
      agentsDb.getScheduledAgentsDue.mockReturnValue([]);

      initCronScheduler(mockBroadcast);

      const cronJobInstance = mockCronJobInstances[0];
      expect(cronJobInstance.start).toHaveBeenCalled();
    });

    it('should not create duplicate schedulers', () => {
      const mockBroadcast = vi.fn();
      agentsDb.getScheduledAgentsDue.mockReturnValue([]);

      initCronScheduler(mockBroadcast);
      initCronScheduler(mockBroadcast);

      // Should only create one instance
      expect(mockCronJobInstances).toHaveLength(1);
    });

    it('should check scheduled agents immediately on init', () => {
      const mockBroadcast = vi.fn();
      agentsDb.getScheduledAgentsDue.mockReturnValue([]);

      initCronScheduler(mockBroadcast);

      expect(agentsDb.getScheduledAgentsDue).toHaveBeenCalled();
    });
  });

  describe('stopCronScheduler', () => {
    it('should stop the CronJob', () => {
      const mockBroadcast = vi.fn();
      agentsDb.getScheduledAgentsDue.mockReturnValue([]);

      initCronScheduler(mockBroadcast);
      const cronJobInstance = mockCronJobInstances[0];

      stopCronScheduler();

      expect(cronJobInstance.stop).toHaveBeenCalled();
    });

    it('should allow reinitializing after stop', () => {
      const mockBroadcast = vi.fn();
      agentsDb.getScheduledAgentsDue.mockReturnValue([]);

      initCronScheduler(mockBroadcast);
      stopCronScheduler();
      initCronScheduler(mockBroadcast);

      expect(mockCronJobInstances).toHaveLength(2);
    });
  });

  describe('recalculateAgentNextRun', () => {
    it('should calculate next run for enabled agent with schedule', () => {
      const mockAgent = {
        id: 1,
        schedule_enabled: 1,
        schedule: '0 9 * * *'
      };
      agentsDb.getById.mockReturnValue(mockAgent);

      const result = recalculateAgentNextRun(1);

      expect(result).toBeInstanceOf(Date);
      expect(agentsDb.updateNextRunAt).toHaveBeenCalledWith(1, expect.any(Date));
    });

    it('should set null for disabled agent', () => {
      const mockAgent = {
        id: 1,
        schedule_enabled: 0,
        schedule: '0 9 * * *'
      };
      agentsDb.getById.mockReturnValue(mockAgent);

      const result = recalculateAgentNextRun(1);

      expect(result).toBeNull();
      expect(agentsDb.updateNextRunAt).toHaveBeenCalledWith(1, null);
    });

    it('should set null for agent without schedule', () => {
      const mockAgent = {
        id: 1,
        schedule_enabled: 1,
        schedule: null
      };
      agentsDb.getById.mockReturnValue(mockAgent);

      const result = recalculateAgentNextRun(1);

      expect(result).toBeNull();
      expect(agentsDb.updateNextRunAt).toHaveBeenCalledWith(1, null);
    });

    it('should set null for non-existent agent', () => {
      agentsDb.getById.mockReturnValue(undefined);

      const result = recalculateAgentNextRun(999);

      expect(result).toBeNull();
      expect(agentsDb.updateNextRunAt).toHaveBeenCalledWith(999, null);
    });
  });

  describe('isAgentRunning', () => {
    it('should return false for agent not running', () => {
      const result = isAgentRunning(1);

      expect(result).toBe(false);
    });

    // Note: Testing isAgentRunning returning true requires triggering
    // the internal checkScheduledAgents function, which is harder to test
    // without more extensive mocking of the async flow
  });

  describe('Scheduled Agent Execution', () => {
    it('should execute due agents when scheduler checks', async () => {
      const mockAgent = {
        id: 1,
        name: 'Test Agent',
        schedule: '0 9 * * *',
        cron_prompt: 'Hello from cron',
        user_id: 1
      };
      const mockConversation = { id: 100 };

      agentsDb.getScheduledAgentsDue.mockReturnValue([mockAgent]);
      conversationsDb.createForAgentWithTrigger.mockReturnValue(mockConversation);
      startAgentConversation.mockResolvedValue({});

      const mockBroadcast = vi.fn();
      initCronScheduler(mockBroadcast);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(conversationsDb.createForAgentWithTrigger).toHaveBeenCalledWith(1, 'cron');
      expect(startAgentConversation).toHaveBeenCalledWith(
        1,
        'Hello from cron',
        expect.objectContaining({
          conversationId: 100,
          userId: 1,
          permissionMode: 'bypassPermissions'
        })
      );
    });

    it('should update schedule status after execution', async () => {
      const mockAgent = {
        id: 1,
        name: 'Test Agent',
        schedule: '0 9 * * *',
        cron_prompt: 'Hello',
        user_id: 1
      };
      const mockConversation = { id: 100 };

      agentsDb.getScheduledAgentsDue.mockReturnValue([mockAgent]);
      conversationsDb.createForAgentWithTrigger.mockReturnValue(mockConversation);
      startAgentConversation.mockResolvedValue({});

      initCronScheduler(vi.fn());

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(agentsDb.updateScheduleStatus).toHaveBeenCalledWith(
        1,
        expect.any(Date),
        expect.any(Date)
      );
    });

    it('should not run agent if already running (overlap prevention)', async () => {
      const mockAgent = {
        id: 1,
        name: 'Test Agent',
        schedule: '0 9 * * *',
        cron_prompt: 'Hello',
        user_id: 1
      };

      // Return same agent twice to simulate overlap
      agentsDb.getScheduledAgentsDue.mockReturnValue([mockAgent, mockAgent]);
      conversationsDb.createForAgentWithTrigger.mockReturnValue({ id: 100 });

      // Make the conversation start slow
      startAgentConversation.mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 500))
      );

      initCronScheduler(vi.fn());

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should only attempt to start once due to overlap prevention
      expect(startAgentConversation).toHaveBeenCalledTimes(1);
    });

    it('should handle execution errors gracefully', async () => {
      const mockAgent = {
        id: 1,
        name: 'Test Agent',
        schedule: '0 9 * * *',
        cron_prompt: 'Hello',
        user_id: 1
      };

      agentsDb.getScheduledAgentsDue.mockReturnValue([mockAgent]);
      conversationsDb.createForAgentWithTrigger.mockReturnValue({ id: 100 });
      startAgentConversation.mockRejectedValue(new Error('Conversation failed'));

      // Should not throw
      initCronScheduler(vi.fn());

      // Wait longer for async error handling
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should still update schedule status even after error (in finally block)
      expect(agentsDb.updateScheduleStatus).toHaveBeenCalled();
    });

    it('should process multiple due agents', async () => {
      const mockAgents = [
        { id: 1, name: 'Agent 1', schedule: '0 9 * * *', cron_prompt: 'Hello 1', user_id: 1 },
        { id: 2, name: 'Agent 2', schedule: '0 9 * * *', cron_prompt: 'Hello 2', user_id: 1 }
      ];

      agentsDb.getScheduledAgentsDue.mockReturnValue(mockAgents);
      conversationsDb.createForAgentWithTrigger
        .mockReturnValueOnce({ id: 100 })
        .mockReturnValueOnce({ id: 101 });
      startAgentConversation.mockResolvedValue({});

      initCronScheduler(vi.fn());

      // Wait longer for both agents to be processed sequentially
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(startAgentConversation).toHaveBeenCalledTimes(2);
      expect(agentsDb.updateScheduleStatus).toHaveBeenCalledTimes(2);
    });
  });
});
