# Claude Code UI - Project Documentation

## Overview

Claude Code UI is a web-based interface for Claude Code CLI. It provides a desktop/mobile-friendly way to manage coding projects and have conversations with Claude AI.

**Core Concept**: The app uses a **task-driven development** model:
- **Project**: An explicit database entry pointing to a Git repository
- **Task**: A unit of work with markdown documentation (stored in `.claude-ui/tasks/`)
- **Conversation**: A Claude session linked to a specific task

Users create projects, define tasks as units of work, and start conversations scoped to specific tasks. Task documentation is automatically injected as context when starting a conversation.

## Architecture

```
+-------------------------------------------------------------+
|                        Frontend                              |
|  React (Vite) - Port 5173                                   |
|  +-------------+  +-----------------+  +------------------+ |
|  | Sidebar     |  | TaskDetailView  |  | ChatInterface    | |
|  |             |  |                 |  |                  | |
|  | Projects    |  | Task docs       |  | Messages         | |
|  | Tasks       |  | Conversations   |  | Input            | |
|  +-------------+  +-----------------+  +------------------+ |
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
| `src/App.jsx` | Root component, state for selectedTask/activeConversation, view routing |
| `src/contexts/TaskContext.jsx` | State management for projects, tasks, conversations |
| `src/components/Sidebar.jsx` | Project list with expandable task lists |
| `src/components/MainContent.jsx` | View routing (ProjectDetail/TaskDetail/Chat) |
| `src/components/TaskDetailView.jsx` | Task docs (editable), conversation history |
| `src/components/ProjectDetailView.jsx` | Project name, edit button, task list |
| `src/components/ChatInterface.jsx` | Message display, WebSocket, message input |
| `src/components/ConversationList.jsx` | List with +New/Resume buttons |
| `src/components/MarkdownEditor.jsx` | View/edit toggle for documentation |
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

### Frontend State (App.jsx)

| State | Purpose |
|-------|---------|
| `selectedProject` | Currently selected project object |
| `selectedTask` | Currently selected task object |
| `activeConversation` | Currently active conversation object |
| `currentView` | Derived: 'project', 'task', or 'chat' |
| `activeTab` | Current tab: 'chat', 'files', 'shell', 'git' |

### TaskContext State

| State | Purpose |
|-------|---------|
| `projects` | Array of all user projects |
| `tasks` | Array of tasks for selected project |
| `conversations` | Array of conversations for selected task |
| `isLoading*` | Loading states for each resource |

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

```
+----------------------------------+------------------------------+
| SIDEBAR                          | MAIN CONTENT                 |
+----------------------------------+------------------------------+
|                                  |                              |
| > Project A  <-(click name)------+-> Project Detail View        |
|   +-- Task 1  <-(click)----------+-> Task Detail View           |
|   +-- Task 2                     |       |                      |
|                                  |       v (click New/Resume)   |
| v Project B  <-(click arrow)     |    Chat View                 |
|   +-- Task 3                     |       |                      |
|   +-- Task 4                     |       v (click Back)         |
|                                  |    Task Detail View          |
+----------------------------------+------------------------------+
```

## Quick Reference: Key Methods

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
