/*
 * useSessionStreaming.js - Hook for session streaming and abort functionality
 *
 * Extracts streaming logic from ChatInterface for reuse across components.
 * Handles message streaming, status updates, and session abort.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// Transform streaming SDK message to display format
function transformStreamingMessage(sdkMessage) {
  const timestamp = new Date().toISOString();

  // Handle assistant messages with content array
  if (sdkMessage.type === 'assistant' && sdkMessage.message?.content) {
    const content = sdkMessage.message.content;
    const messages = [];

    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text') {
          messages.push({ type: 'assistant', content: block.text, timestamp });
        } else if (block.type === 'thinking') {
          messages.push({ type: 'thinking', content: block.thinking, timestamp });
        } else if (block.type === 'tool_use') {
          messages.push({
            type: 'tool',
            isToolUse: true,
            toolName: block.name,
            toolId: block.id,
            toolInput: JSON.stringify(block.input, null, 2),
            timestamp
          });
        }
      }
    } else if (typeof content === 'string') {
      messages.push({ type: 'assistant', content, timestamp });
    }

    return messages;
  }

  // Handle user messages (for tool results)
  if (sdkMessage.type === 'user' && sdkMessage.message?.content) {
    const content = sdkMessage.message.content;
    if (Array.isArray(content)) {
      // Tool results come as user messages - we can update existing tool entries
      // For now, we'll skip these as they're handled in tool_use display
      return [];
    }
  }

  return [];
}

export function useSessionStreaming({
  selectedSession,
  selectedProject,
  sendMessage,
  subscribe,
  unsubscribe,
  onMessagesRefresh,
  onTokenBudgetUpdate,
  onDisconnect, // Callback to subscribe to WebSocket disconnection events
}) {
  // Streaming state
  const [streamingMessages, setStreamingMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [claudeStatus, setClaudeStatus] = useState(null);

  // Use refs to store latest callback values to avoid effect re-runs
  const onMessagesRefreshRef = useRef(onMessagesRefresh);
  const selectedSessionIdRef = useRef(selectedSession?.id);

  // Keep refs updated
  useEffect(() => {
    onMessagesRefreshRef.current = onMessagesRefresh;
  }, [onMessagesRefresh]);

  useEffect(() => {
    selectedSessionIdRef.current = selectedSession?.id;
  }, [selectedSession?.id]);

  // Handle incoming claude-response messages
  // Use ref for session ID to avoid recreating this callback
  const handleClaudeResponse = useCallback((data) => {
    const currentSessionId = selectedSessionIdRef.current;
    const messageSessionId = data.session_id;

    // Robust session filtering:
    // Accept messages when:
    // 1. We don't have a session ID yet (new conversation, waiting for first message)
    // 2. The message's session ID matches our session ID
    // 3. Message has no session ID (broadcast messages - SDK often omits session_id)
    const shouldAccept =
      !currentSessionId ||                              // We don't know our session yet
      !messageSessionId ||                              // Message has no session (broadcasts)
      messageSessionId === currentSessionId;            // Direct match

    if (!shouldAccept) {
      console.log('[useSessionStreaming] Ignoring message for different session:', messageSessionId);
      return;
    }

    setIsStreaming(true);

    // Transform and append streaming messages
    const transformed = transformStreamingMessage(data);
    if (transformed.length > 0) {
      setStreamingMessages(prev => [...prev, ...transformed]);
    }
  }, []); // No deps - uses ref

  // Handle claude-complete event
  // Use ref for callback to avoid recreating this handler
  const handleClaudeComplete = useCallback(async () => {
    setIsStreaming(false);
    setIsSending(false);
    setClaudeStatus(null);

    // Refresh messages from REST API to get persisted messages
    // Then clear streaming messages
    if (onMessagesRefreshRef.current) {
      await onMessagesRefreshRef.current();
    }
    setStreamingMessages([]);
  }, []); // No deps - uses ref

  // Handle errors
  const handleClaudeError = useCallback((error) => {
    console.error('[useSessionStreaming] Claude error:', error);
    setIsStreaming(false);
    setIsSending(false);
    setClaudeStatus(null);
  }, []);

  // Handle abort session (stop button)
  const handleAbortSession = useCallback(() => {
    if (selectedSession?.id) {
      sendMessage('abort-session', {
        sessionId: selectedSession.id,
        provider: selectedSession?.__provider || 'claude'
      });
    }
  }, [selectedSession?.id, selectedSession?.__provider, sendMessage]);

  // Handle session abort confirmation
  const handleSessionAborted = useCallback(() => {
    setIsStreaming(false);
    setIsSending(false);
    setClaudeStatus(null);
    // Add interruption message to streaming messages
    setStreamingMessages(prev => [...prev, {
      type: 'assistant',
      content: 'Session interrupted by user.',
      timestamp: new Date().toISOString()
    }]);
  }, []);

  // Handle claude status updates (for can_interrupt flag)
  const handleClaudeStatusMsg = useCallback((msg) => {
    if (msg.data) {
      setClaudeStatus({
        text: msg.data.text || 'Working...',
        tokens: msg.data.tokens || 0,
        can_interrupt: msg.data.can_interrupt !== false
      });
    }
  }, []);

  // Subscribe to WebSocket messages
  // Only re-subscribe when selectedSession changes (not on every render)
  useEffect(() => {
    if (!selectedSession) return;

    const handleResponse = (msg) => handleClaudeResponse(msg.data);
    const handleComplete = () => handleClaudeComplete();
    const handleError = (msg) => handleClaudeError(msg.error);
    const handleAborted = () => handleSessionAborted();
    const handleStatus = (msg) => handleClaudeStatusMsg(msg);

    subscribe('claude-response', handleResponse);
    subscribe('claude-complete', handleComplete);
    subscribe('claude-error', handleError);
    subscribe('session-aborted', handleAborted);
    subscribe('claude-status', handleStatus);

    return () => {
      unsubscribe('claude-response', handleResponse);
      unsubscribe('claude-complete', handleComplete);
      unsubscribe('claude-error', handleError);
      unsubscribe('session-aborted', handleAborted);
      unsubscribe('claude-status', handleStatus);
    };
  }, [selectedSession?.id, subscribe, unsubscribe]); // Only depend on session ID, not full object

  // Escape key to stop generation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && (isSending || isStreaming)) {
        handleAbortSession();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSending, isStreaming, handleAbortSession]);

  // Clear streaming state immediately on WebSocket disconnect
  // This prevents "stuck thinking" state when connection is lost
  useEffect(() => {
    if (!onDisconnect) return;

    const cleanup = onDisconnect(() => {
      console.log('[useSessionStreaming] Connection lost, clearing streaming state');
      setIsStreaming(false);
      setIsSending(false);
      setClaudeStatus(null);
    });

    return cleanup;
  }, [onDisconnect]);

  return {
    // State
    streamingMessages,
    setStreamingMessages,
    isStreaming,
    setIsStreaming,
    isSending,
    setIsSending,
    claudeStatus,

    // Actions
    handleAbortSession,
  };
}
