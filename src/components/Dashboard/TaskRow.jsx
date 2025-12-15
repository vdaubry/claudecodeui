/**
 * TaskRow.jsx - Individual Task Row
 *
 * Displays a task with:
 * - Status indicator (filled/empty dot)
 * - Task title
 * - Status badge (LIVE, In Progress, Pending)
 * - View button
 */

import React, { useState } from 'react';
import { FileText, Trash2, ChevronRight, Circle, CheckCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { useTaskContext } from '../../contexts/TaskContext';

// Format relative time
function formatTimeAgo(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();

  if (isNaN(date.getTime())) return '';

  const diffInMs = now - date;
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  if (diffInHours < 24) return `${diffInHours}h ago`;
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays}d ago`;
  return date.toLocaleDateString();
}

function TaskRow({
  task,
  project, // Optional - for status view
  onClick,
  onDelete,
  onComplete,
  showProject = false
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const { isTaskLive } = useTaskContext();

  // Determine task status from context's live task tracking
  const hasConversations = task.conversation_count > 0 || task.has_conversations;
  const isLive = task.is_live || isTaskLive(task.id);

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this task?')) {
      return;
    }
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
    }
  };

  const handleComplete = async (e) => {
    e.stopPropagation();
    if (!confirm('Mark this task as completed?')) {
      return;
    }
    setIsCompleting(true);
    try {
      await onComplete();
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <div
      data-testid={`task-row-${task.id}`}
      className={cn(
        'group flex items-center gap-3 p-3 hover:bg-accent/50 cursor-pointer transition-colors',
        isLive && 'bg-red-500/5'
      )}
      onClick={onClick}
    >
      {/* Status Indicator */}
      <div className="flex-shrink-0">
        {hasConversations ? (
          <div className={cn(
            'w-2.5 h-2.5 rounded-full',
            isLive ? 'bg-red-500 animate-pulse' : 'bg-primary'
          )} />
        ) : (
          <Circle className="w-2.5 h-2.5 text-muted-foreground" />
        )}
      </div>

      {/* Task Icon */}
      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />

      {/* Task Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {showProject && (project?.name || task.project_name) && (
            <>
              <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                {project?.name || task.project_name}
              </span>
              <span className="text-muted-foreground">&rsaquo;</span>
            </>
          )}
          <span className="font-medium text-foreground truncate">
            {task.title || `Task ${task.id}`}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {formatTimeAgo(task.updated_at || task.created_at)}
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex-shrink-0 flex items-center gap-2">
        {isLive ? (
          <span
            data-testid="live-badge"
            className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full bg-red-500/10 text-red-500"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            LIVE
          </span>
        ) : task.status === 'completed' ? (
          <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400">
            Completed
          </span>
        ) : task.status === 'in_progress' ? (
          <span className="text-xs px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
            In Progress
          </span>
        ) : (
          <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
            Pending
          </span>
        )}

        {/* Complete Button - only show if onComplete is provided */}
        {onComplete && (
          <button
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-green-500/10 rounded"
            onClick={handleComplete}
            title="Mark as completed"
          >
            {isCompleting ? (
              <div className="w-3.5 h-3.5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5 text-muted-foreground hover:text-green-500" />
            )}
          </button>
        )}

        {/* Delete Button */}
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500/10 rounded"
          onClick={handleDelete}
        >
          {isDeleting ? (
            <div className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
          )}
        </button>

        {/* View Arrow */}
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </div>
  );
}

export default TaskRow;
