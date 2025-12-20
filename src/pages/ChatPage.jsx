/**
 * ChatPage.jsx - Chat Page Wrapper
 *
 * Loads project, task, and conversation from URL params.
 * Renders ChatInterface with header and breadcrumb.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ChatInterface from '../components/ChatInterface';
import Breadcrumb from '../components/Breadcrumb';
import ErrorBoundary from '../components/ErrorBoundary';
import { Button } from '../components/ui/button';
import { useTaskContext } from '../contexts/TaskContext';
import { useAuthToken } from '../hooks/useAuthToken';
import { api } from '../utils/api';
import useLocalStorage from '../hooks/useLocalStorage';

function ChatPage() {
  const { projectId, taskId, conversationId } = useParams();
  const navigate = useNavigate();
  const { getTokenParam } = useAuthToken();
  const {
    projects,
    tasks,
    loadProjects,
    loadTasks,
    isLoadingProjects,
    isLoadingTasks
  } = useTaskContext();

  // Display settings
  const [autoExpandTools] = useLocalStorage('autoExpandTools', false);
  const [showRawParameters] = useLocalStorage('showRawParameters', false);
  const [showThinking] = useLocalStorage('showThinking', true);

  const [project, setProject] = useState(null);
  const [task, setTask] = useState(null);
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

  // Find project and load tasks
  useEffect(() => {
    if (projects.length > 0) {
      const foundProject = projects.find(p => p.id === parseInt(projectId));
      if (foundProject) {
        setProject(foundProject);
        loadTasks(foundProject.id);
      } else {
        navigate(`/${getTokenParam()}`, { replace: true });
      }
    }
  }, [projects, projectId, loadTasks, navigate, getTokenParam]);

  // Find task
  useEffect(() => {
    if (tasks.length > 0 && project) {
      const foundTask = tasks.find(t => t.id === parseInt(taskId));
      if (foundTask) {
        setTask(foundTask);
      } else {
        navigate(`/projects/${projectId}${getTokenParam()}`, { replace: true });
      }
    }
  }, [tasks, taskId, project, projectId, navigate, getTokenParam]);

  // Load conversation
  useEffect(() => {
    const loadConversation = async () => {
      if (!task) return;

      try {
        const response = await api.conversations.get(parseInt(conversationId));
        if (response.ok) {
          const data = await response.json();
          setConversation(data);
        } else {
          // Conversation not found, redirect to task detail
          navigate(`/projects/${projectId}/tasks/${taskId}${getTokenParam()}`, { replace: true });
        }
      } catch (error) {
        console.error('Error loading conversation:', error);
        navigate(`/projects/${projectId}/tasks/${taskId}${getTokenParam()}`, { replace: true });
      }
    };

    loadConversation();
  }, [conversationId, task, projectId, taskId, navigate, getTokenParam]);

  // Navigation handlers
  const handleBack = useCallback(() => {
    navigate(`/projects/${projectId}/tasks/${taskId}${getTokenParam()}`);
  }, [navigate, projectId, taskId, getTokenParam]);

  const handleProjectClick = useCallback(() => {
    navigate(`/projects/${projectId}${getTokenParam()}`);
  }, [navigate, projectId, getTokenParam]);

  const handleTaskClick = useCallback(() => {
    navigate(`/projects/${projectId}/tasks/${taskId}${getTokenParam()}`);
  }, [navigate, projectId, taskId, getTokenParam]);

  const handleHomeClick = useCallback(() => {
    navigate(`/${getTokenParam()}`);
  }, [navigate, getTokenParam]);

  // Loading state
  if (isLoading || isLoadingProjects || !project || !task || !conversation) {
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
            title="Back to Task"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Breadcrumb
            project={project}
            task={task}
            conversation={conversation}
            onProjectClick={handleProjectClick}
            onTaskClick={handleTaskClick}
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
            activeConversation={conversation}
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
