/*
 * ChatInterface.jsx - Chat Component with Message Sending
 *
 * Architecture:
 * - Load messages via REST API when session selected
 * - Display messages (user, assistant, tool calls)
 * - Send messages via WebSocket
 * - User refreshes to see responses
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ClaudeStatus from './ClaudeStatus.jsx';
import MessageInput from './MessageInput.jsx';
import MessageComponent from './MessageComponent.jsx';
import CommandMenu from './CommandMenu';
import { api, authenticatedFetch } from '../utils/api';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useSlashCommands } from '../hooks/useSlashCommands';
import { useSessionStreaming } from '../hooks/useSessionStreaming';

// Convert raw session messages to displayable format
function convertSessionMessages(rawMessages) {
  const converted = [];
  const toolResults = new Map();

  // First pass: collect tool results
  for (const msg of rawMessages) {
    if (msg.type === 'user' && msg.message?.content) {
      const content = msg.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result') {
            toolResults.set(block.tool_use_id, block);
          }
        }
      }
    }
  }

  // Second pass: build message list
  for (const msg of rawMessages) {
    const timestamp = msg.timestamp;

    if (msg.type === 'user') {
      const content = msg.message?.content;
      if (typeof content === 'string') {
        converted.push({ type: 'user', content, timestamp });
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            converted.push({ type: 'user', content: block.text, timestamp });
          }
        }
      }
    } else if (msg.type === 'assistant') {
      const content = msg.message?.content;
      if (typeof content === 'string') {
        converted.push({ type: 'assistant', content, timestamp });
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            converted.push({ type: 'assistant', content: block.text, timestamp });
          } else if (block.type === 'thinking') {
            converted.push({ type: 'thinking', content: block.thinking, timestamp });
          } else if (block.type === 'tool_use') {
            const toolResult = toolResults.get(block.id);
            converted.push({
              type: 'tool',
              isToolUse: true,
              toolName: block.name,
              toolId: block.id,
              toolInput: JSON.stringify(block.input, null, 2),
              toolResult: toolResult?.content,
              timestamp
            });
          }
        }
      }
    }
  }

  return converted;
}

// Main ChatInterface component
function ChatInterface({
  selectedProject,
  selectedSession,
  onFileOpen,
  onNavigateToSession,
  onShowSettings,
  autoExpandTools,
  showRawParameters,
  showThinking,
  onShowAllTasks
}) {
  const [sessionMessages, setSessionMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState('');

  // Permission mode state
  const [permissionMode, setPermissionMode] = useState('default');

  // Token usage state (will be populated from backend responses)
  const [tokenBudget, setTokenBudget] = useState(null);

  // Slash commands via hook
  const {
    slashCommands,
    showCommandMenu,
    slashPosition,
    commandQuery,
    filteredCommands,
    selectedCommandIndex,
    handleSlashDetected,
    handleCommandSelect: hookCommandSelect,
    handleCloseCommandMenu,
    handleToggleCommandMenu,
  } = useSlashCommands(selectedProject?.path);

  // Ref for textarea positioning (forwarded to MessageInput)
  const inputTextareaRef = useRef(null);

  // Use shared WebSocket connection
  const { ws, isConnected, sendMessage, subscribe, unsubscribe } = useWebSocket();

  // Session subscription ref
  const subscribedSessionRef = useRef(null);

  // Scroll state for smart auto-scroll behavior
  const messagesContainerRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  // Refresh session messages from REST API
  const refreshSessionMessages = useCallback(async () => {
    if (!selectedSession || !selectedProject) {
      setSessionMessages([]);
      return;
    }

    try {
      const response = await api.sessionMessages(selectedProject.name, selectedSession.id, 1000, 0);
      if (response.ok) {
        const data = await response.json();
        setSessionMessages(data.messages || []);
      } else {
        console.error('Failed to load messages');
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }, [selectedSession?.id, selectedProject?.name]);

  // Fetch token usage callback for the streaming hook
  const fetchTokenUsage = useCallback(async () => {
    if (selectedProject && selectedSession?.id) {
      try {
        const url = `/api/projects/${selectedProject.name}/sessions/${selectedSession.id}/token-usage`;
        const response = await authenticatedFetch(url);
        if (response.ok) {
          const data = await response.json();
          setTokenBudget(data);
        }
      } catch (error) {
        console.error('Failed to fetch updated token usage:', error);
      }
    }
  }, [selectedProject, selectedSession?.id]);

  // Combined callback for when streaming completes
  const handleStreamingComplete = useCallback(async () => {
    await refreshSessionMessages();
    await fetchTokenUsage();
  }, [refreshSessionMessages, fetchTokenUsage]);

  // Session streaming via hook (handles streaming, abort, status, WebSocket subscriptions)
  const {
    streamingMessages,
    setStreamingMessages,
    isStreaming,
    setIsStreaming,
    isSending,
    setIsSending,
    claudeStatus,
    handleAbortSession,
  } = useSessionStreaming({
    selectedSession,
    selectedProject,
    sendMessage,
    subscribe,
    unsubscribe,
    onMessagesRefresh: handleStreamingComplete,
  });

  // Handle token budget updates
  const handleTokenBudget = useCallback((message) => {
    setTokenBudget(message.data);
  }, []);

  // Handler to change permission mode
  const handleModeChange = useCallback((newMode) => {
    setPermissionMode(newMode);
    if (selectedSession?.id) {
      localStorage.setItem(`permissionMode-${selectedSession.id}`, newMode);
    }
  }, [selectedSession?.id]);

  // Wrapper for command selection that includes input/setInput
  const handleCommandSelect = useCallback((command, index, isHover) => {
    hookCommandSelect(command, index, isHover, input, setInput);
  }, [hookCommandSelect, input, setInput]);

  // Subscribe to additional WebSocket messages (token budget, session subscription status)
  // Note: Streaming-related subscriptions are handled by useSessionStreaming hook
  useEffect(() => {
    if (!selectedSession) return;

    const handleTokenBudgetMsg = (msg) => handleTokenBudget(msg);
    const handleSubscribed = (msg) => console.log('[ChatInterface] Subscribed to session:', msg.sessionId);
    const handleUnsubscribed = () => console.log('[ChatInterface] Unsubscribed from session');

    subscribe('token-budget', handleTokenBudgetMsg);
    subscribe('session-subscribed', handleSubscribed);
    subscribe('session-unsubscribed', handleUnsubscribed);

    return () => {
      unsubscribe('token-budget', handleTokenBudgetMsg);
      unsubscribe('session-subscribed', handleSubscribed);
      unsubscribe('session-unsubscribed', handleUnsubscribed);
    };
  }, [selectedSession, subscribe, unsubscribe, handleTokenBudget]);

  // Handle message submission
  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (!input.trim() || isSending || !selectedProject || !isConnected) return;

    const messageText = input.trim();
    setIsSending(true);
    setInput('');

    // Add optimistic user message to streaming messages
    const userMessage = {
      type: 'user',
      content: messageText,
      timestamp: new Date().toISOString()
    };
    setStreamingMessages([userMessage]);

    sendMessage('claude-command', {
      command: messageText,
      options: {
        projectPath: selectedProject.path,
        cwd: selectedProject.fullPath || selectedProject.path,
        sessionId: selectedSession?.id,
        resume: !!selectedSession?.id,
        permissionMode: permissionMode
      }
    });
    // Note: isSending is cleared when claude-complete is received
  }, [input, isSending, selectedProject, selectedSession, isConnected, sendMessage, permissionMode]);

  // Convert raw messages to displayable format, including streaming messages
  const displayMessages = useMemo(() => {
    const historyMessages = convertSessionMessages(sessionMessages);
    // Append streaming messages during active streaming
    if (streamingMessages.length > 0) {
      return [...historyMessages, ...streamingMessages];
    }
    return historyMessages;
  }, [sessionMessages, streamingMessages]);

  // Load messages when session changes
  useEffect(() => {
    async function loadMessages() {
      if (!selectedSession || !selectedProject) {
        setSessionMessages([]);
        return;
      }

      setIsLoading(true);
      try {
        // Load all messages (no pagination for simplicity)
        const response = await api.sessionMessages(selectedProject.name, selectedSession.id, 1000, 0);
        if (response.ok) {
          const data = await response.json();
          setSessionMessages(data.messages || []);
        } else {
          console.error('Failed to load messages');
          setSessionMessages([]);
        }
      } catch (error) {
        console.error('Error loading messages:', error);
        setSessionMessages([]);
      } finally {
        setIsLoading(false);
      }
    }

    loadMessages();
  }, [selectedSession?.id, selectedProject?.name]);

  // Initialize streaming messages with user's initial message from NewSessionModal
  useEffect(() => {
    if (selectedSession?.__initialMessage && sessionMessages.length === 0) {
      // Only add initialMessage to streaming if we don't have messages from DB yet
      setStreamingMessages([{
        type: 'user',
        content: selectedSession.__initialMessage,
        timestamp: new Date().toISOString()
      }]);
    } else if (sessionMessages.length > 0 && !isStreaming) {
      // Clear streaming messages if we have DB messages AND we're not currently streaming
      // This prevents duplication when switching back to a conversation
      setStreamingMessages([]);
    }
  }, [selectedSession?.id, selectedSession?.__initialMessage, sessionMessages.length, isStreaming]);

  // Load permission mode when session changes
  // Prioritize __permissionMode from modal (for new sessions), then localStorage, then default
  useEffect(() => {
    if (selectedSession?.id) {
      if (selectedSession.__permissionMode) {
        setPermissionMode(selectedSession.__permissionMode);
      } else {
        const savedMode = localStorage.getItem(`permissionMode-${selectedSession.id}`);
        setPermissionMode(savedMode || 'default');
      }
    } else {
      setPermissionMode('default');
    }
  }, [selectedSession?.id, selectedSession?.__permissionMode]);

  // Load token usage when session changes
  useEffect(() => {
    if (!selectedProject || !selectedSession?.id) {
      setTokenBudget(null);
      return;
    }

    const fetchTokenUsage = async () => {
      try {
        const url = `/api/projects/${selectedProject.name}/sessions/${selectedSession.id}/token-usage`;
        const response = await authenticatedFetch(url);
        if (response.ok) {
          const data = await response.json();
          setTokenBudget(data);
        } else {
          setTokenBudget(null);
        }
      } catch (error) {
        console.error('Failed to fetch token usage:', error);
        setTokenBudget(null);
      }
    };

    fetchTokenUsage();
  }, [selectedSession?.id, selectedProject?.name]);

  // Manage session subscription when session or WebSocket changes
  useEffect(() => {
    if (!isConnected) return;

    const newSessionId = selectedSession?.id;
    const currentSubscription = subscribedSessionRef.current;

    // Unsubscribe from previous session
    if (currentSubscription && currentSubscription !== newSessionId) {
      sendMessage('unsubscribe-session', {});
    }

    // Subscribe to new session
    if (newSessionId) {
      sendMessage('subscribe-session', {
        sessionId: newSessionId,
        provider: selectedSession?.__provider || 'claude'
      });
      subscribedSessionRef.current = newSessionId;
    } else {
      subscribedSessionRef.current = null;
    }

    // Clear streaming state when switching to a different session (without initial message)
    if (currentSubscription !== newSessionId && !selectedSession?.__initialMessage) {
      setStreamingMessages([]);
    }
    setIsStreaming(false);
  }, [selectedSession?.id, selectedSession?.__provider, selectedSession?.__initialMessage, isConnected, sendMessage]);

  // Handle scroll events to track if user is at bottom
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // In column-reverse, scrollTop is 0 when at bottom (newest messages)
    // scrollTop becomes negative as user scrolls up to older messages
    const atBottom = container.scrollTop >= -50; // 50px threshold

    setIsAtBottom(atBottom);
    if (atBottom) {
      setHasNewMessages(false);
    }
  }, []);

  // Attach scroll listener to messages container
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // Track new messages when user is scrolled up
  useEffect(() => {
    if (streamingMessages.length > 0 && !isAtBottom) {
      setHasNewMessages(true);
    }
  }, [streamingMessages.length, isAtBottom]);

  // Scroll to bottom function
  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = 0; // In column-reverse, 0 is the bottom
    }
    setHasNewMessages(false);
  }, []);

  // Auto-scroll to bottom when new messages arrive AND user is at bottom
  useEffect(() => {
    if (isAtBottom && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = 0;
    }
  }, [displayMessages.length, isAtBottom]);

  // Note: Escape key to stop generation is handled by useSessionStreaming hook

  // Loading state - but skip if we have an initial message to display
  if (isLoading && !selectedSession?.__initialMessage) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <div className="w-8 h-8 mx-auto mb-3">
            <div className="w-full h-full rounded-full border-4 border-gray-200 border-t-blue-500 animate-spin" />
          </div>
          <p>Loading messages...</p>
        </div>
      </div>
    );
  }

  // Render messages
  return (
    <div className="h-full flex flex-col relative">
      {/* Messages container - uses flex-col-reverse so newest messages are at bottom and scroll origin is bottom */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col-reverse"
      >
        {/* Wrap messages in a div to maintain correct order within reversed flex container */}
        <div className="space-y-4">
          {displayMessages.map((message, index) => {
            const prevMessage = index > 0 ? displayMessages[index - 1] : null;
            const isGrouped = prevMessage && prevMessage.type === message.type;

            // Skip thinking messages if showThinking is false
            if (message.type === 'thinking' && !showThinking) {
              return null;
            }

            return (
              <MessageComponent
                key={index}
                message={message}
                isGrouped={isGrouped}
              />
            );
          })}
        </div>
      </div>

      {/* New messages indicator - appears when user has scrolled up and new messages arrive */}
      {hasNewMessages && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-blue-600 text-white rounded-full shadow-lg flex items-center gap-2 hover:bg-blue-700 transition-colors z-10"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          New messages
        </button>
      )}

      {/* Claude processing status with stop button */}
      <ClaudeStatus
        status={claudeStatus}
        isLoading={isSending || isStreaming}
        onAbort={handleAbortSession}
        provider={selectedSession?.__provider || 'claude'}
      />

      <MessageInput
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        isConnected={isConnected}
        isSending={isSending}
        isStreaming={isStreaming}
        selectedProject={selectedProject}
        permissionMode={permissionMode}
        onModeChange={handleModeChange}
        tokenBudget={tokenBudget}
        slashCommands={slashCommands}
        showCommandMenu={showCommandMenu}
        onToggleCommandMenu={handleToggleCommandMenu}
        isUserScrolledUp={!isAtBottom}
        onScrollToBottom={scrollToBottom}
        onSlashDetected={handleSlashDetected}
        textareaRef={inputTextareaRef}
        selectedCommandIndex={selectedCommandIndex}
        filteredCommands={filteredCommands}
        onCommandSelect={handleCommandSelect}
        onCloseCommandMenu={handleCloseCommandMenu}
      />

      {/* Command Menu - positioned above input */}
      <CommandMenu
        commands={filteredCommands}
        selectedIndex={selectedCommandIndex}
        onSelect={handleCommandSelect}
        onClose={handleCloseCommandMenu}
        position={{
          top: inputTextareaRef.current
            ? Math.max(16, inputTextareaRef.current.getBoundingClientRect().top - 316)
            : 0,
          left: inputTextareaRef.current
            ? inputTextareaRef.current.getBoundingClientRect().left
            : 16,
          bottom: inputTextareaRef.current
            ? window.innerHeight - inputTextareaRef.current.getBoundingClientRect().top + 8
            : 90
        }}
        isOpen={showCommandMenu && filteredCommands.length > 0}
      />
    </div>
  );
}

export default ChatInterface;
