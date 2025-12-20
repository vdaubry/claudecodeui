import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TaskEditPage from './TaskEditPage';
import { useTaskContext } from '../contexts/TaskContext';

// Mock TaskContext
vi.mock('../contexts/TaskContext', () => ({
  useTaskContext: vi.fn(),
}));

// Mock MicButton component
vi.mock('./MicButton', () => ({
  MicButton: ({ onTranscript }) => (
    <button data-testid="mic-button" onClick={() => onTranscript('Transcribed text')}>
      Mic
    </button>
  ),
}));

// Mock @uiw/react-md-editor
vi.mock('@uiw/react-md-editor', () => ({
  default: ({ value, onChange, textareaProps }) => (
    <textarea
      data-testid="documentation-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={textareaProps?.placeholder}
    />
  ),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
  Save: () => <span data-testid="icon-save" />,
  Trash2: () => <span data-testid="icon-trash" />,
  CheckSquare: () => <span data-testid="icon-check-square" />,
  AlertTriangle: () => <span data-testid="icon-alert" />,
  Clock: () => <span data-testid="icon-clock" />,
  Loader2: () => <span data-testid="icon-loader" />,
  CheckCircle2: () => <span data-testid="icon-check-circle" />,
}));

describe('TaskEditPage Component', () => {
  const mockEditingTask = {
    id: 't1',
    title: 'Test Task',
    status: 'pending',
  };

  const mockSelectedProject = {
    id: 'p1',
    name: 'Test Project',
  };

  const defaultContextValue = {
    editingTask: mockEditingTask,
    selectedProject: mockSelectedProject,
    taskDoc: 'Initial task documentation',
    isLoadingTaskDoc: false,
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    saveTaskDoc: vi.fn(),
    exitEditMode: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useTaskContext.mockReturnValue(defaultContextValue);
  });

  describe('Rendering', () => {
    it('should display empty state when no task is being edited', () => {
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        editingTask: null,
      });

      render(<TaskEditPage />);

      expect(screen.getByText('No task selected for editing')).toBeInTheDocument();
    });

    it('should render the page with task data', () => {
      render(<TaskEditPage />);

      expect(screen.getByTestId('task-edit-page')).toBeInTheDocument();
      expect(screen.getByText('Edit Task')).toBeInTheDocument();
    });

    it('should display task title in input field', () => {
      render(<TaskEditPage />);

      const titleInput = screen.getByTestId('title-input');
      expect(titleInput).toHaveValue('Test Task');
    });

    it('should display current status', () => {
      render(<TaskEditPage />);

      const statusSelect = screen.getByTestId('status-select');
      expect(statusSelect).toHaveValue('pending');
    });

    it('should display task documentation', () => {
      render(<TaskEditPage />);

      const editor = screen.getByTestId('documentation-editor');
      expect(editor).toHaveValue('Initial task documentation');
    });

    it('should display project name', () => {
      render(<TaskEditPage />);

      expect(screen.getByText('Test Project')).toBeInTheDocument();
    });
  });

  describe('Form Interactions', () => {
    it('should update title when user types', () => {
      render(<TaskEditPage />);

      const titleInput = screen.getByTestId('title-input');
      fireEvent.change(titleInput, { target: { value: 'Updated Task' } });

      expect(titleInput).toHaveValue('Updated Task');
    });

    it('should update status when dropdown changed', () => {
      render(<TaskEditPage />);

      const statusSelect = screen.getByTestId('status-select');
      fireEvent.change(statusSelect, { target: { value: 'in_progress' } });

      expect(statusSelect).toHaveValue('in_progress');
    });

    it('should update documentation when user types', () => {
      render(<TaskEditPage />);

      const editor = screen.getByTestId('documentation-editor');
      fireEvent.change(editor, { target: { value: 'Updated docs' } });

      expect(editor).toHaveValue('Updated docs');
    });

    it('should enable save button when changes are made', () => {
      render(<TaskEditPage />);

      const saveButton = screen.getByTestId('save-button');
      expect(saveButton).toBeDisabled(); // No changes yet

      const titleInput = screen.getByTestId('title-input');
      fireEvent.change(titleInput, { target: { value: 'Changed Title' } });

      expect(saveButton).not.toBeDisabled();
    });

    it('should add transcribed text to documentation when mic button used', () => {
      render(<TaskEditPage />);

      const micButton = screen.getByTestId('mic-button');
      fireEvent.click(micButton);

      const editor = screen.getByTestId('documentation-editor');
      expect(editor).toHaveValue('Initial task documentation Transcribed text');
    });
  });

  describe('Status Options', () => {
    it('should display all three status options', () => {
      render(<TaskEditPage />);

      const statusSelect = screen.getByTestId('status-select');
      const options = statusSelect.querySelectorAll('option');

      expect(options).toHaveLength(3);
      expect(options[0]).toHaveValue('pending');
      expect(options[1]).toHaveValue('in_progress');
      expect(options[2]).toHaveValue('completed');
    });

    it('should show correct labels for status options', () => {
      render(<TaskEditPage />);

      expect(screen.getByRole('option', { name: 'Pending' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'In Progress' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Completed' })).toBeInTheDocument();
    });
  });

  describe('Save Operation', () => {
    it('should call updateTask and saveTaskDoc with correct parameters', async () => {
      const updateTask = vi.fn().mockResolvedValue({ success: true, task: {} });
      const saveTaskDoc = vi.fn().mockResolvedValue({ success: true });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        updateTask,
        saveTaskDoc,
      });

      render(<TaskEditPage />);

      // Make a change
      const titleInput = screen.getByTestId('title-input');
      fireEvent.change(titleInput, { target: { value: 'New Title' } });

      // Click save
      fireEvent.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(updateTask).toHaveBeenCalledWith('t1', {
          title: 'New Title',
          status: 'pending',
        });
        expect(saveTaskDoc).toHaveBeenCalledWith('t1', 'Initial task documentation');
      });
    });

    it('should call exitEditMode on successful save', async () => {
      const exitEditMode = vi.fn();
      const updateTask = vi.fn().mockResolvedValue({ success: true, task: {} });
      const saveTaskDoc = vi.fn().mockResolvedValue({ success: true });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        updateTask,
        saveTaskDoc,
        exitEditMode,
      });

      render(<TaskEditPage />);

      const titleInput = screen.getByTestId('title-input');
      fireEvent.change(titleInput, { target: { value: 'New Title' } });
      fireEvent.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(exitEditMode).toHaveBeenCalled();
      });
    });

    it('should display error when task update fails', async () => {
      const updateTask = vi.fn().mockResolvedValue({
        success: false,
        error: 'Failed to update task',
      });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        updateTask,
      });

      render(<TaskEditPage />);

      const titleInput = screen.getByTestId('title-input');
      fireEvent.change(titleInput, { target: { value: 'New Title' } });
      fireEvent.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
        expect(screen.getByText('Failed to update task')).toBeInTheDocument();
      });
    });

    it('should display error when doc save fails', async () => {
      const updateTask = vi.fn().mockResolvedValue({ success: true, task: {} });
      const saveTaskDoc = vi.fn().mockResolvedValue({
        success: false,
        error: 'Failed to save documentation',
      });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        updateTask,
        saveTaskDoc,
      });

      render(<TaskEditPage />);

      const titleInput = screen.getByTestId('title-input');
      fireEvent.change(titleInput, { target: { value: 'New Title' } });
      fireEvent.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(screen.getByText(/failed to save documentation/i)).toBeInTheDocument();
      });
    });

    it('should show error when title is empty', async () => {
      render(<TaskEditPage />);

      // Clear title first then change docs to enable button
      const titleInput = screen.getByTestId('title-input');
      fireEvent.change(titleInput, { target: { value: '' } });

      const editor = screen.getByTestId('documentation-editor');
      fireEvent.change(editor, { target: { value: 'New docs' } });

      fireEvent.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(screen.getByText('Task title is required')).toBeInTheDocument();
      });
    });
  });

  describe('Delete Operation', () => {
    it('should show delete confirmation when delete button clicked', () => {
      render(<TaskEditPage />);

      fireEvent.click(screen.getByTestId('delete-button'));

      expect(screen.getByTestId('delete-confirmation')).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
    });

    it('should hide confirmation when cancel clicked', () => {
      render(<TaskEditPage />);

      fireEvent.click(screen.getByTestId('delete-button'));
      expect(screen.getByTestId('delete-confirmation')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('cancel-delete-button'));

      expect(screen.queryByTestId('delete-confirmation')).not.toBeInTheDocument();
    });

    it('should call deleteTask when confirmed', async () => {
      const deleteTask = vi.fn().mockResolvedValue({ success: true });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        deleteTask,
      });

      render(<TaskEditPage />);

      fireEvent.click(screen.getByTestId('delete-button'));
      fireEvent.click(screen.getByTestId('confirm-delete-button'));

      await waitFor(() => {
        expect(deleteTask).toHaveBeenCalledWith('t1');
      });
    });

    it('should call exitEditMode on successful delete', async () => {
      const exitEditMode = vi.fn();
      const deleteTask = vi.fn().mockResolvedValue({ success: true });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        deleteTask,
        exitEditMode,
      });

      render(<TaskEditPage />);

      fireEvent.click(screen.getByTestId('delete-button'));
      fireEvent.click(screen.getByTestId('confirm-delete-button'));

      await waitFor(() => {
        expect(exitEditMode).toHaveBeenCalled();
      });
    });

    it('should display error when delete fails', async () => {
      const deleteTask = vi.fn().mockResolvedValue({
        success: false,
        error: 'Cannot delete task',
      });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        deleteTask,
      });

      render(<TaskEditPage />);

      fireEvent.click(screen.getByTestId('delete-button'));
      fireEvent.click(screen.getByTestId('confirm-delete-button'));

      await waitFor(() => {
        expect(screen.getByText('Cannot delete task')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('should call exitEditMode when back button clicked', () => {
      const exitEditMode = vi.fn();
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        exitEditMode,
      });

      render(<TaskEditPage />);

      fireEvent.click(screen.getByTestId('back-button'));

      expect(exitEditMode).toHaveBeenCalled();
    });

    it('should call exitEditMode when Cancel button clicked', () => {
      const exitEditMode = vi.fn();
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        exitEditMode,
      });

      render(<TaskEditPage />);

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(exitEditMode).toHaveBeenCalled();
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should call exitEditMode when Escape pressed', () => {
      const exitEditMode = vi.fn();
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        exitEditMode,
      });

      render(<TaskEditPage />);

      const page = screen.getByTestId('task-edit-page');
      fireEvent.keyDown(page, { key: 'Escape' });

      expect(exitEditMode).toHaveBeenCalled();
    });

    it('should save when Ctrl+S pressed', async () => {
      const updateTask = vi.fn().mockResolvedValue({ success: true, task: {} });
      const saveTaskDoc = vi.fn().mockResolvedValue({ success: true });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        updateTask,
        saveTaskDoc,
      });

      render(<TaskEditPage />);

      // Make a change first
      const titleInput = screen.getByTestId('title-input');
      fireEvent.change(titleInput, { target: { value: 'New Title' } });

      const page = screen.getByTestId('task-edit-page');
      fireEvent.keyDown(page, { key: 's', ctrlKey: true });

      await waitFor(() => {
        expect(updateTask).toHaveBeenCalled();
      });
    });

    it('should save when Cmd+S pressed (Mac)', async () => {
      const updateTask = vi.fn().mockResolvedValue({ success: true, task: {} });
      const saveTaskDoc = vi.fn().mockResolvedValue({ success: true });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        updateTask,
        saveTaskDoc,
      });

      render(<TaskEditPage />);

      const titleInput = screen.getByTestId('title-input');
      fireEvent.change(titleInput, { target: { value: 'New Title' } });

      const page = screen.getByTestId('task-edit-page');
      fireEvent.keyDown(page, { key: 's', metaKey: true });

      await waitFor(() => {
        expect(updateTask).toHaveBeenCalled();
      });
    });

    it('should close delete confirmation on Escape', () => {
      render(<TaskEditPage />);

      fireEvent.click(screen.getByTestId('delete-button'));
      expect(screen.getByTestId('delete-confirmation')).toBeInTheDocument();

      const page = screen.getByTestId('task-edit-page');
      fireEvent.keyDown(page, { key: 'Escape' });

      expect(screen.queryByTestId('delete-confirmation')).not.toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('should show loading skeleton when documentation is loading', () => {
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        isLoadingTaskDoc: true,
      });

      render(<TaskEditPage />);

      expect(screen.queryByTestId('documentation-editor')).not.toBeInTheDocument();
      // Should show animated skeleton
      const loadingSection = screen.getByText('Documentation').parentElement.parentElement;
      expect(loadingSection.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('should show saving state on save button', async () => {
      const updateTask = vi.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ success: true, task: {} }), 100))
      );
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        updateTask,
      });

      render(<TaskEditPage />);

      const titleInput = screen.getByTestId('title-input');
      fireEvent.change(titleInput, { target: { value: 'New Title' } });
      fireEvent.click(screen.getByTestId('save-button'));

      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });

    it('should show deleting state on confirm delete button', async () => {
      const deleteTask = vi.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
      );
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        deleteTask,
      });

      render(<TaskEditPage />);

      fireEvent.click(screen.getByTestId('delete-button'));
      fireEvent.click(screen.getByTestId('confirm-delete-button'));

      expect(screen.getByText('Deleting...')).toBeInTheDocument();
    });
  });

  describe('Header', () => {
    it('should display Edit Task header', () => {
      render(<TaskEditPage />);

      expect(screen.getByText('Edit Task')).toBeInTheDocument();
      expect(screen.getByTestId('icon-check-square')).toBeInTheDocument();
    });

    it('should display back button', () => {
      render(<TaskEditPage />);

      expect(screen.getByTestId('back-button')).toBeInTheDocument();
      expect(screen.getByTestId('icon-arrow-left')).toBeInTheDocument();
    });
  });

  describe('Labels and Hints', () => {
    it('should display form field labels', () => {
      render(<TaskEditPage />);

      expect(screen.getByText('Task Title')).toBeInTheDocument();
      expect(screen.getByText('Project')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Documentation')).toBeInTheDocument();
    });

    it('should display keyboard hint footer', () => {
      render(<TaskEditPage />);

      // Keyboard hints are displayed in the footer with kbd elements
      expect(screen.getByText('Ctrl')).toBeInTheDocument();
      expect(screen.getByText('S')).toBeInTheDocument();
      expect(screen.getByText('Esc')).toBeInTheDocument();
    });
  });

  describe('Danger Zone', () => {
    it('should display danger zone section', () => {
      render(<TaskEditPage />);

      expect(screen.getByText('Danger Zone')).toBeInTheDocument();
    });

    it('should display delete button with warning styling', () => {
      render(<TaskEditPage />);

      const deleteButton = screen.getByTestId('delete-button');
      expect(deleteButton).toHaveTextContent('Delete Task');
    });
  });

  describe('No Project Context', () => {
    it('should not show project field when selectedProject is null', () => {
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        selectedProject: null,
      });

      render(<TaskEditPage />);

      expect(screen.queryByText('Project')).not.toBeInTheDocument();
    });
  });

  describe('Status Change Detection', () => {
    it('should detect status changes and enable save', () => {
      render(<TaskEditPage />);

      const saveButton = screen.getByTestId('save-button');
      expect(saveButton).toBeDisabled();

      const statusSelect = screen.getByTestId('status-select');
      fireEvent.change(statusSelect, { target: { value: 'completed' } });

      expect(saveButton).not.toBeDisabled();
    });
  });

  describe('Initial Status Values', () => {
    it('should handle in_progress status', () => {
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        editingTask: {
          ...mockEditingTask,
          status: 'in_progress',
        },
      });

      render(<TaskEditPage />);

      const statusSelect = screen.getByTestId('status-select');
      expect(statusSelect).toHaveValue('in_progress');
    });

    it('should handle completed status', () => {
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        editingTask: {
          ...mockEditingTask,
          status: 'completed',
        },
      });

      render(<TaskEditPage />);

      const statusSelect = screen.getByTestId('status-select');
      expect(statusSelect).toHaveValue('completed');
    });

    it('should default to pending for missing status', () => {
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        editingTask: {
          id: 't1',
          title: 'Test Task',
          // No status field
        },
      });

      render(<TaskEditPage />);

      const statusSelect = screen.getByTestId('status-select');
      expect(statusSelect).toHaveValue('pending');
    });
  });
});
