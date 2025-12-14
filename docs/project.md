# Claude Code UI - Project Documentation

## Overview

Claude Code UI is a web-based interface for Claude Code CLI. It provides a desktop/mobile-friendly way to manage coding projects and have conversations with Claude AI.

**Core Concept**: The app uses a **task-driven development** model:
- **Project**: An explicit database entry pointing to a Git repository
- **Task**: A unit of work with markdown documentation (stored in `.claude-ui/tasks/`)
- **Conversation**: A Claude session linked to a specific task

Users create projects, define tasks as units of work, and start conversations scoped to specific tasks. Task documentation is automatically injected as context when starting a conversation.

## Architecture

The frontend uses a **Dual-View Dashboard** design with a 3-screen navigation flow:

```
+-------------------------------------------------------------+
|                        Frontend                              |
|  React (Vite) - Port 5173                                   |
|  +---------------+  +-----------------+  +----------------+ |
|  | Dashboard     |  | TaskDetailView  |  | ChatInterface  | |
|  |               |  |                 |  |                | |
|  | By Project    |  | Task docs       |  | Messages       | |
|  | By Status     |  | Conversations   |  | Input          | |
|  +---------------+  +-----------------+  +----------------+ |
+-------------------------------------------------------------+
                          |
              WebSocket /ws  |  REST API /api/*
                          v
+-------------------------------------------------------------+
|                        Backend                               |
|  Node.js + Express - Port 3002                              |
|  +--------------+  +----------------+  +------------------+ |
|  | index.js     |  | claude-sdk.js  |  | documentation.js | |
|  | WebSocket    |  | SDK wrapper    |  | .claude-ui/ I/O  | |
|  | routing      |  | context inject |  |                  | |
|  +--------------+  +----------------+  +------------------+ |
+-------------------------------------------------------------+
                          |
                          v
+-------------------------------------------------------------+
|              Claude Agent SDK + File System                  |
|  ~/.claude/projects/{project-name}/{conversation-id}.jsonl  |
|  {repo}/.claude-ui/project.md                               |
|  {repo}/.claude-ui/tasks/task-{id}.md                       |
+-------------------------------------------------------------+
```

## Key Files

### Frontend

| File | Purpose |
|------|---------|
| `src/App.jsx` | Root component, providers, project form modal |
| `src/contexts/TaskContext.jsx` | State management for projects, tasks, conversations, navigation |
| `src/components/MainContent.jsx` | View routing: Dashboard -> TaskDetail -> Chat |
| `src/components/Dashboard/Dashboard.jsx` | Full-screen dashboard with project/status toggle |
| `src/components/Dashboard/ViewToggle.jsx` | "By Project" / "By Status" toggle buttons |
| `src/components/Dashboard/ProjectCard.jsx` | Collapsible project card with task list |
| `src/components/Dashboard/TaskRow.jsx` | Task row with status badge and LIVE indicator |
| `src/components/Dashboard/CompletedCollapse.jsx` | Collapsed section for completed tasks |
| `src/components/Dashboard/InProgressSection.jsx` | Section for in-progress tasks (status view) |
| `src/components/TaskDetailView.jsx` | Task docs (editable), conversation list |
| `src/components/ChatInterface.jsx` | Message display, WebSocket, message input |
| `src/components/ConversationList.jsx` | Conversation cards with Open/Resume buttons |
| `src/components/MarkdownEditor.jsx` | View/edit toggle for documentation |
| `src/components/Breadcrumb.jsx` | Navigation breadcrumb (Home > Project > Task) |
| `src/utils/api.js` | REST API client for projects/tasks/conversations |

### Backend

| File | Purpose |
|------|---------|
| `server/index.js` | Express server, WebSocket handlers, route registration |
| `server/claude-sdk.js` | Claude Agent SDK integration, custom system prompt support |
| `server/services/documentation.js` | Read/write `.claude-ui/` files, build context prompts |
| `server/services/sessions.js` | JSONL message reading for conversation history |
| `server/database/db.js` | Database operations: `projectsDb`, `tasksDb`, `conversationsDb` |
| `server/routes/projects.js` | Project CRUD + documentation endpoints |
| `server/routes/tasks.js` | Task CRUD + documentation endpoints |
| `server/routes/conversations.js` | Conversation CRUD + messages endpoints |

## Database Schema

Three tables manage the task-driven workflow:

**`projects`** - User-created projects pointing to repo folders
- `id`, `user_id`, `name`, `repo_folder_path`, `created_at`, `updated_at`

**`tasks`** - Work items belonging to projects
- `id`, `project_id` (FK), `title`, `created_at`, `updated_at`
- Documentation at `.claude-ui/tasks/task-{id}.md` (convention, not stored)

**`conversations`** - Links Claude sessions to tasks
- `id`, `task_id` (FK), `claude_conversation_id`, `created_at`

## Conversation Management

### Data Flow: Starting a New Conversation

1. **User clicks "New Conversation"** on TaskDetailView
2. **Frontend sends WebSocket** → `claude-command` with `taskId`, `isNewConversation: true`
3. **Backend looks up** → Task → Project → `repo_folder_path`
4. **Backend creates** → Conversation record in DB
5. **Backend reads** → `{repo}/.claude-ui/project.md` + `task-{id}.md`
6. **Backend builds** → Combined system prompt with project/task context
7. **Calls Claude SDK** → With `customSystemPrompt` option
8. **SDK streams responses** → Each sent via WebSocket as `claude-response`
9. **On first message** → Backend captures `session_id`, updates conversation record
10. **Stream ends** → Backend sends `claude-complete`

### Data Flow: Resuming a Conversation

1. **User clicks "Resume"** on existing conversation
2. **Frontend sends WebSocket** → `claude-command` with `conversationId`, `isNewConversation: false`
3. **Backend looks up** → Conversation → `claude_conversation_id`
4. **Calls Claude SDK** → With `resume: claude_conversation_id`
5. **Streaming proceeds** normally (no context injection needed)

### File Structure Convention

```
<repo-root>/
  .claude-ui/                    # Auto-created when project added
    project.md                   # Project-level documentation
    tasks/                       # Auto-created when project added
      task-1.md                  # Task documentation (auto-created blank)
      task-2.md
```

## State Management

### TaskContext State

The `TaskContext` manages all navigation and data state:

| State | Purpose |
|-------|---------|
| `selectedProject` | Currently selected project object |
| `selectedTask` | Currently selected task object |
| `activeConversation` | Currently active conversation object |
| `currentView` | View state: `'empty'`, `'project-detail'`, `'task-detail'`, or `'chat'` |
| `dashboardViewMode` | Dashboard toggle: `'project'` or `'status'` |
| `projects` | Array of all user projects |
| `tasks` | Array of tasks for selected project |
| `conversations` | Array of conversations for selected task |
| `projectDoc` | Current project documentation content |
| `taskDoc` | Current task documentation content |
| `isLoading*` | Loading states for each resource |

### Navigation Actions

| Action | Purpose |
|--------|---------|
| `selectProject(project)` | Navigate to project (loads tasks) |
| `selectTask(task)` | Navigate to task detail view |
| `selectConversation(conversation)` | Navigate to chat view |
| `navigateBack()` | Go back one level in navigation |
| `clearSelection()` | Return to dashboard |
| `setDashboardViewMode(mode)` | Toggle between 'project' and 'status' views |

### Object Shapes

```javascript
// Project
{
  id: number,
  name: string,              // Display name
  repo_folder_path: string,  // Absolute path to repo
  created_at: string,
  updated_at: string
}

// Task
{
  id: number,
  project_id: number,
  title: string,             // Display title
  created_at: string,
  updated_at: string
}

// Conversation
{
  id: number,
  task_id: number,
  claude_conversation_id: string,  // Session ID from Claude SDK
  created_at: string
}
```

## WebSocket Message Types

### Client → Server

| Type | Purpose |
|------|---------|
| `claude-command` | Send message to Claude (with taskId/conversationId) |
| `subscribe-session` | Subscribe to updates for specific conversation |
| `unsubscribe-session` | Unsubscribe from conversation updates |
| `abort-session` | Stop active conversation processing |

### Server → Client

| Type | Purpose |
|------|---------|
| `claude-response` | Streaming message from Claude |
| `claude-complete` | Stream finished |
| `claude-error` | Error occurred |
| `session-created` | New conversation ID generated |

## REST API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/projects` | GET, POST | List/create projects |
| `/api/projects/:id` | GET, PUT, DELETE | Get/update/delete project |
| `/api/projects/:id/documentation` | GET, PUT | Get/save project.md |
| `/api/projects/:projectId/tasks` | GET, POST | List/create tasks |
| `/api/tasks/:id` | GET, PUT, DELETE | Get/update/delete task |
| `/api/tasks/:id/documentation` | GET, PUT | Get/save task-{id}.md |
| `/api/tasks/:taskId/conversations` | GET, POST | List/create conversations |
| `/api/conversations/:id` | GET, DELETE | Get/delete conversation |
| `/api/conversations/:id/messages` | GET | Get conversation messages |

## UI Navigation Flow

The app uses a **3-screen navigation** model (no sidebar):

```
Dashboard ────────────────► Task Detail ────────────────► Chat
    ◄── Back to Dashboard ────     ◄──── Back to Task ────
```

### Screen 1: Dashboard (Full Screen)

Two view modes toggle between:

**By Project View (Default)**
- First project unfolded by default, others folded
- Click ▼/▶ arrow to toggle fold/unfold each project
- Task rows show: title, status badge, LIVE indicator, View button
- Collapsed "Completed (N)" section at bottom of each project

**By Status View**
- Groups all tasks by status across all projects
- Sections: ACTIVE NOW, IN PROGRESS, PENDING, COMPLETED
- Shows "Project > Task" for each row

### Screen 2: Task Detail

- Back button returns to Dashboard
- Task documentation preview with Edit button
- List of conversations with status (LIVE/Paused) and time since last activity
- "+ New Conversation" button

### Screen 3: Chat Interface

- Back button returns to Task Detail
- Breadcrumb navigation: Home > Project > Task
- Full chat interface with message input

### Visual Indicators

| Status | Indicator |
|--------|-----------|
| LIVE | Pulsing red dot - Claude session is streaming |
| In Progress | Yellow - Has conversation history, not active |
| Pending | Gray circle - No conversation started |
| Completed | Checkmark - Task marked done |

## Quick Reference: Key Methods

### Navigation

- `TaskContext.jsx:selectProject()` - Select project and load its tasks
- `TaskContext.jsx:selectTask()` - Navigate to task detail view
- `TaskContext.jsx:selectConversation()` - Navigate to chat view
- `TaskContext.jsx:navigateBack()` - Go back one level
- `TaskContext.jsx:clearSelection()` - Return to dashboard

### Project/Task/Conversation Management

- `TaskContext.jsx` - All CRUD actions for projects, tasks, conversations
- `api.js:projects.*` - REST client for project endpoints
- `api.js:tasks.*` - REST client for task endpoints
- `api.js:conversations.*` - REST client for conversation endpoints

### Context Injection

- `server/services/documentation.js:buildContextPrompt()` - Combines project + task docs
- `server/claude-sdk.js:mapCliOptionsToSDK()` - Handles `customSystemPrompt` option

### Message Handling

- `ChatInterface.jsx:handleSubmit()` - Sends via WebSocket with taskId/conversationId
- `server/index.js` - WebSocket handler for `claude-command`
- `server/claude-sdk.js:queryClaudeSDK()` - SDK integration with context injection
- `server/services/sessions.js:getSessionMessages()` - Reads JSONL files

### Dashboard Components

- `Dashboard.jsx` - Main container with view toggle and project/status views
- `ProjectCard.jsx` - Collapsible project with fold/unfold and task list
- `TaskRow.jsx` - Task display with status badge and live indicator
- `ViewToggle.jsx` - "By Project" / "By Status" toggle
