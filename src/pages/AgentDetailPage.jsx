/**
 * AgentDetailPage.jsx - Agent Detail Page Wrapper
 *
 * Loads project, agent, conversations, and prompt from URL params.
 * Renders the AgentDetailView component.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AgentDetailView from '../components/AgentDetailView';
import AgentNewConversationModal from '../components/AgentNewConversationModal';
import { useTaskContext } from '../contexts/TaskContext';
import { useAgentContext } from '../contexts/AgentContext';
import { useAuthToken } from '../hooks/useAuthToken';
import { api } from '../utils/api';

function AgentDetailPage() {
  const { projectId, agentId } = useParams();
  const navigate = useNavigate();
  const { getTokenParam } = useAuthToken();
  const {
    projects,
    loadProjects,
    isLoadingProjects
  } = useTaskContext();
  const {
    agents,
    loadAgents,
    agentConversations,
    loadAgentConversations,
    agentPrompt,
    loadAgentPrompt,
    saveAgentPrompt,
    deleteAgentConversation,
    agentAttachments,
    isLoadingAttachments,
    loadAgentAttachments,
    uploadAgentAttachment,
    deleteAgentAttachment,
    isLoadingAgents,
    isLoadingAgentConversations,
    isLoadingAgentPrompt
  } = useAgentContext();

  const [project, setProject] = useState(null);
  const [agent, setAgent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewConversationModal, setShowNewConversationModal] = useState(false);

  // Load project data
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        if (projects.length === 0 && !isLoadingProjects) {
          await loadProjects();
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [projectId, loadProjects, projects.length, isLoadingProjects]);

  // Find project and load agents
  useEffect(() => {
    if (projects.length > 0) {
      const foundProject = projects.find(p => p.id === parseInt(projectId));
      if (foundProject) {
        setProject(foundProject);
        loadAgents(foundProject.id);
      } else {
        navigate(`/${getTokenParam()}`, { replace: true });
      }
    }
  }, [projects, projectId, loadAgents, navigate, getTokenParam]);

  // Find agent and load its data
  useEffect(() => {
    if (agents.length > 0 && project) {
      const foundAgent = agents.find(a => a.id === parseInt(agentId));
      if (foundAgent) {
        setAgent(foundAgent);
        // Load agent-related data
        loadAgentConversations(foundAgent.id);
        loadAgentPrompt(foundAgent.id);
        loadAgentAttachments(foundAgent.id);
      } else {
        // Agent not found, redirect to board agents tab
        navigate(`/projects/${projectId}?tab=agents${getTokenParam() ? '&' + getTokenParam().slice(1) : ''}`, { replace: true });
      }
    }
  }, [agents, agentId, project, projectId, loadAgentConversations, loadAgentPrompt, loadAgentAttachments, navigate, getTokenParam]);

  // Navigation handlers
  const handleBack = useCallback(() => {
    navigate(`/projects/${projectId}?tab=agents${getTokenParam() ? '&' + getTokenParam().slice(1) : ''}`);
  }, [navigate, projectId, getTokenParam]);

  const handleProjectClick = useCallback(() => {
    navigate(`/projects/${projectId}${getTokenParam()}`);
  }, [navigate, projectId, getTokenParam]);

  const handleHomeClick = useCallback(() => {
    navigate(`/${getTokenParam()}`);
  }, [navigate, getTokenParam]);

  // Agent prompt handlers
  const handleSavePrompt = useCallback(async (content) => {
    if (!agent) return { success: false, error: 'No agent selected' };
    return await saveAgentPrompt(agent.id, content);
  }, [agent, saveAgentPrompt]);

  const handleEditPrompt = useCallback(() => {
    if (agent) {
      navigate(`/projects/${projectId}/agents/${agentId}/edit${getTokenParam()}`);
    }
  }, [agent, navigate, projectId, agentId, getTokenParam]);

  // Conversation handlers
  const handleNewConversation = useCallback(() => {
    if (!agent) return;
    setShowNewConversationModal(true);
  }, [agent]);

  const handleConversationCreated = useCallback((conversation) => {
    setShowNewConversationModal(false);
    // Navigate to the chat page with the new conversation
    navigate(`/projects/${projectId}/agents/${agentId}/chat/${conversation.id}${getTokenParam()}`, {
      state: { initialMessage: conversation.__initialMessage }
    });
  }, [navigate, projectId, agentId, getTokenParam]);

  const handleResumeConversation = useCallback((conversation) => {
    navigate(`/projects/${projectId}/agents/${agentId}/chat/${conversation.id}${getTokenParam()}`);
  }, [navigate, projectId, agentId, getTokenParam]);

  const handleDeleteConversation = useCallback(async (conversationId) => {
    return await deleteAgentConversation(conversationId);
  }, [deleteAgentConversation]);

  // Attachment handlers
  const handleUploadAttachment = useCallback(async (file) => {
    if (!agent) return { success: false, error: 'No agent selected' };
    return await uploadAgentAttachment(agent.id, file);
  }, [agent, uploadAgentAttachment]);

  const handleDeleteAttachment = useCallback(async (filename) => {
    if (!agent) return { success: false, error: 'No agent selected' };
    return await deleteAgentAttachment(agent.id, filename);
  }, [agent, deleteAgentAttachment]);

  // Loading state
  if (isLoading || isLoadingProjects || isLoadingAgents || !project || !agent) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <div className="w-12 h-12 mx-auto mb-4">
            <div className="w-full h-full rounded-full border-4 border-muted border-t-primary animate-spin" />
          </div>
          <p>Loading agent...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <AgentDetailView
        project={project}
        agent={agent}
        agentPrompt={agentPrompt}
        conversations={agentConversations}
        isLoadingPrompt={isLoadingAgentPrompt}
        isLoadingConversations={isLoadingAgentConversations}
        agentAttachments={agentAttachments}
        isLoadingAttachments={isLoadingAttachments}
        onUploadAttachment={handleUploadAttachment}
        onDeleteAttachment={handleDeleteAttachment}
        onBack={handleBack}
        onProjectClick={handleProjectClick}
        onHomeClick={handleHomeClick}
        onSavePrompt={handleSavePrompt}
        onEditPrompt={handleEditPrompt}
        onNewConversation={handleNewConversation}
        onResumeConversation={handleResumeConversation}
        onDeleteConversation={handleDeleteConversation}
        className="h-full"
      />
      <AgentNewConversationModal
        isOpen={showNewConversationModal}
        onClose={() => setShowNewConversationModal(false)}
        project={project}
        agent={agent}
        onConversationCreated={handleConversationCreated}
      />
    </>
  );
}

export default AgentDetailPage;
