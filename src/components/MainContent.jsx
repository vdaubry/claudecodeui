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
  showThinking,
  updateAvailable,
  latestVersion,
  releaseInfo,
  onShowVersionModal
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

    // Loading states
    isLoadingConversations,
    isLoadingTaskDoc,

    // Actions
    selectProject,
    selectTask,
    selectConversation,
    navigateBack,
    clearSelection,
    updateTask,
    deleteConversation,
    saveTaskDoc
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
        updateAvailable={updateAvailable}
        latestVersion={latestVersion}
        releaseInfo={releaseInfo}
        onShowVersionModal={onShowVersionModal}
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
