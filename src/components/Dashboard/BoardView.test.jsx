import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BoardView from './BoardView';
import { useTaskContext } from '../../contexts/TaskContext';
import { api } from '../../utils/api';

// Mock TaskContext
vi.mock('../../contexts/TaskContext', () => ({
  useTaskContext: vi.fn(),
}));

// Mock API
vi.mock('../../utils/api', () => ({
  api: {
    tasks: {
      getDoc: vi.fn(),
    },
    conversations: {
      list: vi.fn(),
    },
  },
}));

// Mock BoardColumn component
vi.mock('./BoardColumn', () => ({
  default: ({ status, tasks, onTaskClick, onTaskEdit }) => (
    <div data-testid={`board-column-${status}`}>
      <span data-testid={`${status}-count`}>{tasks.length}</span>
      {tasks.map((task) => (
        <div key={task.id} data-testid={`task-${task.id}`}>
          <button data-testid={`click-${task.id}`} onClick={() => onTaskClick(task)}>Click</button>
          <button data-testid={`edit-${task.id}`} onClick={() => onTaskEdit(task)}>Edit</button>
        </div>
      ))}
    </div>
  ),
}));

// Mock TaskForm component
vi.mock('../TaskForm', () => ({
  default: ({ isOpen, onClose, onSubmit, projectName, isSubmitting }) => (
    isOpen ? (
      <div data-testid="task-form-modal">
        <span data-testid="project-name">{projectName}</span>
        <button data-testid="close-modal" onClick={onClose}>Close</button>
        <button
          data-testid="submit-task"
          onClick={() => onSubmit({ title: 'New Task', documentation: 'Docs' })}
        >
          Submit
        </button>
      </div>
    ) : null
  ),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
  Plus: () => <span data-testid="icon-plus" />,
  Columns: () => <span data-testid="icon-columns" />,
}));

describe('BoardView Component', () => {
  const mockProject = {
    id: 'p1',
    name: 'Test Project',
    repo_folder_path: '/path/to/project',
  };

  const mockTasks = [
    { id: 't1', title: 'Task 1', status: 'pending' },
    { id: 't2', title: 'Task 2', status: 'in_progress' },
    { id: 't3', title: 'Task 3', status: 'completed' },
    { id: 't4', title: 'Task 4', status: 'pending' },
  ];

  const defaultContextValue = {
    selectedProject: mockProject,
    tasks: mockTasks,
    isLoadingTasks: false,
    createTask: vi.fn(),
    selectTask: vi.fn(),
    clearSelection: vi.fn(),
    navigateToTaskEdit: vi.fn(),
    isTaskLive: vi.fn(() => false),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useTaskContext.mockReturnValue(defaultContextValue);

    // Default API mock responses
    api.tasks.getDoc.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: 'Doc content' }),
    });
    api.conversations.list.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ conversations: [] }),
    });
  });

  describe('Rendering', () => {
    it('should return null when no project is selected', () => {
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        selectedProject: null,
      });

      const { container } = render(<BoardView />);

      expect(container.firstChild).toBeNull();
    });

    it('should render when project is selected', () => {
      render(<BoardView />);

      expect(screen.getByText('Test Project')).toBeInTheDocument();
    });

    it('should display project path', () => {
      render(<BoardView />);

      expect(screen.getByText('/path/to/project')).toBeInTheDocument();
    });
  });

  describe('Board Columns', () => {
    it('should render all three columns', () => {
      render(<BoardView />);

      expect(screen.getByTestId('board-column-pending')).toBeInTheDocument();
      expect(screen.getByTestId('board-column-in_progress')).toBeInTheDocument();
      expect(screen.getByTestId('board-column-completed')).toBeInTheDocument();
    });

    it('should group tasks by status correctly', () => {
      render(<BoardView />);

      expect(screen.getByTestId('pending-count').textContent).toBe('2');
      expect(screen.getByTestId('in_progress-count').textContent).toBe('1');
      expect(screen.getByTestId('completed-count').textContent).toBe('1');
    });

    it('should default tasks without status to pending', () => {
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        tasks: [{ id: 't1', title: 'No status task' }],
      });

      render(<BoardView />);

      expect(screen.getByTestId('pending-count').textContent).toBe('1');
    });
  });

  describe('Navigation', () => {
    it('should call clearSelection when back button is clicked', () => {
      render(<BoardView />);

      const backButton = screen.getByTestId('icon-arrow-left').closest('button');
      fireEvent.click(backButton);

      expect(defaultContextValue.clearSelection).toHaveBeenCalled();
    });

    it('should call selectTask when task is clicked', () => {
      render(<BoardView />);

      fireEvent.click(screen.getByTestId('click-t1'));

      expect(defaultContextValue.selectTask).toHaveBeenCalledWith(mockTasks[0]);
    });

    it('should call navigateToTaskEdit when edit is clicked', () => {
      render(<BoardView />);

      fireEvent.click(screen.getByTestId('edit-t2'));

      expect(defaultContextValue.navigateToTaskEdit).toHaveBeenCalledWith(mockTasks[1]);
    });
  });

  describe('New Task Button', () => {
    it('should render New Task button', () => {
      render(<BoardView />);

      expect(screen.getByText('New Task')).toBeInTheDocument();
    });

    it('should open task form modal when clicked', () => {
      render(<BoardView />);

      expect(screen.queryByTestId('task-form-modal')).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('New Task'));

      expect(screen.getByTestId('task-form-modal')).toBeInTheDocument();
    });

    it('should pass project name to task form', () => {
      render(<BoardView />);

      fireEvent.click(screen.getByText('New Task'));

      expect(screen.getByTestId('project-name').textContent).toBe('Test Project');
    });

    it('should close task form modal when close is clicked', () => {
      render(<BoardView />);

      fireEvent.click(screen.getByText('New Task'));
      expect(screen.getByTestId('task-form-modal')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('close-modal'));
      expect(screen.queryByTestId('task-form-modal')).not.toBeInTheDocument();
    });
  });

  describe('Task Creation', () => {
    it('should call createTask with correct parameters', async () => {
      const createTask = vi.fn().mockResolvedValue({ success: true, task: {} });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        createTask,
      });

      render(<BoardView />);

      fireEvent.click(screen.getByText('New Task'));
      fireEvent.click(screen.getByTestId('submit-task'));

      await waitFor(() => {
        expect(createTask).toHaveBeenCalledWith('p1', 'New Task', 'Docs');
      });
    });

    it('should close modal on successful task creation', async () => {
      const createTask = vi.fn().mockResolvedValue({ success: true, task: {} });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        createTask,
      });

      render(<BoardView />);

      fireEvent.click(screen.getByText('New Task'));
      fireEvent.click(screen.getByTestId('submit-task'));

      await waitFor(() => {
        expect(screen.queryByTestId('task-form-modal')).not.toBeInTheDocument();
      });
    });
  });

  describe('Loading States', () => {
    it('should show loading overlay when tasks are loading', () => {
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        isLoadingTasks: true,
      });

      render(<BoardView />);

      expect(screen.getByText('Loading tasks...')).toBeInTheDocument();
    });
  });

  describe('API Integration', () => {
    it('should fetch task documentation on mount', async () => {
      render(<BoardView />);

      await waitFor(() => {
        expect(api.tasks.getDoc).toHaveBeenCalledWith('t1');
        expect(api.tasks.getDoc).toHaveBeenCalledWith('t2');
        expect(api.tasks.getDoc).toHaveBeenCalledWith('t3');
        expect(api.tasks.getDoc).toHaveBeenCalledWith('t4');
      });
    });

    it('should fetch conversation counts on mount', async () => {
      render(<BoardView />);

      await waitFor(() => {
        expect(api.conversations.list).toHaveBeenCalledWith('t1');
        expect(api.conversations.list).toHaveBeenCalledWith('t2');
        expect(api.conversations.list).toHaveBeenCalledWith('t3');
        expect(api.conversations.list).toHaveBeenCalledWith('t4');
      });
    });

    it('should handle API errors gracefully', async () => {
      api.tasks.getDoc.mockResolvedValue({ ok: false });
      api.conversations.list.mockResolvedValue({ ok: false });

      // Should not throw
      render(<BoardView />);

      await waitFor(() => {
        expect(api.tasks.getDoc).toHaveBeenCalled();
      });

      // Should still render
      expect(screen.getByText('Test Project')).toBeInTheDocument();
    });
  });

  describe('Custom ClassName', () => {
    it('should apply custom className', () => {
      const { container } = render(<BoardView className="custom-class" />);

      expect(container.firstChild.className).toContain('custom-class');
    });
  });
});
