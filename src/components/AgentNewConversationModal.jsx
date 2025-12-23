/**
 * AgentNewConversationModal.jsx - Modal for creating new agent conversations
 *
 * Collects the first message from the user before creating an agent conversation.
 * Similar to NewConversationModal but uses agent-specific API.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useSlashCommands } from '../hooks/useSlashCommands';
import { api } from '../utils/api';
import MessageInput from './MessageInput';
import CommandMenu from './CommandMenu';

export default function AgentNewConversationModal({
  isOpen,
  onClose,
  project,
  agent,
  onConversationCreated
}) {
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const [permissionMode, setPermissionMode] = useState('bypassPermissions');
  const { isConnected } = useWebSocket();
  const textareaRef = useRef(null);

  // Get the project path for slash commands
  const projectPath = project?.repo_folder_path || project?.path;

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
  } = useSlashCommands(projectPath);

  // Wrapper for command selection that includes input/setInput
  const handleCommandSelect = useCallback((command, index, isHover) => {
    hookCommandSelect(command, index, isHover, input, setInput);
  }, [hookCommandSelect, input, setInput]);

  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      setIsSending(false);
      setInput('');
      setError(null);
      setPermissionMode('bypassPermissions');
      return;
    }

    // Focus textarea when modal opens
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  }, [isOpen]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!input.trim() || isSending || !agent) return;

    setIsSending(true);
    setError(null);

    try {
      // Single REST call that creates conversation AND starts Claude session
      // Returns conversation with REAL claude_conversation_id
      const response = await api.agents.createConversationWithMessage(agent.id, {
        message: input.trim(),
        permissionMode: permissionMode
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create conversation');
      }

      const conversation = await response.json();

      // conversation.claude_conversation_id is GUARANTEED to be set
      // Claude is already streaming in the background
      // Attach the initial message for immediate display in ChatInterface
      onConversationCreated({
        ...conversation,
        __initialMessage: input.trim()
      });

    } catch (err) {
      console.error('[AgentNewConversationModal] Error:', err);
      setError(err.message);
      setIsSending(false);
    }
  }, [input, isSending, agent, permissionMode, onConversationCreated]);

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
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New Agent Conversation</h2>
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
          Start a conversation with <span className="font-medium text-gray-700 dark:text-gray-300">{agent?.name || 'this agent'}</span>
        </p>

        {/* Error display */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

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
