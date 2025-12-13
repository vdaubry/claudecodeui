/**
 * MainContent.jsx - Main Content Area
 *
 * Task-driven workflow views:
 * - Empty: Welcome/choose project prompt
 * - project-detail: ProjectDetailView with tasks and documentation
 * - task-detail: TaskDetailView with documentation and conversations
 * - chat: ChatInterface for active conversation
 */

import React, { useState, useCallback } from 'react';
import ChatInterface from './ChatInterface';
import ErrorBoundary from './ErrorBoundary';
import ProjectDetailView from './ProjectDetailView';
import TaskDetailView from './TaskDetailView';
import Breadcrumb from './Breadcrumb';
import { useTaskContext } from '../contexts/TaskContext';
import { FolderOpen, ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';

function MainContent({
  isMobile,
  isPWA,
  onMenuClick,
  onShowSettings,
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
    projects,
    tasks,
    conversations,
    projectDoc,
    taskDoc,

    // Loading states
    isLoadingProjects,
    isLoadingTasks,
    isLoadingConversations,
    isLoadingProjectDoc,
    isLoadingTaskDoc,

    // Actions
    selectProject,
    selectTask,
    selectConversation,
    navigateBack,
    clearSelection,
    createTask,
    deleteTask,
    createConversation,
    deleteConversation,
    saveProjectDoc,
    saveTaskDoc,
    updateProject
  } = useTaskContext();

  // Edit project modal state (handled in App.jsx via callback)
  const [editingProject, setEditingProject] = useState(null);

  // Handle project documentation save
  const handleSaveProjectDoc = useCallback(async (content) => {
    if (!selectedProject) return { success: false, error: 'No project selected' };
    return await saveProjectDoc(selectedProject.id, content);
  }, [selectedProject, saveProjectDoc]);

  // Handle task documentation save
  const handleSaveTaskDoc = useCallback(async (content) => {
    if (!selectedTask) return { success: false, error: 'No task selected' };
    return await saveTaskDoc(selectedTask.id, content);
  }, [selectedTask, saveTaskDoc]);

  // Handle task creation
  const handleCreateTask = useCallback(async ({ title, documentation }) => {
    if (!selectedProject) return { success: false, error: 'No project selected' };
    return await createTask(selectedProject.id, title, documentation);
  }, [selectedProject, createTask]);

  // Handle new conversation
  const handleNewConversation = useCallback(async () => {
    if (!selectedTask) return;
    const result = await createConversation(selectedTask.id);
    if (result.success && result.conversation) {
      selectConversation(result.conversation);
    }
  }, [selectedTask, createConversation, selectConversation]);

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

  // Loading state
  if (isLoadingProjects && projects.length === 0) {
    return (
      <div className="h-full flex flex-col">
        {isMobile && (
          <div className="bg-background border-b border-border p-2 sm:p-3 pwa-header-safe flex-shrink-0">
            <button
              onClick={onMenuClick}
              className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <div className="w-12 h-12 mx-auto mb-4">
              <div className="w-full h-full rounded-full border-4 border-muted border-t-primary animate-spin" />
            </div>
            <h2 className="text-xl font-semibold mb-2 text-foreground">Loading Claude Code UI</h2>
            <p>Setting up your workspace...</p>
          </div>
        </div>
      </div>
    );
  }

  // Empty state - no project selected
  if (currentView === 'empty') {
    return (
      <div className="h-full flex flex-col">
        {isMobile && (
          <div className="bg-background border-b border-border p-2 sm:p-3 pwa-header-safe flex-shrink-0">
            <button
              onClick={onMenuClick}
              className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground max-w-md mx-auto px-6">
            <div className="w-16 h-16 mx-auto mb-6 bg-muted rounded-full flex items-center justify-center">
              <FolderOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-semibold mb-3 text-foreground">Choose Your Project</h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              Select a project from the sidebar to view tasks and start conversations with Claude.
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <strong>Tip:</strong> {isMobile ? 'Tap the menu button above to access projects' : 'Create a new project by clicking "New Project" in the sidebar'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Project detail view
  if (currentView === 'project-detail') {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="bg-background border-b border-border p-2 sm:p-3 pwa-header-safe flex-shrink-0">
          <div className="flex items-center gap-2">
            {isMobile && (
              <button
                onClick={onMenuClick}
                className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            <Breadcrumb
              project={selectedProject}
              onHomeClick={handleHomeClick}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <ProjectDetailView
            project={selectedProject}
            tasks={tasks}
            projectDoc={projectDoc}
            isLoadingTasks={isLoadingTasks}
            isLoadingDoc={isLoadingProjectDoc}
            onTaskSelect={selectTask}
            onCreateTask={handleCreateTask}
            onDeleteTask={deleteTask}
            onEditProject={() => setEditingProject(selectedProject)}
            onSaveProjectDoc={handleSaveProjectDoc}
          />
        </div>
      </div>
    );
  }

  // Task detail view
  if (currentView === 'task-detail') {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="bg-background border-b border-border p-2 sm:p-3 pwa-header-safe flex-shrink-0">
          <div className="flex items-center gap-2">
            {isMobile && (
              <button
                onClick={onMenuClick}
                className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={navigateBack}
              className="h-8 w-8 p-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Breadcrumb
              project={selectedProject}
              task={selectedTask}
              onProjectClick={handleProjectClick}
              onHomeClick={handleHomeClick}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
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
            onNewConversation={handleNewConversation}
            onResumeConversation={handleResumeConversation}
            onDeleteConversation={deleteConversation}
          />
        </div>
      </div>
    );
  }

  // Chat view
  if (currentView === 'chat') {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="bg-background border-b border-border p-2 sm:p-3 pwa-header-safe flex-shrink-0">
          <div className="flex items-center gap-2">
            {isMobile && (
              <button
                onClick={onMenuClick}
                className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={navigateBack}
              className="h-8 w-8 p-0"
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
