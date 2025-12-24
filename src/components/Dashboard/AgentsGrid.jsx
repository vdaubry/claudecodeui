/**
 * AgentsGrid.jsx - Grid of Agent Cards
 *
 * Displays all agents for a project in a responsive grid.
 * Includes create, edit, and delete functionality.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAgentContext } from '../../contexts/AgentContext';
import { useAuthToken } from '../../hooks/useAuthToken';
import { api } from '../../utils/api';
import AgentCard from './AgentCard';
import AgentForm from './AgentForm';

function AgentsGrid({ project, triggerButtonId }) {
  const navigate = useNavigate();
  const { getTokenParam } = useAuthToken();
  const {
    agents,
    createAgent,
    updateAgent,
    deleteAgent
  } = useAgentContext();

  // Modal state
  const [showForm, setShowForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingAgentId, setDeletingAgentId] = useState(null);

  // Agent conversation counts
  const [conversationCounts, setConversationCounts] = useState({});

  // Load conversation counts for all agents
  useEffect(() => {
    const loadCounts = async () => {
      const counts = {};
      await Promise.all(
        agents.map(async (agent) => {
          try {
            const response = await api.agents.listConversations(agent.id);
            if (response.ok) {
              const data = await response.json();
              counts[agent.id] = (data || []).length;
            }
          } catch (error) {
            console.error(`Error loading conversations for agent ${agent.id}:`, error);
          }
        })
      );
      setConversationCounts(counts);
    };

    if (agents.length > 0) {
      loadCounts();
    } else {
      setConversationCounts({});
    }
  }, [agents]);

  // Handle trigger button click (from header)
  useEffect(() => {
    if (triggerButtonId) {
      const button = document.getElementById(triggerButtonId);
      if (button) {
        const handleClick = () => {
          setEditingAgent(null);
          setShowForm(true);
        };
        button.addEventListener('click', handleClick);
        return () => button.removeEventListener('click', handleClick);
      }
    }
  }, [triggerButtonId]);

  // Handle agent click - navigate to detail view
  const handleAgentClick = useCallback((agent) => {
    navigate(`/projects/${project.id}/agents/${agent.id}${getTokenParam()}`);
  }, [navigate, project.id, getTokenParam]);

  // Handle edit click - navigate to full-page edit form
  const handleEditClick = useCallback((agent) => {
    navigate(`/projects/${project.id}/agents/${agent.id}/edit${getTokenParam()}`);
  }, [navigate, project.id, getTokenParam]);

  // Handle delete click
  const handleDeleteClick = useCallback(async (agent) => {
    if (!confirm(`Are you sure you want to delete "${agent.name}"? This will also delete all conversations with this agent.`)) {
      return;
    }

    setDeletingAgentId(agent.id);
    try {
      const result = await deleteAgent(agent.id);
      if (!result.success) {
        alert(result.error || 'Failed to delete agent');
      }
    } finally {
      setDeletingAgentId(null);
    }
  }, [deleteAgent]);

  // Handle form submit
  const handleFormSubmit = useCallback(async ({ name }) => {
    setIsSubmitting(true);
    try {
      if (editingAgent) {
        // Update existing agent
        const result = await updateAgent(editingAgent.id, { name });
        if (result.success) {
          setShowForm(false);
          setEditingAgent(null);
        }
        return result;
      } else {
        // Create new agent
        const result = await createAgent(project.id, name);
        if (result.success) {
          setShowForm(false);
        }
        return result;
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [editingAgent, project.id, createAgent, updateAgent]);

  // Handle form close
  const handleFormClose = useCallback(() => {
    setShowForm(false);
    setEditingAgent(null);
  }, []);

  return (
    <div className="flex-1 p-4 lg:p-6 overflow-y-auto">
      {agents.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center h-full text-center py-12">
          <div className="p-4 rounded-full bg-muted mb-4">
            <Bot className="w-12 h-12 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            No Custom Agents
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mb-4">
            Create custom agents with specialized prompts to automate repetitive tasks or provide consistent assistance.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-lg',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90 transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            <Plus className="w-4 h-4" />
            Create Your First Agent
          </button>
        </div>
      ) : (
        /* Agents grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              conversationCount={conversationCounts[agent.id] || 0}
              onClick={handleAgentClick}
              onEditClick={handleEditClick}
              onDeleteClick={handleDeleteClick}
            />
          ))}
        </div>
      )}

      {/* Agent Form Modal */}
      <AgentForm
        isOpen={showForm}
        onClose={handleFormClose}
        onSubmit={handleFormSubmit}
        projectName={project?.name}
        agent={editingAgent}
        isSubmitting={isSubmitting}
      />

      {/* Deleting overlay */}
      {deletingAgentId && (
        <div className="fixed inset-0 bg-background/50 flex items-center justify-center z-50 pointer-events-none">
          <div className="flex items-center gap-2 text-foreground bg-card px-4 py-2 rounded-lg shadow-lg border border-border">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Deleting agent...</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default AgentsGrid;
