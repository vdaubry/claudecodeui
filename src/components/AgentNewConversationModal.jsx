/**
 * AgentNewConversationModal.jsx - Agent conversation modal
 *
 * Wrapper around NewConversationModalBase with agent-specific adapter.
 */

import React, { useMemo } from 'react';
import { api } from '../utils/api';
import NewConversationModalBase from './NewConversationModalBase';

export default function AgentNewConversationModal({
  isOpen,
  onClose,
  project,
  agent,
  onConversationCreated
}) {
  const adapter = useMemo(() => ({
    title: 'New Agent Conversation',
    subtitle: ({ entity }) => (
      <>Start a conversation with <span className="font-medium text-gray-700 dark:text-gray-300">{entity?.name || 'this agent'}</span></>
    ),
    logTag: 'AgentNewConversationModal',
    submitLabel: 'Start Conversation',
    submitLabelLoading: 'Creating...',
    isReady: ({ entity }) => !!entity,
    createConversation: ({ entityId, message, permissionMode }) =>
      api.agents.createConversationWithMessage(entityId, { message, permissionMode })
  }), []);

  return (
    <NewConversationModalBase
      isOpen={isOpen}
      onClose={onClose}
      project={project}
      entity={agent}
      entityId={agent?.id}
      onConversationCreated={onConversationCreated}
      adapter={adapter}
    />
  );
}
