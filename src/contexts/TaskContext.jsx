/**
 * TaskContext.jsx - State Management for Task-Driven Workflow
 *
 * This context manages the task-driven architecture:
 * - Projects: User-created projects pointing to repo folders
 * - Tasks: Work items belonging to projects
 * - Conversations: Claude sessions linked to tasks
 *
 * All state is fetched from /api/ endpoints.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { api } from '../utils/api';
import { useWebSocket } from './WebSocketContext';

// Create context
const TaskContext = createContext(null);

// Custom hook to use the context
export function useTaskContext() {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTaskContext must be used within a TaskContextProvider');
  }
  return context;
}

// Provider component
export function TaskContextProvider({ children }) {
  // WebSocket for streaming events
  const { subscribe, unsubscribe, isConnected } = useWebSocket() || {};

  // Projects state
  const [projects, setProjects] = useState([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [projectsError, setProjectsError] = useState(null);

  // Tasks state (for currently selected project)
  const [tasks, setTasks] = useState([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [tasksError, setTasksError] = useState(null);

  // Live task tracking - Set of task IDs that have active streaming
  const [liveTaskIds, setLiveTaskIds] = useState(new Set());
  const liveTaskIdsRef = useRef(new Set());

  // Conversations state (for currently selected task)
  const [conversations, setConversations] = useState([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [conversationsError, setConversationsError] = useState(null);

  // Selection state
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [activeConversation, setActiveConversation] = useState(null);

  // Documentation state
  const [projectDoc, setProjectDoc] = useState('');
  const [taskDoc, setTaskDoc] = useState('');
  const [isLoadingProjectDoc, setIsLoadingProjectDoc] = useState(false);
  const [isLoadingTaskDoc, setIsLoadingTaskDoc] = useState(false);

  // Current view state - derived from selection
  // Possible values: 'empty', 'project-detail', 'task-detail', 'chat'
  const getCurrentView = useCallback(() => {
    if (activeConversation) return 'chat';
    if (selectedTask) return 'task-detail';
    if (selectedProject) return 'project-detail';
    return 'empty';
  }, [activeConversation, selectedTask, selectedProject]);

  // ========== Projects API ==========

  const loadProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    setProjectsError(null);
    try {
      const response = await api.projects.list();
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || data || []);
      } else {
        const error = await response.json();
        setProjectsError(error.error || 'Failed to load projects');
      }
    } catch (error) {
      console.error('Error loading projects:', error);
      setProjectsError(error.message);
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  const createProject = useCallback(async (name, repoFolderPath, documentation = '') => {
    try {
      const response = await api.projects.create(name, repoFolderPath);
      if (response.ok) {
        const newProject = await response.json();
        setProjects(prev => [...prev, newProject]);

        // Save documentation if provided
        if (documentation && documentation.trim()) {
          await api.projects.saveDoc(newProject.id, documentation);
        }

        return { success: true, project: newProject };
      } else {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to create project' };
      }
    } catch (error) {
      console.error('Error creating project:', error);
      return { success: false, error: error.message };
    }
  }, []);

  const updateProject = useCallback(async (id, data) => {
    try {
      // Extract documentation from data if present
      const { documentation, ...projectData } = data;

      const response = await api.projects.update(id, projectData);
      if (response.ok) {
        const updatedProject = await response.json();
        setProjects(prev => prev.map(p => p.id === id ? updatedProject : p));
        if (selectedProject?.id === id) {
          setSelectedProject(updatedProject);
        }

        // Save documentation if provided (even if empty, to allow clearing)
        if (documentation !== undefined) {
          await api.projects.saveDoc(id, documentation);
          setProjectDoc(documentation);
        }

        return { success: true, project: updatedProject };
      } else {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to update project' };
      }
    } catch (error) {
      console.error('Error updating project:', error);
      return { success: false, error: error.message };
    }
  }, [selectedProject]);

  const deleteProject = useCallback(async (id) => {
    try {
      const response = await api.projects.delete(id);
      if (response.ok) {
        setProjects(prev => prev.filter(p => p.id !== id));
        if (selectedProject?.id === id) {
          setSelectedProject(null);
          setTasks([]);
          setSelectedTask(null);
          setConversations([]);
          setActiveConversation(null);
        }
        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to delete project' };
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      return { success: false, error: error.message };
    }
  }, [selectedProject]);

  // ========== Project Documentation API ==========

  const loadProjectDoc = useCallback(async (projectId) => {
    setIsLoadingProjectDoc(true);
    try {
      const response = await api.projects.getDoc(projectId);
      if (response.ok) {
        const data = await response.json();
        setProjectDoc(data.content || '');
        return { success: true, content: data.content || '' };
      } else {
        setProjectDoc('');
        return { success: false, error: 'Failed to load documentation' };
      }
    } catch (error) {
      console.error('Error loading project doc:', error);
      setProjectDoc('');
      return { success: false, error: error.message };
    } finally {
      setIsLoadingProjectDoc(false);
    }
  }, []);

  const saveProjectDoc = useCallback(async (projectId, content) => {
    try {
      const response = await api.projects.saveDoc(projectId, content);
      if (response.ok) {
        setProjectDoc(content);
        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to save documentation' };
      }
    } catch (error) {
      console.error('Error saving project doc:', error);
      return { success: false, error: error.message };
    }
  }, []);

  // ========== Tasks API ==========

  const loadTasks = useCallback(async (projectId) => {
    if (!projectId) {
      setTasks([]);
      return;
    }
    setIsLoadingTasks(true);
    setTasksError(null);
    try {
      const response = await api.tasks.list(projectId);
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks || data || []);
      } else {
        const error = await response.json();
        setTasksError(error.error || 'Failed to load tasks');
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
      setTasksError(error.message);
    } finally {
      setIsLoadingTasks(false);
    }
  }, []);

  const createTask = useCallback(async (projectId, title, documentation = '') => {
    try {
      const response = await api.tasks.create(projectId, title);
      if (response.ok) {
        const newTask = await response.json();
        setTasks(prev => [newTask, ...prev]);

        // Save documentation if provided
        if (documentation && documentation.trim()) {
          await api.tasks.saveDoc(newTask.id, documentation);
        }

        return { success: true, task: newTask };
      } else {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to create task' };
      }
    } catch (error) {
      console.error('Error creating task:', error);
      return { success: false, error: error.message };
    }
  }, []);

  const updateTask = useCallback(async (id, data) => {
    try {
      const response = await api.tasks.update(id, data);
      if (response.ok) {
        const updatedTask = await response.json();
        setTasks(prev => prev.map(t => t.id === id ? updatedTask : t));
        if (selectedTask?.id === id) {
          setSelectedTask(updatedTask);
        }
        return { success: true, task: updatedTask };
      } else {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to update task' };
      }
    } catch (error) {
      console.error('Error updating task:', error);
      return { success: false, error: error.message };
    }
  }, [selectedTask]);

  const deleteTask = useCallback(async (id) => {
    try {
      const response = await api.tasks.delete(id);
      if (response.ok) {
        setTasks(prev => prev.filter(t => t.id !== id));
        if (selectedTask?.id === id) {
          setSelectedTask(null);
          setConversations([]);
          setActiveConversation(null);
        }
        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to delete task' };
      }
    } catch (error) {
      console.error('Error deleting task:', error);
      return { success: false, error: error.message };
    }
  }, [selectedTask]);

  // ========== Task Documentation API ==========

  const loadTaskDoc = useCallback(async (taskId) => {
    setIsLoadingTaskDoc(true);
    try {
      const response = await api.tasks.getDoc(taskId);
      if (response.ok) {
        const data = await response.json();
        setTaskDoc(data.content || '');
        return { success: true, content: data.content || '' };
      } else {
        setTaskDoc('');
        return { success: false, error: 'Failed to load documentation' };
      }
    } catch (error) {
      console.error('Error loading task doc:', error);
      setTaskDoc('');
      return { success: false, error: error.message };
    } finally {
      setIsLoadingTaskDoc(false);
    }
  }, []);

  const saveTaskDoc = useCallback(async (taskId, content) => {
    try {
      const response = await api.tasks.saveDoc(taskId, content);
      if (response.ok) {
        setTaskDoc(content);
        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to save documentation' };
      }
    } catch (error) {
      console.error('Error saving task doc:', error);
      return { success: false, error: error.message };
    }
  }, []);

  // ========== Conversations API ==========

  const loadConversations = useCallback(async (taskId) => {
    if (!taskId) {
      setConversations([]);
      return;
    }
    setIsLoadingConversations(true);
    setConversationsError(null);
    try {
      const response = await api.conversations.list(taskId);
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || data || []);
      } else {
        const error = await response.json();
        setConversationsError(error.error || 'Failed to load conversations');
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
      setConversationsError(error.message);
    } finally {
      setIsLoadingConversations(false);
    }
  }, []);

  const createConversation = useCallback(async (taskId) => {
    try {
      const response = await api.conversations.create(taskId);
      if (response.ok) {
        const newConversation = await response.json();
        setConversations(prev => [newConversation, ...prev]);
        return { success: true, conversation: newConversation };
      } else {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to create conversation' };
      }
    } catch (error) {
      console.error('Error creating conversation:', error);
      return { success: false, error: error.message };
    }
  }, []);

  const deleteConversation = useCallback(async (id) => {
    try {
      const response = await api.conversations.delete(id);
      if (response.ok) {
        setConversations(prev => prev.filter(c => c.id !== id));
        if (activeConversation?.id === id) {
          setActiveConversation(null);
        }
        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to delete conversation' };
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
      return { success: false, error: error.message };
    }
  }, [activeConversation]);

  // ========== Selection Handlers ==========

  const selectProject = useCallback(async (project) => {
    setSelectedProject(project);
    setSelectedTask(null);
    setActiveConversation(null);
    setTasks([]);
    setConversations([]);
    setProjectDoc('');
    setTaskDoc('');

    if (project) {
      // Load tasks and project documentation in parallel
      await Promise.all([
        loadTasks(project.id),
        loadProjectDoc(project.id)
      ]);
    }
  }, [loadTasks, loadProjectDoc]);

  const selectTask = useCallback(async (task) => {
    setSelectedTask(task);
    setActiveConversation(null);
    setConversations([]);
    setTaskDoc('');

    if (task) {
      // Load conversations and task documentation in parallel
      await Promise.all([
        loadConversations(task.id),
        loadTaskDoc(task.id)
      ]);
    }
  }, [loadConversations, loadTaskDoc]);

  const selectConversation = useCallback((conversation) => {
    setActiveConversation(conversation);
  }, []);

  const navigateBack = useCallback(() => {
    if (activeConversation) {
      setActiveConversation(null);
    } else if (selectedTask) {
      setSelectedTask(null);
      setConversations([]);
      setTaskDoc('');
    } else if (selectedProject) {
      setSelectedProject(null);
      setTasks([]);
      setProjectDoc('');
    }
  }, [activeConversation, selectedTask, selectedProject]);

  // Clear all selection state
  const clearSelection = useCallback(() => {
    setSelectedProject(null);
    setSelectedTask(null);
    setActiveConversation(null);
    setTasks([]);
    setConversations([]);
    setProjectDoc('');
    setTaskDoc('');
  }, []);

  // ========== Effects ==========

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Fetch active streaming sessions on mount and when WebSocket connects
  useEffect(() => {
    const fetchActiveSessions = async () => {
      try {
        const response = await api.streamingSessions.getActive();
        if (response.ok) {
          const data = await response.json();
          const taskIds = new Set(data.sessions.map(s => s.taskId));
          setLiveTaskIds(taskIds);
          liveTaskIdsRef.current = taskIds;
        }
      } catch (error) {
        console.error('Error fetching active streaming sessions:', error);
      }
    };

    fetchActiveSessions();
  }, [isConnected]);

  // Subscribe to streaming events via WebSocket
  useEffect(() => {
    if (!subscribe || !unsubscribe) return;

    const handleStreamingStarted = (message) => {
      const { taskId } = message;
      if (taskId) {
        setLiveTaskIds(prev => {
          const next = new Set(prev);
          next.add(taskId);
          liveTaskIdsRef.current = next;
          return next;
        });
      }
    };

    const handleStreamingEnded = (message) => {
      const { taskId } = message;
      if (taskId) {
        setLiveTaskIds(prev => {
          const next = new Set(prev);
          next.delete(taskId);
          liveTaskIdsRef.current = next;
          return next;
        });
      }
    };

    subscribe('streaming-started', handleStreamingStarted);
    subscribe('streaming-ended', handleStreamingEnded);

    return () => {
      unsubscribe('streaming-started', handleStreamingStarted);
      unsubscribe('streaming-ended', handleStreamingEnded);
    };
  }, [subscribe, unsubscribe]);

  // Helper to check if a task is live
  const isTaskLive = useCallback((taskId) => {
    return liveTaskIdsRef.current.has(taskId);
  }, []);

  // ========== Context Value ==========

  const value = {
    // Projects
    projects,
    isLoadingProjects,
    projectsError,
    loadProjects,
    createProject,
    updateProject,
    deleteProject,

    // Project Documentation
    projectDoc,
    isLoadingProjectDoc,
    loadProjectDoc,
    saveProjectDoc,

    // Tasks
    tasks,
    isLoadingTasks,
    tasksError,
    loadTasks,
    createTask,
    updateTask,
    deleteTask,

    // Task Documentation
    taskDoc,
    isLoadingTaskDoc,
    loadTaskDoc,
    saveTaskDoc,

    // Conversations
    conversations,
    isLoadingConversations,
    conversationsError,
    loadConversations,
    createConversation,
    deleteConversation,

    // Selection
    selectedProject,
    selectedTask,
    activeConversation,
    selectProject,
    selectTask,
    selectConversation,
    navigateBack,
    clearSelection,

    // View state
    currentView: getCurrentView(),
    getCurrentView,

    // Live task tracking
    liveTaskIds,
    isTaskLive,
  };

  return (
    <TaskContext.Provider value={value}>
      {children}
    </TaskContext.Provider>
  );
}

export default TaskContext;
