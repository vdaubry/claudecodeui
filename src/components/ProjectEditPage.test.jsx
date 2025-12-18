import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProjectEditPage from './ProjectEditPage';
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

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
  Save: () => <span data-testid="icon-save" />,
  Trash2: () => <span data-testid="icon-trash" />,
  FolderOpen: () => <span data-testid="icon-folder" />,
  AlertTriangle: () => <span data-testid="icon-alert" />,
}));

describe('ProjectEditPage Component', () => {
  const mockEditingProject = {
    id: 'p1',
    name: 'Test Project',
    repo_folder_path: '/path/to/project',
  };

  const defaultContextValue = {
    editingProject: mockEditingProject,
    projectDoc: 'Initial documentation',
    isLoadingProjectDoc: false,
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    exitEditMode: vi.fn(),
    navigateToBoard: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useTaskContext.mockReturnValue(defaultContextValue);
  });

  describe('Rendering', () => {
    it('should display empty state when no project is being edited', () => {
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        editingProject: null,
      });

      render(<ProjectEditPage />);

      expect(screen.getByText('No project selected for editing')).toBeInTheDocument();
    });

    it('should render the page with project data', () => {
      render(<ProjectEditPage />);

      expect(screen.getByTestId('project-edit-page')).toBeInTheDocument();
      expect(screen.getByText('Edit Project')).toBeInTheDocument();
    });

    it('should display project name in input field', () => {
      render(<ProjectEditPage />);

      const nameInput = screen.getByTestId('name-input');
      expect(nameInput).toHaveValue('Test Project');
    });

    it('should display project folder path', () => {
      render(<ProjectEditPage />);

      expect(screen.getByText('/path/to/project')).toBeInTheDocument();
    });

    it('should display project documentation', () => {
      render(<ProjectEditPage />);

      const textarea = screen.getByTestId('documentation-textarea');
      expect(textarea).toHaveValue('Initial documentation');
    });
  });

  describe('Form Interactions', () => {
    it('should update name when user types', () => {
      render(<ProjectEditPage />);

      const nameInput = screen.getByTestId('name-input');
      fireEvent.change(nameInput, { target: { value: 'Updated Project' } });

      expect(nameInput).toHaveValue('Updated Project');
    });

    it('should update documentation when user types', () => {
      render(<ProjectEditPage />);

      const textarea = screen.getByTestId('documentation-textarea');
      fireEvent.change(textarea, { target: { value: 'Updated docs' } });

      expect(textarea).toHaveValue('Updated docs');
    });

    it('should enable save button when changes are made', () => {
      render(<ProjectEditPage />);

      const saveButton = screen.getByTestId('save-button');
      expect(saveButton).toBeDisabled(); // No changes yet

      const nameInput = screen.getByTestId('name-input');
      fireEvent.change(nameInput, { target: { value: 'Changed Name' } });

      expect(saveButton).not.toBeDisabled();
    });

    it('should add transcribed text to documentation when mic button used', () => {
      render(<ProjectEditPage />);

      const micButton = screen.getByTestId('mic-button');
      fireEvent.click(micButton);

      const textarea = screen.getByTestId('documentation-textarea');
      expect(textarea).toHaveValue('Initial documentation Transcribed text');
    });
  });

  describe('Save Operation', () => {
    it('should call updateProject with correct parameters', async () => {
      const updateProject = vi.fn().mockResolvedValue({ success: true });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        updateProject,
      });

      render(<ProjectEditPage />);

      // Make a change
      const nameInput = screen.getByTestId('name-input');
      fireEvent.change(nameInput, { target: { value: 'New Name' } });

      // Click save
      fireEvent.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(updateProject).toHaveBeenCalledWith('p1', {
          name: 'New Name',
          documentation: 'Initial documentation',
        });
      });
    });

    it('should call exitEditMode on successful save', async () => {
      const exitEditMode = vi.fn();
      const updateProject = vi.fn().mockResolvedValue({ success: true });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        updateProject,
        exitEditMode,
      });

      render(<ProjectEditPage />);

      const nameInput = screen.getByTestId('name-input');
      fireEvent.change(nameInput, { target: { value: 'New Name' } });
      fireEvent.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(exitEditMode).toHaveBeenCalled();
      });
    });

    it('should display error when save fails', async () => {
      const updateProject = vi.fn().mockResolvedValue({
        success: false,
        error: 'Failed to save project',
      });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        updateProject,
      });

      render(<ProjectEditPage />);

      const nameInput = screen.getByTestId('name-input');
      fireEvent.change(nameInput, { target: { value: 'New Name' } });
      fireEvent.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
        expect(screen.getByText('Failed to save project')).toBeInTheDocument();
      });
    });

    it('should show error when name is empty', async () => {
      render(<ProjectEditPage />);

      // Make name change first to enable save, then clear it
      const nameInput = screen.getByTestId('name-input');
      fireEvent.change(nameInput, { target: { value: '' } });

      // Change docs to enable button
      const textarea = screen.getByTestId('documentation-textarea');
      fireEvent.change(textarea, { target: { value: 'New docs' } });

      fireEvent.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(screen.getByText('Project name is required')).toBeInTheDocument();
      });
    });
  });

  describe('Delete Operation', () => {
    it('should show delete confirmation when delete button clicked', () => {
      render(<ProjectEditPage />);

      fireEvent.click(screen.getByTestId('delete-button'));

      expect(screen.getByTestId('delete-confirmation')).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
    });

    it('should hide confirmation when cancel clicked', () => {
      render(<ProjectEditPage />);

      fireEvent.click(screen.getByTestId('delete-button'));
      expect(screen.getByTestId('delete-confirmation')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('cancel-delete-button'));

      expect(screen.queryByTestId('delete-confirmation')).not.toBeInTheDocument();
    });

    it('should call deleteProject when confirmed', async () => {
      const deleteProject = vi.fn().mockResolvedValue({ success: true });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        deleteProject,
      });

      render(<ProjectEditPage />);

      fireEvent.click(screen.getByTestId('delete-button'));
      fireEvent.click(screen.getByTestId('confirm-delete-button'));

      await waitFor(() => {
        expect(deleteProject).toHaveBeenCalledWith('p1');
      });
    });

    it('should call exitEditMode on successful delete', async () => {
      const exitEditMode = vi.fn();
      const deleteProject = vi.fn().mockResolvedValue({ success: true });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        deleteProject,
        exitEditMode,
      });

      render(<ProjectEditPage />);

      fireEvent.click(screen.getByTestId('delete-button'));
      fireEvent.click(screen.getByTestId('confirm-delete-button'));

      await waitFor(() => {
        expect(exitEditMode).toHaveBeenCalled();
      });
    });

    it('should display error when delete fails', async () => {
      const deleteProject = vi.fn().mockResolvedValue({
        success: false,
        error: 'Cannot delete project',
      });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        deleteProject,
      });

      render(<ProjectEditPage />);

      fireEvent.click(screen.getByTestId('delete-button'));
      fireEvent.click(screen.getByTestId('confirm-delete-button'));

      await waitFor(() => {
        expect(screen.getByText('Cannot delete project')).toBeInTheDocument();
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

      render(<ProjectEditPage />);

      fireEvent.click(screen.getByTestId('back-button'));

      expect(exitEditMode).toHaveBeenCalled();
    });

    it('should call exitEditMode when Cancel button clicked', () => {
      const exitEditMode = vi.fn();
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        exitEditMode,
      });

      render(<ProjectEditPage />);

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

      render(<ProjectEditPage />);

      const page = screen.getByTestId('project-edit-page');
      fireEvent.keyDown(page, { key: 'Escape' });

      expect(exitEditMode).toHaveBeenCalled();
    });

    it('should save when Ctrl+S pressed', async () => {
      const updateProject = vi.fn().mockResolvedValue({ success: true });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        updateProject,
      });

      render(<ProjectEditPage />);

      // Make a change first
      const nameInput = screen.getByTestId('name-input');
      fireEvent.change(nameInput, { target: { value: 'New Name' } });

      const page = screen.getByTestId('project-edit-page');
      fireEvent.keyDown(page, { key: 's', ctrlKey: true });

      await waitFor(() => {
        expect(updateProject).toHaveBeenCalled();
      });
    });

    it('should save when Cmd+S pressed (Mac)', async () => {
      const updateProject = vi.fn().mockResolvedValue({ success: true });
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        updateProject,
      });

      render(<ProjectEditPage />);

      const nameInput = screen.getByTestId('name-input');
      fireEvent.change(nameInput, { target: { value: 'New Name' } });

      const page = screen.getByTestId('project-edit-page');
      fireEvent.keyDown(page, { key: 's', metaKey: true });

      await waitFor(() => {
        expect(updateProject).toHaveBeenCalled();
      });
    });

    it('should close delete confirmation on Escape', () => {
      render(<ProjectEditPage />);

      fireEvent.click(screen.getByTestId('delete-button'));
      expect(screen.getByTestId('delete-confirmation')).toBeInTheDocument();

      const page = screen.getByTestId('project-edit-page');
      fireEvent.keyDown(page, { key: 'Escape' });

      expect(screen.queryByTestId('delete-confirmation')).not.toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('should show loading skeleton when documentation is loading', () => {
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        isLoadingProjectDoc: true,
      });

      render(<ProjectEditPage />);

      expect(screen.queryByTestId('documentation-textarea')).not.toBeInTheDocument();
      // Should show animated skeleton
      const loadingSection = screen.getByText('Documentation').parentElement;
      expect(loadingSection.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('should show saving state on save button', async () => {
      const updateProject = vi.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
      );
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        updateProject,
      });

      render(<ProjectEditPage />);

      const nameInput = screen.getByTestId('name-input');
      fireEvent.change(nameInput, { target: { value: 'New Name' } });
      fireEvent.click(screen.getByTestId('save-button'));

      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });

    it('should show deleting state on confirm delete button', async () => {
      const deleteProject = vi.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
      );
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        deleteProject,
      });

      render(<ProjectEditPage />);

      fireEvent.click(screen.getByTestId('delete-button'));
      fireEvent.click(screen.getByTestId('confirm-delete-button'));

      expect(screen.getByText('Deleting...')).toBeInTheDocument();
    });
  });

  describe('Header', () => {
    it('should display Edit Project header', () => {
      render(<ProjectEditPage />);

      expect(screen.getByText('Edit Project')).toBeInTheDocument();
      expect(screen.getByTestId('icon-folder')).toBeInTheDocument();
    });

    it('should display back button', () => {
      render(<ProjectEditPage />);

      expect(screen.getByTestId('back-button')).toBeInTheDocument();
      expect(screen.getByTestId('icon-arrow-left')).toBeInTheDocument();
    });
  });

  describe('Labels and Hints', () => {
    it('should display form field labels', () => {
      render(<ProjectEditPage />);

      expect(screen.getByText('Project Name')).toBeInTheDocument();
      expect(screen.getByText('Folder Path')).toBeInTheDocument();
      expect(screen.getByText('Documentation')).toBeInTheDocument();
    });

    it('should display keyboard hint footer', () => {
      render(<ProjectEditPage />);

      // Keyboard hints are displayed in the footer with kbd elements
      expect(screen.getByText('Ctrl')).toBeInTheDocument();
      expect(screen.getByText('S')).toBeInTheDocument();
      expect(screen.getByText('Esc')).toBeInTheDocument();
    });

    it('should display documentation help text', () => {
      render(<ProjectEditPage />);

      expect(screen.getByText(/Supports markdown formatting/)).toBeInTheDocument();
    });
  });

  describe('Danger Zone', () => {
    it('should display danger zone section', () => {
      render(<ProjectEditPage />);

      expect(screen.getByText('Danger Zone')).toBeInTheDocument();
    });

    it('should display delete button with warning styling', () => {
      render(<ProjectEditPage />);

      const deleteButton = screen.getByTestId('delete-button');
      expect(deleteButton).toHaveTextContent('Delete Project');
    });
  });

  describe('No Folder Path', () => {
    it('should display "No folder path" when repo_folder_path is empty', () => {
      useTaskContext.mockReturnValue({
        ...defaultContextValue,
        editingProject: {
          ...mockEditingProject,
          repo_folder_path: null,
        },
      });

      render(<ProjectEditPage />);

      expect(screen.getByText('No folder path')).toBeInTheDocument();
    });
  });
});
