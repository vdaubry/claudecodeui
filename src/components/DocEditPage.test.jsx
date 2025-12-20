import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DocEditPage from './DocEditPage';
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
      data-testid="md-editor"
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
  FileText: () => <span data-testid="icon-file-text" />,
  AlertTriangle: () => <span data-testid="icon-alert" />,
}));

describe('DocEditPage Component', () => {
  const mockEditingDocTask = {
    id: 't1',
    title: 'Test Task',
  };

  const mockSelectedProject = {
    id: 'p1',
    name: 'Test Project',
  };

  const defaultContextValue = {
    editingDocTask: mockEditingDocTask,
    selectedProject: mockSelectedProject,
    taskDoc: 'Initial task documentation',
    isLoadingTaskDoc: false,
    saveTaskDoc: vi.fn(),
    exitDocEditMode: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useTaskContext.mockReturnValue(defaultContextValue);
  });

  describe('Rendering', () => {
    it('should display empty state when no task is being edited', () => {
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        editingDocTask: null,
      });

      render(<DocEditPage />);

      expect(screen.getByText('No task selected for documentation editing')).toBeInTheDocument();
    });

    it('should render the page with task data', () => {
      render(<DocEditPage />);

      expect(screen.getByTestId('doc-edit-page')).toBeInTheDocument();
      expect(screen.getByText('Edit Documentation')).toBeInTheDocument();
    });

    it('should display task title in header', () => {
      render(<DocEditPage />);

      expect(screen.getByText('Test Task')).toBeInTheDocument();
    });

    it('should display task documentation in editor', () => {
      render(<DocEditPage />);

      const editor = screen.getByTestId('md-editor');
      expect(editor).toHaveValue('Initial task documentation');
    });

    it('should display project name', () => {
      render(<DocEditPage />);

      expect(screen.getByText(/Test Project/)).toBeInTheDocument();
    });
  });

  describe('Form Interactions', () => {
    it('should update documentation when user types', () => {
      render(<DocEditPage />);

      const editor = screen.getByTestId('md-editor');
      fireEvent.change(editor, { target: { value: 'Updated docs' } });

      expect(editor).toHaveValue('Updated docs');
    });

    it('should enable save button when changes are made', () => {
      render(<DocEditPage />);

      const saveButton = screen.getByTestId('save-button');
      expect(saveButton).toBeDisabled(); // No changes yet

      const editor = screen.getByTestId('md-editor');
      fireEvent.change(editor, { target: { value: 'Changed documentation' } });

      expect(saveButton).not.toBeDisabled();
    });

    it('should add transcribed text to documentation when mic button used', () => {
      render(<DocEditPage />);

      const micButton = screen.getByTestId('mic-button');
      fireEvent.click(micButton);

      const editor = screen.getByTestId('md-editor');
      expect(editor).toHaveValue('Initial task documentation Transcribed text');
    });

    it('should handle empty initial documentation with transcription', () => {
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        taskDoc: '',
      });

      render(<DocEditPage />);

      const micButton = screen.getByTestId('mic-button');
      fireEvent.click(micButton);

      const editor = screen.getByTestId('md-editor');
      expect(editor).toHaveValue('Transcribed text');
    });
  });

  describe('Save Operation', () => {
    it('should call saveTaskDoc with correct parameters', async () => {
      const saveTaskDoc = vi.fn().mockResolvedValue({ success: true });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        saveTaskDoc,
      });

      render(<DocEditPage />);

      // Make a change
      const editor = screen.getByTestId('md-editor');
      fireEvent.change(editor, { target: { value: 'New documentation' } });

      // Click save
      fireEvent.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(saveTaskDoc).toHaveBeenCalledWith('t1', 'New documentation');
      });
    });

    it('should call exitDocEditMode on successful save', async () => {
      const exitDocEditMode = vi.fn();
      const saveTaskDoc = vi.fn().mockResolvedValue({ success: true });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        saveTaskDoc,
        exitDocEditMode,
      });

      render(<DocEditPage />);

      const editor = screen.getByTestId('md-editor');
      fireEvent.change(editor, { target: { value: 'New docs' } });
      fireEvent.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(exitDocEditMode).toHaveBeenCalled();
      });
    });

    it('should display error when save fails', async () => {
      const saveTaskDoc = vi.fn().mockResolvedValue({
        success: false,
        error: 'Failed to save documentation',
      });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        saveTaskDoc,
      });

      render(<DocEditPage />);

      const editor = screen.getByTestId('md-editor');
      fireEvent.change(editor, { target: { value: 'New docs' } });
      fireEvent.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
        expect(screen.getByText('Failed to save documentation')).toBeInTheDocument();
      });
    });

    it('should handle exceptions during save', async () => {
      const saveTaskDoc = vi.fn().mockRejectedValue(new Error('Network error'));
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        saveTaskDoc,
      });

      render(<DocEditPage />);

      const editor = screen.getByTestId('md-editor');
      fireEvent.change(editor, { target: { value: 'New docs' } });
      fireEvent.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('should call exitDocEditMode when back button clicked', () => {
      const exitDocEditMode = vi.fn();
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        exitDocEditMode,
      });

      render(<DocEditPage />);

      fireEvent.click(screen.getByTestId('back-button'));

      expect(exitDocEditMode).toHaveBeenCalled();
    });

    it('should call exitDocEditMode when Cancel button clicked', () => {
      const exitDocEditMode = vi.fn();
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        exitDocEditMode,
      });

      render(<DocEditPage />);

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(exitDocEditMode).toHaveBeenCalled();
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should call exitDocEditMode when Escape pressed', () => {
      const exitDocEditMode = vi.fn();
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        exitDocEditMode,
      });

      render(<DocEditPage />);

      const page = screen.getByTestId('doc-edit-page');
      fireEvent.keyDown(page, { key: 'Escape' });

      expect(exitDocEditMode).toHaveBeenCalled();
    });

    it('should save when Ctrl+S pressed', async () => {
      const saveTaskDoc = vi.fn().mockResolvedValue({ success: true });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        saveTaskDoc,
      });

      render(<DocEditPage />);

      // Make a change first
      const editor = screen.getByTestId('md-editor');
      fireEvent.change(editor, { target: { value: 'New docs' } });

      const page = screen.getByTestId('doc-edit-page');
      fireEvent.keyDown(page, { key: 's', ctrlKey: true });

      await waitFor(() => {
        expect(saveTaskDoc).toHaveBeenCalled();
      });
    });

    it('should save when Cmd+S pressed (Mac)', async () => {
      const saveTaskDoc = vi.fn().mockResolvedValue({ success: true });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        saveTaskDoc,
      });

      render(<DocEditPage />);

      const editor = screen.getByTestId('md-editor');
      fireEvent.change(editor, { target: { value: 'New docs' } });

      const page = screen.getByTestId('doc-edit-page');
      fireEvent.keyDown(page, { key: 's', metaKey: true });

      await waitFor(() => {
        expect(saveTaskDoc).toHaveBeenCalled();
      });
    });
  });

  describe('Loading States', () => {
    it('should show loading skeleton when documentation is loading', () => {
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        isLoadingTaskDoc: true,
      });

      render(<DocEditPage />);

      expect(screen.queryByTestId('md-editor')).not.toBeInTheDocument();
      // Should show animated skeleton
      const skeleton = document.querySelector('.animate-pulse');
      expect(skeleton).toBeInTheDocument();
    });

    it('should show saving state on save button', async () => {
      const saveTaskDoc = vi.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
      );
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        saveTaskDoc,
      });

      render(<DocEditPage />);

      const editor = screen.getByTestId('md-editor');
      fireEvent.change(editor, { target: { value: 'New docs' } });
      fireEvent.click(screen.getByTestId('save-button'));

      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });
  });

  describe('Header', () => {
    it('should display Edit Documentation header', () => {
      render(<DocEditPage />);

      expect(screen.getByText('Edit Documentation')).toBeInTheDocument();
      expect(screen.getByTestId('icon-file-text')).toBeInTheDocument();
    });

    it('should display back button', () => {
      render(<DocEditPage />);

      expect(screen.getByTestId('back-button')).toBeInTheDocument();
      expect(screen.getByTestId('icon-arrow-left')).toBeInTheDocument();
    });

    it('should display mic button in header', () => {
      render(<DocEditPage />);

      expect(screen.getByTestId('mic-button')).toBeInTheDocument();
    });
  });

  describe('Keyboard Hints', () => {
    it('should display keyboard hint footer', () => {
      render(<DocEditPage />);

      // Keyboard hints are displayed in the footer with kbd elements
      expect(screen.getByText('Ctrl')).toBeInTheDocument();
      expect(screen.getByText('S')).toBeInTheDocument();
      expect(screen.getByText('Esc')).toBeInTheDocument();
    });
  });

  describe('No Project Context', () => {
    it('should not show project field when selectedProject is null', () => {
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        selectedProject: null,
      });

      render(<DocEditPage />);

      expect(screen.queryByText(/Project:/)).not.toBeInTheDocument();
    });
  });

  describe('Change Detection', () => {
    it('should detect documentation changes and enable save', () => {
      render(<DocEditPage />);

      const saveButton = screen.getByTestId('save-button');
      expect(saveButton).toBeDisabled();

      const editor = screen.getByTestId('md-editor');
      fireEvent.change(editor, { target: { value: 'Different content' } });

      expect(saveButton).not.toBeDisabled();
    });

    it('should disable save when content matches original', () => {
      render(<DocEditPage />);

      const editor = screen.getByTestId('md-editor');

      // Change content
      fireEvent.change(editor, { target: { value: 'Changed' } });
      expect(screen.getByTestId('save-button')).not.toBeDisabled();

      // Change back to original
      fireEvent.change(editor, { target: { value: 'Initial task documentation' } });
      expect(screen.getByTestId('save-button')).toBeDisabled();
    });
  });

  describe('Empty Documentation', () => {
    it('should handle empty initial documentation', () => {
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        taskDoc: '',
      });

      render(<DocEditPage />);

      const editor = screen.getByTestId('md-editor');
      expect(editor).toHaveValue('');
    });

    it('should handle null documentation', () => {
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        taskDoc: null,
      });

      render(<DocEditPage />);

      const editor = screen.getByTestId('md-editor');
      expect(editor).toHaveValue('');
    });
  });
});
