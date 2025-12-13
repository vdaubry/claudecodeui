/**
 * ProjectDetailView.jsx - Project Detail Page
 *
 * Displays project details including:
 * - Project name and path
 * - Edit button for project settings
 * - Task list with "New Task" button
 * - Project documentation (editable markdown)
 */

import React, { useState } from 'react';
import { FolderOpen, Plus, FileText, Edit2, Trash2, Clock } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import MarkdownEditor from './MarkdownEditor';
import TaskForm from './TaskForm';
import { cn } from '../lib/utils';

// Format relative time
function formatTimeAgo(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();

  if (isNaN(date.getTime())) return '';

  const diffInMs = now - date;
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays} days ago`;
  return date.toLocaleDateString();
}

function ProjectDetailView({
  project,
  tasks = [],
  projectDoc = '',
  isLoadingTasks = false,
  isLoadingDoc = false,
  onTaskSelect,
  onCreateTask,
  onDeleteTask,
  onEditProject,
  onSaveProjectDoc,
  className
}) {
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState(null);

  // Handle task creation
  const handleCreateTask = async ({ title, documentation }) => {
    setIsCreatingTask(true);
    try {
      const result = await onCreateTask({ title, documentation });
      if (result.success) {
        setShowTaskForm(false);
        return { success: true };
      }
      return result;
    } finally {
      setIsCreatingTask(false);
    }
  };

  // Handle task deletion
  const handleDeleteTask = async (e, taskId) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this task? All conversations will be lost.')) {
      return;
    }

    setDeletingTaskId(taskId);
    try {
      await onDeleteTask(taskId);
    } finally {
      setDeletingTaskId(null);
    }
  };

  if (!project) return null;

  return (
    <div className={cn('h-full flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <FolderOpen className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-foreground truncate">
              {project.name}
            </h1>
            <p className="text-sm text-muted-foreground truncate" title={project.repo_folder_path}>
              {project.repo_folder_path}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onEditProject}>
          <Edit2 className="w-4 h-4 mr-1" />
          Edit
        </Button>
      </div>

      {/* Content - Split view */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left panel - Tasks */}
        <div className="w-full md:w-1/2 lg:w-2/5 border-b md:border-b-0 md:border-r border-border flex flex-col">
          {/* Tasks header */}
          <div className="flex items-center justify-between p-3 border-b border-border">
            <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Tasks
              {tasks.length > 0 && (
                <span className="text-xs text-muted-foreground">({tasks.length})</span>
              )}
            </h2>
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowTaskForm(true)}
              className="h-8"
            >
              <Plus className="w-4 h-4 mr-1" />
              New Task
            </Button>
          </div>

          {/* Tasks list */}
          <ScrollArea className="flex-1">
            <div className="p-2">
              {isLoadingTasks ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-3 rounded-lg border border-border animate-pulse">
                      <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                      <div className="h-3 bg-muted rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No tasks yet</p>
                  <p className="text-xs mt-1">Create a task to start working on this project</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tasks.map((task) => {
                    const isDeleting = deletingTaskId === task.id;

                    return (
                      <div
                        key={task.id}
                        className="group p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/50 cursor-pointer transition-colors"
                        onClick={() => onTaskSelect(task)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              <span className="text-sm font-medium truncate">
                                {task.title || `Task ${task.id}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              <span>{formatTimeAgo(task.created_at)}</span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            onClick={(e) => handleDeleteTask(e, task.id)}
                            disabled={isDeleting}
                          >
                            {isDeleting ? (
                              <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right panel - Documentation */}
        <div className="flex-1 flex flex-col min-h-0">
          <MarkdownEditor
            content={projectDoc}
            onSave={onSaveProjectDoc}
            isLoading={isLoadingDoc}
            placeholder="No project documentation yet. Click Edit to add context for your tasks."
            className="h-full"
          />
        </div>
      </div>

      {/* Task creation modal */}
      <TaskForm
        isOpen={showTaskForm}
        onClose={() => setShowTaskForm(false)}
        onSubmit={handleCreateTask}
        projectName={project.name}
        isSubmitting={isCreatingTask}
      />
    </div>
  );
}

export default ProjectDetailView;
