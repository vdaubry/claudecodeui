import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TaskDetailView from './TaskDetailView';

// Mock child components
vi.mock('./ui/button', () => ({
  Button: ({ children, onClick, variant, size, className, disabled }) => (
    <button onClick={onClick} className={className} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('./Breadcrumb', () => ({
  default: ({ project, task, onProjectClick, onHomeClick }) => (
    <div data-testid="breadcrumb">
      <button data-testid="home-click" onClick={onHomeClick}>Home</button>
      <button data-testid="project-click" onClick={() => onProjectClick?.(project)}>
        {project?.name}
      </button>
      <span>{task?.title}</span>
    </div>
  ),
}));

vi.mock('./MarkdownEditor', () => ({
  default: ({ content, onSave, isLoading, placeholder }) => (
    <div data-testid="markdown-editor">
      <span data-testid="doc-content">{content || placeholder}</span>
      {isLoading && <span data-testid="doc-loading">Loading...</span>}
      <button data-testid="save-doc" onClick={() => onSave?.('Updated docs')}>Save</button>
    </div>
  ),
}));

vi.mock('./ConversationList', () => ({
  default: ({ conversations, isLoading, onNewConversation, onResumeConversation, onDeleteConversation, activeConversationId }) => (
    <div data-testid="conversation-list">
      {isLoading && <span data-testid="conv-loading">Loading...</span>}
      <span data-testid="conv-count">{conversations?.length || 0}</span>
      <button data-testid="new-conv" onClick={onNewConversation}>New</button>
      {conversations?.map((c) => (
        <div key={c.id} data-testid={`conv-${c.id}`}>
          <button data-testid={`resume-${c.id}`} onClick={() => onResumeConversation(c)}>
            Resume
          </button>
          <button data-testid={`delete-${c.id}`} onClick={() => onDeleteConversation(c.id)}>
            Delete
          </button>
          {activeConversationId === c.id && <span data-testid="active-indicator">Active</span>}
        </div>
      ))}
    </div>
  ),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  FileText: () => <span data-testid="icon-file-text" />,
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
  ChevronDown: () => <span data-testid="icon-chevron-down" />,
  Check: () => <span data-testid="icon-check" />,
}));

describe('TaskDetailView Component', () => {
  const mockProject = { id: 'p1', name: 'Test Project' };
  const mockTask = { id: 't1', title: 'Test Task', status: 'pending' };
  const mockConversations = [
    { id: 'c1', title: 'Conversation 1' },
    { id: 'c2', title: 'Conversation 2' },
  ];

  const defaultProps = {
    project: mockProject,
    task: mockTask,
    taskDoc: '# Task Documentation',
    conversations: mockConversations,
    activeConversationId: null,
    isLoadingDoc: false,
    isLoadingConversations: false,
    onBack: vi.fn(),
    onProjectClick: vi.fn(),
    onHomeClick: vi.fn(),
    onSaveTaskDoc: vi.fn(),
    onStatusChange: vi.fn(),
    onNewConversation: vi.fn(),
    onResumeConversation: vi.fn(),
    onDeleteConversation: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should return null when task is null', () => {
      const { container } = render(<TaskDetailView {...defaultProps} task={null} />);
      expect(container.firstChild).toBeNull();
    });

    it('should render task title', () => {
      render(<TaskDetailView {...defaultProps} />);
      // Title appears in both breadcrumb and h1, verify at least one
      expect(screen.getAllByText('Test Task').length).toBeGreaterThanOrEqual(1);
    });

    it('should render fallback title when task.title is missing', () => {
      render(<TaskDetailView {...defaultProps} task={{ id: 't1', status: 'pending' }} />);
      expect(screen.getByText('Task t1')).toBeInTheDocument();
    });

    it('should render project name in subtitle', () => {
      render(<TaskDetailView {...defaultProps} />);
      expect(screen.getByText(/in Test Project/)).toBeInTheDocument();
    });

    it('should render breadcrumb', () => {
      render(<TaskDetailView {...defaultProps} />);
      expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
    });

    it('should render markdown editor with task doc', () => {
      render(<TaskDetailView {...defaultProps} />);
      expect(screen.getByTestId('doc-content')).toHaveTextContent('# Task Documentation');
    });

    it('should render conversation list', () => {
      render(<TaskDetailView {...defaultProps} />);
      expect(screen.getByTestId('conversation-list')).toBeInTheDocument();
      expect(screen.getByTestId('conv-count')).toHaveTextContent('2');
    });
  });

  describe('Status Display', () => {
    it('should show Pending status for pending task', () => {
      render(<TaskDetailView {...defaultProps} task={{ ...mockTask, status: 'pending' }} />);
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('should show In Progress status for in_progress task', () => {
      render(<TaskDetailView {...defaultProps} task={{ ...mockTask, status: 'in_progress' }} />);
      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });

    it('should show Completed status for completed task', () => {
      render(<TaskDetailView {...defaultProps} task={{ ...mockTask, status: 'completed' }} />);
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('should default to Pending for unknown status', () => {
      render(<TaskDetailView {...defaultProps} task={{ ...mockTask, status: 'unknown' }} />);
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });
  });

  describe('Status Dropdown', () => {
    it('should open dropdown when status button is clicked', () => {
      render(<TaskDetailView {...defaultProps} />);

      // Dropdown should not be visible initially
      expect(screen.queryAllByText('In Progress').length).toBe(0);

      // Click the status button
      fireEvent.click(screen.getByText('Pending'));

      // Now dropdown should show all options
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('should close dropdown when clicking outside', () => {
      render(<TaskDetailView {...defaultProps} />);

      // Open dropdown
      fireEvent.click(screen.getByText('Pending'));
      expect(screen.getByText('In Progress')).toBeInTheDocument();

      // Click overlay (fixed inset-0 div)
      const overlay = document.querySelector('.fixed.inset-0');
      fireEvent.click(overlay);

      // Dropdown should close (In Progress no longer visible in dropdown)
      expect(screen.queryAllByText('In Progress').length).toBe(0);
    });

    it('should call onStatusChange when new status is selected', async () => {
      const onStatusChange = vi.fn().mockResolvedValue(undefined);
      render(<TaskDetailView {...defaultProps} onStatusChange={onStatusChange} />);

      // Open dropdown
      fireEvent.click(screen.getByText('Pending'));

      // Select new status
      fireEvent.click(screen.getByText('In Progress'));

      await waitFor(() => {
        expect(onStatusChange).toHaveBeenCalledWith('t1', 'in_progress');
      });
    });

    it('should not call onStatusChange when same status is selected', async () => {
      const onStatusChange = vi.fn();
      render(<TaskDetailView {...defaultProps} onStatusChange={onStatusChange} />);

      // Open dropdown
      fireEvent.click(screen.getByText('Pending'));

      // Click the same status (Pending in dropdown)
      const pendingOptions = screen.getAllByText('Pending');
      fireEvent.click(pendingOptions[pendingOptions.length - 1]); // Click the one in dropdown

      expect(onStatusChange).not.toHaveBeenCalled();
    });
  });

  describe('Navigation', () => {
    it('should call onBack when back button is clicked', () => {
      render(<TaskDetailView {...defaultProps} />);

      const backButton = screen.getByTestId('icon-arrow-left').closest('button');
      fireEvent.click(backButton);

      expect(defaultProps.onBack).toHaveBeenCalled();
    });

    it('should call onHomeClick from breadcrumb', () => {
      render(<TaskDetailView {...defaultProps} />);

      fireEvent.click(screen.getByTestId('home-click'));

      expect(defaultProps.onHomeClick).toHaveBeenCalled();
    });

    it('should call onProjectClick from breadcrumb', () => {
      render(<TaskDetailView {...defaultProps} />);

      fireEvent.click(screen.getByTestId('project-click'));

      expect(defaultProps.onProjectClick).toHaveBeenCalled();
    });
  });

  describe('Conversation Actions', () => {
    it('should call onNewConversation', () => {
      render(<TaskDetailView {...defaultProps} />);

      fireEvent.click(screen.getByTestId('new-conv'));

      expect(defaultProps.onNewConversation).toHaveBeenCalled();
    });

    it('should call onResumeConversation with conversation', () => {
      render(<TaskDetailView {...defaultProps} />);

      fireEvent.click(screen.getByTestId('resume-c1'));

      expect(defaultProps.onResumeConversation).toHaveBeenCalledWith(mockConversations[0]);
    });

    it('should call onDeleteConversation with id', () => {
      render(<TaskDetailView {...defaultProps} />);

      fireEvent.click(screen.getByTestId('delete-c2'));

      expect(defaultProps.onDeleteConversation).toHaveBeenCalledWith('c2');
    });
  });

  describe('Document Actions', () => {
    it('should call onSaveTaskDoc when save is clicked', () => {
      render(<TaskDetailView {...defaultProps} />);

      fireEvent.click(screen.getByTestId('save-doc'));

      expect(defaultProps.onSaveTaskDoc).toHaveBeenCalledWith('Updated docs');
    });
  });

  describe('Loading States', () => {
    it('should pass isLoadingDoc to MarkdownEditor', () => {
      render(<TaskDetailView {...defaultProps} isLoadingDoc={true} />);

      expect(screen.getByTestId('doc-loading')).toBeInTheDocument();
    });

    it('should pass isLoadingConversations to ConversationList', () => {
      render(<TaskDetailView {...defaultProps} isLoadingConversations={true} />);

      expect(screen.getByTestId('conv-loading')).toBeInTheDocument();
    });
  });

  describe('Active Conversation', () => {
    it('should highlight active conversation', () => {
      render(<TaskDetailView {...defaultProps} activeConversationId="c1" />);

      expect(screen.getByTestId('conv-c1').querySelector('[data-testid="active-indicator"]')).toBeInTheDocument();
    });
  });

  describe('Custom ClassName', () => {
    it('should apply custom className', () => {
      const { container } = render(<TaskDetailView {...defaultProps} className="custom-class" />);

      expect(container.firstChild.className).toContain('custom-class');
    });
  });
});
