/**
 * ProjectForm.jsx - Project Create/Edit Modal
 *
 * Modal form for creating or editing a project.
 * Allows users to:
 * - Enter a project name
 * - Browse or enter a repository folder path
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, FolderOpen, Folder, ChevronRight, ChevronLeft, Home, RefreshCw, FileText } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { api } from '../utils/api';
import { cn } from '../lib/utils';
import { Textarea } from './ui/textarea';

function ProjectForm({
  isOpen,
  onClose,
  onSubmit,
  initialData = null, // null for create, object for edit
  isSubmitting = false
}) {
  const [name, setName] = useState('');
  const [repoFolderPath, setRepoFolderPath] = useState('');
  const [documentation, setDocumentation] = useState('');
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);
  const [error, setError] = useState(null);

  // File browser state
  const [showBrowser, setShowBrowser] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [directories, setDirectories] = useState([]);
  const [isLoadingDirs, setIsLoadingDirs] = useState(false);
  const [browserError, setBrowserError] = useState(null);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setName(initialData.name || '');
        setRepoFolderPath(initialData.repo_folder_path || '');
        // Load documentation for existing project
        loadDocumentation(initialData.id);
      } else {
        setName('');
        setRepoFolderPath('');
        setDocumentation('');
      }
      setError(null);
      setShowBrowser(false);
    }
  }, [isOpen, initialData]);

  // Load documentation for existing project
  const loadDocumentation = async (projectId) => {
    setIsLoadingDoc(true);
    try {
      const response = await api.projects.getDoc(projectId);
      if (response.ok) {
        const data = await response.json();
        setDocumentation(data.content || '');
      } else {
        setDocumentation('');
      }
    } catch (err) {
      console.error('Error loading documentation:', err);
      setDocumentation('');
    } finally {
      setIsLoadingDoc(false);
    }
  };

  // Load directories when browser opens or path changes
  const loadDirectories = useCallback(async (path = null) => {
    setIsLoadingDirs(true);
    setBrowserError(null);

    try {
      const response = await api.browseFilesystem(path);
      if (response.ok) {
        const data = await response.json();
        setDirectories(data.directories || []);
        setCurrentPath(data.currentPath || path || '');
      } else {
        const errorData = await response.json();
        setBrowserError(errorData.error || 'Failed to load directories');
      }
    } catch (err) {
      console.error('Error loading directories:', err);
      setBrowserError(err.message || 'Failed to load directories');
    } finally {
      setIsLoadingDirs(false);
    }
  }, []);

  // Open file browser
  const handleOpenBrowser = useCallback(() => {
    setShowBrowser(true);
    loadDirectories(repoFolderPath || null);
  }, [repoFolderPath, loadDirectories]);

  // Navigate to a directory
  const handleNavigateTo = useCallback((path) => {
    loadDirectories(path);
  }, [loadDirectories]);

  // Navigate up one level
  const handleNavigateUp = useCallback(() => {
    if (!currentPath) return;
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    loadDirectories(parentPath);
  }, [currentPath, loadDirectories]);

  // Navigate to home
  const handleNavigateHome = useCallback(() => {
    loadDirectories(null);
  }, [loadDirectories]);

  // Select current path
  const handleSelectPath = useCallback(() => {
    setRepoFolderPath(currentPath);
    setShowBrowser(false);

    // Auto-fill name from folder name if not set
    if (!name && currentPath) {
      const folderName = currentPath.split('/').pop();
      setName(folderName);
    }
  }, [currentPath, name]);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    if (!repoFolderPath.trim()) {
      setError('Repository folder path is required');
      return;
    }

    try {
      const result = await onSubmit({
        name: name.trim(),
        repoFolderPath: repoFolderPath.trim(),
        documentation: documentation
      });

      if (!result.success) {
        setError(result.error || 'Failed to save project');
      }
    } catch (err) {
      setError(err.message || 'Failed to save project');
    }
  };

  if (!isOpen) return null;

  const isEditMode = !!initialData;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-card rounded-lg shadow-xl border border-border w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {isEditMode ? 'Edit Project' : 'Create New Project'}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {showBrowser ? (
            // File browser view
            <div className="space-y-4">
              {/* Browser header */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBrowser(false)}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
                <span className="text-sm font-medium">Select Folder</span>
              </div>

              {/* Path navigation */}
              <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNavigateHome}
                  className="h-7 w-7 p-0"
                  title="Go to home"
                >
                  <Home className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNavigateUp}
                  className="h-7 w-7 p-0"
                  disabled={!currentPath}
                  title="Go up"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => loadDirectories(currentPath)}
                  className="h-7 w-7 p-0"
                  title="Refresh"
                >
                  <RefreshCw className={cn('w-4 h-4', isLoadingDirs && 'animate-spin')} />
                </Button>
                <span className="text-sm text-muted-foreground truncate flex-1" title={currentPath}>
                  {currentPath || '/'}
                </span>
              </div>

              {/* Directory list */}
              <div className="border border-border rounded-md max-h-60 overflow-auto">
                {isLoadingDirs ? (
                  <div className="p-4 text-center text-muted-foreground">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading...
                  </div>
                ) : browserError ? (
                  <div className="p-4 text-center text-red-500 dark:text-red-400">
                    {browserError}
                  </div>
                ) : directories.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No subdirectories found
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {directories.map((dir) => (
                      <button
                        key={dir.path}
                        className="w-full flex items-center gap-2 p-2 hover:bg-accent text-left transition-colors"
                        onClick={() => handleNavigateTo(dir.path)}
                      >
                        <Folder className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm truncate">{dir.name}</span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Select button */}
              <Button
                variant="default"
                className="w-full"
                onClick={handleSelectPath}
                disabled={!currentPath}
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                Select This Folder
              </Button>
            </div>
          ) : (
            // Form view
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Error message */}
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              {/* Project name */}
              <div className="space-y-2">
                <label htmlFor="project-name" className="text-sm font-medium text-foreground">
                  Project Name
                </label>
                <Input
                  id="project-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Project"
                  autoFocus
                />
              </div>

              {/* Repository folder path */}
              <div className="space-y-2">
                <label htmlFor="repo-path" className="text-sm font-medium text-foreground">
                  Repository Folder Path
                </label>
                <div className="flex gap-2">
                  <Input
                    id="repo-path"
                    type="text"
                    value={repoFolderPath}
                    onChange={(e) => setRepoFolderPath(e.target.value)}
                    placeholder="/path/to/your/project"
                    className="flex-1"
                    disabled={isEditMode} // Can't change path in edit mode
                  />
                  {!isEditMode && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleOpenBrowser}
                    >
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {isEditMode && (
                  <p className="text-xs text-muted-foreground">
                    Repository path cannot be changed after creation.
                  </p>
                )}
              </div>

              {/* Project Documentation */}
              <div className="space-y-2">
                <label htmlFor="project-documentation" className="text-sm font-medium text-foreground flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Project Documentation
                </label>
                {isLoadingDoc ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Loading documentation...
                  </div>
                ) : (
                  <>
                    <Textarea
                      id="project-documentation"
                      value={documentation}
                      onChange={(e) => setDocumentation(e.target.value)}
                      placeholder="Add context about this project for the coding agent. This will be injected as context when starting conversations."
                      rows={6}
                      className="resize-y min-h-[120px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      This documentation is saved to <code className="bg-muted px-1 rounded">.claude-ui/project.md</code> and provides context for all tasks in this project.
                    </p>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  className="flex-1"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      {isEditMode ? 'Saving...' : 'Creating...'}
                    </>
                  ) : (
                    isEditMode ? 'Save Changes' : 'Create Project'
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProjectForm;
