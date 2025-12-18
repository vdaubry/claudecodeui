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
import { generateReviewMessage, generateImplementationMessage } from '../constants/agentConfig';
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

  // Handle completing a plan (marks agent run as completed)
  // Auto-chains: implementation ↔ review agent (loop until workflow_complete)
  const handleCompletePlan = useCallback(async (agentRunId) => {
    if (!agentRunId) return;

    try {
      // 1. Find the agent run to check its type
      const agentRun = agentRuns.find(r => r.id === agentRunId);
      const agentType = agentRun?.agent_type;

      // 2. Complete the current agent run
      const response = await api.agentRuns.complete(agentRunId);
      if (!response.ok) {
        console.error('Failed to complete agent run');
        return;
      }

      // 3. Refresh agent runs for the current task
      if (selectedTask) {
        await loadAgentRuns(selectedTask.id);
      }

      // 4. Fetch fresh task data to check workflow_complete
      // The agent may have set this via the CLI script
      let freshTask = null;
      if (selectedTask) {
        const taskResponse = await api.tasks.get(selectedTask.id);
        if (taskResponse.ok) {
          freshTask = await taskResponse.json();
        }
      }

      // 5. If workflow_complete is true, stop the loop
      if (freshTask?.workflow_complete) {
        console.log('Workflow marked complete, stopping agent loop');
        navigateBack();
        return;
      }

      // 6. Auto-chain: implementation → review
      if (agentType === 'implementation' && selectedTask && selectedProject) {
        try {
          // Create review agent run
          const reviewResult = await createAgentRun(selectedTask.id, 'review');
          if (!reviewResult.success) {
            console.error('Failed to create review agent run:', reviewResult.error);
            navigateBack();
            return;
          }

          const reviewAgentRunId = reviewResult.agentRun.id;
          const taskDocPath = `.claude-ui/tasks/task-${selectedTask.id}.md`;
          const reviewMessage = generateReviewMessage(taskDocPath, selectedTask.id);

          // Create conversation for review agent
          const convResponse = await api.conversations.createWithMessage(selectedTask.id, {
            message: reviewMessage,
            projectPath: selectedProject.repo_folder_path,
            permissionMode: 'bypassPermissions'
          });

          if (!convResponse.ok) {
            console.error('Failed to create review conversation');
            navigateBack();
            return;
          }

          const conversation = await convResponse.json();

          // Link conversation to review agent run
          await linkAgentRunConversation(reviewAgentRunId, conversation.id);

          // Navigate to review chat (don't go back)
          selectConversation({
            ...conversation,
            __initialMessage: reviewMessage,
            __agentRunId: reviewAgentRunId,
            __permissionMode: 'bypassPermissions'
          });
          return;
        } catch (chainError) {
          console.error('Error auto-chaining to review agent:', chainError);
          navigateBack();
          return;
        }
      }

      // 7. Auto-chain: review → implementation (loop back)
      if (agentType === 'review' && selectedTask && selectedProject) {
        try {
          // Create implementation agent run
          const implResult = await createAgentRun(selectedTask.id, 'implementation');
          if (!implResult.success) {
            console.error('Failed to create implementation agent run:', implResult.error);
            navigateBack();
            return;
          }

          const implAgentRunId = implResult.agentRun.id;
          const taskDocPath = `.claude-ui/tasks/task-${selectedTask.id}.md`;
          const implMessage = generateImplementationMessage(taskDocPath, selectedTask.id);

          // Create conversation for implementation agent
          const convResponse = await api.conversations.createWithMessage(selectedTask.id, {
            message: implMessage,
            projectPath: selectedProject.repo_folder_path,
            permissionMode: 'bypassPermissions'
          });

          if (!convResponse.ok) {
            console.error('Failed to create implementation conversation');
            navigateBack();
            return;
          }

          const conversation = await convResponse.json();

          // Link conversation to implementation agent run
          await linkAgentRunConversation(implAgentRunId, conversation.id);

          // Navigate to implementation chat (continue loop)
          selectConversation({
            ...conversation,
            __initialMessage: implMessage,
            __agentRunId: implAgentRunId,
            __permissionMode: 'bypassPermissions'
          });
          return;
        } catch (chainError) {
          console.error('Error auto-chaining to implementation agent:', chainError);
          navigateBack();
          return;
        }
      }

      // 8. Default: Navigate back to task detail
      navigateBack();
    } catch (error) {
      console.error('Error completing plan:', error);
    }
  }, [agentRuns, selectedTask, selectedProject, loadAgentRuns, navigateBack, createAgentRun, linkAgentRunConversation, selectConversation]);

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
