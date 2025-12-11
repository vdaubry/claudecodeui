import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, authenticatedFetch } from './api.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
Object.defineProperty(global, 'localStorage', { value: mockLocalStorage });

describe('API Client - Phase 5', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue('test-token');
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('authenticatedFetch', () => {
    it('should include Authorization header when token exists', async () => {
      await authenticatedFetch('/api/test');

      expect(mockFetch).toHaveBeenCalledWith('/api/test', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
      });
    });

    it('should not include Authorization header when no token', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      await authenticatedFetch('/api/test');

      expect(mockFetch).toHaveBeenCalledWith('/api/test', {
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('should not set Content-Type for FormData', async () => {
      const formData = new FormData();
      formData.append('file', 'test');

      await authenticatedFetch('/api/test', { body: formData });

      expect(mockFetch).toHaveBeenCalledWith('/api/test', {
        body: formData,
        headers: {
          'Authorization': 'Bearer test-token',
        },
      });
    });
  });

  describe('api.projects', () => {
    it('list() should call GET /api/v2/projects', async () => {
      await api.projects.list();

      expect(mockFetch).toHaveBeenCalledWith('/api/v2/projects', expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
        }),
      }));
    });

    it('create() should call POST /api/v2/projects with name and repoFolderPath', async () => {
      await api.projects.create('My Project', '/path/to/repo');

      expect(mockFetch).toHaveBeenCalledWith('/api/v2/projects', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'My Project', repoFolderPath: '/path/to/repo' }),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }));
    });

    it('get() should call GET /api/v2/projects/:id', async () => {
      await api.projects.get(123);

      expect(mockFetch).toHaveBeenCalledWith('/api/v2/projects/123', expect.any(Object));
    });

    it('update() should call PUT /api/v2/projects/:id with data', async () => {
      await api.projects.update(123, { name: 'Updated Name' });

      expect(mockFetch).toHaveBeenCalledWith('/api/v2/projects/123', expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name' }),
      }));
    });

    it('delete() should call DELETE /api/v2/projects/:id', async () => {
      await api.projects.delete(123);

      expect(mockFetch).toHaveBeenCalledWith('/api/v2/projects/123', expect.objectContaining({
        method: 'DELETE',
      }));
    });

    it('getDoc() should call GET /api/v2/projects/:id/documentation', async () => {
      await api.projects.getDoc(123);

      expect(mockFetch).toHaveBeenCalledWith('/api/v2/projects/123/documentation', expect.any(Object));
    });

    it('saveDoc() should call PUT /api/v2/projects/:id/documentation with content', async () => {
      await api.projects.saveDoc(123, '# Project Docs\n\nDescription here.');

      expect(mockFetch).toHaveBeenCalledWith('/api/v2/projects/123/documentation', expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ content: '# Project Docs\n\nDescription here.' }),
      }));
    });
  });

  describe('api.tasks', () => {
    it('list() should call GET /api/v2/projects/:projectId/tasks', async () => {
      await api.tasks.list(456);

      expect(mockFetch).toHaveBeenCalledWith('/api/v2/projects/456/tasks', expect.any(Object));
    });

    it('create() should call POST /api/v2/projects/:projectId/tasks with title', async () => {
      await api.tasks.create(456, 'New Task Title');

      expect(mockFetch).toHaveBeenCalledWith('/api/v2/projects/456/tasks', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'New Task Title' }),
      }));
    });

    it('get() should call GET /api/v2/tasks/:id', async () => {
      await api.tasks.get(789);

      expect(mockFetch).toHaveBeenCalledWith('/api/v2/tasks/789', expect.any(Object));
    });

    it('update() should call PUT /api/v2/tasks/:id with data', async () => {
      await api.tasks.update(789, { title: 'Updated Task' });

      expect(mockFetch).toHaveBeenCalledWith('/api/v2/tasks/789', expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ title: 'Updated Task' }),
      }));
    });

    it('delete() should call DELETE /api/v2/tasks/:id', async () => {
      await api.tasks.delete(789);

      expect(mockFetch).toHaveBeenCalledWith('/api/v2/tasks/789', expect.objectContaining({
        method: 'DELETE',
      }));
    });

    it('getDoc() should call GET /api/v2/tasks/:id/documentation', async () => {
      await api.tasks.getDoc(789);

      expect(mockFetch).toHaveBeenCalledWith('/api/v2/tasks/789/documentation', expect.any(Object));
    });

    it('saveDoc() should call PUT /api/v2/tasks/:id/documentation with content', async () => {
      await api.tasks.saveDoc(789, '# Task Description\n\nImplement feature X.');

      expect(mockFetch).toHaveBeenCalledWith('/api/v2/tasks/789/documentation', expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ content: '# Task Description\n\nImplement feature X.' }),
      }));
    });
  });

  describe('api.conversations', () => {
    it('list() should call GET /api/v2/tasks/:taskId/conversations', async () => {
      await api.conversations.list(789);

      expect(mockFetch).toHaveBeenCalledWith('/api/v2/tasks/789/conversations', expect.any(Object));
    });

    it('create() should call POST /api/v2/tasks/:taskId/conversations', async () => {
      await api.conversations.create(789);

      expect(mockFetch).toHaveBeenCalledWith('/api/v2/tasks/789/conversations', expect.objectContaining({
        method: 'POST',
      }));
    });

    it('get() should call GET /api/v2/conversations/:id', async () => {
      await api.conversations.get(101);

      expect(mockFetch).toHaveBeenCalledWith('/api/v2/conversations/101', expect.any(Object));
    });

    it('delete() should call DELETE /api/v2/conversations/:id', async () => {
      await api.conversations.delete(101);

      expect(mockFetch).toHaveBeenCalledWith('/api/v2/conversations/101', expect.objectContaining({
        method: 'DELETE',
      }));
    });
  });

  describe('api.auth', () => {
    it('status() should call GET /api/auth/status without auth header', async () => {
      await api.auth.status();

      // status() uses regular fetch, not authenticatedFetch
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/status');
    });

    it('login() should call POST /api/auth/login with credentials', async () => {
      await api.auth.login('testuser', 'testpass');

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'testpass' }),
      });
    });

    it('register() should call POST /api/auth/register with credentials', async () => {
      await api.auth.register('newuser', 'newpass');

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'newuser', password: 'newpass' }),
      });
    });

    it('user() should call GET /api/auth/user with auth header', async () => {
      await api.auth.user();

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/user', expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
        }),
      }));
    });

    it('logout() should call POST /api/auth/logout with auth header', async () => {
      await api.auth.logout();

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
        }),
      }));
    });
  });

  describe('api.user', () => {
    it('gitConfig() should call GET /api/user/git-config', async () => {
      await api.user.gitConfig();

      expect(mockFetch).toHaveBeenCalledWith('/api/user/git-config', expect.any(Object));
    });

    it('updateGitConfig() should call POST /api/user/git-config with name and email', async () => {
      await api.user.updateGitConfig('John Doe', 'john@example.com');

      expect(mockFetch).toHaveBeenCalledWith('/api/user/git-config', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ gitName: 'John Doe', gitEmail: 'john@example.com' }),
      }));
    });

    it('onboardingStatus() should call GET /api/user/onboarding-status', async () => {
      await api.user.onboardingStatus();

      expect(mockFetch).toHaveBeenCalledWith('/api/user/onboarding-status', expect.any(Object));
    });

    it('completeOnboarding() should call POST /api/user/complete-onboarding', async () => {
      await api.user.completeOnboarding();

      expect(mockFetch).toHaveBeenCalledWith('/api/user/complete-onboarding', expect.objectContaining({
        method: 'POST',
      }));
    });
  });

  describe('api.browseFilesystem', () => {
    it('should call GET /api/browse-filesystem without params when no path', async () => {
      await api.browseFilesystem();

      expect(mockFetch).toHaveBeenCalledWith('/api/browse-filesystem?', expect.any(Object));
    });

    it('should call GET /api/browse-filesystem with path param', async () => {
      await api.browseFilesystem('/home/user');

      expect(mockFetch).toHaveBeenCalledWith('/api/browse-filesystem?path=%2Fhome%2Fuser', expect.any(Object));
    });
  });

  describe('api.getCommands', () => {
    it('should call POST /api/commands/list with projectPath', async () => {
      await api.getCommands('/path/to/project');

      expect(mockFetch).toHaveBeenCalledWith('/api/commands/list', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ projectPath: '/path/to/project' }),
      }));
    });

    it('should use empty string for projectPath when not provided', async () => {
      await api.getCommands();

      expect(mockFetch).toHaveBeenCalledWith('/api/commands/list', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ projectPath: '' }),
      }));
    });
  });

  describe('api.transcribe', () => {
    it('should call POST /api/transcribe with FormData and auth header', async () => {
      const formData = new FormData();
      formData.append('audio', 'test-audio-data');

      await api.transcribe(formData);

      expect(mockFetch).toHaveBeenCalledWith('/api/transcribe', expect.objectContaining({
        method: 'POST',
        body: formData,
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
        }),
      }));
    });
  });

  describe('api.get', () => {
    it('should call GET /api/:endpoint', async () => {
      await api.get('/custom/endpoint');

      expect(mockFetch).toHaveBeenCalledWith('/api/custom/endpoint', expect.any(Object));
    });
  });
});
