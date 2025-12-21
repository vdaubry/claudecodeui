/**
 * useTaskSubscription Hook
 *
 * Subscribes to real-time task updates via WebSocket.
 * When subscribed, the hook receives and processes:
 * - conversation-added: New conversations created for the task
 * - agent-run-updated: Agent run status changes
 *
 * Updates the TaskContext state directly to provide live updates
 * on the Task Detail page without requiring manual refresh.
 */

import { useEffect, useRef } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useTaskContext } from '../contexts/TaskContext';

/**
 * Subscribe to real-time updates for a specific task
 *
 * @param {number|null} taskId - The task ID to subscribe to (null to unsubscribe)
 */
export function useTaskSubscription(taskId) {
  const { isConnected, subscribe, unsubscribe, sendMessage } = useWebSocket();
  const { setConversations, setAgentRuns } = useTaskContext();
  const subscribedTaskRef = useRef(null);

  useEffect(() => {
    if (!isConnected || !taskId) return;

    // Subscribe to task events
    sendMessage('subscribe-task', { taskId });
    subscribedTaskRef.current = taskId;
    console.log('[useTaskSubscription] Subscribed to task:', taskId);

    // Handle new conversation added
    const handleConversationAdded = (msg) => {
      if (msg.taskId === taskId && msg.conversation) {
        console.log('[useTaskSubscription] Conversation added:', msg.conversation.id);
        setConversations(prev => {
          // Avoid duplicates
          if (prev.some(c => c.id === msg.conversation.id)) return prev;
          // Add to beginning of list (newest first)
          return [msg.conversation, ...prev];
        });
      }
    };

    // Handle agent run status updates
    const handleAgentRunUpdated = (msg) => {
      if (msg.taskId === taskId && msg.agentRun) {
        console.log('[useTaskSubscription] Agent run updated:', msg.agentRun.id, msg.agentRun.status);
        setAgentRuns(prev => {
          const existing = prev.find(run => run.id === msg.agentRun.id);
          if (existing) {
            // Update existing agent run
            return prev.map(run =>
              run.id === msg.agentRun.id ? { ...run, ...msg.agentRun } : run
            );
          } else {
            // Add new agent run (for newly created runs)
            return [...prev, msg.agentRun];
          }
        });
      }
    };

    subscribe('conversation-added', handleConversationAdded);
    subscribe('agent-run-updated', handleAgentRunUpdated);

    return () => {
      // Unsubscribe when component unmounts or taskId changes
      sendMessage('unsubscribe-task', { taskId });
      subscribedTaskRef.current = null;
      unsubscribe('conversation-added', handleConversationAdded);
      unsubscribe('agent-run-updated', handleAgentRunUpdated);
      console.log('[useTaskSubscription] Unsubscribed from task:', taskId);
    };
  }, [taskId, isConnected, sendMessage, subscribe, unsubscribe, setConversations, setAgentRuns]);

  // Re-subscribe after reconnection
  useEffect(() => {
    if (isConnected && subscribedTaskRef.current) {
      // Re-subscribe to ensure we don't miss updates after reconnection
      sendMessage('subscribe-task', { taskId: subscribedTaskRef.current });
      console.log('[useTaskSubscription] Re-subscribed after reconnection:', subscribedTaskRef.current);
    }
  }, [isConnected, sendMessage]);
}

export default useTaskSubscription;
