// Utility function for authenticated API calls
export const authenticatedFetch = (url, options = {}) => {
  const isPlatform = import.meta.env.VITE_IS_PLATFORM === 'true';
  const token = localStorage.getItem('auth-token');

  // Check if body is FormData - don't set Content-Type to let browser handle it
  const isFormData = options.body instanceof FormData;

  const defaultHeaders = {};

  // Only set Content-Type for non-FormData requests
  if (!isFormData) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  if (!isPlatform && token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });
};

// API endpoints
export const api = {
  // Auth endpoints (no token required)
  auth: {
    status: () => fetch('/api/auth/status'),
    login: (username, password) => fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
    register: (username, password) => fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
    user: () => authenticatedFetch('/api/auth/user'),
    logout: () => authenticatedFetch('/api/auth/logout', { method: 'POST' }),
  },

  // Task-driven workflow API
  // Projects API
  projects: {
    list: () => authenticatedFetch('/api/v2/projects'),
    create: (name, repoFolderPath) =>
      authenticatedFetch('/api/v2/projects', {
        method: 'POST',
        body: JSON.stringify({ name, repoFolderPath }),
      }),
    get: (id) => authenticatedFetch(`/api/v2/projects/${id}`),
    update: (id, data) =>
      authenticatedFetch(`/api/v2/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id) =>
      authenticatedFetch(`/api/v2/projects/${id}`, {
        method: 'DELETE',
      }),
    getDoc: (id) => authenticatedFetch(`/api/v2/projects/${id}/documentation`),
    saveDoc: (id, content) =>
      authenticatedFetch(`/api/v2/projects/${id}/documentation`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      }),
  },

  // Tasks API
  tasks: {
    list: (projectId) => authenticatedFetch(`/api/v2/projects/${projectId}/tasks`),
    create: (projectId, title) =>
      authenticatedFetch(`/api/v2/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      }),
    get: (id) => authenticatedFetch(`/api/v2/tasks/${id}`),
    update: (id, data) =>
      authenticatedFetch(`/api/v2/tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id) =>
      authenticatedFetch(`/api/v2/tasks/${id}`, {
        method: 'DELETE',
      }),
    getDoc: (id) => authenticatedFetch(`/api/v2/tasks/${id}/documentation`),
    saveDoc: (id, content) =>
      authenticatedFetch(`/api/v2/tasks/${id}/documentation`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      }),
  },

  // Conversations API
  conversations: {
    list: (taskId) => authenticatedFetch(`/api/v2/tasks/${taskId}/conversations`),
    create: (taskId) =>
      authenticatedFetch(`/api/v2/tasks/${taskId}/conversations`, {
        method: 'POST',
      }),
    get: (id) => authenticatedFetch(`/api/v2/conversations/${id}`),
    delete: (id) =>
      authenticatedFetch(`/api/v2/conversations/${id}`, {
        method: 'DELETE',
      }),
  },

  // Voice transcription
  transcribe: (formData) =>
    authenticatedFetch('/api/transcribe', {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type for FormData
    }),

  // Slash commands endpoint
  getCommands: (projectPath) =>
    authenticatedFetch('/api/commands/list', {
      method: 'POST',
      body: JSON.stringify({ projectPath: projectPath || '' }),
    }),

  // Browse filesystem for project suggestions
  browseFilesystem: (dirPath = null) => {
    const params = new URLSearchParams();
    if (dirPath) params.append('path', dirPath);

    return authenticatedFetch(`/api/browse-filesystem?${params}`);
  },

  // User endpoints
  user: {
    gitConfig: () => authenticatedFetch('/api/user/git-config'),
    updateGitConfig: (gitName, gitEmail) =>
      authenticatedFetch('/api/user/git-config', {
        method: 'POST',
        body: JSON.stringify({ gitName, gitEmail }),
      }),
    onboardingStatus: () => authenticatedFetch('/api/user/onboarding-status'),
    completeOnboarding: () =>
      authenticatedFetch('/api/user/complete-onboarding', {
        method: 'POST',
      }),
  },

  // Generic GET method for any endpoint
  get: (endpoint) => authenticatedFetch(`/api${endpoint}`),
};
