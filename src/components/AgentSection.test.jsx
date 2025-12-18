import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AgentSection from './AgentSection';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Play: () => <span data-testid="icon-play" />,
  Check: () => <span data-testid="icon-check" />,
  Loader2: () => <span data-testid="icon-loader" />,
  FileText: () => <span data-testid="icon-file-text" />,
  Code: () => <span data-testid="icon-code" />,
  CheckCircle: () => <span data-testid="icon-check-circle" />,
}));

// Mock UI components
vi.mock('./ui/button', () => ({
  Button: ({ children, onClick, disabled, className }) => (
    <button onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

vi.mock('../lib/utils', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

describe('AgentSection', () => {
  const defaultProps = {
    agentRuns: [],
    isLoading: false,
    onRunAgent: vi.fn(),
    onResumeAgent: vi.fn(),
    taskId: 'task-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Agent Types Rendering', () => {
    it('should render all three agent types', () => {
      render(<AgentSection {...defaultProps} />);

      expect(screen.getByText('Planification')).toBeInTheDocument();
      expect(screen.getByText('Implementation')).toBeInTheDocument();
      expect(screen.getByText('Review')).toBeInTheDocument();
    });

    it('should show correct descriptions for each agent', () => {
      render(<AgentSection {...defaultProps} />);

      expect(screen.getByText('Create a detailed implementation plan')).toBeInTheDocument();
      expect(screen.getByText('Implement the next phase from the plan')).toBeInTheDocument();
      expect(screen.getByText('Review implementation and run tests')).toBeInTheDocument();
    });

    it('should render icons for each agent type', () => {
      render(<AgentSection {...defaultProps} />);

      expect(screen.getByTestId('icon-file-text')).toBeInTheDocument();
      expect(screen.getByTestId('icon-code')).toBeInTheDocument();
      expect(screen.getByTestId('icon-check-circle')).toBeInTheDocument();
    });
  });

  describe('Running Planification Agent', () => {
    it('should call onRunAgent with planification type when Run button clicked', async () => {
      const onRunAgent = vi.fn();
      render(<AgentSection {...defaultProps} onRunAgent={onRunAgent} />);

      const runButtons = screen.getAllByText('Run');
      fireEvent.click(runButtons[0]); // First Run button is for Planification

      await waitFor(() => {
        expect(onRunAgent).toHaveBeenCalledWith(
          'planification',
          expect.stringContaining('@agent-Plan')
        );
      });
    });

    it('should include task doc path in planification message', async () => {
      const onRunAgent = vi.fn();
      render(<AgentSection {...defaultProps} onRunAgent={onRunAgent} taskId="test-task-id" />);

      const runButtons = screen.getAllByText('Run');
      fireEvent.click(runButtons[0]);

      await waitFor(() => {
        expect(onRunAgent).toHaveBeenCalledWith(
          'planification',
          expect.stringContaining('.claude-ui/tasks/task-test-task-id.md')
        );
      });
    });
  });

  describe('Running Implementation Agent', () => {
    it('should call onRunAgent with implementation type when Run button clicked', async () => {
      const onRunAgent = vi.fn();
      render(<AgentSection {...defaultProps} onRunAgent={onRunAgent} />);

      const runButtons = screen.getAllByText('Run');
      fireEvent.click(runButtons[1]); // Second Run button is for Implementation

      await waitFor(() => {
        expect(onRunAgent).toHaveBeenCalledWith(
          'implementation',
          expect.stringContaining('@agent-Implement')
        );
      });
    });

    it('should include task doc path in implementation message', async () => {
      const onRunAgent = vi.fn();
      render(<AgentSection {...defaultProps} onRunAgent={onRunAgent} taskId="my-task" />);

      const runButtons = screen.getAllByText('Run');
      fireEvent.click(runButtons[1]);

      await waitFor(() => {
        expect(onRunAgent).toHaveBeenCalledWith(
          'implementation',
          expect.stringContaining('.claude-ui/tasks/task-my-task.md')
        );
      });
    });

    it('should include no-questions instruction in implementation message', async () => {
      const onRunAgent = vi.fn();
      render(<AgentSection {...defaultProps} onRunAgent={onRunAgent} />);

      const runButtons = screen.getAllByText('Run');
      fireEvent.click(runButtons[1]);

      await waitFor(() => {
        expect(onRunAgent).toHaveBeenCalledWith(
          'implementation',
          expect.stringContaining('Do NOT ask any questions')
        );
      });
    });

    it('should include Review Findings check in implementation message', async () => {
      const onRunAgent = vi.fn();
      render(<AgentSection {...defaultProps} onRunAgent={onRunAgent} />);

      const runButtons = screen.getAllByText('Run');
      fireEvent.click(runButtons[1]);

      await waitFor(() => {
        expect(onRunAgent).toHaveBeenCalledWith(
          'implementation',
          expect.stringContaining('Review Findings')
        );
      });
    });
  });

  describe('Running Review Agent', () => {
    it('should call onRunAgent with review type when Run button clicked', async () => {
      const onRunAgent = vi.fn();
      render(<AgentSection {...defaultProps} onRunAgent={onRunAgent} />);

      const runButtons = screen.getAllByText('Run');
      fireEvent.click(runButtons[2]); // Third Run button is for Review

      await waitFor(() => {
        expect(onRunAgent).toHaveBeenCalledWith(
          'review',
          expect.stringContaining('@agent-Review')
        );
      });
    });

    it('should include task doc path in review message', async () => {
      const onRunAgent = vi.fn();
      render(<AgentSection {...defaultProps} onRunAgent={onRunAgent} taskId="review-task" />);

      const runButtons = screen.getAllByText('Run');
      fireEvent.click(runButtons[2]);

      await waitFor(() => {
        expect(onRunAgent).toHaveBeenCalledWith(
          'review',
          expect.stringContaining('.claude-ui/tasks/task-review-task.md')
        );
      });
    });

    it('should include unit test instruction in review message', async () => {
      const onRunAgent = vi.fn();
      render(<AgentSection {...defaultProps} onRunAgent={onRunAgent} />);

      const runButtons = screen.getAllByText('Run');
      fireEvent.click(runButtons[2]);

      await waitFor(() => {
        expect(onRunAgent).toHaveBeenCalledWith(
          'review',
          expect.stringContaining('npm test')
        );
      });
    });

    it('should include Playwright MCP instruction in review message', async () => {
      const onRunAgent = vi.fn();
      render(<AgentSection {...defaultProps} onRunAgent={onRunAgent} />);

      const runButtons = screen.getAllByText('Run');
      fireEvent.click(runButtons[2]);

      await waitFor(() => {
        expect(onRunAgent).toHaveBeenCalledWith(
          'review',
          expect.stringContaining('Playwright MCP')
        );
      });
    });

    it('should include no-fix constraint in review message', async () => {
      const onRunAgent = vi.fn();
      render(<AgentSection {...defaultProps} onRunAgent={onRunAgent} />);

      const runButtons = screen.getAllByText('Run');
      fireEvent.click(runButtons[2]);

      await waitFor(() => {
        expect(onRunAgent).toHaveBeenCalledWith(
          'review',
          expect.stringContaining('Do NOT fix any code')
        );
      });
    });
  });

  describe('Agent Status Display', () => {
    it('should show Completed status for completed implementation agent', () => {
      render(
        <AgentSection
          {...defaultProps}
          agentRuns={[{ id: 1, agent_type: 'implementation', status: 'completed' }]}
        />
      );

      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('should show In Progress status for running implementation agent', () => {
      render(
        <AgentSection
          {...defaultProps}
          agentRuns={[{ id: 1, agent_type: 'implementation', status: 'running' }]}
        />
      );

      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });

    it('should show In Progress status for pending implementation agent', () => {
      render(
        <AgentSection
          {...defaultProps}
          agentRuns={[{ id: 1, agent_type: 'implementation', status: 'pending' }]}
        />
      );

      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });

    it('should show Completed status for completed planification agent', () => {
      render(
        <AgentSection
          {...defaultProps}
          agentRuns={[{ id: 1, agent_type: 'planification', status: 'completed' }]}
        />
      );

      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('should show Completed status for completed review agent', () => {
      render(
        <AgentSection
          {...defaultProps}
          agentRuns={[{ id: 1, agent_type: 'review', status: 'completed' }]}
        />
      );

      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('should show In Progress status for running review agent', () => {
      render(
        <AgentSection
          {...defaultProps}
          agentRuns={[{ id: 1, agent_type: 'review', status: 'running' }]}
        />
      );

      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });
  });

  describe('Resume Agent', () => {
    it('should call onResumeAgent when clicking In Progress button', () => {
      const onResumeAgent = vi.fn();
      render(
        <AgentSection
          {...defaultProps}
          onResumeAgent={onResumeAgent}
          agentRuns={[{ id: 1, agent_type: 'implementation', status: 'running', conversation_id: 'conv-123' }]}
        />
      );

      fireEvent.click(screen.getByText('In Progress'));

      expect(onResumeAgent).toHaveBeenCalledWith('conv-123');
    });

    it('should call onResumeAgent when clicking Completed button', () => {
      const onResumeAgent = vi.fn();
      render(
        <AgentSection
          {...defaultProps}
          onResumeAgent={onResumeAgent}
          agentRuns={[{ id: 1, agent_type: 'implementation', status: 'completed', conversation_id: 'conv-456' }]}
        />
      );

      fireEvent.click(screen.getByText('Completed'));

      expect(onResumeAgent).toHaveBeenCalledWith('conv-456');
    });
  });

  describe('Loading State', () => {
    it('should show loading skeleton when isLoading is true', () => {
      render(<AgentSection {...defaultProps} isLoading={true} />);

      expect(screen.getByText('Agents')).toBeInTheDocument();
      // Should show loading skeleton instead of agent list
      expect(screen.queryByText('Planification')).not.toBeInTheDocument();
      expect(screen.queryByText('Implementation')).not.toBeInTheDocument();
      expect(screen.queryByText('Review')).not.toBeInTheDocument();
    });
  });

  describe('Button Disabled State', () => {
    it('should disable button while agent is starting', async () => {
      const onRunAgent = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)));
      render(<AgentSection {...defaultProps} onRunAgent={onRunAgent} />);

      const runButtons = screen.getAllByText('Run');
      fireEvent.click(runButtons[0]);

      // Button should show Starting... state
      await waitFor(() => {
        expect(screen.getByText('Starting...')).toBeInTheDocument();
      });
    });
  });
});
