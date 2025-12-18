/**
 * ProjectEditPage.jsx - Full-page Project Edit Form
 *
 * Provides a dedicated page for editing project details:
 * - Name input field
 * - Documentation markdown editor
 * - Save/Cancel buttons
 * - Delete button with confirmation
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Save, Trash2, FolderOpen, AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { MicButton } from './MicButton';
import { useTaskContext } from '../contexts/TaskContext';
import { cn } from '../lib/utils';

function ProjectEditPage() {
  const {
    editingProject,
    projectDoc,
    isLoadingProjectDoc,
    updateProject,
    deleteProject,
    exitEditMode,
    navigateToBoard
  } = useTaskContext();

  // Form state
  const [name, setName] = useState('');
  const [documentation, setDocumentation] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  const textareaRef = useRef(null);
  const nameInputRef = useRef(null);

  // Initialize form with project data
  useEffect(() => {
    if (editingProject) {
      setName(editingProject.name || '');
      setDocumentation(projectDoc || '');
      setHasChanges(false);
      setError(null);
    }
  }, [editingProject, projectDoc]);

  // Track changes
  useEffect(() => {
    if (!editingProject) return;
    const nameChanged = name !== (editingProject.name || '');
    const docChanged = documentation !== (projectDoc || '');
    setHasChanges(nameChanged || docChanged);
  }, [name, documentation, editingProject, projectDoc]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!editingProject) return;
    if (!name.trim()) {
      setError('Project name is required');
      nameInputRef.current?.focus();
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const result = await updateProject(editingProject.id, {
        name: name.trim(),
        documentation
      });

      if (result.success) {
        exitEditMode();
      } else {
        setError(result.error || 'Failed to save project');
      }
    } catch (err) {
      setError(err.message || 'Failed to save project');
    } finally {
      setIsSaving(false);
    }
  }, [editingProject, name, documentation, updateProject, exitEditMode]);

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!editingProject) return;

    setIsDeleting(true);
    setError(null);

    try {
      const result = await deleteProject(editingProject.id);

      if (result.success) {
        // Navigate back to dashboard after successful deletion
        exitEditMode();
      } else {
        setError(result.error || 'Failed to delete project');
        setShowDeleteConfirm(false);
      }
    } catch (err) {
      setError(err.message || 'Failed to delete project');
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  }, [editingProject, deleteProject, exitEditMode]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    exitEditMode();
  }, [exitEditMode]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e) => {
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
  }, [showDeleteConfirm, handleCancel, handleSave]);

  if (!editingProject) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p>No project selected for editing</p>
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col bg-background"
      onKeyDown={handleKeyDown}
      data-testid="project-edit-page"
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
            <FolderOpen className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="font-semibold truncate">Edit Project</span>
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
          {/* Project name */}
          <div className="space-y-2">
            <label
              htmlFor="project-name"
              className="text-sm font-medium text-foreground"
            >
              Project Name
            </label>
            <Input
              id="project-name"
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter project name..."
              className="text-base"
              data-testid="name-input"
            />
          </div>

          {/* Folder path (read-only) */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Folder Path
            </label>
            <div className="px-3 py-2 bg-muted/50 border border-border rounded-md text-sm text-muted-foreground font-mono">
              {editingProject.repo_folder_path || 'No folder path'}
            </div>
          </div>

          {/* Documentation */}
          <div className="space-y-2">
            <label
              htmlFor="project-documentation"
              className="text-sm font-medium text-foreground"
            >
              Documentation
            </label>
            {isLoadingProjectDoc ? (
              <div className="animate-pulse space-y-2 p-4 border border-border rounded-md">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2" />
                <div className="h-4 bg-muted rounded w-5/6" />
              </div>
            ) : (
              <div className="flex gap-2 items-start">
                <textarea
                  id="project-documentation"
                  ref={textareaRef}
                  value={documentation}
                  onChange={(e) => setDocumentation(e.target.value)}
                  placeholder="Add project documentation in markdown format..."
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
                    Are you sure you want to delete this project? This will also
                    delete all tasks and conversations within this project.
                    This action cannot be undone.
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
                      {isDeleting ? 'Deleting...' : 'Yes, Delete Project'}
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
                  Delete Project
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

export default ProjectEditPage;
