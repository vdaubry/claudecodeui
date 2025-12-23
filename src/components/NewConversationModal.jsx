/*
 * NewConversationModal.jsx - Task conversation modal
 *
 * Wrapper around NewConversationModalBase with task-specific adapter.
 */

import React, { useMemo } from 'react';
import { api } from '../utils/api';
import NewConversationModalBase from './NewConversationModalBase';

export default function NewConversationModal({
  isOpen,
  onClose,
  project,
  taskId,
  onConversationCreated
}) {
  const adapter = useMemo(() => ({
    title: 'New Conversation',
    subtitle: ({ project: currentProject }) => (
      <>Start a new conversation in <span className="font-medium text-gray-700 dark:text-gray-300">{currentProject?.name || 'this project'}</span></>
    ),
    logTag: 'NewConversationModal',
    submitLabel: 'Start Conversation',
    submitLabelLoading: 'Creating...',
    isReady: ({ entityId }) => !!entityId,
    createConversation: ({ entityId, message, projectPath, permissionMode }) =>
      api.conversations.createWithMessage(entityId, { message, projectPath, permissionMode })
  }), []);

  return (
    <NewConversationModalBase
      isOpen={isOpen}
      onClose={onClose}
      project={project}
      entity={null}
      entityId={taskId}
      onConversationCreated={onConversationCreated}
      adapter={adapter}
    />
  );
}
