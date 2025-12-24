/**
 * AgentContext.jsx - State Management for Custom Agents
 *
 * This context manages custom agents:
 * - Agents: Reusable agent configurations with prompts
 * - Agent Conversations: Claude sessions linked to agents
 *
 * All state is fetched from /api/ endpoints.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { api } from '../utils/api';

// Create context
const AgentContext = createContext(null);

// Custom hook to use the context
export function useAgentContext() {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgentContext must be used within an AgentContextProvider');
  }
  return context;
}

// Provider component
export function AgentContextProvider({ children }) {
  // Agents state (for currently selected project)
  const [agents, setAgents] = useState([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [agentsError, setAgentsError] = useState(null);

  // Selected agent state
  const [selectedAgent, setSelectedAgent] = useState(null);

  // Agent conversations state (for currently selected agent)
  const [agentConversations, setAgentConversations] = useState([]);
  const [isLoadingAgentConversations, setIsLoadingAgentConversations] = useState(false);

  // Active agent conversation
  const [activeAgentConversation, setActiveAgentConversation] = useState(null);

  // Agent prompt state
  const [agentPrompt, setAgentPrompt] = useState('');
  const [isLoadingAgentPrompt, setIsLoadingAgentPrompt] = useState(false);

  // Agent attachments state
  const [agentAttachments, setAgentAttachments] = useState([]);
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);

  // Agent output files state
  const [agentOutputFiles, setAgentOutputFiles] = useState([]);
  const [isLoadingOutputFiles, setIsLoadingOutputFiles] = useState(false);

  // ========== Agents API ==========

  const loadAgents = useCallback(async (projectId) => {
    if (!projectId) {
      setAgents([]);
      return;
    }

    setIsLoadingAgents(true);
    setAgentsError(null);
    try {
      const response = await api.agents.list(projectId);
      if (response.ok) {
        const data = await response.json();
        setAgents(data || []);
      } else {
        const error = await response.json();
        setAgentsError(error.error || 'Failed to load agents');
      }
    } catch (error) {
      console.error('Error loading agents:', error);
      setAgentsError(error.message);
    } finally {
      setIsLoadingAgents(false);
    }
  }, []);

  const createAgent = useCallback(async (projectId, name) => {
    try {
      const response = await api.agents.create(projectId, name);
      if (response.ok) {
        const newAgent = await response.json();
        setAgents(prev => [...prev, newAgent]);
        return { success: true, agent: newAgent };
      } else {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to create agent' };
      }
    } catch (error) {
      console.error('Error creating agent:', error);
      return { success: false, error: error.message };
    }
  }, []);

  const updateAgent = useCallback(async (id, data) => {
    try {
      const response = await api.agents.update(id, data);
      if (response.ok) {
        const updatedAgent = await response.json();
        setAgents(prev => prev.map(a => a.id === id ? updatedAgent : a));
        if (selectedAgent?.id === id) {
          setSelectedAgent(updatedAgent);
        }
        return { success: true, agent: updatedAgent };
      } else {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to update agent' };
      }
    } catch (error) {
      console.error('Error updating agent:', error);
      return { success: false, error: error.message };
    }
  }, [selectedAgent]);

  const deleteAgent = useCallback(async (id) => {
    try {
      const response = await api.agents.delete(id);
      if (response.ok) {
        setAgents(prev => prev.filter(a => a.id !== id));
        if (selectedAgent?.id === id) {
          setSelectedAgent(null);
          setAgentConversations([]);
          setActiveAgentConversation(null);
          setAgentPrompt('');
        }
        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to delete agent' };
      }
    } catch (error) {
      console.error('Error deleting agent:', error);
      return { success: false, error: error.message };
    }
  }, [selectedAgent]);

  // ========== Agent Prompt API ==========

  const loadAgentPrompt = useCallback(async (agentId) => {
    setIsLoadingAgentPrompt(true);
    try {
      const response = await api.agents.getPrompt(agentId);
      if (response.ok) {
        const data = await response.json();
        setAgentPrompt(data.content || '');
        return { success: true, content: data.content || '' };
      } else {
        setAgentPrompt('');
        return { success: false, error: 'Failed to load prompt' };
      }
    } catch (error) {
      console.error('Error loading agent prompt:', error);
      setAgentPrompt('');
      return { success: false, error: error.message };
    } finally {
      setIsLoadingAgentPrompt(false);
    }
  }, []);

  const saveAgentPrompt = useCallback(async (agentId, content) => {
    try {
      const response = await api.agents.savePrompt(agentId, content);
      if (response.ok) {
        setAgentPrompt(content);
        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to save prompt' };
      }
    } catch (error) {
      console.error('Error saving agent prompt:', error);
      return { success: false, error: error.message };
    }
  }, []);

  // ========== Agent Attachments API ==========

  const loadAgentAttachments = useCallback(async (agentId) => {
    if (!agentId) {
      setAgentAttachments([]);
      return;
    }

    setIsLoadingAttachments(true);
    try {
      const response = await api.agents.listAttachments(agentId);
      if (response.ok) {
        const data = await response.json();
        setAgentAttachments(data || []);
      } else {
        setAgentAttachments([]);
      }
    } catch (error) {
      console.error('Error loading agent attachments:', error);
      setAgentAttachments([]);
    } finally {
      setIsLoadingAttachments(false);
    }
  }, []);

  const uploadAgentAttachment = useCallback(async (agentId, file) => {
    try {
      const response = await api.agents.uploadAttachment(agentId, file);
      if (response.ok) {
        const data = await response.json();
        setAgentAttachments(prev => [...prev, data.file]);
        return { success: true, file: data.file };
      } else {
        const error = await response.json();
        return { success: false, error: error.error || 'Upload failed' };
      }
    } catch (error) {
      console.error('Error uploading attachment:', error);
      return { success: false, error: error.message };
    }
  }, []);

  const deleteAgentAttachment = useCallback(async (agentId, filename) => {
    try {
      const response = await api.agents.deleteAttachment(agentId, filename);
      if (response.ok) {
        setAgentAttachments(prev => prev.filter(f => f.name !== filename));
        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, error: error.error || 'Delete failed' };
      }
    } catch (error) {
      console.error('Error deleting attachment:', error);
      return { success: false, error: error.message };
    }
  }, []);

  // ========== Agent Output Files API ==========

  const loadAgentOutputFiles = useCallback(async (agentId) => {
    if (!agentId) {
      setAgentOutputFiles([]);
      return;
    }

    setIsLoadingOutputFiles(true);
    try {
      const response = await api.agents.listOutputFiles(agentId);
      if (response.ok) {
        const data = await response.json();
        setAgentOutputFiles(data || []);
      } else {
        setAgentOutputFiles([]);
      }
    } catch (error) {
      console.error('Error loading agent output files:', error);
      setAgentOutputFiles([]);
    } finally {
      setIsLoadingOutputFiles(false);
    }
  }, []);

  const downloadAgentOutputFile = useCallback(async (agentId, filename) => {
    try {
      const response = await api.agents.downloadOutputFile(agentId, filename);
      if (response.ok) {
        // Get the blob from response
        const blob = await response.blob();
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, error: error.error || 'Download failed' };
      }
    } catch (error) {
      console.error('Error downloading output file:', error);
      return { success: false, error: error.message };
    }
  }, []);

  const deleteAgentOutputFile = useCallback(async (agentId, filename) => {
    try {
      const response = await api.agents.deleteOutputFile(agentId, filename);
      if (response.ok) {
        setAgentOutputFiles(prev => prev.filter(f => f.name !== filename));
        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, error: error.error || 'Delete failed' };
      }
    } catch (error) {
      console.error('Error deleting output file:', error);
      return { success: false, error: error.message };
    }
  }, []);

  // ========== Agent Schedule API ==========

  const validateCronExpression = useCallback(async (expression) => {
    try {
      const response = await api.agents.validateCron(expression);
      if (response.ok) {
        return await response.json();
      } else {
        const error = await response.json();
        return { valid: false, error: error.error || 'Validation failed' };
      }
    } catch (error) {
      console.error('Error validating cron expression:', error);
      return { valid: false, error: error.message };
    }
  }, []);

  const triggerAgent = useCallback(async (agentId) => {
    try {
      const response = await api.agents.trigger(agentId);
      if (response.ok) {
        const data = await response.json();
        // Reload conversations to show the new one
        await loadAgentConversations(agentId);
        return { success: true, conversationId: data.conversationId };
      } else {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to trigger agent' };
      }
    } catch (error) {
      console.error('Error triggering agent:', error);
      return { success: false, error: error.message };
    }
  }, []);

  // ========== Agent Conversations API ==========

  const loadAgentConversations = useCallback(async (agentId) => {
    if (!agentId) {
      setAgentConversations([]);
      return;
    }

    setIsLoadingAgentConversations(true);
    try {
      const response = await api.agents.listConversations(agentId);
      if (response.ok) {
        const data = await response.json();
        setAgentConversations(data || []);
      } else {
        setAgentConversations([]);
      }
    } catch (error) {
      console.error('Error loading agent conversations:', error);
      setAgentConversations([]);
    } finally {
      setIsLoadingAgentConversations(false);
    }
  }, []);

  const createAgentConversation = useCallback(async (agentId) => {
    try {
      const response = await api.agents.createConversation(agentId);
      if (response.ok) {
        const newConversation = await response.json();
        setAgentConversations(prev => [newConversation, ...prev]);
        return { success: true, conversation: newConversation };
      } else {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to create conversation' };
      }
    } catch (error) {
      console.error('Error creating agent conversation:', error);
      return { success: false, error: error.message };
    }
  }, []);

  const deleteAgentConversation = useCallback(async (conversationId) => {
    try {
      const response = await api.conversations.delete(conversationId);
      if (response.ok) {
        setAgentConversations(prev => prev.filter(c => c.id !== conversationId));
        if (activeAgentConversation?.id === conversationId) {
          setActiveAgentConversation(null);
        }
        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to delete conversation' };
      }
    } catch (error) {
      console.error('Error deleting agent conversation:', error);
      return { success: false, error: error.message };
    }
  }, [activeAgentConversation]);

  // ========== Navigation Helpers ==========

  const selectAgent = useCallback(async (agent) => {
    setSelectedAgent(agent);
    setActiveAgentConversation(null);

    if (agent) {
      // Load conversations, prompt, attachments, and output files for this agent
      await Promise.all([
        loadAgentConversations(agent.id),
        loadAgentPrompt(agent.id),
        loadAgentAttachments(agent.id),
        loadAgentOutputFiles(agent.id)
      ]);
    } else {
      setAgentConversations([]);
      setAgentPrompt('');
      setAgentAttachments([]);
      setAgentOutputFiles([]);
    }
  }, [loadAgentConversations, loadAgentPrompt, loadAgentAttachments, loadAgentOutputFiles]);

  const selectAgentConversation = useCallback((conversation) => {
    setActiveAgentConversation(conversation);
  }, []);

  const clearAgentSelection = useCallback(() => {
    setSelectedAgent(null);
    setAgentConversations([]);
    setActiveAgentConversation(null);
    setAgentPrompt('');
    setAgentAttachments([]);
    setAgentOutputFiles([]);
  }, []);

  // ========== Context Value ==========

  const value = {
    // Agents state
    agents,
    isLoadingAgents,
    agentsError,
    selectedAgent,

    // Agent conversations state
    agentConversations,
    isLoadingAgentConversations,
    activeAgentConversation,

    // Agent prompt state
    agentPrompt,
    isLoadingAgentPrompt,

    // Agent attachments state
    agentAttachments,
    isLoadingAttachments,

    // Agent output files state
    agentOutputFiles,
    isLoadingOutputFiles,

    // Agents API
    loadAgents,
    createAgent,
    updateAgent,
    deleteAgent,

    // Agent prompt API
    loadAgentPrompt,
    saveAgentPrompt,

    // Agent attachments API
    loadAgentAttachments,
    uploadAgentAttachment,
    deleteAgentAttachment,

    // Agent output files API
    loadAgentOutputFiles,
    downloadAgentOutputFile,
    deleteAgentOutputFile,

    // Agent schedule API
    validateCronExpression,
    triggerAgent,

    // Agent conversations API
    loadAgentConversations,
    createAgentConversation,
    deleteAgentConversation,

    // Navigation
    selectAgent,
    selectAgentConversation,
    clearAgentSelection,

    // State setters for external updates (WebSocket, etc.)
    setAgentConversations,
  };

  return (
    <AgentContext.Provider value={value}>
      {children}
    </AgentContext.Provider>
  );
}

export default AgentContext;
