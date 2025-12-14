/**
 * ProjectCard.jsx - Collapsible Project Card
 *
 * Displays a project with:
 * - Fold/unfold toggle (arrow)
 * - Project name and path
 * - Active task count indicator
 * - Task list when expanded
 * - Collapsed completed section
 */

import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Folder,
  Trash2,
  Plus,
  Pencil
} from 'lucide-react';
import { Button } from '../ui/button';
import TaskRow from './TaskRow';
import CompletedCollapse from './CompletedCollapse';
import { cn } from '../../lib/utils';

function ProjectCard({
  project,
  tasks = [],
  isExpanded,
  isLoading,
  onToggle,
  onTaskClick,
  onNewTask,
  onEditProject,
  onDeleteProject,
  onDeleteTask
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  // Separate tasks by status (for now, we treat all as "pending" or "in_progress")
  // In a real implementation, tasks would have a status field
  const activeTasks = tasks.filter(t => !t.completed);
  const completedTasks = tasks.filter(t => t.completed);

  // Check if any task has active conversations (would need WebSocket status)
  // For now, we'll simulate this
  const hasActiveConversation = false; // TODO: Implement real-time status

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this project? All tasks and conversations will be lost.')) {
      return;
    }
    setIsDeleting(true);
    try {
      await onDeleteProject(project.id);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className={cn(
        'rounded-lg border transition-all',
        hasActiveConversation
          ? 'border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
          : 'border-border',
        isExpanded ? 'bg-card' : 'bg-card/50'
      )}
    >
      {/* Project Header */}
      <div
        data-testid={`project-card-${project.name.toLowerCase().replace(/\s+/g, '-')}`}
        className="w-full p-4 flex items-center gap-3 hover:bg-accent/50 rounded-t-lg transition-colors cursor-pointer"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        {/* Expand/Collapse Arrow */}
        <div className="flex-shrink-0 text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="w-5 h-5" />
          ) : (
            <ChevronRight className="w-5 h-5" />
          )}
        </div>

        {/* Folder Icon */}
        <div className={cn(
          'flex-shrink-0',
          hasActiveConversation && 'text-red-500'
        )}>
          {isExpanded ? (
            <FolderOpen className={cn(
              'w-5 h-5',
              hasActiveConversation ? 'text-red-500' : 'text-primary'
            )} />
          ) : (
            <Folder className="w-5 h-5 text-muted-foreground" />
          )}
        </div>

        {/* Project Info */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            {hasActiveConversation && (
              <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
            <h3 className="font-semibold text-foreground truncate">
              {project.name}
            </h3>
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {project.repo_folder_path}
          </p>
        </div>

        {/* Task Count Badge */}
        <div className="flex-shrink-0 flex items-center gap-2">
          {activeTasks.length > 0 && (
            <span className={cn(
              'text-xs px-2 py-1 rounded-full',
              hasActiveConversation
                ? 'bg-red-500/10 text-red-500'
                : 'bg-muted text-muted-foreground'
            )}>
              {activeTasks.length} {activeTasks.length === 1 ? 'task' : 'tasks'}
            </span>
          )}

          {/* Edit Button */}
          <button
            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-accent transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onEditProject?.();
            }}
            title="Edit project"
          >
            <Pencil className="w-4 h-4" />
          </button>

          {/* Delete Button */}
          <button
            className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-accent transition-colors"
            onClick={handleDelete}
            disabled={isDeleting}
            title="Delete project"
          >
            {isDeleting ? (
              <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-border">
          {/* Loading State */}
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">
              <div className="w-5 h-5 mx-auto border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
              <p className="mt-2 text-sm">Loading tasks...</p>
            </div>
          ) : activeTasks.length === 0 && completedTasks.length === 0 ? (
            // Empty State
            <div className="p-4 text-center text-muted-foreground">
              <p className="text-sm">No tasks yet</p>
              <p className="text-xs mt-1 mb-3">Create a task to get started</p>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onNewTask?.();
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                New Task
              </Button>
            </div>
          ) : (
            <>
              {/* Active Tasks */}
              <div className="divide-y divide-border">
                {activeTasks.map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onClick={() => onTaskClick(task)}
                    onDelete={() => onDeleteTask(task.id)}
                  />
                ))}
              </div>

              {/* Completed Tasks (Collapsed) */}
              {completedTasks.length > 0 && (
                <CompletedCollapse
                  tasks={completedTasks}
                  onTaskClick={onTaskClick}
                />
              )}
            </>
          )}

          {/* Footer with New Task button */}
          <div className="p-3 border-t border-border bg-muted/30">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onNewTask?.();
              }}
            >
              <Plus className="w-3 h-3 mr-1" />
              New Task
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectCard;
