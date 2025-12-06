/*
 * ChatInterface.jsx - Minimal View-Only Chat Component
 *
 * Stateless architecture:
 * - Load messages via REST API when session selected
 * - Display messages (user, assistant, tool calls)
 * - No sending, no streaming, no WebSocket
 */

import React, { useState, useEffect, useMemo, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ClaudeLogo from './ClaudeLogo.jsx';
import CursorLogo from './CursorLogo.jsx';
import { api } from '../utils/api';

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

  // Convert raw messages to displayable format
  const displayMessages = useMemo(() => {
    return convertSessionMessages(sessionMessages);
  }, [sessionMessages]);

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

  // Empty state - no session selected
  if (!selectedSession) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 p-6">
        <div className="w-16 h-16 mb-4">
          <ClaudeLogo className="w-full h-full opacity-50" />
        </div>
        <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">Select a Conversation</h2>
        <p className="text-center max-w-md">
          Choose a conversation from the sidebar to view the message history.
        </p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
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

  // No messages
  if (displayMessages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 p-6">
        <h2 className="text-lg font-semibold mb-2">No Messages</h2>
        <p className="text-center">This conversation doesn't have any messages yet.</p>
      </div>
    );
  }

  // Render messages
  return (
    <div className="h-full flex flex-col">
      {/* Messages container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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

      {/* View-only indicator */}
      <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div className="text-center text-sm text-gray-500 dark:text-gray-400">
          View-only mode — {displayMessages.length} messages
        </div>
      </div>
    </div>
  );
}

export default ChatInterface;
