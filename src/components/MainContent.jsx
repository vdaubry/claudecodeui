/**
 * MainContent.jsx - Main Content Area
 *
 * Task-driven workflow views:
 * - empty: Dashboard with project cards grid
 * - board: BoardView with Kanban columns for a project
 * - task-detail: TaskDetailView with documentation and conversations
 * - chat: ChatInterface for active conversation
 * - project-edit: ProjectEditPage for editing project details
 * - task-edit: TaskEditPage for editing task details
 */

import React, { useState, useCallback } from 'react';
import ChatInterface from './ChatInterface';
import ErrorBoundary from './ErrorBoundary';
import TaskDetailView from './TaskDetailView';
import Breadcrumb from './Breadcrumb';
import { Dashboard } from './Dashboard';
import BoardView from './Dashboard/BoardView';
import NewConversationModal from './NewConversationModal';
import ProjectEditPage from './ProjectEditPage';
import TaskEditPage from './TaskEditPage';
import DocEditPage from './DocEditPage';
import { useTaskContext } from '../contexts/TaskContext';
import { useToast } from '../contexts/ToastContext';
import { api } from '../utils/api';
import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';

function MainContent({
  isMobile,
  isPWA,
  onShowSettings,
  onShowProjectForm,
  onEditProject,
  autoExpandTools,
  showRawParameters,
  showThinking
}) {
  const {
    // Selection state
    selectedProject,
    selectedTask,
    activeConversation,
    currentView,

    // Data
    conversations,
    taskDoc,
    agentRuns,

    // Loading states
    isLoadingConversations,
    isLoadingTaskDoc,
    isLoadingAgentRuns,

    // Actions
    selectProject,
    selectTask,
    selectConversation,
    navigateBack,
    clearSelection,
    updateTask,
    deleteConversation,
    saveTaskDoc,
    loadAgentRuns,
    navigateToDocEdit
  } = useTaskContext();

  // Toast notifications
  const { toast } = useToast();

  // New conversation modal state
  const [showNewConversationModal, setShowNewConversationModal] = useState(false);

  // Handle task documentation save
  const handleSaveTaskDoc = useCallback(async (content) => {
    if (!selectedTask) return { success: false, error: 'No task selected' };
    return await saveTaskDoc(selectedTask.id, content);
  }, [selectedTask, saveTaskDoc]);

  // Handle task status change
  const handleStatusChange = useCallback(async (taskId, newStatus) => {
    return await updateTask(taskId, { status: newStatus });
  }, [updateTask]);

  // Handle edit documentation - navigate to full-page editor
  const handleEditDocumentation = useCallback(() => {
    if (selectedTask) {
      navigateToDocEdit(selectedTask);
    }
  }, [selectedTask, navigateToDocEdit]);

  // Handle workflow_complete toggle
  const handleWorkflowCompleteChange = useCallback(async (taskId, value) => {
    return await updateTask(taskId, { workflow_complete: value });
  }, [updateTask]);

  // Handle new conversation - opens modal instead of creating immediately
  const handleNewConversation = useCallback(() => {
    if (!selectedTask) return;
    setShowNewConversationModal(true);
  }, [selectedTask]);

  // Handle conversation created from modal
  const handleConversationCreated = useCallback((conversation) => {
    setShowNewConversationModal(false);
    selectConversation(conversation);
  }, [selectConversation]);

  // Handle resume conversation
  const handleResumeConversation = useCallback((conversation) => {
    selectConversation(conversation);
  }, [selectConversation]);

  // Handle running an agent (calls backend which handles everything)
  // Backend creates agent run, conversation, starts streaming, and handles chaining
  const handleRunAgent = useCallback(async (agentType) => {
    if (!selectedTask) return;

    try {
      // Call backend to start agent run
      // Backend handles: create agent run, create conversation, start streaming, auto-chain
      const response = await api.agentRuns.create(selectedTask.id, agentType);

      if (response.status === 409) {
        // Agent already running
        const data = await response.json();
        toast.warning(`${data.runningAgent?.agent_type || 'An'} agent is already running`);
        return;
      }

      if (response.status >= 400 && response.status < 500) {
        // Client error (400-499)
        const data = await response.json();
        toast.error(data.error || `Failed to start ${agentType} agent`);
        return;
      }

      if (!response.ok) {
        // Server error (500+) or other errors
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || `Server error starting ${agentType} agent`);
        return;
      }

      // Refresh agent runs list to show the new running agent
      await loadAgentRuns(selectedTask.id);

      toast.success(`${agentType.charAt(0).toUpperCase() + agentType.slice(1)} agent started`);
    } catch (error) {
      console.error('Error starting agent:', error);
      toast.error(`Failed to start agent: ${error.message}`);
    }
  }, [selectedTask, loadAgentRuns, toast]);

  // Navigation handlers
  const handleHomeClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const handleProjectClick = useCallback(() => {
    // Go back to project view (clear task and conversation)
    if (selectedProject) {
      selectProject(selectedProject);
    }
  }, [selectedProject, selectProject]);

  const handleTaskClick = useCallback(() => {
    // Go back to task view (clear conversation)
    if (selectedTask) {
      selectTask(selectedTask);
    }
  }, [selectedTask, selectTask]);

  // Dashboard view - shows project cards grid
  if (currentView === 'empty') {
    return (
      <Dashboard
        onShowSettings={onShowSettings}
        onShowProjectForm={onShowProjectForm}
        onEditProject={onEditProject}
        onTaskClick={(task) => selectTask(task)}
        isMobile={isMobile}
      />
    );
  }

  // Board view - Kanban columns for a project
  if (currentView === 'board') {
    return <BoardView />;
  }

  // Project edit page
  if (currentView === 'project-edit') {
    return <ProjectEditPage />;
  }

  // Task edit page
  if (currentView === 'task-edit') {
    return <TaskEditPage />;
  }

  // Documentation edit page
  if (currentView === 'doc-edit') {
    return <DocEditPage />;
  }

  // Task detail view
  if (currentView === 'task-detail') {
    return (
      <>
        <TaskDetailView
          project={selectedProject}
          task={selectedTask}
          taskDoc={taskDoc}
          conversations={conversations}
          isLoadingDoc={isLoadingTaskDoc}
          isLoadingConversations={isLoadingConversations}
          // Agent runs
          agentRuns={agentRuns}
          isLoadingAgentRuns={isLoadingAgentRuns}
          onRunAgent={handleRunAgent}
          // Callbacks
          onBack={navigateBack}
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
          project={selectedProject}
          taskId={selectedTask?.id}
          onConversationCreated={handleConversationCreated}
        />
      </>
    );
  }

  // Chat view
  if (currentView === 'chat') {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="bg-background border-b border-border p-2 sm:p-3 pwa-header-safe flex-shrink-0">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={navigateBack}
              className="h-8 w-8 p-0"
              title="Back to Task"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Breadcrumb
              project={selectedProject}
              task={selectedTask}
              conversation={activeConversation}
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
              selectedProject={selectedProject}
              selectedTask={selectedTask}
              activeConversation={activeConversation}
              onShowSettings={onShowSettings}
              autoExpandTools={autoExpandTools}
              showRawParameters={showRawParameters}
              showThinking={showThinking}
            />
          </ErrorBoundary>
        </div>
      </div>
    );
  }

  // Fallback - shouldn't reach here
  return (
    <div className="h-full flex items-center justify-center text-muted-foreground">
      <p>Unknown view state</p>
    </div>
  );
}

export default React.memo(MainContent);
