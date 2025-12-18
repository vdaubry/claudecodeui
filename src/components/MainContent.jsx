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
import { useTaskContext } from '../contexts/TaskContext';
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
    createAgentRun,
    linkAgentRunConversation,
    loadAgentRuns
  } = useTaskContext();

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

  // Handle running an agent (planification, etc.)
  const handleRunAgent = useCallback(async (agentType, message) => {
    if (!selectedTask || !selectedProject) return;

    try {
      // 1. Create agent run record
      const result = await createAgentRun(selectedTask.id, agentType);
      if (!result.success) {
        console.error('Failed to create agent run:', result.error);
        return;
      }

      const agentRunId = result.agentRun.id;

      // 2. Create conversation via REST API with bypass permissions mode
      // Uses bypassPermissions so the @agent-Plan sub-agent can write to files
      const response = await api.conversations.createWithMessage(selectedTask.id, {
        message: message,
        projectPath: selectedProject.repo_folder_path,
        permissionMode: 'bypassPermissions'
      });

      if (!response.ok) {
        console.error('Failed to create conversation');
        return;
      }

      const conversation = await response.json();

      // 3. Link conversation to agent run
      await linkAgentRunConversation(agentRunId, conversation.id);

      // 4. Navigate to chat with the agent run context
      selectConversation({
        ...conversation,
        __initialMessage: message,
        __agentRunId: agentRunId,
        __permissionMode: 'bypassPermissions'
      });

    } catch (error) {
      console.error('Error running agent:', error);
    }
  }, [selectedTask, selectedProject, createAgentRun, linkAgentRunConversation, selectConversation]);

  // Handle completing a plan (marks agent run as completed and returns to task detail)
  const handleCompletePlan = useCallback(async (agentRunId) => {
    if (!agentRunId) return;

    try {
      const response = await api.agentRuns.complete(agentRunId);
      if (response.ok) {
        // Refresh agent runs for the current task
        if (selectedTask) {
          await loadAgentRuns(selectedTask.id);
        }
        // Navigate back to task detail
        navigateBack();
      } else {
        console.error('Failed to complete agent run');
      }
    } catch (error) {
      console.error('Error completing plan:', error);
    }
  }, [selectedTask, loadAgentRuns, navigateBack]);

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
          onStatusChange={handleStatusChange}
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
              onCompletePlan={handleCompletePlan}
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
