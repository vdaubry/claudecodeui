/**
 * Dashboard.jsx - Main Dashboard Component
 *
 * Full-screen dashboard replacing the sidebar.
 * Supports two view modes:
 * - "project": Group tasks by project (default)
 * - "in_progress": Show all in-progress tasks across projects
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FolderPlus, Settings, MessageSquare } from 'lucide-react';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { useTaskContext } from '../../contexts/TaskContext';
import { api } from '../../utils/api';
import ViewToggle from './ViewToggle';
import ProjectCardGrid from './ProjectCardGrid';
import InProgressSection from './InProgressSection';
import TaskForm from '../TaskForm';
import { cn } from '../../lib/utils';

function Dashboard({
  onShowSettings,
  onShowProjectForm,
  onEditProject,
  onTaskClick,
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
    loadProjects,
    navigateToBoard,
    navigateToProjectEdit,
    isTaskLive,
    liveTaskIds
  } = useTaskContext();

  // View mode: 'project' or 'in_progress'
  const [viewMode, setViewMode] = useState('project');

  // Task form modal state
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskFormProject, setTaskFormProject] = useState(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // Project data cache: task counts and documentation for grid cards
  const [projectData, setProjectData] = useState({});
  const [isLoadingProjectData, setIsLoadingProjectData] = useState(false);

  // In-progress tasks state (fetched from /api/tasks?status=in_progress)
  const [inProgressTasks, setInProgressTasks] = useState([]);
  const [isLoadingInProgress, setIsLoadingInProgress] = useState(false);

  // Load project data (task counts and docs) for all projects
  useEffect(() => {
    const loadAllProjectData = async () => {
      if (projects.length === 0) return;

      setIsLoadingProjectData(true);
      const newProjectData = {};

      try {
        // Fetch data for all projects in parallel
        await Promise.all(
          projects.map(async (project) => {
            try {
              // Fetch tasks for this project
              const tasksResponse = await api.tasks.list(project.id);
              let projectTasks = [];
              if (tasksResponse.ok) {
                const data = await tasksResponse.json();
                projectTasks = data.tasks || data || [];
              }

              // Fetch documentation for this project
              const docResponse = await api.projects.getDoc(project.id);
              let documentation = '';
              if (docResponse.ok) {
                const docData = await docResponse.json();
                documentation = docData.content || '';
              }

              // Count tasks by status
              const taskCounts = {
                pending: projectTasks.filter(t => t.status === 'pending' || (!t.status && !t.completed)).length,
                in_progress: projectTasks.filter(t => t.status === 'in_progress').length,
                completed: projectTasks.filter(t => t.status === 'completed' || t.completed).length
              };

              // Check if any task in this project is live
              const hasLiveTask = projectTasks.some(t => isTaskLive(t.id));

              newProjectData[project.id] = {
                taskCounts,
                documentation,
                hasLiveTask,
                tasks: projectTasks
              };
            } catch (error) {
              console.error(`Error loading data for project ${project.id}:`, error);
              newProjectData[project.id] = {
                taskCounts: { pending: 0, in_progress: 0, completed: 0 },
                documentation: '',
                hasLiveTask: false,
                tasks: []
              };
            }
          })
        );

        setProjectData(newProjectData);
      } finally {
        setIsLoadingProjectData(false);
      }
    };

    loadAllProjectData();
  }, [projects, isTaskLive]);

  // Update live task status when liveTaskIds changes
  useEffect(() => {
    if (Object.keys(projectData).length === 0) return;

    setProjectData(prev => {
      const updated = { ...prev };
      let hasChanges = false;

      Object.keys(updated).forEach(projectId => {
        const data = updated[projectId];
        if (data.tasks) {
          const hasLiveTask = data.tasks.some(t => isTaskLive(t.id));
          if (data.hasLiveTask !== hasLiveTask) {
            updated[projectId] = { ...data, hasLiveTask };
            hasChanges = true;
          }
        }
      });

      return hasChanges ? updated : prev;
    });
  }, [liveTaskIds, isTaskLive]);

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

  // Handle project card click - navigate to board view
  const handleProjectCardClick = useCallback((project) => {
    navigateToBoard(project);
  }, [navigateToBoard]);

  // Handle status badge click - navigate to board view (badge status could be used for filtering in the future)
  const handleStatusBadgeClick = useCallback((project, status) => {
    navigateToBoard(project);
  }, [navigateToBoard]);

  // Handle project edit click
  const handleEditProjectClick = useCallback((project) => {
    // Use the callback from App.jsx to show the edit modal
    onEditProject?.(project);
  }, [onEditProject]);

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
    <div className="h-full flex flex-col bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border p-4 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          {/* Logo and title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-lg flex items-center justify-center shadow-md">
              <MessageSquare className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Claude Code UI</h1>
              <p className="text-sm text-muted-foreground">Task-driven workflow</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
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
            <div className="text-center py-16 px-4">
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-muted to-muted/60 rounded-2xl flex items-center justify-center shadow-inner">
                <FolderPlus className="w-10 h-10 text-muted-foreground" />
              </div>
              <h2 className="text-2xl font-semibold mb-3 text-foreground">No Projects Yet</h2>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
                Create your first project to start managing tasks and conversations with Claude.
              </p>
              <Button onClick={onShowProjectForm} size="lg" className="shadow-md hover:shadow-lg transition-shadow">
                <FolderPlus className="w-5 h-5 mr-2" />
                Create Project
              </Button>
            </div>
          ) : viewMode === 'project' ? (
            // Project grid view
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => {
                const data = projectData[project.id] || {
                  taskCounts: { pending: 0, in_progress: 0, completed: 0 },
                  documentation: '',
                  hasLiveTask: false
                };
                return (
                  <ProjectCardGrid
                    key={project.id}
                    project={project}
                    taskCounts={data.taskCounts}
                    documentationPreview={data.documentation}
                    hasLiveTask={data.hasLiveTask}
                    onCardClick={() => handleProjectCardClick(project)}
                    onEditClick={() => handleEditProjectClick(project)}
                    onDeleteClick={() => deleteProject(project.id)}
                    onStatusBadgeClick={(status) => handleStatusBadgeClick(project, status)}
                  />
                );
              })}
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
