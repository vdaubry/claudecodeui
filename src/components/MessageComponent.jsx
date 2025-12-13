/*
 * MessageComponent.jsx - Message Rendering Component
 *
 * Renders individual chat messages including:
 * - User messages (blue bubble, right-aligned)
 * - Assistant messages (with ClaudeLogo, Markdown rendering)
 * - Tool messages (expandable with parameters/results)
 * - Thinking messages (collapsible purple box)
 */

import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ClaudeLogo from './ClaudeLogo.jsx';

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

// Helper to check if children contain block-level elements
const hasBlockElements = (children) => {
  return React.Children.toArray(children).some(child => {
    if (React.isValidElement(child)) {
      // Check for block-level element types
      const blockTypes = ['pre', 'div', 'table', 'ul', 'ol', 'blockquote'];
      if (typeof child.type === 'string' && blockTypes.includes(child.type)) {
        return true;
      }
      // Check for our CodeBlock component
      if (child.type === CodeBlock) {
        return true;
      }
    }
    return false;
  });
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
  p: ({ children }) => {
    // If paragraph contains block-level elements, use div instead to avoid invalid nesting
    if (hasBlockElements(children)) {
      return <div className="mb-3 last:mb-0">{children}</div>;
    }
    return <p className="mb-3 last:mb-0">{children}</p>;
  },
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

export default MessageComponent;
