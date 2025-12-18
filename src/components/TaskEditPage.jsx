/**
 * TaskEditPage.jsx - Full-page Task Edit Form
 *
 * Provides a dedicated page for editing task details:
 * - Title input field
 * - Status dropdown (Pending/In Progress/Completed)
 * - Documentation markdown editor
 * - Save/Cancel buttons
 * - Delete button with confirmation
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  Save,
  Trash2,
  CheckSquare,
  AlertTriangle,
  Clock,
  Loader2,
  CheckCircle2
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { MicButton } from './MicButton';
import { useTaskContext } from '../contexts/TaskContext';
import { cn } from '../lib/utils';

// Status options with icons and colors
const STATUS_OPTIONS = [
  {
    value: 'pending',
    label: 'Pending',
    icon: Clock,
    className: 'text-muted-foreground'
  },
  {
    value: 'in_progress',
    label: 'In Progress',
    icon: Loader2,
    className: 'text-yellow-600 dark:text-yellow-500'
  },
  {
    value: 'completed',
    label: 'Completed',
    icon: CheckCircle2,
    className: 'text-green-600 dark:text-green-500'
  }
];

function TaskEditPage() {
  const {
    editingTask,
    selectedProject,
    taskDoc,
    isLoadingTaskDoc,
    updateTask,
    deleteTask,
    saveTaskDoc,
    exitEditMode
  } = useTaskContext();

  // Form state
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('pending');
  const [documentation, setDocumentation] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  const textareaRef = useRef(null);
  const titleInputRef = useRef(null);

  // Initialize form with task data
  useEffect(() => {
    if (editingTask) {
      setTitle(editingTask.title || '');
      setStatus(editingTask.status || 'pending');
      setDocumentation(taskDoc || '');
      setHasChanges(false);
      setError(null);
    }
  }, [editingTask, taskDoc]);

  // Track changes
  useEffect(() => {
    if (!editingTask) return;
    const titleChanged = title !== (editingTask.title || '');
    const statusChanged = status !== (editingTask.status || 'pending');
    const docChanged = documentation !== (taskDoc || '');
    setHasChanges(titleChanged || statusChanged || docChanged);
  }, [title, status, documentation, editingTask, taskDoc]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!editingTask) return;
    if (!title.trim()) {
      setError('Task title is required');
      titleInputRef.current?.focus();
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Update task metadata
      const taskResult = await updateTask(editingTask.id, {
        title: title.trim(),
        status
      });

      if (!taskResult.success) {
        setError(taskResult.error || 'Failed to save task');
        setIsSaving(false);
        return;
      }

      // Save documentation separately
      const docResult = await saveTaskDoc(editingTask.id, documentation);

      if (docResult.success) {
        exitEditMode();
      } else {
        setError(docResult.error || 'Task saved but failed to save documentation');
      }
    } catch (err) {
      setError(err.message || 'Failed to save task');
    } finally {
      setIsSaving(false);
    }
  }, [editingTask, title, status, documentation, updateTask, saveTaskDoc, exitEditMode]);

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!editingTask) return;

    setIsDeleting(true);
    setError(null);

    try {
      const result = await deleteTask(editingTask.id);

      if (result.success) {
        exitEditMode();
      } else {
        setError(result.error || 'Failed to delete task');
        setShowDeleteConfirm(false);
      }
    } catch (err) {
      setError(err.message || 'Failed to delete task');
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  }, [editingTask, deleteTask, exitEditMode]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    exitEditMode();
  }, [exitEditMode]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else {
          handleCancel();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    },
    [showDeleteConfirm, handleCancel, handleSave]
  );

  if (!editingTask) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p>No task selected for editing</p>
      </div>
    );
  }

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];
  const StatusIcon = currentStatus.icon;

  return (
    <div
      className="h-full flex flex-col bg-background"
      onKeyDown={handleKeyDown}
      data-testid="task-edit-page"
    >
      {/* Header */}
      <div className="flex-shrink-0 bg-background border-b border-border p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="h-8 w-8 p-0 flex-shrink-0"
              title="Back"
              data-testid="back-button"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <CheckSquare className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="font-semibold truncate">Edit Task</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isSaving || isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || isDeleting || !hasChanges}
              data-testid="save-button"
            >
              <Save className="w-4 h-4 mr-1.5" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div
          className="mx-4 mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive flex items-center gap-2"
          data-testid="error-message"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Form content */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Task title */}
          <div className="space-y-2">
            <label
              htmlFor="task-title"
              className="text-sm font-medium text-foreground"
            >
              Task Title
            </label>
            <Input
              id="task-title"
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter task title..."
              className="text-base"
              data-testid="title-input"
            />
          </div>

          {/* Project context (read-only) */}
          {selectedProject && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Project
              </label>
              <div className="px-3 py-2 bg-muted/50 border border-border rounded-md text-sm text-muted-foreground">
                {selectedProject.name}
              </div>
            </div>
          )}

          {/* Status dropdown */}
          <div className="space-y-2">
            <label
              htmlFor="task-status"
              className="text-sm font-medium text-foreground"
            >
              Status
            </label>
            <div className="relative">
              <select
                id="task-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={cn(
                  'w-full h-10 pl-10 pr-4 appearance-none',
                  'bg-background border border-input rounded-md',
                  'text-sm font-medium',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                  'cursor-pointer',
                  currentStatus.className
                )}
                data-testid="status-select"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <StatusIcon className={cn('w-4 h-4', currentStatus.className)} />
              </div>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg
                  className="w-4 h-4 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Documentation */}
          <div className="space-y-2">
            <label
              htmlFor="task-documentation"
              className="text-sm font-medium text-foreground"
            >
              Documentation
            </label>
            {isLoadingTaskDoc ? (
              <div className="animate-pulse space-y-2 p-4 border border-border rounded-md">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2" />
                <div className="h-4 bg-muted rounded w-5/6" />
              </div>
            ) : (
              <div className="flex gap-2 items-start">
                <textarea
                  id="task-documentation"
                  ref={textareaRef}
                  value={documentation}
                  onChange={(e) => setDocumentation(e.target.value)}
                  placeholder="Add task documentation in markdown format..."
                  className={cn(
                    'flex-1 min-h-[300px] p-3',
                    'bg-background border border-input rounded-md',
                    'resize-y font-mono text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                    'placeholder:text-muted-foreground'
                  )}
                  data-testid="documentation-textarea"
                />
                <MicButton
                  onTranscript={(transcript) => {
                    setDocumentation((prev) => {
                      if (!prev.trim()) return transcript;
                      return prev.trimEnd() + ' ' + transcript;
                    });
                    requestAnimationFrame(() => {
                      textareaRef.current?.focus();
                    });
                  }}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Supports markdown formatting. Use headers, lists, and code blocks.
            </p>
          </div>

          {/* Danger zone */}
          <div className="pt-6 border-t border-border">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-destructive">
                Danger Zone
              </h3>

              {showDeleteConfirm ? (
                <div
                  className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg space-y-3"
                  data-testid="delete-confirmation"
                >
                  <p className="text-sm text-foreground">
                    Are you sure you want to delete this task? This will also
                    delete all conversations within this task. This action
                    cannot be undone.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      data-testid="confirm-delete-button"
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" />
                      {isDeleting ? 'Deleting...' : 'Yes, Delete Task'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isDeleting}
                      data-testid="cancel-delete-button"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                  data-testid="delete-button"
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Delete Task
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard hints */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-border text-xs text-muted-foreground flex items-center gap-4 bg-muted/30">
        <span>
          <kbd className="px-1.5 py-0.5 bg-muted rounded">Ctrl</kbd>+
          <kbd className="px-1.5 py-0.5 bg-muted rounded">S</kbd> Save
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-muted rounded">Esc</kbd> Cancel
        </span>
      </div>
    </div>
  );
}

export default TaskEditPage;
