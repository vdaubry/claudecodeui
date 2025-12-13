/**
 * TaskDetailView.jsx - Task Detail Page
 *
 * Displays task details including:
 * - Breadcrumb navigation
 * - Task title and metadata
 * - Task documentation (editable markdown)
 * - Conversation history with +/Resume buttons
 */

import React from 'react';
import { FileText, ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import Breadcrumb from './Breadcrumb';
import MarkdownEditor from './MarkdownEditor';
import ConversationList from './ConversationList';
import { cn } from '../lib/utils';

function TaskDetailView({
  project,
  task,
  taskDoc = '',
  conversations = [],
  activeConversationId,
  isLoadingDoc = false,
  isLoadingConversations = false,
  onBack,
  onProjectClick,
  onHomeClick,
  onSaveTaskDoc,
  onNewConversation,
  onResumeConversation,
  onDeleteConversation,
  className
}) {
  if (!task) return null;

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
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-foreground truncate">
              {task.title || `Task ${task.id}`}
            </h1>
            <p className="text-sm text-muted-foreground">
              Task #{task.id} in {project?.name || 'Unknown Project'}
            </p>
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

        {/* Right panel - Documentation */}
        <div className="flex-1 flex flex-col min-h-0">
          <MarkdownEditor
            content={taskDoc}
            onSave={onSaveTaskDoc}
            isLoading={isLoadingDoc}
            placeholder="No task documentation yet. Click Edit to describe what needs to be done."
            className="h-full"
          />
        </div>
      </div>
    </div>
  );
}

export default TaskDetailView;
