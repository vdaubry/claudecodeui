/*
 * ChatInterface.jsx - Chat Component with Message Sending
 *
 * Architecture:
 * - Load messages via REST API when session selected
 * - Display messages (user, assistant, tool calls)
 * - Send messages via WebSocket
 * - User refreshes to see responses
 */

import React, { useState, useEffect, useMemo, memo, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ClaudeLogo from './ClaudeLogo.jsx';
import CursorLogo from './CursorLogo.jsx';
import ClaudeStatus from './ClaudeStatus.jsx';
import MessageInput from './MessageInput.jsx';
import CommandMenu from './CommandMenu';
import { api, authenticatedFetch } from '../utils/api';
import { useWebSocket } from '../contexts/WebSocketContext';

// Code block component for syntax highlighting
const CodeBlock = ({ children, className }) => {
  const language = className?.replace('language-', '') || '';
  return (
    <pre className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto my-3">
      <code className={`text-sm text-gray-100 ${className || ''}`}>
        {children}
      </code>
    </pre>
  );
};

// Markdown components configuration
const markdownComponents = {
  code: ({ node, inline, className, children, ...props }) => {
    if (inline) {
      return (
        <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
          {children}
        </code>
      );
    }
    return <CodeBlock className={className}>{children}</CodeBlock>;
  },
  pre: ({ children }) => <>{children}</>,
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="text-gray-700 dark:text-gray-300">{children}</li>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
      {children}
    </a>
  ),
  h1: ({ children }) => <h1 className="text-xl font-bold mb-3 mt-4">{children}</h1>,
  h2: ({ children }) => <h2 className="text-lg font-bold mb-2 mt-3">{children}</h2>,
  h3: ({ children }) => <h3 className="text-base font-bold mb-2 mt-3">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic my-3">
      {children}
    </blockquote>
  ),
};

// Message component for rendering individual messages
const MessageComponent = memo(({ message, isGrouped }) => {
  if (message.type === 'user') {
    return (
      <div className="chat-message user flex justify-end px-3 sm:px-0">
        <div className="flex items-end space-x-3 max-w-[85%] md:max-w-md lg:max-w-lg">
          <div className="bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2 shadow-sm">
            <div className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </div>
            {message.timestamp && (
              <div className="text-xs text-blue-100 mt-1 text-right">
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            )}
          </div>
          {!isGrouped && (
            <div className="hidden sm:flex w-8 h-8 bg-blue-600 rounded-full items-center justify-center text-white text-sm flex-shrink-0">
              U
            </div>
          )}
        </div>
      </div>
    );
  }

  // Assistant message
  if (message.type === 'assistant') {
    return (
      <div className={`chat-message assistant px-3 sm:px-0 ${isGrouped ? 'grouped' : ''}`}>
        <div className="w-full">
          {!isGrouped && (
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center p-1">
                <ClaudeLogo className="w-full h-full" />
              </div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">Claude</div>
            </div>
          )}
          <div className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content || ''}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  // Tool use message
  if (message.type === 'tool' || message.isToolUse) {
    return (
      <div className="chat-message tool px-3 sm:px-0">
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3 my-2">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="font-medium">{message.toolName || 'Tool'}</span>
          </div>
          {message.toolInput && (
            <details className="mt-2">
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                View parameters
              </summary>
              <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto">
                {typeof message.toolInput === 'string' ? message.toolInput : JSON.stringify(message.toolInput, null, 2)}
              </pre>
            </details>
          )}
          {message.toolResult && (
            <details className="mt-2">
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                View result
              </summary>
              <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto max-h-48 overflow-y-auto">
                {typeof message.toolResult === 'string' ? message.toolResult : JSON.stringify(message.toolResult, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }

  // Thinking message
  if (message.type === 'thinking') {
    return (
      <div className="chat-message thinking px-3 sm:px-0">
        <details className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3 my-2">
          <summary className="text-sm text-purple-700 dark:text-purple-300 cursor-pointer font-medium">
            💭 Thinking...
          </summary>
          <div className="mt-2 text-sm text-purple-600 dark:text-purple-400 whitespace-pre-wrap">
            {message.content}
          </div>
        </details>
      </div>
    );
  }

  // Default/unknown message type
  return (
    <div className="chat-message px-3 sm:px-0">
      <div className="text-sm text-gray-600 dark:text-gray-400">
        {message.content || JSON.stringify(message)}
      </div>
    </div>
  );
});

MessageComponent.displayName = 'MessageComponent';

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
  const [isSending, setIsSending] = useState(false);

  // Permission mode state
  const [permissionMode, setPermissionMode] = useState('default');

  // Token usage state (will be populated from backend responses)
  const [tokenBudget, setTokenBudget] = useState(null);

  // Slash commands state
  const [slashCommands, setSlashCommands] = useState([]);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [slashPosition, setSlashPosition] = useState(-1);
  const [commandQuery, setCommandQuery] = useState('');
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(-1);

  // Ref for textarea positioning (forwarded to MessageInput)
  const inputTextareaRef = useRef(null);

  // Use shared WebSocket connection
  const { ws, isConnected, sendMessage, subscribe, unsubscribe } = useWebSocket();

  // Streaming state for real-time message updates
  const [streamingMessages, setStreamingMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const subscribedSessionRef = useRef(null);

  // Claude status state (for stop button)
  const [claudeStatus, setClaudeStatus] = useState(null);

  // Scroll state for smart auto-scroll behavior
  const messagesContainerRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  // Transform streaming SDK message to display format
  const transformStreamingMessage = useCallback((sdkMessage) => {
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
  }, []);

  // Handle incoming claude-response messages
  const handleClaudeResponse = useCallback((data) => {
    const currentSessionId = selectedSession?.id;
    const messageSessionId = data.session_id;

    // Filter: ignore messages for different sessions
    if (currentSessionId && messageSessionId && messageSessionId !== currentSessionId) {
      console.log('[ChatInterface] Ignoring message for different session:', messageSessionId);
      return;
    }

    setIsStreaming(true);

    // Transform and append streaming messages
    const transformed = transformStreamingMessage(data);
    if (transformed.length > 0) {
      setStreamingMessages(prev => [...prev, ...transformed]);
    }
  }, [selectedSession?.id, transformStreamingMessage]);

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

  // Handle claude-complete event
  const handleClaudeComplete = useCallback(async (message) => {
    setIsStreaming(false);
    setIsSending(false);
    setClaudeStatus(null);

    // Refresh messages from REST API to get persisted messages
    // Then clear streaming messages
    await refreshSessionMessages();
    setStreamingMessages([]);

    // Fetch updated token usage after message completes
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
  }, [refreshSessionMessages, selectedProject, selectedSession?.id]);

  // Handle token budget updates
  const handleTokenBudget = useCallback((message) => {
    setTokenBudget(message.data);
  }, []);

  // Handle errors
  const handleClaudeError = useCallback((error) => {
    console.error('[ChatInterface] Claude error:', error);
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

  // Handler to change permission mode
  const handleModeChange = useCallback((newMode) => {
    setPermissionMode(newMode);
    if (selectedSession?.id) {
      localStorage.setItem(`permissionMode-${selectedSession.id}`, newMode);
    }
  }, [selectedSession?.id]);

  // Handler to toggle command menu
  const handleToggleCommandMenu = useCallback(() => {
    const isOpening = !showCommandMenu;
    setShowCommandMenu(isOpening);
    if (isOpening) {
      // Reset command query when opening via button
      setCommandQuery('');
      setSelectedCommandIndex(-1);
    }
  }, [showCommandMenu]);

  // Filtered commands based on query
  const filteredCommands = useMemo(() => {
    if (!commandQuery) return slashCommands;
    return slashCommands.filter(cmd =>
      cmd.name.toLowerCase().includes(commandQuery.toLowerCase())
    );
  }, [slashCommands, commandQuery]);

  // Handler for command selection from CommandMenu
  const handleCommandSelect = useCallback((command, index, isHover) => {
    if (isHover) {
      setSelectedCommandIndex(index);
      return;
    }
    // Insert command into input
    const beforeSlash = slashPosition >= 0 ? input.slice(0, slashPosition) : input;
    const afterCursor = slashPosition >= 0 ? input.slice(slashPosition + 1 + commandQuery.length) : '';
    const newInput = beforeSlash + '/' + command.name + ' ' + afterCursor.trim();
    setInput(newInput.trim() + ' ');
    setShowCommandMenu(false);
    setSlashPosition(-1);
    setCommandQuery('');
    setSelectedCommandIndex(-1);
  }, [input, slashPosition, commandQuery]);

  // Handler for slash detection from MessageInput
  const handleSlashDetected = useCallback((position, query) => {
    if (position >= 0) {
      setSlashPosition(position);
      setCommandQuery(query);
      setShowCommandMenu(true);
      setSelectedCommandIndex(-1);
    } else {
      setSlashPosition(-1);
      setCommandQuery('');
      setShowCommandMenu(false);
    }
  }, []);

  // Handler to close command menu
  const handleCloseCommandMenu = useCallback(() => {
    setShowCommandMenu(false);
    setSlashPosition(-1);
    setCommandQuery('');
    setSelectedCommandIndex(-1);
  }, []);

  // Subscribe to WebSocket messages using shared context
  useEffect(() => {
    if (!selectedSession) return; // Don't subscribe if no session

    const handleResponse = (msg) => handleClaudeResponse(msg.data);
    const handleComplete = (msg) => handleClaudeComplete(msg);
    const handleError = (msg) => handleClaudeError(msg.error);
    const handleTokenBudgetMsg = (msg) => handleTokenBudget(msg);
    const handleSubscribed = (msg) => console.log('[ChatInterface] Subscribed to session:', msg.sessionId);
    const handleUnsubscribed = () => console.log('[ChatInterface] Unsubscribed from session');
    // NOTE: Don't subscribe to session-created - modal handles new sessions now

    // Handle session abort confirmation
    const handleSessionAborted = (msg) => {
      setIsStreaming(false);
      setIsSending(false);
      setClaudeStatus(null);
      // Add interruption message to streaming messages
      setStreamingMessages(prev => [...prev, {
        type: 'assistant',
        content: 'Session interrupted by user.',
        timestamp: new Date().toISOString()
      }]);
    };

    // Handle claude status updates (for can_interrupt flag)
    const handleClaudeStatusMsg = (msg) => {
      if (msg.data) {
        setClaudeStatus({
          text: msg.data.text || 'Working...',
          tokens: msg.data.tokens || 0,
          can_interrupt: msg.data.can_interrupt !== false
        });
      }
    };

    subscribe('claude-response', handleResponse);
    subscribe('claude-complete', handleComplete);
    subscribe('claude-error', handleError);
    subscribe('token-budget', handleTokenBudgetMsg);
    subscribe('session-subscribed', handleSubscribed);
    subscribe('session-unsubscribed', handleUnsubscribed);
    subscribe('session-aborted', handleSessionAborted);
    subscribe('claude-status', handleClaudeStatusMsg);

    return () => {
      unsubscribe('claude-response', handleResponse);
      unsubscribe('claude-complete', handleComplete);
      unsubscribe('claude-error', handleError);
      unsubscribe('token-budget', handleTokenBudgetMsg);
      unsubscribe('session-subscribed', handleSubscribed);
      unsubscribe('session-unsubscribed', handleUnsubscribed);
      unsubscribe('session-aborted', handleSessionAborted);
      unsubscribe('claude-status', handleClaudeStatusMsg);
    };
  }, [selectedSession, subscribe, unsubscribe, handleClaudeResponse, handleClaudeComplete, handleClaudeError, handleTokenBudget]);

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

  // Load permission mode from localStorage when session changes
  useEffect(() => {
    if (selectedSession?.id) {
      const savedMode = localStorage.getItem(`permissionMode-${selectedSession.id}`);
      setPermissionMode(savedMode || 'default');
    } else {
      setPermissionMode('default');
    }
  }, [selectedSession?.id]);

  // Fetch slash commands when project changes
  useEffect(() => {
    const fetchCommands = async () => {
      if (!selectedProject) return;
      try {
        const response = await api.getCommands(selectedProject.path || selectedProject.fullPath);
        if (response.ok) {
          const data = await response.json();
          // Combine built-in and custom commands
          const allCommands = [...(data.builtIn || []), ...(data.custom || [])];
          setSlashCommands(allCommands);
        }
      } catch (error) {
        console.error('Error fetching commands:', error);
      }
    };
    fetchCommands();
  }, [selectedProject?.path]);

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
