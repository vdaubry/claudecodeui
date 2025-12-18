/**
 * TaskDetailView.jsx - Task Detail Page
 *
 * Displays task details including:
 * - Breadcrumb navigation
 * - Task title, status, and metadata
 * - Task documentation (editable markdown)
 * - Conversation history with +/Resume buttons
 */

import React, { useState, useCallback } from 'react';
import { FileText, ArrowLeft, ChevronDown, Check, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';
import Breadcrumb from './Breadcrumb';
import MarkdownEditor from './MarkdownEditor';
import ConversationList from './ConversationList';
import AgentSection from './AgentSection';
import { cn } from '../lib/utils';

// Status configuration
const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'bg-gray-500/10 text-gray-600 dark:text-gray-400' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' },
  { value: 'completed', label: 'Completed', color: 'bg-green-500/10 text-green-600 dark:text-green-400' },
];

function TaskDetailView({
  project,
  task,
  taskDoc = '',
  conversations = [],
  activeConversationId,
  isLoadingDoc = false,
  isLoadingConversations = false,
  // Agent runs props
  agentRuns = [],
  isLoadingAgentRuns = false,
  onRunAgent,
  // Callbacks
  onBack,
  onProjectClick,
  onHomeClick,
  onSaveTaskDoc,
  onStatusChange,
  onWorkflowCompleteChange,
  onNewConversation,
  onResumeConversation,
  onDeleteConversation,
  className
}) {
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isUpdatingWorkflow, setIsUpdatingWorkflow] = useState(false);

  if (!task) return null;

  const currentStatus = STATUS_OPTIONS.find(s => s.value === task.status) || STATUS_OPTIONS[0];

  const handleStatusChange = async (newStatus) => {
    if (newStatus === task.status || !onStatusChange) return;

    setIsUpdatingStatus(true);
    setShowStatusDropdown(false);
    try {
      await onStatusChange(task.id, newStatus);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleWorkflowCompleteToggle = async () => {
    if (!onWorkflowCompleteChange) return;

    setIsUpdatingWorkflow(true);
    try {
      await onWorkflowCompleteChange(task.id, !task.workflow_complete);
    } finally {
      setIsUpdatingWorkflow(false);
    }
  };

  // Handle resuming an agent's linked conversation
  const handleResumeAgent = useCallback((conversationId) => {
    if (!conversationId || !onResumeConversation) return;
    const conversation = conversations.find(c => c.id === conversationId);
    if (conversation) {
      onResumeConversation(conversation);
    }
  }, [conversations, onResumeConversation]);

  return (
    <div className={cn('h-full flex flex-col', className)}>
      {/* Header with breadcrumb */}
      <div className="p-4 border-b border-border">
        {/* Back button and breadcrumb */}
        <div className="flex items-center gap-2 mb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-8 w-8 p-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Breadcrumb
            project={project}
            task={task}
            onProjectClick={onProjectClick}
            onHomeClick={onHomeClick}
          />
        </div>

        {/* Task header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-blue-500" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-foreground truncate">
              {task.title || `Task ${task.id}`}
            </h1>
            <p className="text-sm text-muted-foreground">
              Task #{task.id} in {project?.name || 'Unknown Project'}
            </p>
          </div>

          {/* Workflow complete toggle */}
          <button
            onClick={handleWorkflowCompleteToggle}
            disabled={isUpdatingWorkflow}
            title={task.workflow_complete ? 'Workflow complete - click to resume agent loop' : 'Click to mark workflow as complete'}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex-shrink-0',
              task.workflow_complete
                ? 'bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20'
                : 'bg-gray-500/10 text-gray-500 dark:text-gray-400 hover:bg-gray-500/20',
              isUpdatingWorkflow && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isUpdatingWorkflow ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <CheckCircle2 className={cn(
                'w-4 h-4',
                task.workflow_complete && 'fill-green-500/20'
              )} />
            )}
            <span className="hidden sm:inline">
              {task.workflow_complete ? 'Done' : 'Mark Done'}
            </span>
          </button>

          {/* Status selector */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              disabled={isUpdatingStatus}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                currentStatus.color,
                'hover:opacity-80',
                isUpdatingStatus && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isUpdatingStatus ? (
                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                currentStatus.label
              )}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {/* Dropdown */}
            {showStatusDropdown && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowStatusDropdown(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-20 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
                  {STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleStatusChange(option.value)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent transition-colors',
                        option.value === task.status && 'bg-accent/50'
                      )}
                    >
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', option.color)}>
                        {option.label}
                      </span>
                      {option.value === task.status && (
                        <Check className="w-4 h-4 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content - Split view */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left panel - Conversations */}
        <div className="w-full md:w-80 lg:w-96 flex flex-col min-h-0 border-b md:border-b-0 md:border-r border-border">
          <ConversationList
            conversations={conversations}
            isLoading={isLoadingConversations}
            onNewConversation={onNewConversation}
            onResumeConversation={onResumeConversation}
            onDeleteConversation={onDeleteConversation}
            activeConversationId={activeConversationId}
            className="h-full"
          />
        </div>

        {/* Right panel - Documentation and Agents */}
        <div className="flex-1 flex flex-col min-h-0">
          <MarkdownEditor
            content={taskDoc}
            onSave={onSaveTaskDoc}
            isLoading={isLoadingDoc}
            placeholder="No task documentation yet. Click Edit to describe what needs to be done."
            className="flex-1 min-h-0"
          />
          <AgentSection
            agentRuns={agentRuns}
            isLoading={isLoadingAgentRuns}
            onRunAgent={onRunAgent}
            onResumeAgent={handleResumeAgent}
            taskId={task.id}
          />
        </div>
      </div>
    </div>
  );
}

export default TaskDetailView;
