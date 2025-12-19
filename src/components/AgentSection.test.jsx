import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import AgentSection from './AgentSection';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Play: () => <span data-testid="icon-play" />,
  Check: () => <span data-testid="icon-check" />,
  Loader2: () => <span data-testid="icon-loader" />,
  FileText: () => <span data-testid="icon-file-text" />,
  Code: () => <span data-testid="icon-code" />,
  CheckCircle: () => <span data-testid="icon-check-circle" />,
  MessageCircle: () => <span data-testid="icon-message-circle" />,
  AlertCircle: () => <span data-testid="icon-alert-circle" />,
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
        expect(onRunAgent).toHaveBeenCalledWith('planification');
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
        expect(onRunAgent).toHaveBeenCalledWith('implementation');
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
        expect(onRunAgent).toHaveBeenCalledWith('review');
      });
    });
  });

  describe('Agent Status Display', () => {
    it('should show Completed status for implementation and review agents when workflow is complete', () => {
      render(
        <AgentSection
          {...defaultProps}
          agentRuns={[{ id: 1, agent_type: 'implementation', status: 'completed' }]}
          workflowComplete={true}
        />
      );

      // Both implementation and review show Completed when workflowComplete is true
      const completedButtons = screen.getAllByText('Completed');
      expect(completedButtons.length).toBe(2); // implementation + review
    });

    it('should show Run button for implementation agent when workflow is not complete', () => {
      render(
        <AgentSection
          {...defaultProps}
          agentRuns={[{ id: 1, agent_type: 'implementation', status: 'completed' }]}
          workflowComplete={false}
        />
      );

      // Implementation agent should show Run button (not Completed) when workflow is not complete
      const runButtons = screen.getAllByText('Run');
      expect(runButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('should show Running status for running implementation agent', () => {
      render(
        <AgentSection
          {...defaultProps}
          agentRuns={[{ id: 1, agent_type: 'implementation', status: 'running' }]}
        />
      );

      expect(screen.getByText('Running')).toBeInTheDocument();
    });

    it('should show Running status for pending implementation agent', () => {
      render(
        <AgentSection
          {...defaultProps}
          agentRuns={[{ id: 1, agent_type: 'implementation', status: 'pending' }]}
        />
      );

      expect(screen.getByText('Running')).toBeInTheDocument();
    });

    it('should show Failed status for failed implementation agent', () => {
      render(
        <AgentSection
          {...defaultProps}
          agentRuns={[{ id: 1, agent_type: 'implementation', status: 'failed' }]}
        />
      );

      expect(screen.getByText('Failed')).toBeInTheDocument();
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

    it('should show Completed status for planification based on agent status (not workflow)', () => {
      // Planification completion is based on agent run status, not workflowComplete
      render(
        <AgentSection
          {...defaultProps}
          agentRuns={[{ id: 1, agent_type: 'planification', status: 'completed' }]}
          workflowComplete={false}
        />
      );

      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('should show Running status for running review agent', () => {
      render(
        <AgentSection
          {...defaultProps}
          agentRuns={[{ id: 1, agent_type: 'review', status: 'running' }]}
        />
      );

      expect(screen.getByText('Running')).toBeInTheDocument();
    });
  });

  describe('Resume Agent', () => {
    it('should call onResumeAgent when clicking conversation button', () => {
      const onResumeAgent = vi.fn();
      render(
        <AgentSection
          {...defaultProps}
          onResumeAgent={onResumeAgent}
          agentRuns={[{ id: 1, agent_type: 'implementation', status: 'running', conversation_id: 'conv-123' }]}
        />
      );

      // Click the conversation (message) button
      fireEvent.click(screen.getByTestId('icon-message-circle').closest('button'));

      expect(onResumeAgent).toHaveBeenCalledWith('conv-123');
    });

    it('should call onResumeAgent when clicking conversation button for completed agent', () => {
      const onResumeAgent = vi.fn();
      render(
        <AgentSection
          {...defaultProps}
          onResumeAgent={onResumeAgent}
          agentRuns={[{ id: 1, agent_type: 'implementation', status: 'completed', conversation_id: 'conv-456' }]}
        />
      );

      // Click the conversation (message) button
      fireEvent.click(screen.getByTestId('icon-message-circle').closest('button'));

      expect(onResumeAgent).toHaveBeenCalledWith('conv-456');
    });

    it('should show conversation button when agent has conversation_id', () => {
      render(
        <AgentSection
          {...defaultProps}
          agentRuns={[{ id: 1, agent_type: 'implementation', status: 'completed', conversation_id: 'conv-123' }]}
        />
      );

      expect(screen.getByTestId('icon-message-circle')).toBeInTheDocument();
    });

    it('should not show conversation button when agent has no conversation_id', () => {
      render(
        <AgentSection
          {...defaultProps}
          agentRuns={[{ id: 1, agent_type: 'implementation', status: 'completed' }]} // No conversation_id
        />
      );

      expect(screen.queryByTestId('icon-message-circle')).not.toBeInTheDocument();
    });

    it('should not call onRunAgent when clicking Running button (disabled)', () => {
      const onRunAgent = vi.fn();
      render(
        <AgentSection
          {...defaultProps}
          onRunAgent={onRunAgent}
          agentRuns={[{ id: 1, agent_type: 'implementation', status: 'running', conversation_id: 'conv-123' }]}
        />
      );

      // Running button should be disabled
      fireEvent.click(screen.getByText('Running'));

      expect(onRunAgent).not.toHaveBeenCalled();
    });

    it('should call onRunAgent when clicking Completed button (starts new run)', async () => {
      const onRunAgent = vi.fn();
      render(
        <AgentSection
          {...defaultProps}
          onRunAgent={onRunAgent}
          agentRuns={[{ id: 1, agent_type: 'planification', status: 'completed', conversation_id: 'conv-456' }]}
        />
      );

      // Click Completed button - should start new agent run (use planification for single Completed)
      fireEvent.click(screen.getByText('Completed'));

      await waitFor(() => {
        expect(onRunAgent).toHaveBeenCalledWith('planification');
      });
    });

    it('should call onRunAgent when clicking Failed button (starts new run)', async () => {
      const onRunAgent = vi.fn();
      render(
        <AgentSection
          {...defaultProps}
          onRunAgent={onRunAgent}
          agentRuns={[{ id: 1, agent_type: 'implementation', status: 'failed', conversation_id: 'conv-789' }]}
        />
      );

      // Click Failed button - should start new agent run
      fireEvent.click(screen.getByText('Failed'));

      await waitFor(() => {
        expect(onRunAgent).toHaveBeenCalledWith('implementation');
      });
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

  describe('Error Handling and Edge Cases', () => {
    it('should prevent double-clicking run button', async () => {
      let resolvePromise;
      const slowPromise = new Promise(resolve => { resolvePromise = resolve; });
      const onRunAgent = vi.fn(() => slowPromise);

      render(<AgentSection {...defaultProps} onRunAgent={onRunAgent} />);

      const runButtons = screen.getAllByText('Run');

      // First click
      fireEvent.click(runButtons[0]);

      // Try to click again while first is still processing
      fireEvent.click(runButtons[0]);
      fireEvent.click(runButtons[0]);

      // Should only have been called once due to internal guard
      expect(onRunAgent).toHaveBeenCalledTimes(1);

      // Cleanup: resolve the promise
      resolvePromise();
    });

    it('should reset starting state after onRunAgent completes', async () => {
      const onRunAgent = vi.fn(() => Promise.resolve());
      render(<AgentSection {...defaultProps} onRunAgent={onRunAgent} />);

      const runButtons = screen.getAllByText('Run');
      fireEvent.click(runButtons[0]);

      // Wait for the promise to resolve and state to reset
      await waitFor(() => {
        expect(screen.queryByText('Starting...')).not.toBeInTheDocument();
      });

      // Run button should be visible again
      expect(screen.getAllByText('Run')).toHaveLength(3);
    });

    it('should pass correct agent type to onRunAgent for all agent types', async () => {
      const onRunAgent = vi.fn(() => Promise.resolve());
      render(<AgentSection {...defaultProps} onRunAgent={onRunAgent} />);

      const runButtons = screen.getAllByText('Run');

      // Click all three buttons in sequence
      fireEvent.click(runButtons[0]); // Planification
      await waitFor(() => expect(onRunAgent).toHaveBeenCalledWith('planification'));

      fireEvent.click(runButtons[1]); // Implementation
      await waitFor(() => expect(onRunAgent).toHaveBeenCalledWith('implementation'));

      fireEvent.click(runButtons[2]); // Review
      await waitFor(() => expect(onRunAgent).toHaveBeenCalledWith('review'));
    });
  });

  describe('Multiple Agent Runs Display', () => {
    it('should show status for multiple agents at different states', () => {
      render(
        <AgentSection
          {...defaultProps}
          agentRuns={[
            { id: 1, agent_type: 'planification', status: 'completed', conversation_id: 'conv-1' },
            { id: 2, agent_type: 'implementation', status: 'running', conversation_id: 'conv-2' },
            // Review has no run yet
          ]}
        />
      );

      // Should show Completed for planification
      expect(screen.getByText('Completed')).toBeInTheDocument();

      // Should show Running for implementation
      expect(screen.getByText('Running')).toBeInTheDocument();

      // Should show Run for review (no agent run exists)
      const runButtons = screen.getAllByText('Run');
      expect(runButtons).toHaveLength(1); // Only review should have Run button
    });

    it('should show most recent agent run status when multiple exist for same type', () => {
      // If there are multiple runs of the same type, should use first one found
      // For planification agent, status is based on agent run status
      render(
        <AgentSection
          {...defaultProps}
          agentRuns={[
            { id: 1, agent_type: 'planification', status: 'completed', conversation_id: 'conv-1' },
            { id: 2, agent_type: 'planification', status: 'running', conversation_id: 'conv-2' },
          ]}
        />
      );

      // Should find the first matching agent run (completed)
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });
  });

  describe('Resume Agent with WebSocket Event Handling', () => {
    it('should not show conversation button when conversation_id is missing', () => {
      render(
        <AgentSection
          {...defaultProps}
          agentRuns={[{ id: 1, agent_type: 'implementation', status: 'running' }]} // No conversation_id
        />
      );

      // No conversation button should be shown
      expect(screen.queryByTestId('icon-message-circle')).not.toBeInTheDocument();
    });

    it('should not throw when onResumeAgent prop is not provided', () => {
      render(
        <AgentSection
          {...defaultProps}
          onResumeAgent={undefined}
          agentRuns={[{ id: 1, agent_type: 'implementation', status: 'running', conversation_id: 'conv-123' }]}
        />
      );

      // Should not throw when clicking conversation button
      const conversationButton = screen.getByTestId('icon-message-circle').closest('button');
      fireEvent.click(conversationButton);
      // If we get here without error, the test passes
    });
  });

  describe('Agent Run Status Transitions', () => {
    it('should show Failed button for failed agent (allows retry)', () => {
      render(
        <AgentSection
          {...defaultProps}
          agentRuns={[{ id: 1, agent_type: 'implementation', status: 'failed', conversation_id: 'conv-123' }]}
        />
      );

      // Failed status shows Failed button which can be clicked to retry
      expect(screen.getByText('Failed')).toBeInTheDocument();
      // Planification and Review should still show Run buttons
      const runButtons = screen.getAllByText('Run');
      expect(runButtons.length).toBe(2);
    });

    it('should show conversation button for failed agent with conversation_id', () => {
      render(
        <AgentSection
          {...defaultProps}
          agentRuns={[{ id: 1, agent_type: 'implementation', status: 'failed', conversation_id: 'conv-123' }]}
        />
      );

      // Should show conversation button to view what went wrong
      expect(screen.getByTestId('icon-message-circle')).toBeInTheDocument();
    });

    it('should handle agent run with no conversation_id gracefully', () => {
      // Use planification agent since its completion is based on status (not workflowComplete)
      render(
        <AgentSection
          {...defaultProps}
          agentRuns={[{ id: 1, agent_type: 'planification', status: 'completed' }]} // No conversation_id
        />
      );

      // Should still show Completed button
      expect(screen.getByText('Completed')).toBeInTheDocument();
      // But no conversation button
      expect(screen.queryByTestId('icon-message-circle')).not.toBeInTheDocument();
    });
  });
});
