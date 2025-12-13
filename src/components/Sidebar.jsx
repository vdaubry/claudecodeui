/**
 * Sidebar.jsx - Project/Task Navigation Sidebar
 *
 * Task-driven workflow:
 * - Lists projects from database (API)
 * - Expandable projects show tasks (not sessions)
 * - Click task to navigate to task detail view
 * - Conversations appear only in task detail, not here
 */

import React, { useState, useEffect } from 'react';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  FolderOpen,
  Folder,
  Plus,
  ChevronDown,
  ChevronRight,
  Edit3,
  Check,
  X,
  Trash2,
  Settings,
  FolderPlus,
  RefreshCw,
  Sparkles,
  Star,
  Search,
  FileText,
  MessageSquare
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useTaskContext } from '../contexts/TaskContext';

// Format relative time
const formatTimeAgo = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();

  if (isNaN(date.getTime())) return '';

  const diffInMs = now - date;
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays}d ago`;
  return date.toLocaleDateString();
};

function Sidebar({
  onShowSettings,
  updateAvailable,
  latestVersion,
  releaseInfo,
  onShowVersionModal,
  isPWA,
  isMobile,
  onToggleSidebar,
  onShowProjectForm
}) {
  const {
    projects,
    tasks,
    isLoadingProjects,
    isLoadingTasks,
    selectedProject,
    selectedTask,
    activeConversation,
    selectProject,
    selectTask,
    deleteProject,
    deleteTask,
    loadProjects
  } = useTaskContext();

  const [expandedProjects, setExpandedProjects] = useState(new Set());
  const [searchFilter, setSearchFilter] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState(null);
  const [deletingTaskId, setDeletingTaskId] = useState(null);

  // Starred projects (persisted in localStorage)
  const [starredProjects, setStarredProjects] = useState(() => {
    try {
      const saved = localStorage.getItem('starredProjects');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Auto-expand project when selected
  useEffect(() => {
    if (selectedProject) {
      setExpandedProjects(prev => new Set([...prev, selectedProject.id]));
    }
  }, [selectedProject]);

  const toggleProject = (projectId) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const toggleStarProject = (projectId) => {
    const newStarred = new Set(starredProjects);
    if (newStarred.has(projectId)) {
      newStarred.delete(projectId);
    } else {
      newStarred.add(projectId);
    }
    setStarredProjects(newStarred);
    localStorage.setItem('starredProjects', JSON.stringify([...newStarred]));
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadProjects();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleProjectClick = async (project) => {
    await selectProject(project);
    toggleProject(project.id);
  };

  const handleTaskClick = async (task) => {
    await selectTask(task);
    if (isMobile) {
      // Close sidebar on mobile after task selection
    }
  };

  const handleDeleteProject = async (e, projectId) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this project? All tasks and conversations will be lost.')) {
      return;
    }
    setDeletingProjectId(projectId);
    try {
      await deleteProject(projectId);
    } finally {
      setDeletingProjectId(null);
    }
  };

  const handleDeleteTask = async (e, taskId) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this task?')) {
      return;
    }
    setDeletingTaskId(taskId);
    try {
      await deleteTask(taskId);
    } finally {
      setDeletingTaskId(null);
    }
  };

  // Filter and sort projects
  const filteredProjects = projects
    .filter(project => {
      if (!searchFilter.trim()) return true;
      const search = searchFilter.toLowerCase();
      return project.name.toLowerCase().includes(search);
    })
    .sort((a, b) => {
      // Starred projects first
      const aStarred = starredProjects.has(a.id);
      const bStarred = starredProjects.has(b.id);
      if (aStarred && !bStarred) return -1;
      if (!aStarred && bStarred) return 1;
      // Then by name
      return a.name.localeCompare(b.name);
    });

  // Get tasks for a specific project
  const getProjectTasks = (projectId) => {
    if (selectedProject?.id !== projectId) return [];
    return tasks;
  };

  return (
    <div
      className="h-full flex flex-col bg-card md:select-none"
      style={isPWA && isMobile ? { paddingTop: '44px' } : {}}
    >
      {/* Header */}
      <div className="md:p-4 md:border-b md:border-border">
        {/* Desktop Header */}
        <div className="hidden md:flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-sm">
              <MessageSquare className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Claude Code UI</h1>
              <p className="text-sm text-muted-foreground">Task-driven workflow</p>
            </div>
          </div>
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 px-0"
              onClick={onToggleSidebar}
              title="Hide sidebar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
          )}
        </div>

        {/* Mobile Header */}
        <div
          className="md:hidden p-3 border-b border-border"
          style={isPWA && isMobile ? { paddingTop: '16px' } : {}}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">Claude Code UI</h1>
                <p className="text-sm text-muted-foreground">Projects</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="w-8 h-8 rounded-md bg-background border border-border flex items-center justify-center"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
              </button>
              <button
                className="w-8 h-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center"
                onClick={onShowProjectForm}
              >
                <FolderPlus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Actions */}
      {projects.length > 0 && !isLoadingProjects && (
        <div className="px-3 md:px-4 py-2 border-b border-border space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search projects..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-9 h-9 text-sm bg-muted/50 border-0"
            />
            {searchFilter && (
              <button
                onClick={() => setSearchFilter('')}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-accent rounded"
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Desktop action buttons */}
          {!isMobile && (
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                className="flex-1 h-8 text-xs"
                onClick={onShowProjectForm}
              >
                <FolderPlus className="w-3.5 h-3.5 mr-1.5" />
                New Project
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 px-0"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Projects List */}
      <ScrollArea className="flex-1 md:px-2 md:py-3">
        <div className="md:space-y-1 pb-safe-area-inset-bottom">
          {isLoadingProjects ? (
            <div className="text-center py-8 px-4">
              <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mx-auto mb-3">
                <div className="w-6 h-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              </div>
              <h3 className="text-base font-medium text-foreground mb-1">Loading projects...</h3>
              <p className="text-sm text-muted-foreground">Fetching your projects</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8 px-4">
              <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mx-auto mb-3">
                <Folder className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="text-base font-medium text-foreground mb-1">No projects yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create a project to get started
              </p>
              <Button variant="default" size="sm" onClick={onShowProjectForm}>
                <FolderPlus className="w-4 h-4 mr-2" />
                Create Project
              </Button>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-8 px-4">
              <Search className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <h3 className="text-base font-medium text-foreground mb-1">No matching projects</h3>
              <p className="text-sm text-muted-foreground">Try adjusting your search</p>
            </div>
          ) : (
            filteredProjects.map((project) => {
              const isExpanded = expandedProjects.has(project.id);
              const isSelected = selectedProject?.id === project.id;
              const isStarred = starredProjects.has(project.id);
              const projectTasks = getProjectTasks(project.id);
              const isDeleting = deletingProjectId === project.id;

              return (
                <div key={project.id} className="md:space-y-1">
                  {/* Project Header */}
                  <div className="group">
                    <Button
                      variant="ghost"
                      className={cn(
                        'w-full justify-between p-2 h-auto font-normal hover:bg-accent/50',
                        isSelected && 'bg-accent text-accent-foreground',
                        isStarred && !isSelected && 'bg-yellow-50/50 dark:bg-yellow-900/10'
                      )}
                      onClick={() => handleProjectClick(project)}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {isExpanded ? (
                          <FolderOpen className="w-4 h-4 text-primary flex-shrink-0" />
                        ) : (
                          <Folder className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        )}
                        <div className="min-w-0 flex-1 text-left">
                          <div className="text-sm font-semibold truncate">{project.name}</div>
                          <div className="text-xs text-muted-foreground truncate" title={project.repo_folder_path}>
                            {project.repo_folder_path}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Star button */}
                        <div
                          className={cn(
                            'w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded cursor-pointer',
                            isStarred ? 'opacity-100' : ''
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStarProject(project.id);
                          }}
                        >
                          <Star
                            className={cn(
                              'w-3 h-3',
                              isStarred ? 'text-yellow-500 fill-current' : 'text-muted-foreground'
                            )}
                          />
                        </div>
                        {/* Delete button */}
                        <div
                          className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={(e) => handleDeleteProject(e, project.id)}
                        >
                          {isDeleting ? (
                            <div className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3 text-red-500" />
                          )}
                        </div>
                        {/* Expand/collapse chevron */}
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </Button>
                  </div>

                  {/* Tasks List (when expanded) */}
                  {isExpanded && isSelected && (
                    <div className="ml-3 space-y-1 border-l border-border pl-3">
                      {isLoadingTasks ? (
                        <div className="py-2 px-2">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <div className="w-3 h-3 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                            Loading tasks...
                          </div>
                        </div>
                      ) : projectTasks.length === 0 ? (
                        <div className="py-2 px-2 text-xs text-muted-foreground">
                          No tasks yet
                        </div>
                      ) : (
                        projectTasks.map((task) => {
                          const isTaskSelected = selectedTask?.id === task.id;
                          const isTaskDeleting = deletingTaskId === task.id;

                          return (
                            <div key={task.id} className="group/task relative">
                              <Button
                                variant="ghost"
                                className={cn(
                                  'w-full justify-start p-2 h-auto font-normal text-left hover:bg-accent/50',
                                  isTaskSelected && 'bg-accent text-accent-foreground'
                                )}
                                onClick={() => handleTaskClick(task)}
                              >
                                <div className="flex items-start gap-2 min-w-0 w-full">
                                  <FileText className="w-3 h-3 mt-0.5 flex-shrink-0 text-muted-foreground" />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-medium truncate">
                                      {task.title || `Task ${task.id}`}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {formatTimeAgo(task.created_at)}
                                    </div>
                                  </div>
                                </div>
                              </Button>
                              {/* Task delete button */}
                              <div
                                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 opacity-0 group-hover/task:opacity-100 transition-opacity flex items-center justify-center rounded cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20"
                                onClick={(e) => handleDeleteTask(e, task.id)}
                              >
                                {isTaskDeleting ? (
                                  <div className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Trash2 className="w-3 h-3 text-red-500" />
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}

                      {/* New Task button - shown in task list */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start gap-2 h-8 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          // Navigate to project detail where they can create tasks
                          // Just select the project if not already
                        }}
                      >
                        <Plus className="w-3 h-3" />
                        View project to add tasks
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Version Update Notification */}
      {updateAvailable && (
        <div className="md:p-2 border-t border-border/50 flex-shrink-0">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 p-3 h-auto font-normal text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg"
            onClick={onShowVersionModal}
          >
            <div className="relative">
              <Sparkles className="w-4 h-4 text-blue-500" />
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
                {releaseInfo?.title || `Version ${latestVersion}`}
              </div>
              <div className="text-xs text-blue-600 dark:text-blue-400">Update available</div>
            </div>
          </Button>
        </div>
      )}

      {/* Settings */}
      <div className="md:p-2 md:border-t md:border-border flex-shrink-0">
        {/* Mobile Settings */}
        <div className="md:hidden p-4 pb-20 border-t border-border/50">
          <button
            className="w-full h-14 bg-muted/50 hover:bg-muted/70 rounded-2xl flex items-center justify-start gap-4 px-4"
            onClick={onShowSettings}
          >
            <div className="w-10 h-10 rounded-2xl bg-background/80 flex items-center justify-center">
              <Settings className="w-5 h-5 text-muted-foreground" />
            </div>
            <span className="text-lg font-medium text-foreground">Settings</span>
          </button>
        </div>

        {/* Desktop Settings */}
        <Button
          variant="ghost"
          className="hidden md:flex w-full justify-start gap-2 p-2 h-auto font-normal text-muted-foreground hover:text-foreground"
          onClick={onShowSettings}
        >
          <Settings className="w-3 h-3" />
          <span className="text-xs">Settings</span>
        </Button>
      </div>
    </div>
  );
}

export default Sidebar;
