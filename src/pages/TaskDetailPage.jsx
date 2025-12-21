/**
 * TaskDetailPage.jsx - Task Detail Page Wrapper
 *
 * Loads project, task, conversations, and documentation from URL params.
 * Renders the TaskDetailView component.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TaskDetailView from '../components/TaskDetailView';
import NewConversationModal from '../components/NewConversationModal';
import { useTaskContext } from '../contexts/TaskContext';
import { useToast } from '../contexts/ToastContext';
import { useAuthToken } from '../hooks/useAuthToken';
import { api } from '../utils/api';

function TaskDetailPage() {
  const { projectId, taskId } = useParams();
  const navigate = useNavigate();
  const { getTokenParam } = useAuthToken();
  const { toast } = useToast();
  const {
    projects,
    tasks,
    conversations,
    taskDoc,
    agentRuns,
    loadProjects,
    loadTasks,
    loadConversations,
    loadTaskDoc,
    loadAgentRuns,
    updateTask,
    deleteConversation,
    saveTaskDoc,
    isLoadingProjects,
    isLoadingTasks,
    isLoadingConversations,
    isLoadingTaskDoc,
    isLoadingAgentRuns
  } = useTaskContext();

  const [project, setProject] = useState(null);
  const [task, setTask] = useState(null);
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

  // Find task and load its data
  useEffect(() => {
    if (tasks.length > 0 && project) {
      const foundTask = tasks.find(t => t.id === parseInt(taskId));
      if (foundTask) {
        setTask(foundTask);
        // Load task-related data
        loadConversations(foundTask.id);
        loadTaskDoc(foundTask.id);
        loadAgentRuns(foundTask.id);
      } else {
        // Task not found, redirect to board
        navigate(`/projects/${projectId}${getTokenParam()}`, { replace: true });
      }
    }
  }, [tasks, taskId, project, projectId, loadConversations, loadTaskDoc, loadAgentRuns, navigate, getTokenParam]);

  // Navigation handlers
  const handleBack = useCallback(() => {
    navigate(`/projects/${projectId}${getTokenParam()}`);
  }, [navigate, projectId, getTokenParam]);

  const handleProjectClick = useCallback(() => {
    navigate(`/projects/${projectId}${getTokenParam()}`);
  }, [navigate, projectId, getTokenParam]);

  const handleHomeClick = useCallback(() => {
    navigate(`/${getTokenParam()}`);
  }, [navigate, getTokenParam]);

  // Task handlers
  const handleSaveTaskDoc = useCallback(async (content) => {
    if (!task) return { success: false, error: 'No task selected' };
    return await saveTaskDoc(task.id, content);
  }, [task, saveTaskDoc]);

  const handleStatusChange = useCallback(async (taskId, newStatus) => {
    return await updateTask(taskId, { status: newStatus });
  }, [updateTask]);

  const handleEditDocumentation = useCallback(() => {
    if (task) {
      navigate(`/projects/${projectId}/tasks/${taskId}/edit${getTokenParam()}`);
    }
  }, [task, navigate, projectId, taskId, getTokenParam]);

  const handleWorkflowCompleteChange = useCallback(async (taskId, value) => {
    return await updateTask(taskId, { workflow_complete: value });
  }, [updateTask]);

  // Conversation handlers
  const handleNewConversation = useCallback(() => {
    if (!task) return;
    setShowNewConversationModal(true);
  }, [task]);

  const handleConversationCreated = useCallback((conversation) => {
    setShowNewConversationModal(false);
    // Pass initial message via navigation state so ChatPage can display it immediately
    navigate(`/projects/${projectId}/tasks/${taskId}/chat/${conversation.id}${getTokenParam()}`, {
      state: { initialMessage: conversation.__initialMessage }
    });
  }, [navigate, projectId, taskId, getTokenParam]);

  const handleResumeConversation = useCallback((conversation) => {
    navigate(`/projects/${projectId}/tasks/${taskId}/chat/${conversation.id}${getTokenParam()}`);
  }, [navigate, projectId, taskId, getTokenParam]);

  // Agent handlers
  const handleRunAgent = useCallback(async (agentType) => {
    if (!task) return;

    try {
      const response = await api.agentRuns.create(task.id, agentType);

      if (response.status === 409) {
        const data = await response.json();
        toast.warning(`${data.runningAgent?.agent_type || 'An'} agent is already running`);
        return;
      }

      if (response.status >= 400 && response.status < 500) {
        const data = await response.json();
        toast.error(data.error || `Failed to start ${agentType} agent`);
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || `Server error starting ${agentType} agent`);
        return;
      }

      await loadAgentRuns(task.id);
      toast.success(`${agentType.charAt(0).toUpperCase() + agentType.slice(1)} agent started`);
    } catch (error) {
      console.error('Error starting agent:', error);
      toast.error(`Failed to start agent: ${error.message}`);
    }
  }, [task, loadAgentRuns, toast]);

  // Loading state
  if (isLoading || isLoadingProjects || !project || !task) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <div className="w-12 h-12 mx-auto mb-4">
            <div className="w-full h-full rounded-full border-4 border-muted border-t-primary animate-spin" />
          </div>
          <p>Loading task...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <TaskDetailView
        project={project}
        task={task}
        taskDoc={taskDoc}
        conversations={conversations}
        isLoadingDoc={isLoadingTaskDoc}
        isLoadingConversations={isLoadingConversations}
        agentRuns={agentRuns}
        isLoadingAgentRuns={isLoadingAgentRuns}
        onRunAgent={handleRunAgent}
        onBack={handleBack}
        onProjectClick={handleProjectClick}
        onHomeClick={handleHomeClick}
        onSaveTaskDoc={handleSaveTaskDoc}
        onEditDocumentation={handleEditDocumentation}
        onStatusChange={handleStatusChange}
        onWorkflowCompleteChange={handleWorkflowCompleteChange}
        onNewConversation={handleNewConversation}
        onResumeConversation={handleResumeConversation}
        onDeleteConversation={deleteConversation}
        className="h-full"
      />
      <NewConversationModal
        isOpen={showNewConversationModal}
        onClose={() => setShowNewConversationModal(false)}
        project={project}
        taskId={task?.id}
        onConversationCreated={handleConversationCreated}
      />
    </>
  );
}

export default TaskDetailPage;
