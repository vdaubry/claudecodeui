/**
 * DocEditPage.jsx - Full-page Documentation Editor
 *
 * Provides a dedicated page for editing task documentation:
 * - Uses @uiw/react-md-editor for markdown editing
 * - MicButton for voice input
 * - Save/Cancel buttons
 * - Keyboard shortcuts (Ctrl+S, Esc)
 *
 * Mobile-friendly design - full screen editing experience.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Save, FileText, AlertTriangle } from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';
import { Button } from './ui/button';
import { MicButton } from './MicButton';
import { useTaskContext } from '../contexts/TaskContext';
import { cn } from '../lib/utils';

function DocEditPage() {
  const {
    editingDocTask,
    selectedProject,
    taskDoc,
    isLoadingTaskDoc,
    saveTaskDoc,
    exitDocEditMode
  } = useTaskContext();

  // Form state
  const [documentation, setDocumentation] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize form with task documentation
  useEffect(() => {
    if (editingDocTask) {
      setDocumentation(taskDoc || '');
      setHasChanges(false);
      setError(null);
    }
  }, [editingDocTask, taskDoc]);

  // Track changes
  useEffect(() => {
    if (!editingDocTask) return;
    const docChanged = documentation !== (taskDoc || '');
    setHasChanges(docChanged);
  }, [documentation, editingDocTask, taskDoc]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!editingDocTask) return;

    setIsSaving(true);
    setError(null);

    try {
      const result = await saveTaskDoc(editingDocTask.id, documentation);

      if (result.success) {
        exitDocEditMode();
      } else {
        setError(result.error || 'Failed to save documentation');
      }
    } catch (err) {
      setError(err.message || 'Failed to save documentation');
    } finally {
      setIsSaving(false);
    }
  }, [editingDocTask, documentation, saveTaskDoc, exitDocEditMode]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    exitDocEditMode();
  }, [exitDocEditMode]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        handleCancel();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    },
    [handleCancel, handleSave]
  );

  // Handle voice transcript
  const handleTranscript = useCallback((transcript) => {
    setDocumentation((prev) => {
      if (!prev.trim()) return transcript;
      return prev.trimEnd() + ' ' + transcript;
    });
  }, []);

  if (!editingDocTask) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p>No task selected for documentation editing</p>
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col bg-background"
      onKeyDown={handleKeyDown}
      data-testid="doc-edit-page"
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
            <FileText className="w-5 h-5 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold truncate block">
                Edit Documentation
              </span>
              <span className="text-xs text-muted-foreground truncate block">
                {editingDocTask.title}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <MicButton onTranscript={handleTranscript} />
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
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

      {/* Project context (read-only) */}
      {selectedProject && (
        <div className="mx-4 mt-4 px-3 py-2 bg-muted/30 border border-border rounded-md text-sm text-muted-foreground">
          <span className="font-medium">Project:</span> {selectedProject.name}
        </div>
      )}

      {/* Editor content */}
      <div className="flex-1 overflow-hidden p-4" data-color-mode="auto">
        {isLoadingTaskDoc ? (
          <div className="animate-pulse space-y-2 p-4 border border-border rounded-md h-full">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-4 bg-muted rounded w-5/6" />
          </div>
        ) : (
          <MDEditor
            value={documentation}
            onChange={(val) => setDocumentation(val || '')}
            preview="edit"
            height="100%"
            visibleDragbar={false}
            hideToolbar={false}
            data-testid="md-editor"
            className={cn(
              'w-full h-full',
              '[&_.w-md-editor]:h-full',
              '[&_.w-md-editor-content]:h-full',
              '[&_.w-md-editor-input]:h-full'
            )}
            textareaProps={{
              placeholder: 'Add task documentation in markdown format...'
            }}
          />
        )}
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

export default DocEditPage;
