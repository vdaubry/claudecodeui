/**
 * BoardView.jsx - Kanban Board View for Project Tasks
 *
 * Main board container displaying tasks in 3 columns:
 * - Pending
 * - In Progress
 * - Completed
 *
 * Features:
 * - Responsive layout: horizontal scroll-snap on mobile, 3-column grid on desktop
 * - Header with breadcrumb navigation and "New Task" button
 * - Loads task documentation and conversation counts
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Columns } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { useTaskContext } from '../../contexts/TaskContext';
import { useAuthToken } from '../../hooks/useAuthToken';
import { api } from '../../utils/api';
import BoardColumn from './BoardColumn';
import TaskForm from '../TaskForm';

function BoardView({ className, project }) {
  const navigate = useNavigate();
  const { getTokenParam } = useAuthToken();
  const {
    tasks,
    isLoadingTasks,
    createTask,
    isTaskLive
  } = useTaskContext();

  // Use project from props (passed by BoardPage)

  // Task form modal state
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // Task documentation cache
  const [taskDocs, setTaskDocs] = useState({});
  const [taskConversationCounts, setTaskConversationCounts] = useState({});
  const [isLoadingTaskData, setIsLoadingTaskData] = useState(false);

  // Group tasks by status
  const tasksByStatus = useMemo(() => {
    const grouped = {
      pending: [],
      in_progress: [],
      completed: []
    };

    tasks.forEach((task) => {
      const status = task.status || 'pending';
      if (grouped[status]) {
        grouped[status].push(task);
      } else {
        grouped.pending.push(task);
      }
    });

    return grouped;
  }, [tasks]);

  // Load task documentation and conversation counts
  useEffect(() => {
    const loadTaskData = async () => {
      if (tasks.length === 0) {
        setTaskDocs({});
        setTaskConversationCounts({});
        return;
      }

      setIsLoadingTaskData(true);
      const newDocs = {};
      const newCounts = {};

      try {
        await Promise.all(
          tasks.map(async (task) => {
            try {
              // Load documentation
              const docResponse = await api.tasks.getDoc(task.id);
              if (docResponse.ok) {
                const docData = await docResponse.json();
                newDocs[task.id] = docData.content || '';
              }

              // Load conversation count
              const convResponse = await api.conversations.list(task.id);
              if (convResponse.ok) {
                const convData = await convResponse.json();
                const conversations = convData.conversations || convData || [];
                newCounts[task.id] = conversations.length;
              }
            } catch (error) {
              console.error(`Error loading data for task ${task.id}:`, error);
            }
          })
        );

        setTaskDocs(newDocs);
        setTaskConversationCounts(newCounts);
      } finally {
        setIsLoadingTaskData(false);
      }
    };

    loadTaskData();
  }, [tasks]);

  // Handle task click - navigate to task detail view
  const handleTaskClick = useCallback((task) => {
    navigate(`/projects/${project.id}/tasks/${task.id}${getTokenParam()}`);
  }, [navigate, project, getTokenParam]);

  // Handle task edit click
  const handleTaskEdit = useCallback((task) => {
    navigate(`/projects/${project.id}/tasks/${task.id}/edit${getTokenParam()}`);
  }, [navigate, project, getTokenParam]);

  // Handle task creation
  const handleCreateTask = useCallback(async ({ title, documentation }) => {
    if (!project) return { success: false, error: 'No project selected' };

    setIsCreatingTask(true);
    try {
      const result = await createTask(project.id, title, documentation);
      if (result.success) {
        setShowTaskForm(false);
      }
      return result;
    } finally {
      setIsCreatingTask(false);
    }
  }, [project, createTask]);

  // Handle back navigation
  const handleBack = useCallback(() => {
    navigate(`/${getTokenParam()}`);
  }, [navigate, getTokenParam]);

  if (!project) {
    return null;
  }

  return (
    <div className={cn('h-full flex flex-col bg-gradient-to-b from-background to-muted/20', className)}>
      {/* Header */}
      <div className="flex-shrink-0 bg-background/80 backdrop-blur-sm border-b border-border p-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          {/* Left: Back button + project name */}
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="h-8 w-8 p-0 flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2 min-w-0">
              <Columns className="w-5 h-5 text-primary flex-shrink-0" />
              <h1 className="font-semibold text-lg truncate">
                {project.name}
              </h1>
            </div>
          </div>

          {/* Right: New Task button */}
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowTaskForm(true)}
            className="flex-shrink-0"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Task
          </Button>
        </div>

        {/* Project path */}
        <p className="text-xs text-muted-foreground ml-11 mt-1 truncate">
          {project.repo_folder_path}
        </p>
      </div>

      {/* Board columns */}
      <div
        className={cn(
          // Mobile: horizontal scroll-snap
          'flex gap-4 p-4 overflow-x-auto flex-1',
          '[scroll-snap-type:x_mandatory]',
          '[-webkit-overflow-scrolling:touch]',
          'scrollbar-hide',
          // Desktop: 3-column grid
          'md:grid md:grid-cols-3 md:overflow-visible',
          'md:[scroll-snap-type:none]',
          // Improved padding on larger screens
          'lg:gap-6 lg:p-6'
        )}
      >
        <BoardColumn
          status="pending"
          tasks={tasksByStatus.pending}
          taskDocs={taskDocs}
          taskConversationCounts={taskConversationCounts}
          isTaskLive={isTaskLive}
          onTaskClick={handleTaskClick}
          onTaskEdit={handleTaskEdit}
        />
        <BoardColumn
          status="in_progress"
          tasks={tasksByStatus.in_progress}
          taskDocs={taskDocs}
          taskConversationCounts={taskConversationCounts}
          isTaskLive={isTaskLive}
          onTaskClick={handleTaskClick}
          onTaskEdit={handleTaskEdit}
        />
        <BoardColumn
          status="completed"
          tasks={tasksByStatus.completed}
          taskDocs={taskDocs}
          taskConversationCounts={taskConversationCounts}
          isTaskLive={isTaskLive}
          onTaskClick={handleTaskClick}
          onTaskEdit={handleTaskEdit}
        />
      </div>

      {/* Loading overlay */}
      {(isLoadingTasks || isLoadingTaskData) && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading tasks...</span>
          </div>
        </div>
      )}

      {/* Task Form Modal */}
      <TaskForm
        isOpen={showTaskForm}
        onClose={() => setShowTaskForm(false)}
        onSubmit={handleCreateTask}
        projectName={project?.name}
        isSubmitting={isCreatingTask}
      />
    </div>
  );
}

export default BoardView;
