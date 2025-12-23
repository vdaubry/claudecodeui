/**
 * ChatInterface.jsx - Chat Component for Task-Driven Workflow
 *
 * Architecture:
 * - Load messages via REST API when conversation selected
 * - Display messages (user, assistant, tool calls)
 * - Send messages via WebSocket
 * - Messages linked to task's conversation
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ClaudeStatus from './ClaudeStatus.jsx';
import MessageInput from './MessageInput.jsx';
import MessageComponent from './MessageComponent.jsx';
import CommandMenu from './CommandMenu';
import { api } from '../utils/api';
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
  selectedTask,
  selectedAgent, // NEW: Support for agent conversations
  activeConversation,
  onShowSettings,
  autoExpandTools,
  showRawParameters,
  showThinking
}) {
  const [sessionMessages, setSessionMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState('');

  const initialPermissionMode = activeConversation?.__permissionMode;

  // Permission mode state - initialize from conversation if it's an agent run
  const [permissionMode, setPermissionMode] = useState(
    initialPermissionMode || 'bypassPermissions'
  );

  // Update permission mode when activeConversation changes (for agent runs)
  // Include conversation id to ensure we reset when switching conversations
  useEffect(() => {
    if (initialPermissionMode) {
      setPermissionMode(initialPermissionMode);
    } else {
      // Reset to default when switching to a non-agent conversation
      setPermissionMode('bypassPermissions');
    }
  }, [activeConversation?.id, initialPermissionMode]);

  // Token usage state (will be populated from backend responses)
  const [tokenBudget, setTokenBudget] = useState(null);

  // Slash commands via hook - use project's repo_folder_path
  const projectPath = selectedProject?.repo_folder_path || selectedProject?.path;
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
  } = useSlashCommands(projectPath);

  // Ref for textarea positioning (forwarded to MessageInput)
  const inputTextareaRef = useRef(null);

  // Use shared WebSocket connection
  const { ws, isConnected, sendMessage, subscribe, unsubscribe, onDisconnect } = useWebSocket();

  // Session subscription ref
  const subscribedSessionRef = useRef(null);

  // Scroll state for smart auto-scroll behavior
  const messagesContainerRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef(null);

  // User-intent tracking refs for robust scroll detection
  const userScrollIntentRef = useRef(false);
  const userScrollIntentTimeoutRef = useRef(null);
  const isProgrammaticScrollRef = useRef(false);
  const reconnectCooldownRef = useRef(false);

  // Reconnection state sync refs
  const wasConnectedRef = useRef(false);
  const isRefreshingRef = useRef(false);

  // Get the claude session ID from the conversation
  const claudeSessionId = activeConversation?.claude_conversation_id;

  // Refresh session messages from REST API
  const conversationId = activeConversation?.id;
  const refreshSessionMessages = useCallback(async () => {
    if (!conversationId) {
      setSessionMessages([]);
      return;
    }

    // Fetch messages for the conversation
    try {
      const response = await api.conversations.getMessages(conversationId, 1000, 0);
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
    }
  }, [conversationId]);

  // Combined callback for when streaming completes
  const handleStreamingComplete = useCallback(async () => {
    await refreshSessionMessages();
  }, [refreshSessionMessages]);

  // Create a session-like object for the streaming hook
  // Only subscribe to streaming when we have a real Claude session ID
  // Modal-first flow guarantees this is always set before ChatInterface renders
  const sessionForStreaming = useMemo(() => {
    if (!claudeSessionId) return null;
    return {
      id: claudeSessionId,
      __provider: 'claude'
    };
  }, [claudeSessionId]);

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
    selectedSession: sessionForStreaming,
    selectedProject,
    sendMessage,
    subscribe,
    unsubscribe,
    onMessagesRefresh: handleStreamingComplete,
    onDisconnect,
  });

  // Display initial message from NewConversationModal immediately
  useEffect(() => {
    if (activeConversation?.__initialMessage && sessionMessages.length === 0) {
      setStreamingMessages([{
        type: 'user',
        content: activeConversation.__initialMessage,
        timestamp: new Date().toISOString()
      }]);
    }
  }, [activeConversation?.__initialMessage, activeConversation?.id, sessionMessages.length, setStreamingMessages]);

  // Handle token budget updates
  const handleTokenBudget = useCallback((message) => {
    setTokenBudget(message.data);
  }, []);

  // Handler to change permission mode
  const handleModeChange = useCallback((newMode) => {
    setPermissionMode(newMode);
    if (activeConversation?.id) {
      localStorage.setItem(`permissionMode-conv-${activeConversation.id}`, newMode);
    }
  }, [activeConversation?.id]);

  // Wrapper for command selection that includes input/setInput
  const handleCommandSelect = useCallback((command, index, isHover) => {
    hookCommandSelect(command, index, isHover, input, setInput);
  }, [hookCommandSelect, input, setInput]);

  // Subscribe to additional WebSocket messages (token budget, session subscription status)
  useEffect(() => {
    if (!activeConversation) return;

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
  }, [activeConversation, subscribe, unsubscribe, handleTokenBudget]);

  // Handle message submission
  // New conversations must be started via modal → REST API
  // handleSubmit only handles resuming existing conversations
  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (!input.trim() || isSending || isStreaming || !selectedProject || !isConnected) return;

    // Require a real Claude session ID - new conversations must use the modal
    if (!claudeSessionId) {
      console.error('[ChatInterface] Cannot send message: no claude session ID');
      return;
    }

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
        projectPath: projectPath,
        cwd: projectPath,
        sessionId: claudeSessionId,
        resume: true,
        permissionMode: permissionMode,
        conversationId: activeConversation?.id
      }
    });
    // Note: isSending is cleared when claude-complete is received
  }, [input, isSending, isStreaming, selectedProject, claudeSessionId, isConnected, sendMessage, permissionMode, projectPath, activeConversation]);

  // Convert raw messages to displayable format, including streaming messages
  const displayMessages = useMemo(() => {
    const historyMessages = convertSessionMessages(sessionMessages);
    // Append streaming messages during active streaming
    if (streamingMessages.length > 0) {
      return [...historyMessages, ...streamingMessages];
    }
    return historyMessages;
  }, [sessionMessages, streamingMessages]);

  // Load messages when conversation changes
  useEffect(() => {
    async function loadMessages() {
      if (!activeConversation) {
        setSessionMessages([]);
        return;
      }

      setIsLoading(true);
      try {
        const response = await api.conversations.getMessages(activeConversation.id, 1000, 0);
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
  }, [activeConversation?.id]);

  // Load permission mode when conversation changes
  // Note: Agent run permission mode is handled by the useEffect above (initialPermissionMode)
  // This effect only handles loading from localStorage for regular conversations
  useEffect(() => {
    // Skip if this is an agent run conversation (handled by initialPermissionMode useEffect)
    if (initialPermissionMode) return;

    if (activeConversation?.id) {
      const savedMode = localStorage.getItem(`permissionMode-conv-${activeConversation.id}`);
      setPermissionMode(savedMode || 'bypassPermissions');
    } else {
      setPermissionMode('bypassPermissions');
    }
  }, [activeConversation?.id, initialPermissionMode]);

  // Initialize token budget from conversation metadata, or reset to null
  useEffect(() => {
    const tokenUsage = activeConversation?.metadata?.tokenUsage;
    if (tokenUsage && tokenUsage.tokens > 0) {
      // Set token budget from persisted metadata (extracted from JSONL files)
      setTokenBudget({
        used: tokenUsage.tokens,
        total: tokenUsage.contextWindow || 200000
      });
    } else {
      setTokenBudget(null);
    }
  }, [activeConversation?.id, activeConversation?.metadata]);

  // Manage session subscription when conversation or WebSocket changes
  useEffect(() => {
    if (!isConnected || !claudeSessionId) return;

    const currentSubscription = subscribedSessionRef.current;
    const isSessionChange = currentSubscription !== claudeSessionId;

    // Unsubscribe from previous session (only if changing sessions)
    if (currentSubscription && isSessionChange) {
      sendMessage('unsubscribe-session', {});
    }

    // Subscribe to new session (or resubscribe on reconnect)
    sendMessage('subscribe-session', {
      sessionId: claudeSessionId,
      provider: 'claude'
    });
    subscribedSessionRef.current = claudeSessionId;

    // Clear streaming state only when actually switching sessions, not on reconnect
    // But preserve streaming messages if this is a new conversation with an initial message
    // (the __initialMessage effect has already set the user's message)
    if (isSessionChange && !activeConversation?.__initialMessage) {
      setStreamingMessages([]);
      setIsStreaming(false);
    }
  }, [claudeSessionId, isConnected, sendMessage]);

  // Set cooldown after WebSocket reconnection to ignore scroll events
  // This prevents false collapses from content refresh triggered by reconnection
  useEffect(() => {
    if (isConnected) {
      reconnectCooldownRef.current = true;
      const timeout = setTimeout(() => {
        reconnectCooldownRef.current = false;
      }, 500); // 500ms cooldown after reconnect
      return () => clearTimeout(timeout);
    }
  }, [isConnected]);

  // State sync on reconnect - re-subscribe and verify server state
  useEffect(() => {
    const wasConnected = wasConnectedRef.current;
    wasConnectedRef.current = isConnected;

    // Reconnection scenario: was disconnected, now connected
    if (isConnected && !wasConnected && claudeSessionId) {
      console.log('[ChatInterface] Reconnected, syncing state...');

      // 1. Re-subscribe to session
      sendMessage('subscribe-session', {
        sessionId: claudeSessionId,
        provider: 'claude'
      });

      // 2. Check if streaming is still active on server
      sendMessage('check-session-status', { sessionId: claudeSessionId });

      // 3. Refresh messages with debounce to prevent double-fetch
      if (!isRefreshingRef.current) {
        isRefreshingRef.current = true;
        refreshSessionMessages().finally(() => {
          isRefreshingRef.current = false;
        });
      }
    }
  }, [isConnected, claudeSessionId, sendMessage, refreshSessionMessages]);

  // Handle session-status response to sync UI state with server
  useEffect(() => {
    const handleSessionStatus = (msg) => {
      if (msg.sessionId === claudeSessionId) {
        if (!msg.isProcessing && (isSending || isStreaming)) {
          // Server says not processing but UI shows active - sync it
          console.log('[ChatInterface] Syncing: Server finished, clearing UI state');
          setIsSending(false);
          setIsStreaming(false);
          // Also refresh to get final messages
          if (!isRefreshingRef.current) {
            isRefreshingRef.current = true;
            refreshSessionMessages().finally(() => {
              isRefreshingRef.current = false;
            });
          }
        }
      }
    };

    subscribe('session-status', handleSessionStatus);
    return () => unsubscribe('session-status', handleSessionStatus);
  }, [claudeSessionId, isSending, isStreaming, subscribe, unsubscribe, refreshSessionMessages, setIsSending, setIsStreaming]);

  // Mark a scroll as programmatic (not user-initiated) to prevent false collapse triggers
  const markProgrammaticScroll = useCallback(() => {
    isProgrammaticScrollRef.current = true;
    // Clear after scroll event has had time to fire (2 frames)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
      });
    });
  }, []);

  // Handle scroll events to track if user is at bottom and trigger collapse
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // In column-reverse, scrollTop is 0 when at bottom (newest messages)
    // scrollTop becomes negative as user scrolls up to older messages
    const scrollPos = container.scrollTop;
    const atBottom = scrollPos >= -50; // 50px threshold

    setIsAtBottom(atBottom);
    if (atBottom) {
      setHasNewMessages(false);
      // Reset scrolling state when back at bottom
      setIsScrolling(false);
      return;
    }

    // === GUARD CONDITIONS to prevent false positive collapses ===

    // GUARD 1: Ignore programmatic scrolls (auto-scroll, scrollToBottom)
    if (isProgrammaticScrollRef.current) return;

    // GUARD 2: Ignore if no user scroll intent detected (touch/wheel/mouse)
    if (!userScrollIntentRef.current) return;

    // GUARD 3: Ignore during streaming (content changes cause layout scrolls)
    if (isStreaming) return;

    // GUARD 4: Ignore during reconnection cooldown
    if (reconnectCooldownRef.current) return;

    // === PASSED ALL GUARDS: This is a genuine user scroll ===

    // Only signal scrolling to collapse when user has scrolled 200+ px from bottom
    // This prevents accidental collapse from small movements
    const COLLAPSE_THRESHOLD = -200;
    if (scrollPos < COLLAPSE_THRESHOLD) {
      setIsScrolling(true);

      // Clear any existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Reset scrolling state after scroll stops (debounce)
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 150);
    }
  }, [isStreaming]);

  // Attach scroll listener to messages container
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => {
        container.removeEventListener('scroll', handleScroll);
        // Clean up timeout on unmount
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
      };
    }
  }, [handleScroll]);

  // Listen for user scroll-intent signals (touch, wheel, mouse)
  // This distinguishes user scrolls from programmatic/layout scrolls
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleUserScrollIntent = () => {
      userScrollIntentRef.current = true;
      // Clear the flag after a short window
      if (userScrollIntentTimeoutRef.current) {
        clearTimeout(userScrollIntentTimeoutRef.current);
      }
      userScrollIntentTimeoutRef.current = setTimeout(() => {
        userScrollIntentRef.current = false;
      }, 200); // User intent valid for 200ms after input
    };

    // Touch events (mobile)
    container.addEventListener('touchstart', handleUserScrollIntent, { passive: true });
    container.addEventListener('touchmove', handleUserScrollIntent, { passive: true });
    // Mouse wheel (desktop)
    container.addEventListener('wheel', handleUserScrollIntent, { passive: true });
    // Mouse drag on scrollbar (desktop)
    container.addEventListener('mousedown', handleUserScrollIntent, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleUserScrollIntent);
      container.removeEventListener('touchmove', handleUserScrollIntent);
      container.removeEventListener('wheel', handleUserScrollIntent);
      container.removeEventListener('mousedown', handleUserScrollIntent);
      if (userScrollIntentTimeoutRef.current) {
        clearTimeout(userScrollIntentTimeoutRef.current);
      }
    };
  }, []);

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
      markProgrammaticScroll(); // Mark as programmatic to prevent false collapse
      container.scrollTop = 0; // In column-reverse, 0 is the bottom
    }
    setHasNewMessages(false);
  }, [markProgrammaticScroll]);

  // Auto-scroll to bottom when new messages arrive AND user is at bottom
  useEffect(() => {
    if (isAtBottom && messagesContainerRef.current) {
      markProgrammaticScroll(); // Mark as programmatic to prevent false collapse
      messagesContainerRef.current.scrollTop = 0;
    }
  }, [displayMessages.length, isAtBottom, markProgrammaticScroll]);

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <div className="w-8 h-8 mx-auto mb-3">
            <div className="w-full h-full rounded-full border-4 border-muted border-t-primary animate-spin" />
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
          {displayMessages.length === 0 && !isStreaming ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg mb-2">Start a conversation</p>
              <p className="text-sm">Type a message below to begin chatting with Claude about this task.</p>
            </div>
          ) : (
            displayMessages.map((message, index) => {
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
            })
          )}
        </div>
      </div>

      {/* New messages indicator - appears when user has scrolled up and new messages arrive */}
      {hasNewMessages && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center gap-2 hover:bg-primary/90 transition-colors z-10"
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
        provider="claude"
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
        isScrolling={isScrolling}
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
