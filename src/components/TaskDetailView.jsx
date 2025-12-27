/**
 * TaskDetailView.jsx - Task Detail Page
 *
 * Displays task details including:
 * - Breadcrumb navigation
 * - Task title, status, and metadata
 * - Task documentation (editable markdown)
 * - Conversation history with +/Resume buttons
 */

import React, { useState, useCallback, useEffect } from 'react';
import { FileText, ArrowLeft, ChevronDown, Check, CheckCircle2, GitBranch, RefreshCw, ExternalLink, GitMerge, Copy, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { Button } from './ui/button';
import Breadcrumb from './Breadcrumb';
import MarkdownEditor from './MarkdownEditor';
import ConversationList from './ConversationList';
import AgentSection from './AgentSection';
import { cn } from '../lib/utils';
import { api } from '../utils/api';

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
  onEditDocumentation,
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

  // Worktree state
  const [worktreeStatus, setWorktreeStatus] = useState(null);
  const [prStatus, setPrStatus] = useState(null);
  const [isLoadingWorktree, setIsLoadingWorktree] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCreatingPR, setIsCreatingPR] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [worktreeError, setWorktreeError] = useState(null);

  // Fetch worktree status when task changes
  useEffect(() => {
    const loadWorktreeStatus = async () => {
      if (!task?.id) return;

      setIsLoadingWorktree(true);
      setWorktreeError(null);
      try {
        const response = await api.tasks.getWorktree(task.id);
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setWorktreeStatus(data);
            // Also fetch PR status
            const prResponse = await api.tasks.getPR(task.id);
            if (prResponse.ok) {
              const prData = await prResponse.json();
              setPrStatus(prData);
            }
          } else {
            setWorktreeStatus(null);
          }
        } else {
          setWorktreeStatus(null);
        }
      } catch (error) {
        console.error('Error loading worktree status:', error);
        setWorktreeStatus(null);
      } finally {
        setIsLoadingWorktree(false);
      }
    };

    loadWorktreeStatus();
  }, [task?.id]);

  // Worktree handlers
  const handleSyncWorktree = async () => {
    if (!task?.id) return;
    setIsSyncing(true);
    setWorktreeError(null);
    try {
      const response = await api.tasks.syncWorktree(task.id);
      if (response.ok) {
        const data = await response.json();
        if (!data.success) {
          setWorktreeError(data.error || 'Sync failed');
        } else {
          // Refresh status
          const statusResponse = await api.tasks.getWorktree(task.id);
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (statusData.success) {
              setWorktreeStatus(statusData);
            }
          }
        }
      }
    } catch (error) {
      setWorktreeError(error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreatePR = async () => {
    if (!task?.id) return;
    setIsCreatingPR(true);
    setWorktreeError(null);
    try {
      const title = task.title || `Task ${task.id}`;
      const body = `## Task\n\n${task.title || 'No title'}\n\n## Description\n\nImplemented as part of task #${task.id}`;
      const response = await api.tasks.createPR(task.id, title, body);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setPrStatus({ exists: true, url: data.url, state: 'OPEN' });
          // Open the PR URL
          if (data.url) {
            window.open(data.url, '_blank');
          }
        } else {
          setWorktreeError(data.error || 'Failed to create PR');
        }
      }
    } catch (error) {
      setWorktreeError(error.message);
    } finally {
      setIsCreatingPR(false);
    }
  };

  const handleMergeAndCleanup = async () => {
    if (!task?.id) return;
    if (!confirm('This will merge the PR, delete the worktree, and clean up the branch. Continue?')) {
      return;
    }
    setIsMerging(true);
    setWorktreeError(null);
    try {
      const response = await api.tasks.mergeAndCleanup(task.id);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setWorktreeStatus(null);
          setPrStatus(null);
        } else {
          setWorktreeError(data.error || 'Merge failed');
        }
      }
    } catch (error) {
      setWorktreeError(error.message);
    } finally {
      setIsMerging(false);
    }
  };

  const copyWorktreePath = () => {
    if (worktreeStatus?.worktreePath) {
      navigator.clipboard.writeText(worktreeStatus.worktreePath);
    }
  };

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
    <div className={cn('min-h-full md:h-full flex flex-col', className)}>
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

      {/* Worktree section - only show if worktree exists */}
      {worktreeStatus && (
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex flex-wrap items-center gap-3">
            {/* Branch info */}
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                {worktreeStatus.branch}
              </span>
            </div>

            {/* Ahead/behind indicators */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {worktreeStatus.ahead > 0 && (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  {worktreeStatus.ahead} ahead
                </span>
              )}
              {worktreeStatus.behind > 0 && (
                <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  {worktreeStatus.behind} behind
                </span>
              )}
              {worktreeStatus.ahead === 0 && worktreeStatus.behind === 0 && (
                <span className="text-muted-foreground">Up to date with {worktreeStatus.mainBranch}</span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 ml-auto">
              {/* Sync button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncWorktree}
                disabled={isSyncing}
                className="h-7 text-xs"
              >
                <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', isSyncing && 'animate-spin')} />
                Sync
              </Button>

              {/* Create PR / View PR */}
              {!prStatus?.exists ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCreatePR}
                  disabled={isCreatingPR || worktreeStatus.ahead === 0}
                  className="h-7 text-xs"
                  title={worktreeStatus.ahead === 0 ? 'No commits to push' : 'Create pull request'}
                >
                  {isCreatingPR ? (
                    <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5" />
                  ) : (
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Create PR
                </Button>
              ) : (
                <>
                  <a
                    href={prStatus.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-accent transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View PR
                  </a>
                  {prStatus.mergeable === 'MERGEABLE' && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleMergeAndCleanup}
                      disabled={isMerging}
                      className="h-7 text-xs bg-green-600 hover:bg-green-700"
                    >
                      {isMerging ? (
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5" />
                      ) : (
                        <GitMerge className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      Merge & Cleanup
                    </Button>
                  )}
                </>
              )}

              {/* Copy path */}
              <Button
                variant="ghost"
                size="sm"
                onClick={copyWorktreePath}
                className="h-7 w-7 p-0"
                title={`Copy path: ${worktreeStatus.worktreePath}`}
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Error message */}
          {worktreeError && (
            <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300">
              {worktreeError}
            </div>
          )}
        </div>
      )}

      {/* Content - Split view */}
      <div className="flex-1 flex flex-col md:flex-row overflow-auto md:overflow-hidden">
        {/* Left panel - Conversations */}
        <div className="w-full md:w-80 lg:w-96 flex flex-col min-h-0 border-b md:border-b-0 md:border-r border-border flex-shrink-0">
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
        <div className="flex-1 flex flex-col min-h-0 min-w-0 md:overflow-hidden flex-shrink-0">
          <MarkdownEditor
            content={taskDoc}
            onSave={onSaveTaskDoc}
            onEditClick={onEditDocumentation}
            isLoading={isLoadingDoc}
            placeholder="No task documentation yet. Click Edit to describe what needs to be done."
            className="md:flex-1 md:min-h-0"
          />
          <AgentSection
            agentRuns={agentRuns}
            isLoading={isLoadingAgentRuns}
            onRunAgent={onRunAgent}
            onResumeAgent={handleResumeAgent}
            workflowComplete={task.workflow_complete}
            className="flex-shrink-0"
          />
        </div>
      </div>
    </div>
  );
}

export default TaskDetailView;
