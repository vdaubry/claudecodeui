/*
 * MessageInput.jsx - Chat Message Input Component
 *
 * Reusable input component for sending messages via WebSocket.
 * Used by ChatInterface for both empty state and messages view.
 */

import React, { memo } from 'react';

const MessageInput = memo(({ input, setInput, handleSubmit, ws, isSending, isStreaming }) => (
  <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
    <form onSubmit={handleSubmit} className="flex items-end gap-3">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
        placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
        className="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        rows={5}
        disabled={!ws || isSending || isStreaming}
      />
      <button
        type="submit"
        disabled={!input.trim() || !ws || isSending || isStreaming}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isSending || isStreaming ? 'Responding...' : 'Send'}
      </button>
    </form>
    {!ws && (
      <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-2">
        Connecting to server...
      </p>
    )}
    {isStreaming && (
      <p className="text-xs text-blue-500 dark:text-blue-400 mt-2 flex items-center">
        <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-2"></span>
        Claude is responding...
      </p>
    )}
  </div>
));

MessageInput.displayName = 'MessageInput';

export default MessageInput;
