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

const createConversationWithMessage = (kind, id, payload) =>
  authenticatedFetch(`/api/${kind}/${id}/conversations`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

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
    list: () => authenticatedFetch('/api/projects'),
    create: (name, repoFolderPath) =>
      authenticatedFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name, repoFolderPath }),
      }),
    get: (id) => authenticatedFetch(`/api/projects/${id}`),
    update: (id, data) =>
      authenticatedFetch(`/api/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id) =>
      authenticatedFetch(`/api/projects/${id}`, {
        method: 'DELETE',
      }),
    getDoc: (id) => authenticatedFetch(`/api/projects/${id}/documentation`),
    saveDoc: (id, content) =>
      authenticatedFetch(`/api/projects/${id}/documentation`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      }),
  },

  // Tasks API
  tasks: {
    // Get all tasks across all projects, optionally filtered by status
    listAll: (status = null) => {
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      const queryString = params.toString();
      return authenticatedFetch(`/api/tasks${queryString ? '?' + queryString : ''}`);
    },
    list: (projectId) => authenticatedFetch(`/api/projects/${projectId}/tasks`),
    create: (projectId, title) =>
      authenticatedFetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      }),
    get: (id) => authenticatedFetch(`/api/tasks/${id}`),
    update: (id, data) =>
      authenticatedFetch(`/api/tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id) =>
      authenticatedFetch(`/api/tasks/${id}`, {
        method: 'DELETE',
      }),
    getDoc: (id) => authenticatedFetch(`/api/tasks/${id}/documentation`),
    saveDoc: (id, content) =>
      authenticatedFetch(`/api/tasks/${id}/documentation`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      }),
    cleanupOldCompleted: (projectId, keepCount = 20) =>
      authenticatedFetch(`/api/projects/${projectId}/tasks/cleanup-old-completed?keep=${keepCount}`, {
        method: 'DELETE',
      }),
  },

  // Conversations API
  conversations: {
    list: (taskId) => authenticatedFetch(`/api/tasks/${taskId}/conversations`),
    create: (taskId) =>
      authenticatedFetch(`/api/tasks/${taskId}/conversations`, {
        method: 'POST',
      }),
    // Create conversation with first message - returns conversation with real claude_conversation_id
    createWithMessage: (taskId, { message, projectPath, permissionMode }) =>
      createConversationWithMessage('tasks', taskId, { message, projectPath, permissionMode }),
    get: (id) => authenticatedFetch(`/api/conversations/${id}`),
    delete: (id) =>
      authenticatedFetch(`/api/conversations/${id}`, {
        method: 'DELETE',
      }),
    getMessages: (id, limit = null, offset = 0) => {
      const params = new URLSearchParams();
      if (limit) params.append('limit', limit);
      if (offset) params.append('offset', offset);
      const queryString = params.toString();
      return authenticatedFetch(`/api/conversations/${id}/messages${queryString ? '?' + queryString : ''}`);
    },
  },

  // Agent Runs API (for automated agent workflows on tasks)
  agentRuns: {
    list: (taskId) => authenticatedFetch(`/api/tasks/${taskId}/agent-runs`),
    create: (taskId, agentType) =>
      authenticatedFetch(`/api/tasks/${taskId}/agent-runs`, {
        method: 'POST',
        body: JSON.stringify({ agentType }),
      }),
    get: (id) => authenticatedFetch(`/api/agent-runs/${id}`),
    complete: (id) =>
      authenticatedFetch(`/api/agent-runs/${id}/complete`, {
        method: 'PUT',
      }),
    linkConversation: (id, conversationId) =>
      authenticatedFetch(`/api/agent-runs/${id}/link-conversation`, {
        method: 'PUT',
        body: JSON.stringify({ conversationId }),
      }),
    delete: (id) =>
      authenticatedFetch(`/api/agent-runs/${id}`, {
        method: 'DELETE',
      }),
  },

  // Custom Agents API (reusable agent configurations with prompts)
  agents: {
    list: (projectId) => authenticatedFetch(`/api/projects/${projectId}/agents`),
    create: (projectId, name) =>
      authenticatedFetch(`/api/projects/${projectId}/agents`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    get: (id) => authenticatedFetch(`/api/agents/${id}`),
    update: (id, data) =>
      authenticatedFetch(`/api/agents/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id) =>
      authenticatedFetch(`/api/agents/${id}`, {
        method: 'DELETE',
      }),
    getPrompt: (id) => authenticatedFetch(`/api/agents/${id}/prompt`),
    savePrompt: (id, content) =>
      authenticatedFetch(`/api/agents/${id}/prompt`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      }),
    // Agent conversations
    listConversations: (agentId) => authenticatedFetch(`/api/agents/${agentId}/conversations`),
    createConversation: (agentId) =>
      authenticatedFetch(`/api/agents/${agentId}/conversations`, {
        method: 'POST',
      }),
    // Create conversation with first message - returns conversation with real claude_conversation_id
    createConversationWithMessage: (agentId, { message, permissionMode }) =>
      createConversationWithMessage('agents', agentId, { message, permissionMode }),
    // Agent attachments
    listAttachments: (agentId) => authenticatedFetch(`/api/agents/${agentId}/attachments`),
    uploadAttachment: (agentId, file) => {
      const formData = new FormData();
      formData.append('file', file);
      return authenticatedFetch(`/api/agents/${agentId}/attachments`, {
        method: 'POST',
        body: formData,
        headers: {}, // Let browser set Content-Type for FormData
      });
    },
    deleteAttachment: (agentId, filename) =>
      authenticatedFetch(`/api/agents/${agentId}/attachments/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      }),
    // Agent output files
    listOutputFiles: (agentId) => authenticatedFetch(`/api/agents/${agentId}/output-files`),
    downloadOutputFile: (agentId, filename) =>
      authenticatedFetch(`/api/agents/${agentId}/output-files/${encodeURIComponent(filename)}`),
    deleteOutputFile: (agentId, filename) =>
      authenticatedFetch(`/api/agents/${agentId}/output-files/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      }),
  },

  // Streaming sessions (for live indicator)
  streamingSessions: {
    getActive: () => authenticatedFetch('/api/streaming-sessions'),
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

  // Get files for a project (for @ file referencing)
  getFiles: (projectId) =>
    authenticatedFetch(`/api/projects/${projectId}/files`),

  // User endpoints
  user: {
    onboardingStatus: () => authenticatedFetch('/api/user/onboarding-status'),
    completeOnboarding: () =>
      authenticatedFetch('/api/user/complete-onboarding', {
        method: 'POST',
      }),
  },

  // Generic GET method for any endpoint
  get: (endpoint) => authenticatedFetch(`/api${endpoint}`),
};
