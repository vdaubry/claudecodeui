/**
 * ChatPage.jsx - Chat Page Wrapper
 *
 * Loads project, task/agent, and conversation from URL params.
 * Renders ChatInterface with header and breadcrumb.
 * Supports both task and agent conversations.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ChatInterface from '../components/ChatInterface';
import Breadcrumb from '../components/Breadcrumb';
import ErrorBoundary from '../components/ErrorBoundary';
import { Button } from '../components/ui/button';
import { useTaskContext } from '../contexts/TaskContext';
import { useAgentContext } from '../contexts/AgentContext';
import { useAuthToken } from '../hooks/useAuthToken';
import { api } from '../utils/api';
import useLocalStorage from '../hooks/useLocalStorage';

function ChatPage() {
  const { projectId, taskId, agentId, conversationId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { getTokenParam } = useAuthToken();

  // Determine if this is an agent conversation
  const isAgentConversation = !!agentId;

  // Get initial message from navigation state (passed from NewConversationModal)
  const initialMessage = location.state?.initialMessage;
  const {
    projects,
    tasks,
    loadProjects,
    loadTasks,
    isLoadingProjects,
    isLoadingTasks
  } = useTaskContext();
  const {
    agents,
    loadAgents,
    isLoadingAgents
  } = useAgentContext();

  // Display settings
  const [autoExpandTools] = useLocalStorage('autoExpandTools', false);
  const [showRawParameters] = useLocalStorage('showRawParameters', false);
  const [showThinking] = useLocalStorage('showThinking', true);

  const [project, setProject] = useState(null);
  const [task, setTask] = useState(null);
  const [agent, setAgent] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

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

  // Find project and load tasks/agents
  useEffect(() => {
    if (projects.length > 0) {
      const foundProject = projects.find(p => p.id === parseInt(projectId));
      if (foundProject) {
        setProject(foundProject);
        if (isAgentConversation) {
          loadAgents(foundProject.id);
        } else {
          loadTasks(foundProject.id);
        }
      } else {
        navigate(`/${getTokenParam()}`, { replace: true });
      }
    }
  }, [projects, projectId, loadTasks, loadAgents, navigate, getTokenParam, isAgentConversation]);

  // Find task (for task conversations)
  useEffect(() => {
    if (!isAgentConversation && tasks.length > 0 && project) {
      const foundTask = tasks.find(t => t.id === parseInt(taskId));
      if (foundTask) {
        setTask(foundTask);
      } else {
        navigate(`/projects/${projectId}${getTokenParam()}`, { replace: true });
      }
    }
  }, [tasks, taskId, project, projectId, navigate, getTokenParam, isAgentConversation]);

  // Find agent (for agent conversations)
  useEffect(() => {
    if (isAgentConversation && agents.length > 0 && project) {
      const foundAgent = agents.find(a => a.id === parseInt(agentId));
      if (foundAgent) {
        setAgent(foundAgent);
      } else {
        navigate(`/projects/${projectId}?tab=agents${getTokenParam() ? '&' + getTokenParam().slice(1) : ''}`, { replace: true });
      }
    }
  }, [agents, agentId, project, projectId, navigate, getTokenParam, isAgentConversation]);

  // Load conversation
  useEffect(() => {
    const loadConversation = async () => {
      // For task conversations, wait for task; for agent conversations, wait for agent
      if (!isAgentConversation && !task) return;
      if (isAgentConversation && !agent) return;

      try {
        const response = await api.conversations.get(parseInt(conversationId));
        if (response.ok) {
          const data = await response.json();
          setConversation(data);
        } else {
          // Conversation not found, redirect appropriately
          if (isAgentConversation) {
            navigate(`/projects/${projectId}/agents/${agentId}${getTokenParam()}`, { replace: true });
          } else {
            navigate(`/projects/${projectId}/tasks/${taskId}${getTokenParam()}`, { replace: true });
          }
        }
      } catch (error) {
        console.error('Error loading conversation:', error);
        if (isAgentConversation) {
          navigate(`/projects/${projectId}/agents/${agentId}${getTokenParam()}`, { replace: true });
        } else {
          navigate(`/projects/${projectId}/tasks/${taskId}${getTokenParam()}`, { replace: true });
        }
      }
    };

    loadConversation();
  }, [conversationId, task, agent, projectId, taskId, agentId, navigate, getTokenParam, isAgentConversation]);

  // Navigation handlers
  const handleBack = useCallback(() => {
    if (isAgentConversation) {
      navigate(`/projects/${projectId}/agents/${agentId}${getTokenParam()}`);
    } else {
      navigate(`/projects/${projectId}/tasks/${taskId}${getTokenParam()}`);
    }
  }, [navigate, projectId, taskId, agentId, getTokenParam, isAgentConversation]);

  const handleProjectClick = useCallback(() => {
    navigate(`/projects/${projectId}${getTokenParam()}`);
  }, [navigate, projectId, getTokenParam]);

  const handleTaskClick = useCallback(() => {
    navigate(`/projects/${projectId}/tasks/${taskId}${getTokenParam()}`);
  }, [navigate, projectId, taskId, getTokenParam]);

  const handleAgentClick = useCallback(() => {
    navigate(`/projects/${projectId}/agents/${agentId}${getTokenParam()}`);
  }, [navigate, projectId, agentId, getTokenParam]);

  const handleHomeClick = useCallback(() => {
    navigate(`/${getTokenParam()}`);
  }, [navigate, getTokenParam]);

  // Create conversation object with initial message for ChatInterface
  const activeConversation = useMemo(() => {
    if (!conversation) return null;
    // Attach initial message so ChatInterface can display it immediately
    if (initialMessage) {
      return { ...conversation, __initialMessage: initialMessage };
    }
    return conversation;
  }, [conversation, initialMessage]);

  // Loading state
  const isLoadingEntities = isAgentConversation
    ? (isLoading || isLoadingProjects || isLoadingAgents || !project || !agent || !conversation)
    : (isLoading || isLoadingProjects || isLoadingTasks || !project || !task || !conversation);

  if (isLoadingEntities) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <div className="w-12 h-12 mx-auto mb-4">
            <div className="w-full h-full rounded-full border-4 border-muted border-t-primary animate-spin" />
          </div>
          <p>Loading conversation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-background border-b border-border p-2 sm:p-3 pwa-header-safe flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="h-8 w-8 p-0"
            title={isAgentConversation ? "Back to Agent" : "Back to Task"}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Breadcrumb
            project={project}
            task={task}
            agent={agent}
            conversation={activeConversation}
            onProjectClick={handleProjectClick}
            onTaskClick={handleTaskClick}
            onAgentClick={handleAgentClick}
            onHomeClick={handleHomeClick}
          />
        </div>
      </div>

      {/* Chat Interface */}
      <div className="flex-1 overflow-hidden">
        <ErrorBoundary showDetails={true}>
          <ChatInterface
            selectedProject={project}
            selectedTask={task}
            selectedAgent={agent}
            activeConversation={activeConversation}
            onShowSettings={() => window.openSettings?.()}
            autoExpandTools={autoExpandTools}
            showRawParameters={showRawParameters}
            showThinking={showThinking}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default ChatPage;
