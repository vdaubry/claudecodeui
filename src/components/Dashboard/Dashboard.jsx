/**
 * Dashboard.jsx - Main Dashboard Component
 *
 * Full-screen dashboard replacing the sidebar.
 * Supports two view modes:
 * - "project": Group tasks by project (default)
 * - "in_progress": Show all in-progress tasks across projects
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FolderPlus, Settings, Sparkles, MessageSquare } from 'lucide-react';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { useTaskContext } from '../../contexts/TaskContext';
import { api } from '../../utils/api';
import ViewToggle from './ViewToggle';
import ProjectCard from './ProjectCard';
import InProgressSection from './InProgressSection';
import TaskForm from '../TaskForm';
import { cn } from '../../lib/utils';

function Dashboard({
  onShowSettings,
  onShowProjectForm,
  onEditProject,
  onTaskClick,
  updateAvailable,
  latestVersion,
  releaseInfo,
  onShowVersionModal,
  isMobile
}) {
  const {
    projects,
    tasks,
    isLoadingProjects,
    isLoadingTasks,
    selectedProject,
    selectProject,
    selectTask,
    selectConversation,
    deleteProject,
    deleteTask,
    updateTask,
    createTask,
    loadProjects
  } = useTaskContext();

  // View mode: 'project' or 'in_progress'
  const [viewMode, setViewMode] = useState('project');

  // Task form modal state
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskFormProject, setTaskFormProject] = useState(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // Track expanded projects (first project expanded by default)
  const [expandedProjects, setExpandedProjects] = useState(new Set());

  // Track tasks loaded per project for project view
  const [projectTasks, setProjectTasks] = useState({});

  // In-progress tasks state (fetched from /api/tasks?status=in_progress)
  const [inProgressTasks, setInProgressTasks] = useState([]);
  const [isLoadingInProgress, setIsLoadingInProgress] = useState(false);

  // Auto-expand first project on load
  useEffect(() => {
    if (projects.length > 0 && expandedProjects.size === 0) {
      setExpandedProjects(new Set([projects[0].id]));
    }
  }, [projects]);

  // When a project is expanded, load its tasks
  useEffect(() => {
    const loadProjectTasks = async () => {
      for (const projectId of expandedProjects) {
        if (!projectTasks[projectId]) {
          // Select project temporarily to load tasks
          const project = projects.find(p => p.id === projectId);
          if (project) {
            await selectProject(project);
          }
        }
      }
    };

    if (expandedProjects.size > 0) {
      loadProjectTasks();
    }
  }, [expandedProjects, projects]);

  // Update projectTasks when tasks change
  useEffect(() => {
    if (selectedProject && tasks.length >= 0) {
      setProjectTasks(prev => ({
        ...prev,
        [selectedProject.id]: tasks
      }));
    }
  }, [selectedProject, tasks]);

  // Toggle project expansion
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

  // Load in-progress tasks when switching to in_progress view
  const loadInProgressTasks = useCallback(async () => {
    setIsLoadingInProgress(true);
    try {
      const response = await api.tasks.listAll('in_progress');
      if (response.ok) {
        const data = await response.json();
        setInProgressTasks(data.tasks || []);
      } else {
        console.error('Failed to load in-progress tasks');
        setInProgressTasks([]);
      }
    } catch (error) {
      console.error('Error loading in-progress tasks:', error);
      setInProgressTasks([]);
    } finally {
      setIsLoadingInProgress(false);
    }
  }, []);

  // Load in-progress tasks on mount for badge count
  useEffect(() => {
    loadInProgressTasks();
  }, [loadInProgressTasks]);

  // Reload in-progress tasks when switching to that view
  useEffect(() => {
    if (viewMode === 'in_progress') {
      loadInProgressTasks();
    }
  }, [viewMode, loadInProgressTasks]);

  // Handle task click - optionally navigate directly to latest conversation
  const handleTaskClick = async (task, navigateToLatestConversation = false) => {
    // Make sure the project is selected first
    const project = projects.find(p => p.id === task.project_id) || task.project;
    if (project && (!selectedProject || selectedProject.id !== project.id)) {
      await selectProject(project);
    }
    await selectTask(task);

    // If navigating to latest conversation, fetch and select it
    if (navigateToLatestConversation) {
      try {
        const response = await api.conversations.list(task.id);
        if (response.ok) {
          const data = await response.json();
          const conversations = data.conversations || data || [];
          if (conversations.length > 0) {
            // Select the first conversation (latest, since ordered by created_at DESC)
            selectConversation(conversations[0]);
            // Don't call onTaskClick since we're navigating to conversation, not task detail
            return;
          }
        }
      } catch (error) {
        console.error('Error fetching conversations:', error);
      }
    }

    onTaskClick?.(task);
  };

  // Handle new task button click
  const handleNewTask = useCallback((project) => {
    setTaskFormProject(project);
    setShowTaskForm(true);
  }, []);

  // Handle task creation
  const handleCreateTask = useCallback(async ({ title, documentation }) => {
    if (!taskFormProject) return { success: false, error: 'No project selected' };

    setIsCreatingTask(true);
    try {
      // Make sure the project is selected
      if (!selectedProject || selectedProject.id !== taskFormProject.id) {
        await selectProject(taskFormProject);
      }

      const result = await createTask(taskFormProject.id, title, documentation);
      if (result.success) {
        setShowTaskForm(false);
        setTaskFormProject(null);
        // Tasks are automatically synced via the useEffect that watches `tasks`
      }
      return result;
    } finally {
      setIsCreatingTask(false);
    }
  }, [taskFormProject, selectedProject, selectProject, createTask]);

  // Handle marking task as completed
  const handleCompleteTask = useCallback(async (taskId) => {
    const result = await updateTask(taskId, { status: 'completed' });
    if (result.success) {
      // Remove from in-progress list
      setInProgressTasks(prev => prev.filter(t => t.id !== taskId));
    }
    return result;
  }, [updateTask]);

  // Loading state
  if (isLoadingProjects && projects.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <div className="w-12 h-12 mx-auto mb-4">
            <div className="w-full h-full rounded-full border-4 border-muted border-t-primary animate-spin" />
          </div>
          <h2 className="text-xl font-semibold mb-2 text-foreground">Loading Dashboard</h2>
          <p>Fetching your projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border p-4">
        <div className="flex items-center justify-between">
          {/* Logo and title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center shadow-sm">
              <MessageSquare className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Claude Code UI</h1>
              <p className="text-sm text-muted-foreground">Task-driven workflow</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {updateAvailable && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onShowVersionModal}
                className="relative"
              >
                <Sparkles className="w-4 h-4 text-blue-500" />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onShowSettings}
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={onShowProjectForm}
            >
              <FolderPlus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </div>
        </div>

        {/* View Toggle */}
        {projects.length > 0 && (
          <div className="mt-4">
            <ViewToggle
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              inProgressCount={inProgressTasks.length}
            />
          </div>
        )}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {projects.length === 0 ? (
            // Empty state
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-6 bg-muted rounded-full flex items-center justify-center">
                <FolderPlus className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-2xl font-semibold mb-3 text-foreground">No Projects Yet</h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Create your first project to start managing tasks and conversations with Claude.
              </p>
              <Button onClick={onShowProjectForm}>
                <FolderPlus className="w-4 h-4 mr-2" />
                Create Project
              </Button>
            </div>
          ) : viewMode === 'project' ? (
            // Project view
            <div className="space-y-3">
              {projects.map((project, index) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  tasks={projectTasks[project.id] || []}
                  isExpanded={expandedProjects.has(project.id)}
                  isLoading={selectedProject?.id === project.id && isLoadingTasks}
                  onToggle={() => toggleProject(project.id)}
                  onTaskClick={handleTaskClick}
                  onNewTask={() => handleNewTask(project)}
                  onEditProject={() => onEditProject?.(project)}
                  onDeleteProject={deleteProject}
                  onDeleteTask={deleteTask}
                />
              ))}
            </div>
          ) : (
            // In Progress view - navigate directly to latest conversation
            <InProgressSection
              tasks={inProgressTasks}
              isLoading={isLoadingInProgress}
              onTaskClick={(task) => handleTaskClick(task, true)}
              onDeleteTask={deleteTask}
              onCompleteTask={handleCompleteTask}
              onRefresh={loadInProgressTasks}
            />
          )}
        </div>
      </ScrollArea>

      {/* Task Form Modal */}
      <TaskForm
        isOpen={showTaskForm}
        onClose={() => {
          setShowTaskForm(false);
          setTaskFormProject(null);
        }}
        onSubmit={handleCreateTask}
        projectName={taskFormProject?.name}
        isSubmitting={isCreatingTask}
      />
    </div>
  );
}

export default Dashboard;
