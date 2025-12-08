/*
 * NewSessionModal.jsx - Modal for creating new sessions
 *
 * Collects the first message from the user before creating a session.
 * Uses the reusable MessageInput component for full feature parity
 * including file references (@), slash commands (/), and permission mode.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useSlashCommands } from '../hooks/useSlashCommands';
import MessageInput from './MessageInput';
import CommandMenu from './CommandMenu';

export default function NewSessionModal({ isOpen, onClose, project, onSessionCreated }) {
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [permissionMode, setPermissionMode] = useState('default');
  const { sendMessage, subscribe, unsubscribe, isConnected } = useWebSocket();
  const textareaRef = useRef(null);

  // Track if THIS modal is waiting for a session-created event
  const pendingSessionRef = useRef(false);

  // Track the input value and permission mode for use in the session-created callback
  const inputRef = useRef('');
  const permissionModeRef = useRef('default');

  // Use the slash commands hook
  const {
    slashCommands,
    showCommandMenu,
    filteredCommands,
    selectedCommandIndex,
    handleSlashDetected,
    handleCommandSelect: hookCommandSelect,
    handleCloseCommandMenu,
    handleToggleCommandMenu,
  } = useSlashCommands(project?.path || project?.fullPath);

  // Wrapper for command selection that includes input/setInput
  const handleCommandSelect = useCallback((command, index, isHover) => {
    hookCommandSelect(command, index, isHover, input, setInput);
  }, [hookCommandSelect, input, setInput]);

  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      pendingSessionRef.current = false;
      setIsSending(false);
      setInput('');
      setPermissionMode('default');
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
      // Pass the initial message and permission mode along with the sessionId
      onSessionCreated(message.sessionId, inputRef.current, permissionModeRef.current);
    };

    subscribe('session-created', handleSessionCreated);
    return () => unsubscribe('session-created', handleSessionCreated);
  }, [isOpen, subscribe, unsubscribe, onSessionCreated]);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (!input.trim() || isSending || !isConnected) return;

    // Mark that THIS modal is waiting for session-created
    pendingSessionRef.current = true;
    // Store the input value and permission mode in refs for use in session-created callback
    inputRef.current = input.trim();
    permissionModeRef.current = permissionMode;
    setIsSending(true);

    const sent = sendMessage('claude-command', {
      command: input.trim(),
      options: {
        projectPath: project.path,
        cwd: project.fullPath || project.path,
        sessionId: undefined,
        resume: false,
        permissionMode: permissionMode
      }
    });

    // If send failed, reset state
    if (!sent) {
      pendingSessionRef.current = false;
      setIsSending(false);
    }
  }, [input, isSending, isConnected, sendMessage, project, permissionMode]);

  // Calculate command menu position relative to modal
  const getCommandMenuPosition = useCallback(() => {
    if (!textareaRef.current) return { top: 0, left: 0, bottom: 90 };
    const rect = textareaRef.current.getBoundingClientRect();
    return {
      top: Math.max(16, rect.top - 316),
      left: rect.left,
      bottom: window.innerHeight - rect.top + 8
    };
  }, []);

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

        {/* Command Menu - positioned above input */}
        <CommandMenu
          commands={filteredCommands}
          selectedIndex={selectedCommandIndex}
          onSelect={handleCommandSelect}
          onClose={handleCloseCommandMenu}
          position={getCommandMenuPosition()}
          isOpen={showCommandMenu}
        />

        {/* Reusable MessageInput component */}
        <MessageInput
          input={input}
          setInput={setInput}
          handleSubmit={handleSubmit}
          isConnected={isConnected}
          isSending={isSending}
          isStreaming={false}
          selectedProject={project}
          permissionMode={permissionMode}
          onModeChange={setPermissionMode}
          tokenBudget={null}
          slashCommands={slashCommands}
          showCommandMenu={showCommandMenu}
          onToggleCommandMenu={handleToggleCommandMenu}
          isUserScrolledUp={false}
          onScrollToBottom={null}
          onSlashDetected={handleSlashDetected}
          textareaRef={textareaRef}
          selectedCommandIndex={selectedCommandIndex}
          filteredCommands={filteredCommands}
          onCommandSelect={handleCommandSelect}
          onCloseCommandMenu={handleCloseCommandMenu}
          // Modal-specific props
          showTokenUsage={false}
          showConnectionWarning={false}
          submitLabel="Start Conversation"
          submitLabelLoading="Creating..."
          rows={4}
          variant="modal"
        />

        {/* Connection warning */}
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
