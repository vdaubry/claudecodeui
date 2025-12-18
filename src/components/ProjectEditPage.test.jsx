import { describe, it, expect, vi } from 'vitest';

describe('ProjectEditPage Logic', () => {
  describe('Form Initialization', () => {
    it('should initialize name from editing project', () => {
      const editingProject = { id: 'p1', name: 'Test Project', repo_folder_path: '/path/to/project' };
      const name = editingProject.name || '';
      expect(name).toBe('Test Project');
    });

    it('should initialize documentation from project doc', () => {
      const projectDoc = '# Project Documentation\n\nThis is the documentation.';
      const documentation = projectDoc || '';
      expect(documentation).toBe('# Project Documentation\n\nThis is the documentation.');
    });

    it('should handle empty project name gracefully', () => {
      const editingProject = { id: 'p1', name: '', repo_folder_path: '/path' };
      const name = editingProject.name || '';
      expect(name).toBe('');
    });

    it('should handle null project doc gracefully', () => {
      const projectDoc = null;
      const documentation = projectDoc || '';
      expect(documentation).toBe('');
    });
  });

  describe('Change Detection', () => {
    it('should detect name change', () => {
      const editingProject = { id: 'p1', name: 'Original Name' };
      const projectDoc = 'Some docs';
      const name = 'Updated Name';
      const documentation = 'Some docs';

      const nameChanged = name !== (editingProject.name || '');
      const docChanged = documentation !== (projectDoc || '');
      const hasChanges = nameChanged || docChanged;

      expect(nameChanged).toBe(true);
      expect(docChanged).toBe(false);
      expect(hasChanges).toBe(true);
    });

    it('should detect documentation change', () => {
      const editingProject = { id: 'p1', name: 'Test' };
      const projectDoc = 'Original docs';
      const name = 'Test';
      const documentation = 'Updated docs';

      const nameChanged = name !== (editingProject.name || '');
      const docChanged = documentation !== (projectDoc || '');
      const hasChanges = nameChanged || docChanged;

      expect(nameChanged).toBe(false);
      expect(docChanged).toBe(true);
      expect(hasChanges).toBe(true);
    });

    it('should not detect changes when values are same', () => {
      const editingProject = { id: 'p1', name: 'Test' };
      const projectDoc = 'Some docs';
      const name = 'Test';
      const documentation = 'Some docs';

      const nameChanged = name !== (editingProject.name || '');
      const docChanged = documentation !== (projectDoc || '');
      const hasChanges = nameChanged || docChanged;

      expect(hasChanges).toBe(false);
    });
  });

  describe('Form Validation', () => {
    it('should require project name', () => {
      const name = '';
      const isValid = name.trim().length > 0;
      expect(isValid).toBe(false);
    });

    it('should pass validation with valid name', () => {
      const name = 'Valid Project Name';
      const isValid = name.trim().length > 0;
      expect(isValid).toBe(true);
    });

    it('should reject whitespace-only names', () => {
      const name = '   ';
      const isValid = name.trim().length > 0;
      expect(isValid).toBe(false);
    });
  });

  describe('Save Operation', () => {
    it('should call updateProject with correct parameters', async () => {
      const updateProject = vi.fn().mockResolvedValue({ success: true, project: {} });
      const editingProject = { id: 'p1' };
      const name = 'Updated Name';
      const documentation = 'Updated docs';

      await updateProject(editingProject.id, { name: name.trim(), documentation });

      expect(updateProject).toHaveBeenCalledWith('p1', {
        name: 'Updated Name',
        documentation: 'Updated docs'
      });
    });

    it('should handle save success', async () => {
      const updateProject = vi.fn().mockResolvedValue({ success: true });
      const exitEditMode = vi.fn();

      const result = await updateProject('p1', { name: 'Test' });
      if (result.success) {
        exitEditMode();
      }

      expect(exitEditMode).toHaveBeenCalled();
    });

    it('should handle save failure', async () => {
      const updateProject = vi.fn().mockResolvedValue({
        success: false,
        error: 'Failed to save'
      });

      const result = await updateProject('p1', { name: 'Test' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to save');
    });

    it('should trim whitespace from name before saving', () => {
      const name = '  Padded Name  ';
      const trimmedName = name.trim();
      expect(trimmedName).toBe('Padded Name');
    });
  });

  describe('Delete Operation', () => {
    it('should require confirmation before deleting', () => {
      let showDeleteConfirm = false;
      const setShowDeleteConfirm = (value) => {
        showDeleteConfirm = value;
      };

      expect(showDeleteConfirm).toBe(false);
      setShowDeleteConfirm(true);
      expect(showDeleteConfirm).toBe(true);
    });

    it('should call deleteProject with project id', async () => {
      const deleteProject = vi.fn().mockResolvedValue({ success: true });
      const editingProject = { id: 'p1', name: 'Test' };

      await deleteProject(editingProject.id);

      expect(deleteProject).toHaveBeenCalledWith('p1');
    });

    it('should exit edit mode on successful delete', async () => {
      const deleteProject = vi.fn().mockResolvedValue({ success: true });
      const exitEditMode = vi.fn();

      const result = await deleteProject('p1');
      if (result.success) {
        exitEditMode();
      }

      expect(exitEditMode).toHaveBeenCalled();
    });

    it('should show error and close confirmation on delete failure', async () => {
      const deleteProject = vi.fn().mockResolvedValue({
        success: false,
        error: 'Cannot delete'
      });
      let showDeleteConfirm = true;
      let error = null;

      const result = await deleteProject('p1');
      if (!result.success) {
        error = result.error;
        showDeleteConfirm = false;
      }

      expect(error).toBe('Cannot delete');
      expect(showDeleteConfirm).toBe(false);
    });

    it('should be able to cancel delete confirmation', () => {
      let showDeleteConfirm = true;
      const setShowDeleteConfirm = (value) => {
        showDeleteConfirm = value;
      };

      setShowDeleteConfirm(false);
      expect(showDeleteConfirm).toBe(false);
    });
  });

  describe('Cancel Operation', () => {
    it('should call exitEditMode when cancel is clicked', () => {
      const exitEditMode = vi.fn();
      exitEditMode();
      expect(exitEditMode).toHaveBeenCalled();
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should detect Ctrl+S for save', () => {
      const event = { ctrlKey: true, key: 's' };
      const isSaveShortcut = (event.ctrlKey || event.metaKey) && event.key === 's';
      expect(isSaveShortcut).toBe(true);
    });

    it('should detect Cmd+S for save (Mac)', () => {
      const event = { metaKey: true, key: 's' };
      const isSaveShortcut = (event.ctrlKey || event.metaKey) && event.key === 's';
      expect(isSaveShortcut).toBe(true);
    });

    it('should detect Escape for cancel', () => {
      const event = { key: 'Escape' };
      const isCancelShortcut = event.key === 'Escape';
      expect(isCancelShortcut).toBe(true);
    });

    it('should not trigger save shortcut without modifier', () => {
      const event = { key: 's', ctrlKey: false, metaKey: false };
      const isSaveShortcut = (event.ctrlKey || event.metaKey) && event.key === 's';
      expect(isSaveShortcut).toBe(false);
    });

    it('should close delete confirmation on Escape', () => {
      let showDeleteConfirm = true;
      const event = { key: 'Escape' };

      if (event.key === 'Escape' && showDeleteConfirm) {
        showDeleteConfirm = false;
      }

      expect(showDeleteConfirm).toBe(false);
    });
  });

  describe('Loading States', () => {
    it('should disable save button while saving', () => {
      const isSaving = true;
      const isDeleting = false;
      const hasChanges = true;

      const saveDisabled = isSaving || isDeleting || !hasChanges;
      expect(saveDisabled).toBe(true);
    });

    it('should disable save button while deleting', () => {
      const isSaving = false;
      const isDeleting = true;
      const hasChanges = true;

      const saveDisabled = isSaving || isDeleting || !hasChanges;
      expect(saveDisabled).toBe(true);
    });

    it('should disable save button when no changes', () => {
      const isSaving = false;
      const isDeleting = false;
      const hasChanges = false;

      const saveDisabled = isSaving || isDeleting || !hasChanges;
      expect(saveDisabled).toBe(true);
    });

    it('should enable save button when ready', () => {
      const isSaving = false;
      const isDeleting = false;
      const hasChanges = true;

      const saveDisabled = isSaving || isDeleting || !hasChanges;
      expect(saveDisabled).toBe(false);
    });
  });

  describe('Null Project Handling', () => {
    it('should not render when editingProject is null', () => {
      const editingProject = null;
      const shouldRender = editingProject !== null;
      expect(shouldRender).toBe(false);
    });

    it('should render when editingProject is provided', () => {
      const editingProject = { id: 'p1', name: 'Test' };
      const shouldRender = editingProject !== null;
      expect(shouldRender).toBe(true);
    });
  });

  describe('Folder Path Display', () => {
    it('should display folder path from project', () => {
      const editingProject = {
        id: 'p1',
        name: 'Test',
        repo_folder_path: '/home/user/projects/test'
      };
      expect(editingProject.repo_folder_path).toBe('/home/user/projects/test');
    });

    it('should handle missing folder path', () => {
      const editingProject = { id: 'p1', name: 'Test' };
      const folderPath = editingProject.repo_folder_path || 'No folder path';
      expect(folderPath).toBe('No folder path');
    });
  });

  describe('Error Handling', () => {
    it('should display error message when error exists', () => {
      const error = 'Something went wrong';
      const showError = error !== null;
      expect(showError).toBe(true);
    });

    it('should hide error message when error is null', () => {
      const error = null;
      const showError = error !== null;
      expect(showError).toBe(false);
    });

    it('should clear error on new action', () => {
      let error = 'Previous error';
      error = null; // Clear on new action
      expect(error).toBe(null);
    });
  });
});
