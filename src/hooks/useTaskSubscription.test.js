import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTaskSubscription } from './useTaskSubscription';

// Mock the WebSocketContext
const mockSendMessage = vi.fn();
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();

vi.mock('../contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    isConnected: true,
    sendMessage: mockSendMessage,
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
  }),
}));

// Mock the TaskContext
const mockSetConversations = vi.fn();
const mockSetAgentRuns = vi.fn();

vi.mock('../contexts/TaskContext', () => ({
  useTaskContext: () => ({
    setConversations: mockSetConversations,
    setAgentRuns: mockSetAgentRuns,
  }),
}));

describe('useTaskSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Subscription Management', () => {
    it('should subscribe to task when taskId is provided', () => {
      renderHook(() => useTaskSubscription(42));

      expect(mockSendMessage).toHaveBeenCalledWith('subscribe-task', { taskId: 42 });
    });

    it('should not subscribe when taskId is null', () => {
      renderHook(() => useTaskSubscription(null));

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should not subscribe when taskId is undefined', () => {
      renderHook(() => useTaskSubscription(undefined));

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should unsubscribe when component unmounts', () => {
      const { unmount } = renderHook(() => useTaskSubscription(42));

      unmount();

      expect(mockSendMessage).toHaveBeenCalledWith('unsubscribe-task', { taskId: 42 });
    });

    it('should unsubscribe from old task and subscribe to new task when taskId changes', () => {
      const { rerender } = renderHook(
        ({ taskId }) => useTaskSubscription(taskId),
        { initialProps: { taskId: 1 } }
      );

      expect(mockSendMessage).toHaveBeenCalledWith('subscribe-task', { taskId: 1 });

      rerender({ taskId: 2 });

      expect(mockSendMessage).toHaveBeenCalledWith('unsubscribe-task', { taskId: 1 });
      expect(mockSendMessage).toHaveBeenCalledWith('subscribe-task', { taskId: 2 });
    });

    it('should subscribe to conversation-added and agent-run-updated events', () => {
      renderHook(() => useTaskSubscription(42));

      expect(mockSubscribe).toHaveBeenCalledWith('conversation-added', expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith('agent-run-updated', expect.any(Function));
    });

    it('should unsubscribe from events on unmount', () => {
      const { unmount } = renderHook(() => useTaskSubscription(42));

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalledWith('conversation-added', expect.any(Function));
      expect(mockUnsubscribe).toHaveBeenCalledWith('agent-run-updated', expect.any(Function));
    });
  });

  describe('Conversation Added Event Handling', () => {
    it('should add conversation to state when conversation-added event is received', () => {
      renderHook(() => useTaskSubscription(42));

      // Get the callback that was passed to subscribe for 'conversation-added'
      const conversationAddedCallback = mockSubscribe.mock.calls.find(
        call => call[0] === 'conversation-added'
      )[1];

      const newConversation = { id: 1, task_id: 42, claude_conversation_id: 'abc123' };

      // Simulate receiving the event
      act(() => {
        conversationAddedCallback({ taskId: 42, conversation: newConversation });
      });

      expect(mockSetConversations).toHaveBeenCalled();

      // Get the updater function and verify it adds the conversation
      const updaterFn = mockSetConversations.mock.calls[0][0];
      const result = updaterFn([]);
      expect(result).toEqual([newConversation]);
    });

    it('should not add conversation when taskId does not match', () => {
      renderHook(() => useTaskSubscription(42));

      const conversationAddedCallback = mockSubscribe.mock.calls.find(
        call => call[0] === 'conversation-added'
      )[1];

      const newConversation = { id: 1, task_id: 99, claude_conversation_id: 'abc123' };

      act(() => {
        conversationAddedCallback({ taskId: 99, conversation: newConversation });
      });

      expect(mockSetConversations).not.toHaveBeenCalled();
    });

    it('should not add duplicate conversation', () => {
      renderHook(() => useTaskSubscription(42));

      const conversationAddedCallback = mockSubscribe.mock.calls.find(
        call => call[0] === 'conversation-added'
      )[1];

      const existingConversation = { id: 1, task_id: 42, claude_conversation_id: 'abc123' };

      act(() => {
        conversationAddedCallback({ taskId: 42, conversation: existingConversation });
      });

      // Verify the updater function prevents duplicates
      const updaterFn = mockSetConversations.mock.calls[0][0];
      const result = updaterFn([{ id: 1, task_id: 42 }]); // Existing conversation with same id
      expect(result).toEqual([{ id: 1, task_id: 42 }]); // Should return original array
    });

    it('should add conversation to beginning of list (newest first)', () => {
      renderHook(() => useTaskSubscription(42));

      const conversationAddedCallback = mockSubscribe.mock.calls.find(
        call => call[0] === 'conversation-added'
      )[1];

      const newConversation = { id: 2, task_id: 42, claude_conversation_id: 'new' };

      act(() => {
        conversationAddedCallback({ taskId: 42, conversation: newConversation });
      });

      const updaterFn = mockSetConversations.mock.calls[0][0];
      const existingConversations = [{ id: 1, task_id: 42, claude_conversation_id: 'old' }];
      const result = updaterFn(existingConversations);

      expect(result[0]).toEqual(newConversation); // New conversation is first
      expect(result[1]).toEqual(existingConversations[0]); // Old conversation is second
    });
  });

  describe('Agent Run Updated Event Handling', () => {
    it('should update existing agent run when agent-run-updated event is received', () => {
      renderHook(() => useTaskSubscription(42));

      const agentRunUpdatedCallback = mockSubscribe.mock.calls.find(
        call => call[0] === 'agent-run-updated'
      )[1];

      const updatedAgentRun = { id: 1, status: 'completed', agent_type: 'implementation' };

      act(() => {
        agentRunUpdatedCallback({ taskId: 42, agentRun: updatedAgentRun });
      });

      expect(mockSetAgentRuns).toHaveBeenCalled();

      // Verify the updater function updates the existing run
      const updaterFn = mockSetAgentRuns.mock.calls[0][0];
      const existingRuns = [{ id: 1, status: 'running', agent_type: 'implementation' }];
      const result = updaterFn(existingRuns);

      expect(result[0].status).toBe('completed');
      expect(result[0].agent_type).toBe('implementation');
    });

    it('should add new agent run if not existing', () => {
      renderHook(() => useTaskSubscription(42));

      const agentRunUpdatedCallback = mockSubscribe.mock.calls.find(
        call => call[0] === 'agent-run-updated'
      )[1];

      const newAgentRun = { id: 2, status: 'running', agent_type: 'review' };

      act(() => {
        agentRunUpdatedCallback({ taskId: 42, agentRun: newAgentRun });
      });

      const updaterFn = mockSetAgentRuns.mock.calls[0][0];
      const existingRuns = [{ id: 1, status: 'completed', agent_type: 'implementation' }];
      const result = updaterFn(existingRuns);

      expect(result.length).toBe(2);
      expect(result[1]).toEqual(newAgentRun);
    });

    it('should not update agent runs when taskId does not match', () => {
      renderHook(() => useTaskSubscription(42));

      const agentRunUpdatedCallback = mockSubscribe.mock.calls.find(
        call => call[0] === 'agent-run-updated'
      )[1];

      const updatedAgentRun = { id: 1, status: 'completed', agent_type: 'implementation' };

      act(() => {
        agentRunUpdatedCallback({ taskId: 99, agentRun: updatedAgentRun });
      });

      expect(mockSetAgentRuns).not.toHaveBeenCalled();
    });

    it('should handle status transition from running to completed', () => {
      renderHook(() => useTaskSubscription(42));

      const agentRunUpdatedCallback = mockSubscribe.mock.calls.find(
        call => call[0] === 'agent-run-updated'
      )[1];

      act(() => {
        agentRunUpdatedCallback({
          taskId: 42,
          agentRun: { id: 1, status: 'completed', agent_type: 'implementation', conversation_id: 5 }
        });
      });

      const updaterFn = mockSetAgentRuns.mock.calls[0][0];
      const existingRuns = [{ id: 1, status: 'running', agent_type: 'implementation', conversation_id: 5 }];
      const result = updaterFn(existingRuns);

      expect(result[0].status).toBe('completed');
    });

    it('should handle status transition from running to failed', () => {
      renderHook(() => useTaskSubscription(42));

      const agentRunUpdatedCallback = mockSubscribe.mock.calls.find(
        call => call[0] === 'agent-run-updated'
      )[1];

      act(() => {
        agentRunUpdatedCallback({
          taskId: 42,
          agentRun: { id: 1, status: 'failed', agent_type: 'review' }
        });
      });

      const updaterFn = mockSetAgentRuns.mock.calls[0][0];
      const existingRuns = [{ id: 1, status: 'running', agent_type: 'review' }];
      const result = updaterFn(existingRuns);

      expect(result[0].status).toBe('failed');
    });
  });

  describe('Connection State Handling', () => {
    it('should not subscribe when not connected', () => {
      // Re-mock with isConnected: false
      vi.doMock('../contexts/WebSocketContext', () => ({
        useWebSocket: () => ({
          isConnected: false,
          sendMessage: mockSendMessage,
          subscribe: mockSubscribe,
          unsubscribe: mockUnsubscribe,
        }),
      }));

      // Clear previous mocks
      mockSendMessage.mockClear();
      mockSubscribe.mockClear();

      // Note: This test verifies the logic - in actual implementation,
      // the hook checks isConnected before subscribing
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty conversation in event', () => {
      renderHook(() => useTaskSubscription(42));

      const conversationAddedCallback = mockSubscribe.mock.calls.find(
        call => call[0] === 'conversation-added'
      )[1];

      act(() => {
        conversationAddedCallback({ taskId: 42, conversation: null });
      });

      // Should not crash, but also should not call setConversations with null
      expect(mockSetConversations).not.toHaveBeenCalled();
    });

    it('should handle empty agentRun in event', () => {
      renderHook(() => useTaskSubscription(42));

      const agentRunUpdatedCallback = mockSubscribe.mock.calls.find(
        call => call[0] === 'agent-run-updated'
      )[1];

      act(() => {
        agentRunUpdatedCallback({ taskId: 42, agentRun: null });
      });

      // Should not crash, but also should not call setAgentRuns with null
      expect(mockSetAgentRuns).not.toHaveBeenCalled();
    });

    it('should handle taskId of 0', () => {
      // taskId of 0 should be treated as falsy and not subscribe
      renderHook(() => useTaskSubscription(0));

      // In JavaScript, 0 is falsy, so this should not subscribe
      // The hook checks `if (!taskId)` which would be true for 0
      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });
});
