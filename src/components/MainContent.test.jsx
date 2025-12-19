import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import MainContent from './MainContent';

// Mock lucide-react icons - return a component factory that creates proper React components
vi.mock('lucide-react', () => {
  const createIcon = (name) => {
    const Icon = (props) => <span data-testid={`icon-${name.toLowerCase()}`} {...props} />;
    Icon.displayName = name;
    return Icon;
  };
  return {
    ArrowLeft: createIcon('ArrowLeft'),
    FileText: createIcon('FileText'),
    ChevronDown: createIcon('ChevronDown'),
    Check: createIcon('Check'),
    CheckCircle2: createIcon('CheckCircle2'),
    Play: createIcon('Play'),
    Loader2: createIcon('Loader2'),
    Code: createIcon('Code'),
    CheckCircle: createIcon('CheckCircle'),
    X: createIcon('X'),
    AlertCircle: createIcon('AlertCircle'),
    AlertTriangle: createIcon('AlertTriangle'),
    Info: createIcon('Info'),
    Plus: createIcon('Plus'),
    MessageSquare: createIcon('MessageSquare'),
    Trash2: createIcon('Trash2'),
    MoreHorizontal: createIcon('MoreHorizontal'),
    RefreshCw: createIcon('RefreshCw'),
    Edit: createIcon('Edit'),
    Save: createIcon('Save'),
    Home: createIcon('Home'),
    ChevronRight: createIcon('ChevronRight'),
    FolderOpen: createIcon('FolderOpen'),
    Hash: createIcon('Hash'),
    Clock: createIcon('Clock'),
  };
});

// Mock UI components
vi.mock('./ui/button', () => ({
  Button: ({ children, onClick, disabled, className, variant, size, title }) => (
    <button onClick={onClick} disabled={disabled} className={className} title={title}>
      {children}
    </button>
  ),
}));

vi.mock('./ui/badge', () => ({
  Badge: ({ children, className }) => (
    <span className={className}>{children}</span>
  ),
}));

vi.mock('../lib/utils', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

// Mock child components that we don't need to test
vi.mock('./ChatInterface', () => ({
  default: () => <div data-testid="chat-interface">Chat Interface</div>,
}));

vi.mock('./Dashboard', () => ({
  Dashboard: ({ onTaskClick }) => (
    <div data-testid="dashboard">
      <button onClick={() => onTaskClick({ id: 1, title: 'Test Task' })}>Task Click</button>
    </div>
  ),
}));

vi.mock('./Dashboard/BoardView', () => ({
  default: () => <div data-testid="board-view">Board View</div>,
}));

vi.mock('./NewConversationModal', () => ({
  default: ({ isOpen, onClose, onConversationCreated }) =>
    isOpen ? (
      <div data-testid="new-conversation-modal">
        <button onClick={onClose}>Close</button>
        <button onClick={() => onConversationCreated({ id: 1 })}>Create</button>
      </div>
    ) : null,
}));

vi.mock('./ProjectEditPage', () => ({
  default: () => <div data-testid="project-edit-page">Project Edit</div>,
}));

vi.mock('./TaskEditPage', () => ({
  default: () => <div data-testid="task-edit-page">Task Edit</div>,
}));

vi.mock('./ErrorBoundary', () => ({
  default: ({ children }) => <div data-testid="error-boundary">{children}</div>,
}));

// Mock Breadcrumb since it's used in TaskDetailView
vi.mock('./Breadcrumb', () => ({
  default: () => <div data-testid="breadcrumb">Breadcrumb</div>,
}));

// Mock MarkdownEditor
vi.mock('./MarkdownEditor', () => ({
  default: () => <div data-testid="markdown-editor">Markdown Editor</div>,
}));

// Mock ConversationList
vi.mock('./ConversationList', () => ({
  default: () => <div data-testid="conversation-list">Conversation List</div>,
}));

// Create mock functions that can be accessed in tests
const mockAgentRunsCreate = vi.fn();

// Mock the API
vi.mock('../utils/api', () => ({
  api: {
    agentRuns: {
      create: (...args) => mockAgentRunsCreate(...args),
    },
  },
}));

// Mock TaskContext
const mockTaskContext = {
  selectedProject: { id: 1, name: 'Test Project', repo_folder_path: '/test/path' },
  selectedTask: { id: 1, title: 'Test Task', status: 'pending', workflow_complete: false },
  activeConversation: null,
  currentView: 'task-detail',
  conversations: [],
  taskDoc: 'Test documentation',
  agentRuns: [],
  isLoadingConversations: false,
  isLoadingTaskDoc: false,
  isLoadingAgentRuns: false,
  selectProject: vi.fn(),
  selectTask: vi.fn(),
  selectConversation: vi.fn(),
  navigateBack: vi.fn(),
  clearSelection: vi.fn(),
  updateTask: vi.fn(),
  deleteConversation: vi.fn(),
  saveTaskDoc: vi.fn(),
  loadAgentRuns: vi.fn(),
};

vi.mock('../contexts/TaskContext', () => ({
  useTaskContext: () => mockTaskContext,
}));

// Mock ToastContext
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe('MainContent - Agent Run API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskContext.currentView = 'task-detail';
    mockTaskContext.selectedTask = { id: 1, title: 'Test Task', status: 'pending', workflow_complete: false };
    mockTaskContext.agentRuns = [];
    mockAgentRunsCreate.mockReset();
  });

  describe('Successful Agent Run Start', () => {
    it('should call API to start agent run when Run button clicked', async () => {
      mockAgentRunsCreate.mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 1, agent_type: 'implementation', status: 'running' }),
      });

      render(<MainContent />);

      // Find and click the Implementation Run button
      const runButtons = screen.getAllByText('Run');
      expect(runButtons.length).toBeGreaterThan(0);

      await act(async () => {
        fireEvent.click(runButtons[1]); // Implementation is second
      });

      await waitFor(() => {
        expect(mockAgentRunsCreate).toHaveBeenCalledWith(1, 'implementation');
      });
    });

    it('should show success toast on successful agent start', async () => {
      mockAgentRunsCreate.mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 1, agent_type: 'implementation', status: 'running' }),
      });

      render(<MainContent />);

      const runButtons = screen.getAllByText('Run');
      await act(async () => {
        fireEvent.click(runButtons[1]); // Implementation
      });

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('Implementation agent started');
      });
    });

    it('should refresh agent runs list after starting agent', async () => {
      mockAgentRunsCreate.mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 1, agent_type: 'planification', status: 'running' }),
      });

      render(<MainContent />);

      const runButtons = screen.getAllByText('Run');
      await act(async () => {
        fireEvent.click(runButtons[0]); // Planification
      });

      await waitFor(() => {
        expect(mockTaskContext.loadAgentRuns).toHaveBeenCalledWith(1);
      });
    });
  });

  describe('409 Conflict - Agent Already Running', () => {
    it('should show warning toast when agent already running (409)', async () => {
      mockAgentRunsCreate.mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({
          error: 'An agent is already running for this task',
          runningAgent: { id: 1, agent_type: 'implementation', status: 'running' },
        }),
      });

      render(<MainContent />);

      const runButtons = screen.getAllByText('Run');
      await act(async () => {
        fireEvent.click(runButtons[0]); // Try to start planification
      });

      await waitFor(() => {
        expect(mockToast.warning).toHaveBeenCalledWith('implementation agent is already running');
      });
    });

    it('should not refresh agent runs when 409 received', async () => {
      mockAgentRunsCreate.mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({
          error: 'An agent is already running for this task',
          runningAgent: { id: 1, agent_type: 'review', status: 'running' },
        }),
      });

      render(<MainContent />);

      const runButtons = screen.getAllByText('Run');
      await act(async () => {
        fireEvent.click(runButtons[0]);
      });

      await waitFor(() => {
        expect(mockToast.warning).toHaveBeenCalled();
      });

      // loadAgentRuns should NOT have been called for 409
      expect(mockTaskContext.loadAgentRuns).not.toHaveBeenCalled();
    });

    it('should handle 409 with missing runningAgent gracefully', async () => {
      mockAgentRunsCreate.mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({
          error: 'An agent is already running for this task',
          // runningAgent is missing
        }),
      });

      render(<MainContent />);

      const runButtons = screen.getAllByText('Run');
      await act(async () => {
        fireEvent.click(runButtons[0]);
      });

      await waitFor(() => {
        expect(mockToast.warning).toHaveBeenCalledWith('An agent is already running');
      });
    });
  });

  describe('Client Error Handling (4xx)', () => {
    it('should show error toast for 400 Bad Request', async () => {
      mockAgentRunsCreate.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid agent type' }),
      });

      render(<MainContent />);

      const runButtons = screen.getAllByText('Run');
      await act(async () => {
        fireEvent.click(runButtons[0]);
      });

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Invalid agent type');
      });
    });

    it('should show error toast for 404 Not Found', async () => {
      mockAgentRunsCreate.mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Task not found' }),
      });

      render(<MainContent />);

      const runButtons = screen.getAllByText('Run');
      await act(async () => {
        fireEvent.click(runButtons[0]);
      });

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Task not found');
      });
    });

    it('should use default message when error field is empty', async () => {
      mockAgentRunsCreate.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({}),
      });

      render(<MainContent />);

      const runButtons = screen.getAllByText('Run');
      await act(async () => {
        fireEvent.click(runButtons[0]);
      });

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Failed to start planification agent');
      });
    });
  });

  describe('Server Error Handling (5xx)', () => {
    it('should show error toast for 500 Internal Server Error', async () => {
      mockAgentRunsCreate.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Database error' }),
      });

      render(<MainContent />);

      const runButtons = screen.getAllByText('Run');
      await act(async () => {
        fireEvent.click(runButtons[0]);
      });

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Database error');
      });
    });

    it('should handle JSON parse error in server response', async () => {
      mockAgentRunsCreate.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      render(<MainContent />);

      const runButtons = screen.getAllByText('Run');
      await act(async () => {
        fireEvent.click(runButtons[0]);
      });

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Server error starting planification agent');
      });
    });
  });

  describe('Network Error Handling', () => {
    it('should show error toast when network request fails', async () => {
      mockAgentRunsCreate.mockRejectedValue(new Error('Network error'));

      render(<MainContent />);

      const runButtons = screen.getAllByText('Run');
      await act(async () => {
        fireEvent.click(runButtons[0]);
      });

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Failed to start agent: Network error');
      });
    });

    it('should handle timeout errors', async () => {
      mockAgentRunsCreate.mockRejectedValue(new Error('Request timeout'));

      render(<MainContent />);

      const runButtons = screen.getAllByText('Run');
      await act(async () => {
        fireEvent.click(runButtons[0]);
      });

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Failed to start agent: Request timeout');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should not call API when selectedTask is null', async () => {
      mockTaskContext.selectedTask = null;

      render(<MainContent />);

      // With no task, the TaskDetailView should still render but API should not be called
      // This tests the guard in handleRunAgent
      expect(mockAgentRunsCreate).not.toHaveBeenCalled();
    });

    it('should call API with correct agent type for all three agents', async () => {
      mockAgentRunsCreate.mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 1, status: 'running' }),
      });

      render(<MainContent />);

      const runButtons = screen.getAllByText('Run');

      // Test planification
      await act(async () => {
        fireEvent.click(runButtons[0]);
      });
      expect(mockAgentRunsCreate).toHaveBeenLastCalledWith(1, 'planification');

      // Test implementation
      await act(async () => {
        fireEvent.click(runButtons[1]);
      });
      expect(mockAgentRunsCreate).toHaveBeenLastCalledWith(1, 'implementation');

      // Test review
      await act(async () => {
        fireEvent.click(runButtons[2]);
      });
      expect(mockAgentRunsCreate).toHaveBeenLastCalledWith(1, 'review');
    });

    it('should capitalize agent type in success toast', async () => {
      mockAgentRunsCreate.mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 1, agent_type: 'planification', status: 'running' }),
      });

      render(<MainContent />);

      const runButtons = screen.getAllByText('Run');
      await act(async () => {
        fireEvent.click(runButtons[0]);
      });

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('Planification agent started');
      });
    });
  });
});

describe('MainContent - View States', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render Dashboard when currentView is empty', () => {
    mockTaskContext.currentView = 'empty';
    render(<MainContent />);
    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
  });

  it('should render BoardView when currentView is board', () => {
    mockTaskContext.currentView = 'board';
    render(<MainContent />);
    expect(screen.getByTestId('board-view')).toBeInTheDocument();
  });

  it('should render TaskDetailView when currentView is task-detail', () => {
    mockTaskContext.currentView = 'task-detail';
    render(<MainContent />);
    expect(screen.getByText('Planification')).toBeInTheDocument();
  });

  it('should render ChatInterface when currentView is chat', () => {
    mockTaskContext.currentView = 'chat';
    mockTaskContext.activeConversation = { id: 1 };
    render(<MainContent />);
    expect(screen.getByTestId('chat-interface')).toBeInTheDocument();
  });
});
