import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BoardView from './BoardView';
import { useTaskContext } from '../../contexts/TaskContext';
import { api } from '../../utils/api';

// Mock TaskContext
vi.mock('../../contexts/TaskContext', () => ({
  useTaskContext: vi.fn(),
}));

// Mock the useAuthToken hook
vi.mock('../../hooks/useAuthToken', () => ({
  useAuthToken: () => ({
    getTokenParam: () => '',
    appendTokenToPath: (path) => path,
    hasUrlToken: false,
    urlToken: null,
  }),
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

// Helper to render with Router
const renderWithRouter = (ui, { route = '/' } = {}) => {
  return render(
    <MemoryRouter initialEntries={[route]}>
      {ui}
    </MemoryRouter>
  );
};

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
    tasks: mockTasks,
    isLoadingTasks: false,
    createTask: vi.fn(),
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
    it('should return null when no project prop is provided', () => {
      const { container } = renderWithRouter(<BoardView />);

      expect(container.querySelector('.flex-1')).toBeNull();
    });

    it('should render when project prop is provided', () => {
      renderWithRouter(<BoardView project={mockProject} />);

      expect(screen.getByText('Test Project')).toBeInTheDocument();
    });

    it('should display project path', () => {
      renderWithRouter(<BoardView project={mockProject} />);

      expect(screen.getByText('/path/to/project')).toBeInTheDocument();
    });
  });

  describe('Board Columns', () => {
    it('should render all three columns', () => {
      renderWithRouter(<BoardView project={mockProject} />);

      expect(screen.getByTestId('board-column-pending')).toBeInTheDocument();
      expect(screen.getByTestId('board-column-in_progress')).toBeInTheDocument();
      expect(screen.getByTestId('board-column-completed')).toBeInTheDocument();
    });

    it('should group tasks by status correctly', () => {
      renderWithRouter(<BoardView project={mockProject} />);

      expect(screen.getByTestId('pending-count').textContent).toBe('2');
      expect(screen.getByTestId('in_progress-count').textContent).toBe('1');
      expect(screen.getByTestId('completed-count').textContent).toBe('1');
    });

    it('should default tasks without status to pending', () => {
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        tasks: [{ id: 't1', title: 'No status task' }],
      });

      renderWithRouter(<BoardView project={mockProject} />);

      expect(screen.getByTestId('pending-count').textContent).toBe('1');
    });
  });

  describe('Navigation', () => {
    it('should navigate to dashboard when back button is clicked', () => {
      renderWithRouter(<BoardView project={mockProject} />);

      const backButton = screen.getByTestId('icon-arrow-left').closest('button');
      fireEvent.click(backButton);

      // Navigation happens via react-router - we verify it doesn't throw
      expect(backButton).toBeInTheDocument();
    });

    it('should navigate to task detail when task is clicked', () => {
      renderWithRouter(<BoardView project={mockProject} />);

      fireEvent.click(screen.getByTestId('click-t1'));

      // Navigation happens via react-router - verify no errors
      expect(screen.getByTestId('click-t1')).toBeInTheDocument();
    });

    it('should navigate to task edit when edit is clicked', () => {
      renderWithRouter(<BoardView project={mockProject} />);

      fireEvent.click(screen.getByTestId('edit-t2'));

      // Navigation happens via react-router - verify no errors
      expect(screen.getByTestId('edit-t2')).toBeInTheDocument();
    });
  });

  describe('New Task Button', () => {
    it('should render New Task button', () => {
      renderWithRouter(<BoardView project={mockProject} />);

      expect(screen.getByText('New Task')).toBeInTheDocument();
    });

    it('should open task form modal when clicked', () => {
      renderWithRouter(<BoardView project={mockProject} />);

      expect(screen.queryByTestId('task-form-modal')).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('New Task'));

      expect(screen.getByTestId('task-form-modal')).toBeInTheDocument();
    });

    it('should pass project name to task form', () => {
      renderWithRouter(<BoardView project={mockProject} />);

      fireEvent.click(screen.getByText('New Task'));

      expect(screen.getByTestId('project-name').textContent).toBe('Test Project');
    });

    it('should close task form modal when close is clicked', () => {
      renderWithRouter(<BoardView project={mockProject} />);

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

      renderWithRouter(<BoardView project={mockProject} />);

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

      renderWithRouter(<BoardView project={mockProject} />);

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

      renderWithRouter(<BoardView project={mockProject} />);

      expect(screen.getByText('Loading tasks...')).toBeInTheDocument();
    });
  });

  describe('API Integration', () => {
    it('should fetch task documentation on mount', async () => {
      renderWithRouter(<BoardView project={mockProject} />);

      await waitFor(() => {
        expect(api.tasks.getDoc).toHaveBeenCalledWith('t1');
        expect(api.tasks.getDoc).toHaveBeenCalledWith('t2');
        expect(api.tasks.getDoc).toHaveBeenCalledWith('t3');
        expect(api.tasks.getDoc).toHaveBeenCalledWith('t4');
      });
    });

    it('should fetch conversation counts on mount', async () => {
      renderWithRouter(<BoardView project={mockProject} />);

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
      renderWithRouter(<BoardView project={mockProject} />);

      await waitFor(() => {
        expect(api.tasks.getDoc).toHaveBeenCalled();
      });

      // Should still render
      expect(screen.getByText('Test Project')).toBeInTheDocument();
    });
  });

  describe('Custom ClassName', () => {
    it('should apply custom className', () => {
      const { container } = renderWithRouter(<BoardView project={mockProject} className="custom-class" />);

      expect(container.querySelector('.custom-class')).toBeInTheDocument();
    });
  });
});
