/*
 * NewSessionModal.jsx - Modal for creating new sessions
 *
 * Collects the first message from the user before creating a session.
 * Uses pending state tracking to scope session-created events.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';

export default function NewSessionModal({ isOpen, onClose, project, onSessionCreated }) {
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const { sendMessage, subscribe, unsubscribe, isConnected } = useWebSocket();
  const textareaRef = useRef(null);

  // Track if THIS modal is waiting for a session-created event
  const pendingSessionRef = useRef(false);

  // Track the input value for use in the session-created callback
  const inputRef = useRef('');

  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      pendingSessionRef.current = false;
      setIsSending(false);
      setInput('');
      return;
    }

    // Focus textarea when modal opens
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);

    const handleSessionCreated = (message) => {
      // IMPORTANT: Only handle if THIS modal sent the request
      if (!pendingSessionRef.current) return;

      pendingSessionRef.current = false;
      setIsSending(false);
      // Pass the initial message along with the sessionId (use ref for current value)
      onSessionCreated(message.sessionId, inputRef.current);
    };

    subscribe('session-created', handleSessionCreated);
    return () => unsubscribe('session-created', handleSessionCreated);
  }, [isOpen, subscribe, unsubscribe, onSessionCreated]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isSending || !isConnected) return;

    // Mark that THIS modal is waiting for session-created
    pendingSessionRef.current = true;
    // Store the input value in ref for use in session-created callback
    inputRef.current = input.trim();
    setIsSending(true);

    const sent = sendMessage('claude-command', {
      command: input.trim(),
      options: {
        projectPath: project.path,
        cwd: project.fullPath || project.path,
        sessionId: undefined,
        resume: false
      }
    });

    // If send failed, reset state
    if (!sent) {
      pendingSessionRef.current = false;
      setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={!isSending ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New Conversation</h2>
          <button
            onClick={onClose}
            disabled={isSending}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Start a new conversation in <span className="font-medium text-gray-700 dark:text-gray-300">{project?.displayName || project?.name}</span>
        </p>

        <form onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your first message..."
            className="w-full h-32 p-3 border border-gray-300 dark:border-gray-600 rounded-lg resize-none bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isSending}
          />

          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!input.trim() || isSending || !isConnected}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                'Start Conversation'
              )}
            </button>
          </div>
        </form>

        {!isConnected && (
          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-700 dark:text-yellow-400">
              Waiting for connection to server...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
